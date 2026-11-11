package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"testing"
	"time"
)

func createTestServer(t *testing.T) (*SyncServer, string) {
	t.Helper()
	dir := t.TempDir()

	opts := SyncOptions{
		StorageRoot: dir,
		MaxBytes:    1024,
		TrustProxy:  false,
	}

	return NewSyncServer(opts), dir
}

func TestSnapshotLifecycle(t *testing.T) {
	server, _ := createTestServer(t)
	revPattern := regexp.MustCompile(`^[0-9A-HJKMNP-TV-Z]{26}$`)

	url := "/v1/apps/mark/vaults/vault_1/snapshots"
	auth := "Bearer token_1"

	// 1. Initial snapshot with If-None-Match: *
	req := httptest.NewRequest(http.MethodPost, url, bytes.NewReader([]byte{1}))
	req.Header.Set("Authorization", auth)
	req.Header.Set("If-None-Match", "*")
	w := httptest.NewRecorder()
	server.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("first upload expected 201, got %d: %s", w.Code, w.Body.String())
	}
	firstRev := w.Header().Get("X-Tildom-Revision")
	if !revPattern.MatchString(firstRev) {
		t.Fatalf("expected ULID revision, got %q", firstRev)
	}

	// 2. Conflict upload with stale revision
	req = httptest.NewRequest(http.MethodPost, url, bytes.NewReader([]byte{2}))
	req.Header.Set("Authorization", auth)
	req.Header.Set("If-Match", "stale")
	w = httptest.NewRecorder()
	server.ServeHTTP(w, req)

	if w.Code != http.StatusConflict {
		t.Fatalf("expected 409 conflict, got %d", w.Code)
	}
	var conflictResp conflictResponse
	if err := json.Unmarshal(w.Body.Bytes(), &conflictResp); err != nil {
		t.Fatalf("invalid conflict response json: %v", err)
	}
	if conflictResp.Revision == nil || *conflictResp.Revision != firstRev {
		t.Fatalf("expected conflict latest revision to be %q", firstRev)
	}

	// 3. Upload three more snapshots (values: 2, 3, 4) chaining If-Match
	latest := firstRev
	for _, val := range []byte{2, 3, 4} {
		req = httptest.NewRequest(http.MethodPost, url, bytes.NewReader([]byte{val}))
		req.Header.Set("Authorization", auth)
		req.Header.Set("If-Match", latest)
		w = httptest.NewRecorder()
		server.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("subsequent upload (%d) expected 201, got %d: %s", val, w.Code, w.Body.String())
		}
		latest = w.Header().Get("X-Tildom-Revision")
	}

	// 4. List revisions: should be pruned to MAX_SNAPSHOTS (3)
	req = httptest.NewRequest(http.MethodGet, url, nil)
	req.Header.Set("Authorization", auth)
	w = httptest.NewRecorder()
	server.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("list snapshots expected 200, got %d", w.Code)
	}
	var listResp struct {
		Revisions []string `json:"revisions"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &listResp); err != nil {
		t.Fatalf("failed to decode list json: %v", err)
	}
	if len(listResp.Revisions) != 3 {
		t.Fatalf("expected 3 revisions after pruning, got %d (%v)", len(listResp.Revisions), listResp.Revisions)
	}
	if listResp.Revisions[0] != latest {
		t.Fatalf("expected newest revision first (%q), got %q", latest, listResp.Revisions[0])
	}

	// 5. Download latest snapshot
	req = httptest.NewRequest(http.MethodGet, url+"/latest", nil)
	req.Header.Set("Authorization", auth)
	w = httptest.NewRecorder()
	server.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("download latest expected 200, got %d", w.Code)
	}
	if w.Header().Get("X-Tildom-Revision") != latest {
		t.Fatalf("expected latest revision header %q, got %q", latest, w.Header().Get("X-Tildom-Revision"))
	}
	if !bytes.Equal(w.Body.Bytes(), []byte{4}) {
		t.Fatalf("expected body [4], got %v", w.Body.Bytes())
	}

	// 6. Download specific revision
	req = httptest.NewRequest(http.MethodGet, url+"/"+latest, nil)
	req.Header.Set("Authorization", auth)
	w = httptest.NewRecorder()
	server.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("download by revision expected 200, got %d", w.Code)
	}
	if !bytes.Equal(w.Body.Bytes(), []byte{4}) {
		t.Fatalf("expected body [4], got %v", w.Body.Bytes())
	}
}

func TestHidesVaultWithoutBearer(t *testing.T) {
	server, _ := createTestServer(t)
	url := "/v1/apps/mark/vaults/vault_1/snapshots"

	// Create initial snapshot
	req := httptest.NewRequest(http.MethodPost, url, bytes.NewReader([]byte{1}))
	req.Header.Set("Authorization", "Bearer token_1")
	req.Header.Set("If-None-Match", "*")
	w := httptest.NewRecorder()
	server.ServeHTTP(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d", w.Code)
	}

	// Request with wrong token must 404 (vault hidden)
	req = httptest.NewRequest(http.MethodGet, url, nil)
	req.Header.Set("Authorization", "Bearer wrong")
	w = httptest.NewRecorder()
	server.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for wrong token, got %d", w.Code)
	}
}

func TestDynamicAppIDs(t *testing.T) {
	server, _ := createTestServer(t)

	// Any safe segment appId works without preconfiguration
	for _, appID := range []string{"mark", "kin", "suite", "custom_app_1"} {
		req := httptest.NewRequest(http.MethodPost, "/v1/apps/"+appID+"/vaults/vault_1/snapshots", bytes.NewReader([]byte{1}))
		req.Header.Set("Authorization", "Bearer secret-token")
		req.Header.Set("Content-Type", "application/octet-stream")
		req.Header.Set("If-None-Match", "*")
		w := httptest.NewRecorder()
		server.ServeHTTP(w, req)
		if w.Code != http.StatusCreated {
			t.Fatalf("expected app %q upload to return 201, got %d: %s", appID, w.Code, w.Body.String())
		}
	}
}

func TestPathTraversalAndSegmentValidation(t *testing.T) {
	server, root := createTestServer(t)

	// 1. Attempt traversal via percent-encoded dots
	req := httptest.NewRequest(http.MethodGet, "/v1/apps/%2e%2e/vaults/v1/snapshots", nil)
	req.Header.Set("Authorization", "Bearer token")
	w := httptest.NewRecorder()
	server.ServeHTTP(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for percent-encoded traversal, got %d", w.Code)
	}

	// 2. Invalid characters in appId
	req = httptest.NewRequest(http.MethodGet, "/v1/apps/bad*id/vaults/v1/snapshots", nil)
	req.Header.Set("Authorization", "Bearer token")
	w = httptest.NewRecorder()
	server.ServeHTTP(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for invalid appId characters, got %d", w.Code)
	}

	// 3. Invalid characters in vaultId
	req = httptest.NewRequest(http.MethodGet, "/v1/apps/mark/vaults/bad$vault/snapshots", nil)
	req.Header.Set("Authorization", "Bearer token")
	w = httptest.NewRecorder()
	server.ServeHTTP(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for invalid vaultId characters, got %d", w.Code)
	}

	// 4. Invalid revision format
	req = httptest.NewRequest(http.MethodGet, "/v1/apps/mark/vaults/vault_1/snapshots/invalid-revision-here", nil)
	req.Header.Set("Authorization", "Bearer token")
	w = httptest.NewRecorder()
	server.ServeHTTP(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for invalid revision format, got %d", w.Code)
	}

	// Check that nothing escaped storage root
	entries, _ := os.ReadDir(filepath.Dir(root))
	for _, e := range entries {
		if e.Name() == "mark" {
			t.Fatalf("file created outside storage root")
		}
	}
}

func TestCORS(t *testing.T) {
	server, _ := createTestServer(t)

	// Preflight OPTIONS returns 204 with wildcard
	req := httptest.NewRequest(http.MethodOptions, "/v1/apps/mark/vaults/v1/snapshots", nil)
	req.Header.Set("Origin", "https://anything.example.com")
	w := httptest.NewRecorder()
	server.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("OPTIONS expected 204, got %d", w.Code)
	}
	if w.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Fatalf("expected Access-Control-Allow-Origin: *, got %q", w.Header().Get("Access-Control-Allow-Origin"))
	}

	// Regular GET includes CORS headers
	req = httptest.NewRequest(http.MethodGet, "/health", nil)
	req.Header.Set("Origin", "https://mark.tildom.app")
	w = httptest.NewRecorder()
	server.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if w.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Fatalf("expected Access-Control-Allow-Origin: *, got %q", w.Header().Get("Access-Control-Allow-Origin"))
	}
}

func TestPayloadSizeLimits(t *testing.T) {
	server, _ := createTestServer(t)
	url := "/v1/apps/mark/vaults/vault_1/snapshots"
	auth := "Bearer token_1"

	// 0-byte body -> 400
	req := httptest.NewRequest(http.MethodPost, url, bytes.NewReader([]byte{}))
	req.Header.Set("Authorization", auth)
	req.Header.Set("If-None-Match", "*")
	w := httptest.NewRecorder()
	server.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("empty body expected 400, got %d", w.Code)
	}

	// Oversized body (> 1024 bytes) via MaxBytesReader -> 413
	oversized := make([]byte, 1025)
	req = httptest.NewRequest(http.MethodPost, url, bytes.NewReader(oversized))
	req.Header.Set("Authorization", auth)
	req.Header.Set("If-None-Match", "*")
	w = httptest.NewRecorder()
	server.ServeHTTP(w, req)
	if w.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("oversized body expected 413, got %d", w.Code)
	}
}

func TestRateLimiterAndUntrustedProxy(t *testing.T) {
	server, _ := createTestServer(t)
	url := "/v1/apps/mark/vaults/vault_1/snapshots"
	auth := "Bearer token_1"

	// Attacker tries to bypass rate limit by rotating X-Forwarded-For
	// But TrustProxy is false, so all requests map to the same RemoteAddr
	for i := 0; i < 30; i++ {
		req := httptest.NewRequest(http.MethodPost, url, bytes.NewReader([]byte{1}))
		req.Header.Set("Authorization", auth)
		req.Header.Set("X-Forwarded-For", "attacker-spoof-"+strconv.Itoa(i))
		req.RemoteAddr = "203.0.113.195:4321"
		w := httptest.NewRecorder()
		server.ServeHTTP(w, req)
		if w.Code == http.StatusTooManyRequests {
			t.Fatalf("premature rate limit on request %d", i)
		}
	}

	// Request 31 with another spoofed IP must be 429 because RemoteAddr is what counts
	req := httptest.NewRequest(http.MethodPost, url, bytes.NewReader([]byte{1}))
	req.Header.Set("Authorization", auth)
	req.Header.Set("X-Forwarded-For", "attacker-spoof-new")
	req.RemoteAddr = "203.0.113.195:4321"
	w := httptest.NewRecorder()
	server.ServeHTTP(w, req)
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 when spoofing X-Forwarded-For without TrustProxy, got %d", w.Code)
	}

	// Now test with TrustProxy = true
	proxyOpts := SyncOptions{
		StorageRoot: t.TempDir(),
		MaxBytes:    1024,
		TrustProxy:  true,
	}
	proxyServer := NewSyncServer(proxyOpts)

	// Send 30 from client A
	for i := 0; i < 30; i++ {
		r := httptest.NewRequest(http.MethodPost, url, bytes.NewReader([]byte{1}))
		r.Header.Set("Authorization", auth)
		r.Header.Set("X-Forwarded-For", "198.51.100.1")
		r.RemoteAddr = "10.0.0.1:8080"
		rec := httptest.NewRecorder()
		proxyServer.ServeHTTP(rec, r)
	}

	// Request 31 from client A is blocked
	rBlocked := httptest.NewRequest(http.MethodPost, url, bytes.NewReader([]byte{1}))
	rBlocked.Header.Set("Authorization", auth)
	rBlocked.Header.Set("X-Forwarded-For", "198.51.100.1")
	rBlocked.RemoteAddr = "10.0.0.1:8080"
	recBlocked := httptest.NewRecorder()
	proxyServer.ServeHTTP(recBlocked, rBlocked)
	if recBlocked.Code != http.StatusTooManyRequests {
		t.Fatalf("expected client A to be rate limited, got %d", recBlocked.Code)
	}

	// But client B through the same proxy is allowed to upload to another vault
	rAllowed := httptest.NewRequest(http.MethodPost, "/v1/apps/mark/vaults/vault_2/snapshots", bytes.NewReader([]byte{1}))
	rAllowed.Header.Set("Authorization", auth)
	rAllowed.Header.Set("If-None-Match", "*")
	rAllowed.Header.Set("X-Forwarded-For", "198.51.100.2")
	rAllowed.RemoteAddr = "10.0.0.1:8080"
	recAllowed := httptest.NewRecorder()
	proxyServer.ServeHTTP(recAllowed, rAllowed)
	if recAllowed.Code != http.StatusCreated {
		t.Fatalf("expected client B to be allowed through trusted proxy, got %d", recAllowed.Code)
	}
}

func TestRateLimiterBucketCleanup(t *testing.T) {
	rl := newRateLimiter()

	// Fill buckets
	for i := 0; i < 50; i++ {
		rl.allow("ip-"+strconv.Itoa(i), false)
	}

	if len(rl.buckets) != 50 {
		t.Fatalf("expected 50 buckets, got %d", len(rl.buckets))
	}

	// Fast forward time past 60s
	rl.cleanupExpired(time.Now().Add(65 * time.Second))

	if len(rl.buckets) != 0 {
		t.Fatalf("expected all expired buckets to be cleaned, got %d", len(rl.buckets))
	}
}

func TestStorageErrorHaltsUpload(t *testing.T) {
	server, root := createTestServer(t)
	url := "/v1/apps/mark/vaults/faulty_vault/snapshots"
	auth := "Bearer token_1"

	// Create a regular file where the vault directory should be, causing listSnapshots (os.ReadDir) to fail with ENOTDIR
	vaultPath := filepath.Join(root, "mark", "faulty_vault")
	if err := os.MkdirAll(filepath.Dir(vaultPath), 0755); err != nil {
		t.Fatalf("mkdir failed: %v", err)
	}
	if err := os.WriteFile(vaultPath, []byte("i am a file not a directory"), 0600); err != nil {
		t.Fatalf("write file failed: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, url, bytes.NewReader([]byte{1}))
	req.Header.Set("Authorization", auth)
	req.Header.Set("If-None-Match", "*")
	w := httptest.NewRecorder()
	server.ServeHTTP(w, req)

	// Must halt and return 500 Internal Server Error, NOT ignore error and treat as empty
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500 when storage fails, got %d: %s", w.Code, w.Body.String())
	}
}

func TestConcurrentVaultUploads(t *testing.T) {
	server, _ := createTestServer(t)
	url := "/v1/apps/mark/vaults/vault_race/snapshots"
	auth := "Bearer token_race"

	// 1. Initial snapshot
	req := httptest.NewRequest(http.MethodPost, url, bytes.NewReader([]byte{1}))
	req.Header.Set("Authorization", auth)
	req.Header.Set("If-None-Match", "*")
	w := httptest.NewRecorder()
	server.ServeHTTP(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("failed initial upload: %d", w.Code)
	}
	firstRev := w.Header().Get("X-Tildom-Revision")

	// 2. 10 concurrent requests all providing If-Match: firstRev
	// Use separate RemoteAddr to avoid tripping rate limiter
	numClients := 10
	results := make(chan int, numClients)

	for i := 0; i < numClients; i++ {
		go func(clientIdx int) {
			r := httptest.NewRequest(http.MethodPost, url, bytes.NewReader([]byte{byte(clientIdx + 10)}))
			r.Header.Set("Authorization", auth)
			r.Header.Set("If-Match", firstRev)
			r.RemoteAddr = "10.0.0." + strconv.Itoa(clientIdx+1) + ":1234"
			rec := httptest.NewRecorder()
			server.ServeHTTP(rec, r)
			results <- rec.Code
		}(i)
	}

	successCount := 0
	conflictCount := 0
	for i := 0; i < numClients; i++ {
		code := <-results
		switch code {
		case http.StatusCreated:
			successCount++
		case http.StatusConflict:
			conflictCount++
		default:
			t.Errorf("unexpected status code: %d", code)
		}
	}

	if successCount != 1 {
		t.Fatalf("expected exactly 1 winner, got %d", successCount)
	}
	if conflictCount != numClients-1 {
		t.Fatalf("expected %d conflicts, got %d", numClients-1, conflictCount)
	}
}

func TestDefaultOptions(t *testing.T) {
	opts := DefaultOptions()
	if opts.MaxBytes != defaultMaxBytes {
		t.Fatalf("expected default max bytes %d, got %d", defaultMaxBytes, opts.MaxBytes)
	}
	if opts.StorageRoot == "" {
		t.Fatalf("expected non-empty storage root")
	}
}

func TestDeleteSnapshotsPreservesOwnership(t *testing.T) {
	server, root := createTestServer(t)
	url := "/v1/apps/mark-audio/vaults/recording/snapshots"
	request := func(method, token string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, url, bytes.NewReader([]byte{1, 2, 3}))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("If-None-Match", "*")
		w := httptest.NewRecorder()
		server.ServeHTTP(w, req)
		return w
	}
	if w := request(http.MethodPost, "owner"); w.Code != http.StatusCreated {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := request(http.MethodDelete, "stranger"); w.Code != http.StatusNotFound {
		t.Fatal(w.Code)
	}
	revisions, _ := listSnapshots(filepath.Join(root, "mark-audio", "recording"))
	if len(revisions) != 1 {
		t.Fatal("unauthorized deletion removed audio")
	}
	for range 2 {
		if w := request(http.MethodDelete, "owner"); w.Code != http.StatusNoContent {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	revisions, _ = listSnapshots(filepath.Join(root, "mark-audio", "recording"))
	if len(revisions) != 0 {
		t.Fatal("audio payload was retained")
	}
	if w := request(http.MethodPost, "stranger"); w.Code < 400 {
		t.Fatal("deleted vault ownership was stolen")
	}
	if w := request(http.MethodPost, "owner"); w.Code != http.StatusCreated {
		t.Fatal(w.Code, w.Body.String())
	}
}
