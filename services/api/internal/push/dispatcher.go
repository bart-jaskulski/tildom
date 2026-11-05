package push

import (
	"context"
	"errors"
	"log"
	"time"
)

type Dispatcher struct {
	storage  *Storage
	sender   PushSender
	interval time.Duration
}

func NewDispatcher(storage *Storage, sender PushSender, interval time.Duration) *Dispatcher {
	if interval <= 0 {
		interval = 30 * time.Second
	}
	return &Dispatcher{
		storage:  storage,
		sender:   sender,
		interval: interval,
	}
}

// Start runs the periodic ticker loop until ctx is cancelled.
func (d *Dispatcher) Start(ctx context.Context) {
	ticker := time.NewTicker(d.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case t := <-ticker.C:
			if _, err := d.Tick(ctx, t); err != nil {
				log.Printf("dispatcher error during tick: %v", err)
			}
		}
	}
}

// Tick executes a single dispatch cycle evaluated at the given time.
// Returns the count of dispatched reminders.
func (d *Dispatcher) Tick(ctx context.Context, now time.Time) (int, error) {
	records, err := d.storage.ListAll()
	if err != nil {
		return 0, err
	}

	dispatched := 0
	for _, record := range records {
		var activeReminders []StoredReminder
		recordModified := false
		expired := false

		for _, rem := range record.Reminders {
			if !rem.NextRun.After(now) {
				// Due for dispatch
				err := d.sender.Send(ctx, &record.Subscription, []byte(rem.Ciphertext))
				if errors.Is(err, ErrSubscriptionExpired) {
					// Subscription no longer valid; drop entire record
					_ = d.storage.Delete(record.SubID)
					expired = true
					break
				}

				dispatched++
				recordModified = true

				if rem.Schedule != "" {
					// Recurring: calculate next occurrence after now
					next, err := CalculateNextRun(rem.Schedule, "", record.Timezone, now)
					if err == nil && !next.IsZero() {
						rem.NextRun = next
						activeReminders = append(activeReminders, rem)
					}
				}
				// If one-shot, do not re-add to activeReminders
			} else {
				activeReminders = append(activeReminders, rem)
			}
		}

		if expired {
			continue
		}

		if recordModified {
			record.Reminders = activeReminders
			record.UpdatedAt = now
			if err := d.storage.Save(record); err != nil {
				log.Printf("failed to update record %s after dispatch: %v", record.SubID, err)
			}
		}
	}

	return dispatched, nil
}
