package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"math"
	"net/http"
	"net/netip"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/bart-jaskulski/tildom/services/api/internal/do"
	"github.com/bart-jaskulski/tildom/services/api/internal/mark"
	"github.com/bart-jaskulski/tildom/services/api/internal/push"
	"github.com/bart-jaskulski/tildom/services/api/internal/ratelimit"
	"google.golang.org/genai"
)

type Config struct {
	Port            string
	GoogleAPIKey    string
	GeminiModel     string
	AllowedOrigins  []string
	TrustedProxies  []netip.Prefix
	PushStorageRoot string
	VAPIDPublicKey  string
	VAPIDPrivateKey string
	VAPIDSubject    string
}

func DefaultConfig() Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8788"
	}

	model := os.Getenv("GEMINI_MODEL")
	if model == "" {
		model = "gemini-3.5-flash-lite"
	}

	allowedOriginsStr := os.Getenv("API_ALLOWED_ORIGINS")
	if allowedOriginsStr == "" {
		allowedOriginsStr = "https://mark.tildom.app,https://do.tildom.app,https://kin.tildom.app"
	}
	var origins []string
	for _, o := range strings.Split(allowedOriginsStr, ",") {
		trimmed := strings.TrimSpace(o)
		if trimmed != "" {
			origins = append(origins, trimmed)
		}
	}

	pushStorage := os.Getenv("PUSH_STORAGE_ROOT")
	if pushStorage == "" {
		pushStorage = "./storage"
	}

	vapidSubject := os.Getenv("VAPID_SUBJECT")
	if vapidSubject == "" {
		vapidSubject = "mailto:push@tildom.app"
	}

	var trustedProxies []netip.Prefix
	for _, raw := range strings.Split(os.Getenv("API_TRUSTED_PROXIES"), ",") {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}
		prefix, err := netip.ParsePrefix(raw)
		if err != nil {
			log.Fatalf("invalid API_TRUSTED_PROXIES CIDR %q: %v", raw, err)
		}
		trustedProxies = append(trustedProxies, prefix)
	}
	return Config{
		TrustedProxies:  trustedProxies,
		Port:            port,
		GoogleAPIKey:    os.Getenv("GOOGLE_API_KEY"),
		GeminiModel:     model,
		AllowedOrigins:  origins,
		PushStorageRoot: pushStorage,
		VAPIDPublicKey:  os.Getenv("VAPID_PUBLIC_KEY"),
		VAPIDPrivateKey: os.Getenv("VAPID_PRIVATE_KEY"),
		VAPIDSubject:    vapidSubject,
	}
}

type AIClientWrapper struct {
	client *genai.Client
}

func (w *AIClientWrapper) GenerateContent(ctx context.Context, model string, contents []*genai.Content, config *genai.GenerateContentConfig) (*genai.GenerateContentResponse, error) {
	return w.client.Models.GenerateContent(ctx, model, contents, config)
}

type Server struct {
	config      Config
	aiClient    mark.AIClient
	pushServer  *push.PushServer
	rateLimiter *ratelimit.Limiter
	mux         *http.ServeMux
	handler     http.Handler
}

var localhostRegex = regexp.MustCompile(`^https?://(?:localhost|127\.0\.0\.1):\d+$`)

var breakdownPolicies = []ratelimit.Policy{
	{ID: "ai-breakdown-1m", MaxRequests: 5, Window: time.Minute},
	{ID: "ai-breakdown-1h", MaxRequests: 30, Window: time.Hour},
}

var tagPolicies = []ratelimit.Policy{
	{ID: "ai-tags-1m", MaxRequests: 10, Window: time.Minute},
	{ID: "ai-tags-1h", MaxRequests: 100, Window: time.Hour},
}

func NewServer(cfg Config, aiClient mark.AIClient, pushServer *push.PushServer) *Server {
	s := &Server{
		config:      cfg,
		aiClient:    aiClient,
		pushServer:  pushServer,
		rateLimiter: ratelimit.NewLimiter(),
		mux:         http.NewServeMux(),
	}

	s.registerRoutes()
	s.handler = s.corsMiddleware(s.mux)
	return s
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.handler.ServeHTTP(w, r)
}

func (s *Server) registerRoutes() {
	s.mux.HandleFunc("GET /health", s.handleHealth)
	s.mux.HandleFunc("POST /v1/mark/metadata", s.handleMarkMetadata)
	s.mux.HandleFunc("POST /v1/mark/tags", s.handleMarkTags)
	s.mux.HandleFunc("POST /v1/do/breakdown", s.handleDoBreakdown)

	if s.pushServer != nil {
		s.pushServer.RegisterRoutes(s.mux)
	}

	// 404 handler for unmatched routes
	s.mux.HandleFunc("/", s.handleNotFound)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/health" {
		s.handleNotFound(w, r)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleNotFound(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusNotFound, map[string]string{"error": "Not found"})
}

func (s *Server) handleMarkMetadata(w http.ResponseWriter, r *http.Request) {
	var body struct {
		URL *string `json:"url"`
	}

	if err := decodeRequest(w, r, &body); err != nil {
		writeJSON(w, requestErrorStatus(err), map[string]string{"error": "Invalid JSON body"})
		return
	}

	if body.URL == nil || strings.TrimSpace(*body.URL) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Missing url"})
		return
	}

	meta, err := mark.FetchPageMetadata(r.Context(), *body.URL)
	if err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, meta)
}

func (s *Server) handleMarkTags(w http.ResponseWriter, r *http.Request) {
	key := ratelimit.ClientKey(r, "ai-tags", s.config.TrustedProxies)
	allowed, retryAfter := s.rateLimiter.Allow(key, tagPolicies, time.Now())
	if !allowed {
		w.Header().Set("Retry-After", strconv.Itoa(int(math.Ceil(retryAfter.Seconds()))))
		writeJSON(w, http.StatusTooManyRequests, map[string]string{
			"error": "Too many AI tagging requests. Please wait a minute and try again.",
		})
		return
	}

	var req mark.TagSuggestionRequest
	if err := decodeRequest(w, r, &req); err != nil {
		writeJSON(w, requestErrorStatus(err), map[string]string{"error": "Invalid tag request"})
		return
	}

	tags, err := mark.SuggestTags(r.Context(), s.aiClient, s.config.GeminiModel, req)
	if err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, mark.ErrNotConfigured) {
			status = http.StatusServiceUnavailable
		} else if errors.Is(err, mark.ErrInvalidRequest) {
			status = http.StatusBadRequest
		} else if errors.Is(err, mark.ErrInvalidResponse) {
			status = http.StatusUnprocessableEntity
		}
		writeJSON(w, status, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"tags": tags})
}

func (s *Server) handleDoBreakdown(w http.ResponseWriter, r *http.Request) {
	key := ratelimit.ClientKey(r, "ai-breakdown", s.config.TrustedProxies)
	allowed, retryAfter := s.rateLimiter.Allow(key, breakdownPolicies, time.Now())
	if !allowed {
		w.Header().Set("Retry-After", strconv.Itoa(int(math.Ceil(retryAfter.Seconds()))))
		writeJSON(w, http.StatusTooManyRequests, map[string]string{
			"error": "Too many AI breakdown requests. Please wait a minute and try again.",
		})
		return
	}

	var req do.BreakdownRequest
	if err := decodeRequest(w, r, &req); err != nil {
		writeJSON(w, requestErrorStatus(err), map[string]string{"error": "Invalid JSON body"})
		return
	}

	res, err := do.BreakdownTask(r.Context(), s.aiClient, s.config.GeminiModel, req)
	if err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, do.ErrNotConfigured) {
			status = http.StatusServiceUnavailable
		} else if errors.Is(err, do.ErrInvalidRequest) {
			status = http.StatusBadRequest
		} else if errors.Is(err, do.ErrInvalidResponse) {
			status = http.StatusUnprocessableEntity
		}
		writeJSON(w, status, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, res)
}

func (s *Server) isAllowedOrigin(origin string) bool {
	if origin == "" {
		return false
	}
	for _, o := range s.config.AllowedOrigins {
		if o == origin {
			return true
		}
	}
	return localhostRegex.MatchString(origin)
}

func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")

		if origin != "" && s.isAllowedOrigin(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Max-Age", "86400")
		}

		if r.Method == http.MethodOptions {
			if origin != "" && !s.isAllowedOrigin(origin) {
				w.WriteHeader(http.StatusForbidden)
				return
			}
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

const maxRequestBytes = 64 * 1024

func decodeRequest(w http.ResponseWriter, r *http.Request, dst any) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBytes)
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(dst); err != nil {
		return err
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		if err != nil {
			return err
		}
		return errors.New("expected one JSON value")
	}
	return nil
}

func requestErrorStatus(err error) int {
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		return http.StatusRequestEntityTooLarge
	}
	return http.StatusBadRequest
}
