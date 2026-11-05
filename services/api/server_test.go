package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/bart-jaskulski/tildom/services/api/internal/mark"
	"github.com/bart-jaskulski/tildom/services/api/internal/push"
	"google.golang.org/genai"
)

type mockAIClient struct {
	fnCalls []*genai.FunctionCall
	err     error
}

func (m *mockAIClient) GenerateContent(ctx context.Context, model string, contents []*genai.Content, config *genai.GenerateContentConfig) (*genai.GenerateContentResponse, error) {
	if m.err != nil {
		return nil, m.err
	}
	parts := make([]*genai.Part, 0, len(m.fnCalls))
	for _, call := range m.fnCalls {
		parts = append(parts, &genai.Part{
			FunctionCall: call,
		})
	}
	return &genai.GenerateContentResponse{
		Candidates: []*genai.Candidate{
			{
				Content: &genai.Content{
					Parts: parts,
				},
			},
		},
	}, nil
}

type fakeSender struct{}

func (f *fakeSender) Send(ctx context.Context, sub *push.WebPushSubscription, payload []byte) error {
	return nil
}

func setupAPITestServer(t *testing.T, ai mark.AIClient) *httptest.Server {
	t.Helper()
	tempDir := t.TempDir()
	storage, err := push.NewStorage(tempDir)
	if err != nil {
		t.Fatalf("failed to init storage: %v", err)
	}

	pushOpts := push.PushOptions{
		StorageRoot:     tempDir,
		VAPIDPublicKey:  "test-pub-key",
		VAPIDPrivateKey: "test-priv-key",
		VAPIDSubject:    "mailto:test@tildom.app",
		TickInterval:    100 * time.Millisecond,
	}

	pushServer := push.NewPushServer(pushOpts, storage, &fakeSender{})
	cfg := Config{
		Port:           "8788",
		GeminiModel:    "gemini-3.5-flash-lite",
		AllowedOrigins: []string{"https://mark.tildom.app", "https://do.tildom.app"},
	}

	server := NewServer(cfg, ai, pushServer)
	httpServer := httptest.NewServer(server)
	t.Cleanup(func() {
		httpServer.Close()
	})

	return httpServer
}

func TestHealthEndpoint(t *testing.T) {
	httpServer := setupAPITestServer(t, nil)

	resp, err := http.Get(httpServer.URL + "/health")
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}

	var body map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode JSON: %v", err)
	}
	if body["ok"] != true {
		t.Errorf("ok = %v, want true", body["ok"])
	}
}

func TestCORS(t *testing.T) {
	httpServer := setupAPITestServer(t, nil)

	t.Run("allows configured origin", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodOptions, httpServer.URL+"/v1/mark/tags", nil)
		req.Header.Set("Origin", "https://mark.tildom.app")
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("preflight failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusNoContent {
			t.Fatalf("status = %d, want 204", resp.StatusCode)
		}
		if resp.Header.Get("Access-Control-Allow-Origin") != "https://mark.tildom.app" {
			t.Errorf("allow-origin = %q, want https://mark.tildom.app", resp.Header.Get("Access-Control-Allow-Origin"))
		}
	})

	t.Run("allows localhost with port", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodOptions, httpServer.URL+"/v1/do/breakdown", nil)
		req.Header.Set("Origin", "http://localhost:5173")
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("preflight failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusNoContent {
			t.Fatalf("status = %d, want 204", resp.StatusCode)
		}
		if resp.Header.Get("Access-Control-Allow-Origin") != "http://localhost:5173" {
			t.Errorf("allow-origin = %q, want http://localhost:5173", resp.Header.Get("Access-Control-Allow-Origin"))
		}
	})

	t.Run("rejects unknown origin", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodOptions, httpServer.URL+"/v1/mark/tags", nil)
		req.Header.Set("Origin", "https://malicious.com")
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("preflight failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.Header.Get("Access-Control-Allow-Origin") != "" {
			t.Errorf("expected no allow-origin header, got %q", resp.Header.Get("Access-Control-Allow-Origin"))
		}
	})

	t.Run("push routes enforce allowed origin", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodOptions, httpServer.URL+"/v1/push/public-key", nil)
		req.Header.Set("Origin", "https://mark.tildom.app")
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("preflight failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.Header.Get("Access-Control-Allow-Origin") != "https://mark.tildom.app" {
			t.Errorf("push allow-origin = %q, want https://mark.tildom.app", resp.Header.Get("Access-Control-Allow-Origin"))
		}

		// Unknown origin rejected
		reqBad, _ := http.NewRequest(http.MethodOptions, httpServer.URL+"/v1/push/public-key", nil)
		reqBad.Header.Set("Origin", "https://untrusted.com")
		respBad, err := http.DefaultClient.Do(reqBad)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer respBad.Body.Close()
		if respBad.Header.Get("Access-Control-Allow-Origin") != "" {
			t.Errorf("expected no allow-origin for untrusted origin, got %q", respBad.Header.Get("Access-Control-Allow-Origin"))
		}
	})
}

func TestMarkTags_Endpoint(t *testing.T) {
	mockAI := &mockAIClient{
		fnCalls: []*genai.FunctionCall{
			{
				Name: "setTags",
				Args: map[string]any{
					"tags": []any{"tech", "news"},
				},
			},
		},
	}

	t.Run("returns 200 with tags", func(t *testing.T) {
		httpServer := setupAPITestServer(t, mockAI)
		body := `{"title": "Tech News", "url": "https://example.com/tech"}`
		req, _ := http.NewRequest(http.MethodPost, httpServer.URL+"/v1/mark/tags", bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Origin", "https://mark.tildom.app")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			t.Fatalf("status = %d, want 200", resp.StatusCode)
		}

		var res struct {
			Tags []string `json:"tags"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}
		if len(res.Tags) != 2 || res.Tags[0] != "tech" {
			t.Errorf("unexpected tags: %v", res.Tags)
		}
	})

	t.Run("returns 429 when rate limit exceeded", func(t *testing.T) {
		httpServer := setupAPITestServer(t, mockAI)
		body := `{"title": "Tech News", "url": "https://example.com/tech"}`

		// Policy is 10 reqs per minute
		for i := 0; i < 10; i++ {
			req, _ := http.NewRequest(http.MethodPost, httpServer.URL+"/v1/mark/tags", bytes.NewBufferString(body))
			req.Header.Set("Content-Type", "application/json")
			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				t.Fatal(err)
			}
			resp.Body.Close()
		}

		// 11th request must be blocked
		req, _ := http.NewRequest(http.MethodPost, httpServer.URL+"/v1/mark/tags", bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusTooManyRequests {
			t.Fatalf("expected 429, got %d", resp.StatusCode)
		}
		if resp.Header.Get("Retry-After") == "" {
			t.Error("expected Retry-After header")
		}
	})
}

func TestDoBreakdown_Endpoint(t *testing.T) {
	mockAI := &mockAIClient{
		fnCalls: []*genai.FunctionCall{
			{
				Name: "createTasks",
				Args: map[string]any{
					"title": "Do laundry",
					"tasks": []any{
						map[string]any{"content": "Sort clothes"},
						map[string]any{"content": "Start washer"},
					},
				},
			},
		},
	}

	t.Run("returns 200 with tasks", func(t *testing.T) {
		httpServer := setupAPITestServer(t, mockAI)
		body := `{"task": "Do laundry", "granularity": "medium"}`
		req, _ := http.NewRequest(http.MethodPost, httpServer.URL+"/v1/do/breakdown", bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Origin", "https://do.tildom.app")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			t.Fatalf("status = %d, want 200", resp.StatusCode)
		}

		var res struct {
			OK     bool   `json:"ok"`
			Action string `json:"action"`
			Title  string `json:"title"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}
		if !res.OK || res.Action != "createTasks" || res.Title != "Do laundry" {
			t.Errorf("unexpected breakdown response: %+v", res)
		}
	})

	t.Run("returns 400 for empty task", func(t *testing.T) {
		httpServer := setupAPITestServer(t, mockAI)
		body := `{"task": "   "}`
		req, _ := http.NewRequest(http.MethodPost, httpServer.URL+"/v1/do/breakdown", bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
	})

	t.Run("returns 429 when rate limit exceeded", func(t *testing.T) {
		httpServer := setupAPITestServer(t, mockAI)
		body := `{"task": "Do laundry"}`

		// Policy is 5 reqs per minute
		for i := 0; i < 5; i++ {
			req, _ := http.NewRequest(http.MethodPost, httpServer.URL+"/v1/do/breakdown", bytes.NewBufferString(body))
			req.Header.Set("Content-Type", "application/json")
			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				t.Fatal(err)
			}
			resp.Body.Close()
		}

		// 6th request
		req, _ := http.NewRequest(http.MethodPost, httpServer.URL+"/v1/do/breakdown", bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusTooManyRequests {
			t.Fatalf("expected 429, got %d", resp.StatusCode)
		}
	})
}

func TestFeatureEndpointsRejectOversizedAndTrailingJSON(t *testing.T) {
	for _, path := range []string{"/v1/mark/metadata", "/v1/mark/tags", "/v1/do/breakdown"} {
		t.Run(path, func(t *testing.T) {
			server := NewServer(Config{}, nil, nil)
			for _, scenario := range []struct {
				body   string
				status int
			}{
				{`{"ignored":"` + strings.Repeat("x", maxRequestBytes) + `"}`, http.StatusRequestEntityTooLarge},
				{`{} {}`, http.StatusBadRequest},
				{`{} garbage`, http.StatusBadRequest},
			} {
				req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(scenario.body))
				rec := httptest.NewRecorder()
				server.ServeHTTP(rec, req)
				if rec.Code != scenario.status {
					t.Fatalf("status = %d, want %d", rec.Code, scenario.status)
				}
			}
		})
	}
}

func TestFeatureEndpointErrorStatuses(t *testing.T) {
	for _, scenario := range []struct {
		name, path, body string
		ai               mark.AIClient
		status           int
	}{
		{"tags unconfigured", "/v1/mark/tags", `{"title":"Go","url":"https://example.com"}`, nil, http.StatusServiceUnavailable},
		{"breakdown unconfigured", "/v1/do/breakdown", `{"task":"Clean"}`, nil, http.StatusServiceUnavailable},
		{"tags invalid without AI", "/v1/mark/tags", `{}`, nil, http.StatusBadRequest},
		{"breakdown invalid without AI", "/v1/do/breakdown", `{}`, nil, http.StatusBadRequest},
		{"tags invalid provider result", "/v1/mark/tags", `{"title":"Go","url":"https://example.com"}`, &mockAIClient{fnCalls: []*genai.FunctionCall{{Name: "setTags", Args: map[string]any{"tags": 42}}}}, http.StatusUnprocessableEntity},
		{"breakdown invalid provider result", "/v1/do/breakdown", `{"task":"Clean"}`, &mockAIClient{fnCalls: []*genai.FunctionCall{{Name: "createTasks", Args: map[string]any{}}}}, http.StatusUnprocessableEntity},
		{"provider failure", "/v1/do/breakdown", `{"task":"Clean"}`, &mockAIClient{err: errors.New("provider unavailable")}, http.StatusInternalServerError},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			server := NewServer(Config{}, scenario.ai, nil)
			rec := httptest.NewRecorder()
			server.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, scenario.path, strings.NewReader(scenario.body)))
			if rec.Code != scenario.status {
				t.Fatalf("status = %d, want %d", rec.Code, scenario.status)
			}
		})
	}
}
