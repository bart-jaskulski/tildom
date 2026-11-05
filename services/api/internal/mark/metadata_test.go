package mark

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestParsePageMetadata_DocumentTitle(t *testing.T) {
	html := "<title>Example article title</title>"
	meta := ParsePageMetadata(html, "https://example.com/article")
	if meta.Title == nil || *meta.Title != "Example article title" {
		t.Fatalf("expected title 'Example article title', got %v", meta.Title)
	}
}

func TestParsePageMetadata_ArticleReaderMode(t *testing.T) {
	html := `
		<html><head><title>Reader title</title></head><body>
			<article><h1>Reader title</h1><p>A readable <strong>article</strong>.</p></article>
		</body></html>
	`
	meta := ParsePageMetadata(html, "https://example.com/article")
	if meta.Title == nil || *meta.Title != "Reader title" {
		t.Fatalf("expected title 'Reader title', got %v", meta.Title)
	}
	if meta.Capture == nil {
		t.Fatalf("expected capture to be present")
	}
	if !strings.Contains(meta.Capture.Markdown, "A readable **article**.") {
		t.Errorf("markdown does not contain expected text: %s", meta.Capture.Markdown)
	}
	if meta.Capture.SourceURL != "https://example.com/article" {
		t.Errorf("sourceUrl = %s, want https://example.com/article", meta.Capture.SourceURL)
	}
}

func TestParsePageMetadata_RemovesImagesAndTrackingParams(t *testing.T) {
	html := `
		<html><head><title>Reader title</title></head><body>
			<article>
				<h1>Reader title</h1>
				<p>Read <a href="/next?utm_source=test&keep=yes">more</a>.</p>
				<a href="https://cdn.example.com/image.jpg"><img src="https://cdn.example.com/image.jpg" alt="ignored"></a>
			</article>
		</body></html>
	`
	meta := ParsePageMetadata(html, "https://example.com/article")
	if meta.Capture == nil {
		t.Fatalf("expected capture to be present")
	}
	md := meta.Capture.Markdown
	if !strings.Contains(md, "keep=yes") {
		t.Errorf("expected keep=yes in markdown, got: %s", md)
	}
	if strings.Contains(md, "utm_source") {
		t.Errorf("expected utm_source to be removed, got: %s", md)
	}
	if strings.Contains(md, "![") {
		t.Errorf("expected no image tags in markdown, got: %s", md)
	}
	if strings.Contains(md, "[](") {
		t.Errorf("expected no empty anchors in markdown, got: %s", md)
	}
}

func TestFetchRejectsUnsafeURLs(t *testing.T) {
	for _, target := range []string{
		"http://127.0.0.1/private", "http://localhost/test", "http://10.0.0.1/admin",
		"http://192.168.1.1/router", "http://[::1]/", "ftp://example.com", "http://user:pass@example.com",
	} {
		if _, err := FetchPageMetadata(context.Background(), target); err == nil {
			t.Errorf("accepted %s", target)
		}
	}
}

// The real HTTP transport dials a local server after validating the fake DNS result.
func metadataTransport(t *testing.T, handler http.Handler) *http.Transport {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	transport := &http.Transport{DialContext: publicDialContext(
		func(ctx context.Context, network, host string) ([]net.IP, error) {
			if host == "private.example" {
				return []net.IP{net.ParseIP("127.0.0.1")}, nil
			}
			return []net.IP{net.ParseIP("93.184.216.34")}, nil
		},
		func(ctx context.Context, network, address string) (net.Conn, error) {
			host, _, err := net.SplitHostPort(address)
			if err != nil {
				return nil, err
			}
			if host != "93.184.216.34" {
				t.Errorf("dialed unvalidated address %s", address)
			}
			return (&net.Dialer{}).DialContext(ctx, network, server.Listener.Addr().String())
		},
	)}
	t.Cleanup(transport.CloseIdleConnections)
	return transport
}

func TestFetchFollowsRedirectAndReadsLateTitle(t *testing.T) {
	transport := metadataTransport(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/start" {
			http.Redirect(w, r, "/article", http.StatusFound)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte("<html><head>" + strings.Repeat(" ", 700_000) + "<title>Late title</title></head><body><article><p>Article content</p></article></body></html>"))
	}))
	meta, err := fetchPageMetadata(context.Background(), "http://public.example/start", transport)
	if err != nil {
		t.Fatal(err)
	}
	if meta.Title == nil || *meta.Title != "Late title" {
		t.Fatalf("unexpected title: %v", meta.Title)
	}
	if meta.Capture == nil || meta.Capture.SourceURL != "http://public.example/article" {
		t.Fatalf("unexpected capture: %+v", meta.Capture)
	}
}

func TestFetchRejectsPrivateRedirect(t *testing.T) {
	transport := metadataTransport(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "http://private.example/secret", http.StatusFound)
	}))
	_, err := fetchPageMetadata(context.Background(), "http://public.example/start", transport)
	if !errors.Is(err, ErrPrivateURL) {
		t.Fatalf("expected private redirect rejection, got %v", err)
	}
}

func TestFetchBoundsResponse(t *testing.T) {
	transport := metadataTransport(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(strings.Repeat(" ", maxHTMLBytes) + "<title>Outside limit</title>"))
	}))
	meta, err := fetchPageMetadata(context.Background(), "http://public.example/article", transport)
	if err != nil {
		t.Fatal(err)
	}
	if meta.Title != nil {
		t.Fatalf("read beyond response limit: %s", *meta.Title)
	}
}

func TestFetchHonorsDeadline(t *testing.T) {
	transport := metadataTransport(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	}))
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	_, err := fetchPageMetadata(ctx, "http://public.example/slow", transport)
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected deadline, got %v", err)
	}
}

func TestDialRejectsMixedPublicAndPrivateAnswers(t *testing.T) {
	dial := publicDialContext(
		func(context.Context, string, string) ([]net.IP, error) {
			return []net.IP{net.ParseIP("93.184.216.34"), net.ParseIP("10.0.0.1")}, nil
		},
		func(context.Context, string, string) (net.Conn, error) {
			t.Fatal("dialed unsafe DNS answer")
			return nil, nil
		},
	)
	_, err := dial(context.Background(), "tcp", "mixed.example:80")
	if !errors.Is(err, ErrPrivateURL) {
		t.Fatalf("expected private URL error, got %v", err)
	}
}
