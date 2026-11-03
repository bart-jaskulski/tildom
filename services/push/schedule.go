package main

import (
	"errors"
	"fmt"
	"time"
	_ "time/tzdata"

	"github.com/robfig/cron/v3"
)

var (
	cronParser = cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow)
	errNoSchedule = errors.New("either schedule or deliverAt must be provided")
	errPastDeliverAt = errors.New("deliverAt timestamp is in the past")
)

// CalculateNextRun computes the next UTC run time for a reminder.
// If schedule is non-empty, it parses the standard 5-part cron expression evaluated in tz.
// If deliverAt is non-empty, it parses RFC3339.
func CalculateNextRun(scheduleStr, deliverAtStr, tz string, now time.Time) (time.Time, error) {
	if scheduleStr != "" {
		sched, err := cronParser.Parse(scheduleStr)
		if err != nil {
			return time.Time{}, fmt.Errorf("invalid cron expression %q: %w", scheduleStr, err)
		}

		loc := time.UTC
		if tz != "" {
			loadedLoc, err := time.LoadLocation(tz)
			if err != nil {
				return time.Time{}, fmt.Errorf("invalid timezone %q: %w", tz, err)
			}
			loc = loadedLoc
		}

		localNow := now.In(loc)
		next := sched.Next(localNow)
		if next.IsZero() {
			return time.Time{}, errors.New("cron expression produces no future runs")
		}
		return next.UTC(), nil
	}

	if deliverAtStr != "" {
		t, err := time.Parse(time.RFC3339, deliverAtStr)
		if err != nil {
			return time.Time{}, fmt.Errorf("invalid deliverAt format (expected RFC3339): %w", err)
		}
		utcTime := t.UTC()
		if utcTime.Before(now) {
			return time.Time{}, errPastDeliverAt
		}
		return utcTime, nil
	}

	return time.Time{}, errNoSchedule
}
