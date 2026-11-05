package ratelimit

import (
	"net/http"
	"net/netip"
	"strings"
	"sync"
	"time"
)

type Policy struct {
	ID          string
	MaxRequests int
	Window      time.Duration
}

type bucket struct {
	count   int
	resetAt time.Time
}

type Limiter struct {
	mu      sync.Mutex
	buckets map[string]*bucket
}

func NewLimiter() *Limiter {
	return &Limiter{
		buckets: make(map[string]*bucket),
	}
}

// ClientKey trusts X-Forwarded-For only across explicitly trusted proxy hops.
func ClientKey(r *http.Request, route string, trustedProxies []netip.Prefix) string {
	peer, err := netip.ParseAddrPort(r.RemoteAddr)
	if err != nil {
		return route + ":unknown"
	}
	ip := peer.Addr().Unmap()
	hops := strings.Split(r.Header.Get("X-Forwarded-For"), ",")
	for i := len(hops) - 1; i >= 0; i-- {
		trusted := false
		for _, prefix := range trustedProxies {
			if prefix.Contains(ip) {
				trusted = true
				break
			}
		}
		if !trusted {
			break
		}
		next, err := netip.ParseAddr(strings.TrimSpace(hops[i]))
		if err != nil {
			break
		}
		ip = next.Unmap()
	}
	return route + ":" + ip.String()
}

func (l *Limiter) Allow(key string, policies []Policy, now time.Time) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()

	// Clean up old buckets periodically if map grows large
	if len(l.buckets) > 1024 {
		for k, b := range l.buckets {
			if !now.Before(b.resetAt) {
				delete(l.buckets, k)
			}
		}
	}

	for _, policy := range policies {
		b := l.buckets[policy.ID+":"+key]
		if b != nil && now.Before(b.resetAt) && b.count >= policy.MaxRequests {
			return false, max(time.Second, b.resetAt.Sub(now))
		}
	}
	for _, policy := range policies {
		id := policy.ID + ":" + key
		b := l.buckets[id]
		if b == nil || !now.Before(b.resetAt) {
			b = &bucket{resetAt: now.Add(policy.Window)}
			l.buckets[id] = b
		}
		b.count++
	}
	return true, 0
}
