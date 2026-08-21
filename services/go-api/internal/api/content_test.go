package api

import (
	// "io"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

var tests = []struct {
	name           string
	requestBody    string
	expectedStatus int
	expectedBody   string
}{
	{
		name:           "Valid request",
		requestBody:    `{"url": "https://example.com"}`,
		expectedStatus: http.StatusOK,
		expectedBody:   "body",
	},
	{
		name:           "Empty URL",
		requestBody:    `{"url": ""}`,
		expectedStatus: http.StatusBadRequest,
	},
	{
		name:           "Invalid JSON",
		requestBody:    `{"url": "https://example.com"`,
		expectedStatus: http.StatusBadRequest,
	},
}

func TestContentHandler(t *testing.T) {
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("POST", "/content", strings.NewReader(tt.requestBody))
			req.Header.Set("Content-Type", "application/json")

			rec := httptest.NewRecorder()
			ContentHandler(rec, req)

			res := rec.Result()

			if res.StatusCode != tt.expectedStatus {
				t.Fatalf("status = %d; want %d", res.StatusCode, tt.expectedStatus)
			}

			if tt.expectedBody == "" {
				return
			}

			var content struct {
				Body string `json:"body"`
			}
			if err := json.NewDecoder(res.Body).Decode(&content); err != nil {
				t.Fatal(err)
			}

			if content.Body != tt.expectedBody {
				t.Fatalf("body = %q; want %q", content.Body, "body")
			}
		})
	}
}
