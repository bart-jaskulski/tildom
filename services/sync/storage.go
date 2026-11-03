package main

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
)

var (
	segmentPattern  = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)
	revisionPattern = regexp.MustCompile(`^[0-9A-HJKMNP-TV-Z]{26}$`)
)

func isSafeSegment(val string) bool {
	return val != "" && segmentPattern.MatchString(val)
}

func isInside(root, candidate string) bool {
	rel, err := filepath.Rel(root, candidate)
	if err != nil {
		return false
	}
	return rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel)
}

func (s *SyncServer) resolveVaultDir(appID, vaultID string) string {
	if !isSafeSegment(appID) || !isSafeSegment(vaultID) {
		return ""
	}

	dir := filepath.Join(s.options.StorageRoot, appID, vaultID)
	if !isInside(s.options.StorageRoot, dir) {
		return ""
	}
	return dir
}

func tokenHash(token string) string {
	h := sha256.Sum256([]byte(token))
	return base64.RawURLEncoding.EncodeToString(h[:])
}

func parseBearer(header string) string {
	if header == "" {
		return ""
	}
	parts := strings.SplitN(header, " ", 2)
	if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
		return strings.TrimSpace(parts[1])
	}
	return ""
}

func authPath(vaultDir string) string {
	return filepath.Join(vaultDir, ".auth")
}

func authorizeExistingVault(vaultDir, token string) bool {
	if token == "" {
		return false
	}
	content, err := os.ReadFile(authPath(vaultDir))
	if err != nil {
		return false
	}
	expected := strings.TrimSpace(string(content))
	actual := tokenHash(token)
	return subtle.ConstantTimeCompare([]byte(expected), []byte(actual)) == 1
}

func writeAuthIfMissing(vaultDir, token string) error {
	f, err := os.OpenFile(authPath(vaultDir), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		if os.IsExist(err) {
			return nil
		}
		return err
	}
	defer f.Close()

	_, err = f.WriteString(tokenHash(token) + "\n")
	return err
}

func listSnapshots(vaultDir string) ([]string, error) {
	entries, err := os.ReadDir(vaultDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	var revisions []string
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if strings.HasSuffix(name, ".bin") {
			rev := strings.TrimSuffix(name, ".bin")
			if revisionPattern.MatchString(rev) {
				revisions = append(revisions, rev)
			}
		}
	}
	slices.Sort(revisions)
	return revisions, nil
}

func latestRevision(vaultDir string) (string, error) {
	revs, err := listSnapshots(vaultDir)
	if err != nil || len(revs) == 0 {
		return "", err
	}
	return revs[len(revs)-1], nil
}

func pruneSnapshots(vaultDir string) error {
	revs, err := listSnapshots(vaultDir)
	if err != nil || len(revs) <= maxSnapshots {
		return err
	}
	stale := revs[:len(revs)-maxSnapshots]
	for _, rev := range stale {
		_ = os.Remove(filepath.Join(vaultDir, rev+".bin"))
	}
	return nil
}

func (s *SyncServer) handleListSnapshots(w http.ResponseWriter, r *http.Request) {
	vaultDir := s.resolveVaultDir(r.PathValue("appId"), r.PathValue("vaultId"))
	if vaultDir == "" {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Not found"})
		return
	}

	token := parseBearer(r.Header.Get("Authorization"))
	if !authorizeExistingVault(vaultDir, token) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Not found"})
		return
	}

	revs, err := listSnapshots(vaultDir)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to list snapshots"})
		return
	}

	slices.Reverse(revs)
	writeJSON(w, http.StatusOK, map[string][]string{"revisions": revs})
}

func (s *SyncServer) handleDownloadLatest(w http.ResponseWriter, r *http.Request) {
	vaultDir := s.resolveVaultDir(r.PathValue("appId"), r.PathValue("vaultId"))
	if vaultDir == "" {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Not found"})
		return
	}

	token := parseBearer(r.Header.Get("Authorization"))
	if !authorizeExistingVault(vaultDir, token) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Not found"})
		return
	}

	rev, err := latestRevision(vaultDir)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to read snapshots"})
		return
	}
	if rev == "" {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Not found"})
		return
	}

	filePath := filepath.Join(vaultDir, rev+".bin")
	data, err := os.ReadFile(filePath)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Not found"})
		return
	}

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("ETag", rev)
	w.Header().Set("X-Tildom-Revision", rev)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

func (s *SyncServer) handleDownloadRevision(w http.ResponseWriter, r *http.Request) {
	revision := r.PathValue("revision")
	vaultDir := s.resolveVaultDir(r.PathValue("appId"), r.PathValue("vaultId"))
	if vaultDir == "" || !revisionPattern.MatchString(revision) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Not found"})
		return
	}

	token := parseBearer(r.Header.Get("Authorization"))
	if !authorizeExistingVault(vaultDir, token) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Not found"})
		return
	}

	filePath := filepath.Join(vaultDir, revision+".bin")
	if !isInside(vaultDir, filePath) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Not found"})
		return
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Not found"})
		return
	}

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("ETag", revision)
	w.Header().Set("X-Tildom-Revision", revision)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

type conflictResponse struct {
	Error    string  `json:"error"`
	Revision *string `json:"revision"`
}

func (s *SyncServer) handleUploadSnapshot(w http.ResponseWriter, r *http.Request) {
	appID := r.PathValue("appId")
	vaultID := r.PathValue("vaultId")
	vaultDir := s.resolveVaultDir(appID, vaultID)
	token := parseBearer(r.Header.Get("Authorization"))

	if vaultDir == "" || token == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, s.options.MaxBytes)
	body, err := io.ReadAll(r.Body)
	if err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			writeJSON(w, http.StatusRequestEntityTooLarge, map[string]string{"error": "Payload too large or empty"})
			return
		}
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Failed to read body"})
		return
	}

	if len(body) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Payload too large or empty"})
		return
	}

	unlock := s.lockVault(appID + "/" + vaultID)
	defer unlock()

	if err := os.MkdirAll(vaultDir, 0755); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create vault directory"})
		return
	}

	hasAuth := authorizeExistingVault(vaultDir, token)
	revs, err := listSnapshots(vaultDir)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to inspect vault storage"})
		return
	}

	var latest *string
	if len(revs) > 0 {
		l := revs[len(revs)-1]
		latest = &l
	}

	ifNoneMatch := r.Header.Get("If-None-Match")
	ifMatch := r.Header.Get("If-Match")

	if !hasAuth && (latest != nil || ifNoneMatch != "*") {
		writeJSON(w, http.StatusConflict, conflictResponse{Error: "Conflict", Revision: latest})
		return
	}

	if hasAuth {
		if latest != nil {
			if ifMatch != *latest {
				writeJSON(w, http.StatusConflict, conflictResponse{Error: "Conflict", Revision: latest})
				return
			}
		} else {
			if ifNoneMatch != "*" {
				writeJSON(w, http.StatusConflict, conflictResponse{Error: "Conflict", Revision: latest})
				return
			}
		}
	}

	if !hasAuth {
		if err := writeAuthIfMissing(vaultDir, token); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to write vault auth"})
			return
		}
	}

	revision := CreateRevisionID()
	tmpPath := filepath.Join(vaultDir, fmt.Sprintf(".%s.%d.tmp", revision, os.Getpid()))
	finalPath := filepath.Join(vaultDir, revision+".bin")

	if err := os.WriteFile(tmpPath, body, 0600); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to write snapshot"})
		return
	}

	if err := os.Rename(tmpPath, finalPath); err != nil {
		_ = os.Remove(tmpPath)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to finalize snapshot"})
		return
	}

	_ = pruneSnapshots(vaultDir)

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("ETag", revision)
	w.Header().Set("X-Tildom-Revision", revision)
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]string{"revision": revision})
}
