package push

import (
	"testing"
	"time"
)

func TestCalculateNextRun_Cron(t *testing.T) {
	// Base time: 2026-06-15 10:00:00 UTC
	base := time.Date(2026, 6, 15, 10, 0, 0, 0, time.UTC)

	tests := []struct {
		name        string
		schedule    string
		tz          string
		wantHourUTC int
		wantDay     int
		wantErr     bool
	}{
		{
			name:        "daily 09:00 UTC",
			schedule:    "0 9 * * *",
			tz:          "UTC",
			wantHourUTC: 9,
			wantDay:     16, // next day since 10:00 > 09:00
		},
		{
			name:        "daily 12:00 UTC",
			schedule:    "0 12 * * *",
			tz:          "UTC",
			wantHourUTC: 12,
			wantDay:     15, // same day
		},
		{
			name:        "daily 09:00 in America/New_York (EDT = UTC-4)",
			schedule:    "0 9 * * *",
			tz:          "America/New_York",
			wantHourUTC: 13, // 09:00 EDT = 13:00 UTC
			wantDay:     15, // same day: 13:00 UTC is after 10:00 UTC
		},
		{
			name:        "daily 09:00 in Europe/Warsaw (CEST = UTC+2)",
			schedule:    "0 9 * * *",
			tz:          "Europe/Warsaw",
			wantHourUTC: 7,  // 09:00 CEST = 07:00 UTC
			wantDay:     16, // next day: 07:00 UTC was before 10:00 UTC base
		},
		{
			name:     "invalid cron expression",
			schedule: "not a cron",
			tz:       "UTC",
			wantErr:  true,
		},
		{
			name:     "invalid timezone",
			schedule: "0 9 * * *",
			tz:       "Fake/NonExistentZone",
			wantErr:  true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := CalculateNextRun(tt.schedule, "", tt.tz, base)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got.Hour() != tt.wantHourUTC {
				t.Errorf("expected UTC hour %d, got %d (full: %s)", tt.wantHourUTC, got.Hour(), got)
			}
			if got.Day() != tt.wantDay {
				t.Errorf("expected day %d, got %d", tt.wantDay, got.Day())
			}
		})
	}
}

func TestCalculateNextRun_DeliverAt(t *testing.T) {
	base := time.Date(2026, 6, 15, 10, 0, 0, 0, time.UTC)

	t.Run("future timestamp", func(t *testing.T) {
		deliverAt := "2026-06-15T12:00:00Z"
		got, err := CalculateNextRun("", deliverAt, "", base)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		want := time.Date(2026, 6, 15, 12, 0, 0, 0, time.UTC)
		if !got.Equal(want) {
			t.Errorf("got %v, want %v", got, want)
		}
	})

	t.Run("past timestamp is rejected", func(t *testing.T) {
		deliverAt := "2026-06-15T08:00:00Z"
		_, err := CalculateNextRun("", deliverAt, "", base)
		if err == nil {
			t.Fatal("expected error for past timestamp, got nil")
		}
	})

	t.Run("malformed timestamp is rejected", func(t *testing.T) {
		_, err := CalculateNextRun("", "not-a-timestamp", "", base)
		if err == nil {
			t.Fatal("expected error for malformed timestamp, got nil")
		}
	})

	t.Run("neither schedule nor deliverAt returns error", func(t *testing.T) {
		_, err := CalculateNextRun("", "", "", base)
		if err == nil {
			t.Fatal("expected error when neither provided, got nil")
		}
	})
}
