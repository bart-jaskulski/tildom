package main

import (
	"regexp"
	"sync"
	"testing"
)

func TestCreateRevisionID(t *testing.T) {
	pattern := regexp.MustCompile(`^[0-9A-HJKMNP-TV-Z]{26}$`)

	prev := ""
	for i := 0; i < 1000; i++ {
		id := CreateRevisionID()
		if !pattern.MatchString(id) {
			t.Fatalf("id %q does not match ULID pattern", id)
		}
		if prev != "" && id <= prev {
			t.Fatalf("expected monotonic id: %q <= %q", id, prev)
		}
		prev = id
	}
}

func TestULIDConcurrent(t *testing.T) {
	var wg sync.WaitGroup
	count := 50
	for i := 0; i < count; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 50; j++ {
				_ = CreateRevisionID()
			}
		}()
	}
	wg.Wait()
}
