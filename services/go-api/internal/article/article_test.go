package article

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestFetch(t *testing.T) {
	html, err := os.ReadFile("testdata/basic-article.html")
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(html)
	}))
	defer server.Close()

	article, err := Fetch(context.Background(), server.URL)

	if err != nil {
		t.Fatalf("Fetch returned an error: %v", err)
	}

	if !strings.Contains(article.Markdown, "minimal article") {
		t.Errorf("Expected Markdown to be 'body', got '%s'", article.Markdown)
	}
}
