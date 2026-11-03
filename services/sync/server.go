package main

import (
	"encoding/json"
	"hash/maphash"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	defaultMaxBytes = 25 * 1024 * 1024
	maxSnapshots    = 3
)

type SyncOptions struct {
	StorageRoot string
	MaxBytes    int64
	TrustProxy  bool
}

func DefaultOptions() SyncOptions {
	storageRoot := os.Getenv("SYNC_STORAGE_ROOT")
	if storageRoot == "" {
		storageRoot = "./storage/vaults"
	}
	absStorage, err := filepath.Abs(storageRoot)
	if err != nil {
		absStorage = storageRoot
	}

	maxBytes := int64(defaultMaxBytes)
	if mbStr := os.Getenv("SYNC_MAX_BYTES"); mbStr != "" {
		if parsed, err := strconv.ParseInt(mbStr, 10, 64); err == nil && parsed > 0 {
			maxBytes = parsed
		}
	}

	trustProxy := os.Getenv("SYNC_TRUST_PROXY") == "true" || os.Getenv("SYNC_TRUST_PROXY") == "1"

	return SyncOptions{
		StorageRoot: absStorage,
		MaxBytes:    maxBytes,
		TrustProxy:  trustProxy,
	}
}

type rateLimiter struct {
	mu      sync.Mutex
	buckets map[string]*rateBucket
	ops     uint64
}

type rateBucket struct {
	count   int
	resetAt time.Time
}

func newRateLimiter() *rateLimiter {
	return &rateLimiter{
		buckets: make(map[string]*rateBucket),
	}
}

func (rl *rateLimiter) allow(ip string, isWrite bool) (bool, int) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	rl.ops++
	now := time.Now()

	// Periodic cleanup every 64 calls when bucket count grows
	if rl.ops%64 == 0 && len(rl.buckets) > 128 {
		for k, b := range rl.buckets {
			if now.After(b.resetAt) {
				delete(rl.buckets, k)
			}
		}
	}

	prefix := "r:"
	maxReqs := 120
	if isWrite {
		prefix = "w:"
		maxReqs = 30
	}
	key := prefix + ip

	b, exists := rl.buckets[key]
	if !exists || now.After(b.resetAt) {
		rl.buckets[key] = &rateBucket{
			count:   1,
			resetAt: now.Add(60 * time.Second),
		}
		return true, 0
	}

	b.count++
	if b.count <= maxReqs {
		return true, 0
	}

	retryAfter := int(time.Until(b.resetAt).Seconds())
	if retryAfter < 1 {
		retryAfter = 1
	}
	return false, retryAfter
}

func (rl *rateLimiter) cleanupExpired(now time.Time) {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	for k, b := range rl.buckets {
		if now.After(b.resetAt) {
			delete(rl.buckets, k)
		}
	}
}

type SyncServer struct {
	options     SyncOptions
	mux         *http.ServeMux
	handler     http.Handler
	rateLimiter *rateLimiter
	vaultLocks  [256]sync.Mutex
}

func NewSyncServer(opts SyncOptions) *SyncServer {
	s := &SyncServer{
		options:     opts,
		mux:         http.NewServeMux(),
		rateLimiter: newRateLimiter(),
	}
	s.registerRoutes()
	s.handler = s.corsMiddleware(s.rateLimitMiddleware(s.mux))
	return s
}

func (s *SyncServer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.handler.ServeHTTP(w, r)
}

var vaultLockSeed = maphash.MakeSeed()

func (s *SyncServer) lockVault(key string) func() {
	h := maphash.String(vaultLockSeed, key) % 256
	s.vaultLocks[h].Lock()
	return s.vaultLocks[h].Unlock
}

func (s *SyncServer) getClientIP(r *http.Request) string {
	if s.options.TrustProxy {
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			for p := range strings.SplitSeq(xff, ",") {
				if ip := strings.TrimSpace(p); ip != "" {
					return ip
				}
			}
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil && host != "" {
		return host
	}
	if r.RemoteAddr != "" {
		return r.RemoteAddr
	}
	return "local"
}

func (s *SyncServer) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, If-Match, If-None-Match")
		w.Header().Set("Access-Control-Expose-Headers", "ETag, X-Tildom-Revision")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (s *SyncServer) rateLimitMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/v1/") || r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}

		ip := s.getClientIP(r)
		isWrite := r.Method == http.MethodPost
		allowed, retryAfter := s.rateLimiter.allow(ip, isWrite)
		if !allowed {
			w.Header().Set("Retry-After", strconv.Itoa(retryAfter))
			http.Error(w, "Too many requests", http.StatusTooManyRequests)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (s *SyncServer) registerRoutes() {
	s.mux.HandleFunc("GET /health", s.handleHealth)
	s.mux.HandleFunc("GET /v1/apps/{appId}/vaults/{vaultId}/snapshots", s.handleListSnapshots)
	s.mux.HandleFunc("GET /v1/apps/{appId}/vaults/{vaultId}/snapshots/latest", s.handleDownloadLatest)
	s.mux.HandleFunc("GET /v1/apps/{appId}/vaults/{vaultId}/snapshots/{revision}", s.handleDownloadRevision)
	s.mux.HandleFunc("POST /v1/apps/{appId}/vaults/{vaultId}/snapshots", s.handleUploadSnapshot)
}

func (s *SyncServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}
