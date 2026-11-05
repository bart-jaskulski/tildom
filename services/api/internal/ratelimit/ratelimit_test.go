package ratelimit

import (
	"net/http/httptest"
	"net/netip"
	"testing"
	"time"
)

func TestLimiter(t *testing.T) {
	limiter := NewLimiter()
	policies := []Policy{
		{ID: "test-1m", MaxRequests: 2, Window: time.Minute},
	}
	now := time.Now()

	key := "test:127.0.0.1:browser"

	allowed, retry := limiter.Allow(key, policies, now)
	if !allowed || retry != 0 {
		t.Fatalf("first request should be allowed")
	}

	allowed, retry = limiter.Allow(key, policies, now.Add(time.Second))
	if !allowed || retry != 0 {
		t.Fatalf("second request should be allowed")
	}

	allowed, retry = limiter.Allow(key, policies, now.Add(2*time.Second))
	if allowed {
		t.Fatalf("third request should be blocked")
	}
	if retry <= 0 {
		t.Fatalf("retryAfter should be positive")
	}

	// Advance past window
	allowed, retry = limiter.Allow(key, policies, now.Add(65*time.Second))
	if !allowed || retry != 0 {
		t.Fatalf("request after window should be allowed")
	}
}

func TestClientQuotaSurvivesConnectionAndHeaderChanges(t *testing.T) {
	limiter := NewLimiter()
	policies := []Policy{{ID: "test", MaxRequests: 1, Window: time.Minute}}
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	first := httptest.NewRequest("POST", "/", nil)
	first.RemoteAddr = "192.0.2.1:1234"
	second := httptest.NewRequest("POST", "/", nil)
	second.RemoteAddr = "192.0.2.1:5678"
	second.Header.Set("X-Forwarded-For", "198.51.100.2")
	second.Header.Set("CF-Connecting-IP", "198.51.100.3")
	second.Header.Set("X-Real-IP", "198.51.100.4")
	second.Header.Set("User-Agent", "different browser")
	if allowed, _ := limiter.Allow(ClientKey(first, "tags", nil), policies, now); !allowed {
		t.Fatal("first request rejected")
	}
	if allowed, _ := limiter.Allow(ClientKey(second, "tags", nil), policies, now); allowed {
		t.Fatal("connection or spoofed headers reset quota")
	}
	if allowed, _ := limiter.Allow(ClientKey(second, "tags", nil), policies, now.Add(time.Minute)); !allowed {
		t.Fatal("quota did not reset at window boundary")
	}
}

func TestTrustedProxyUsesNearestUntrustedHop(t *testing.T) {
	trusted := []netip.Prefix{netip.MustParsePrefix("10.0.0.0/8")}
	req := httptest.NewRequest("POST", "/", nil)
	req.RemoteAddr = "10.0.0.1:1234"
	req.Header.Set("X-Forwarded-For", "203.0.113.99, 192.0.2.1, 10.0.0.2")
	if got := ClientKey(req, "tags", trusted); got != "tags:192.0.2.1" {
		t.Fatalf("client key = %s", got)
	}
	req.Header.Set("X-Forwarded-For", "203.0.113.99, invalid")
	if got := ClientKey(req, "tags", trusted); got != "tags:10.0.0.1" {
		t.Fatalf("malformed header changed client: %s", got)
	}
}

func TestRejectedRequestDoesNotConsumeOtherPolicy(t *testing.T) {
	limiter := NewLimiter()
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	short := Policy{ID: "minute", MaxRequests: 1, Window: time.Minute}
	long := Policy{ID: "hour", MaxRequests: 2, Window: time.Hour}
	policies := []Policy{long, short}
	if allowed, _ := limiter.Allow("client", policies, now); !allowed {
		t.Fatal("first request rejected")
	}
	if allowed, _ := limiter.Allow("client", policies, now.Add(time.Second)); allowed {
		t.Fatal("minute quota not enforced")
	}
	if allowed, _ := limiter.Allow("client", policies, now.Add(time.Minute)); !allowed {
		t.Fatal("rejection consumed hourly quota")
	}
	if allowed, _ := limiter.Allow("client", policies, now.Add(2*time.Minute)); allowed {
		t.Fatal("hour quota not enforced")
	}
}
