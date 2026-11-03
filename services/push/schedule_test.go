package main

import (
	"testing"
	"time"
)

func TestCalculateNextRun(t *testing.T) {
	// Reference base time: 2026-05-10 12:00:00 UTC
	baseTime := time.Date(2026, 5, 10, 12, 0, 0, 0, time.UTC)

	t.Run("computes upcoming annual cron date", func(t *testing.T) {
		// "0 9 14 5 *" -> May 14 at 09:00:00 in Europe/Warsaw
		next, err := CalculateNextRun("0 9 14 5 *", "", "Europe/Warsaw", baseTime)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		// Europe/Warsaw is CEST (UTC+2) on May 14, so 09:00 local is 07:00 UTC
		expected := time.Date(2026, 5, 14, 7, 0, 0, 0, time.UTC)
		if !next.Equal(expected) {
			t.Errorf("got %v, want %v", next, expected)
		}
	})

	t.Run("advances to next year when date already passed this year", func(t *testing.T) {
		// May 1 at 09:00:00 UTC has already passed relative to May 10
		next, err := CalculateNextRun("0 9 1 5 *", "", "UTC", baseTime)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		expected := time.Date(2027, 5, 1, 9, 0, 0, 0, time.UTC)
		if !next.Equal(expected) {
			t.Errorf("got %v, want %v", next, expected)
		}
	})

	t.Run("computes valid future deliverAt", func(t *testing.T) {
		futureStr := "2026-05-12T15:30:00Z"
		next, err := CalculateNextRun("", futureStr, "UTC", baseTime)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		expected := time.Date(2026, 5, 12, 15, 30, 0, 0, time.UTC)
		if !next.Equal(expected) {
			t.Errorf("got %v, want %v", next, expected)
		}
	})

	t.Run("rejects deliverAt in the past", func(t *testing.T) {
		pastStr := "2026-05-01T10:00:00Z"
		_, err := CalculateNextRun("", pastStr, "UTC", baseTime)
		if err == nil {
			t.Fatal("expected error for deliverAt in the past, got nil")
		}
	})

	t.Run("rejects invalid cron expression syntax", func(t *testing.T) {
		_, err := CalculateNextRun("not a cron", "", "UTC", baseTime)
		if err == nil {
			t.Fatal("expected error for malformed cron, got nil")
		}
	})

	t.Run("rejects empty schedule and deliverAt", func(t *testing.T) {
		_, err := CalculateNextRun("", "", "UTC", baseTime)
		if err == nil {
			t.Fatal("expected error when neither schedule nor deliverAt is provided, got nil")
		}
	})
}
