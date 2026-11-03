package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

// fakeSender records all sent notifications in-memory for testing.
type fakeSender struct {
	mu        sync.Mutex
	delivered []delivery
	errToReturn error
}

type delivery struct {
	Endpoint string
	Payload  string
}

func (f *fakeSender) Send(ctx context.Context, sub *WebPushSubscription, payload []byte) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.errToReturn != nil {
		return f.errToReturn
	}
	f.delivered = append(f.delivered, delivery{
		Endpoint: sub.Endpoint,
		Payload:  string(payload),
	})
	return nil
}

func (f *fakeSender) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.delivered)
}

func (f *fakeSender) last() (delivery, bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.delivered) == 0 {
		return delivery{}, false
	}
	return f.delivered[len(f.delivered)-1], true
}

func setupTestServer(t *testing.T) (*httptest.Server, *PushServer, *Storage, *fakeSender) {
	t.Helper()
	tempDir := t.TempDir()
	storage, err := NewStorage(tempDir)
	if err != nil {
		t.Fatalf("failed to init test storage: %v", err)
	}

	sender := &fakeSender{}
	opts := PushOptions{
		StorageRoot:     tempDir,
		VAPIDPublicKey:  "test-public-key-12345",
		VAPIDPrivateKey: "test-private-key-67890",
		VAPIDSubject:    "mailto:test@tildom.app",
		TickInterval:    10 * time.Millisecond,
	}

	server := NewPushServer(opts, storage, sender)
	httpServer := httptest.NewServer(server)
	t.Cleanup(func() {
		httpServer.Close()
	})

	return httpServer, server, storage, sender
}

func TestHealthAndPublicKey(t *testing.T) {
	httpServer, _, _, _ := setupTestServer(t)

	t.Run("GET /health returns 200 ok", func(t *testing.T) {
		resp, err := http.Get(httpServer.URL + "/health")
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			t.Fatalf("status = %d, want 200", resp.StatusCode)
		}

		var body map[string]string
		if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}
		if body["status"] != "ok" {
			t.Errorf("got status %q, want ok", body["status"])
		}
	})

	t.Run("GET /v1/push/public-key returns configured VAPID key", func(t *testing.T) {
		resp, err := http.Get(httpServer.URL + "/v1/push/public-key")
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			t.Fatalf("status = %d, want 200", resp.StatusCode)
		}

		var body map[string]string
		if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}
		if body["publicKey"] != "test-public-key-12345" {
			t.Errorf("got publicKey %q, want test-public-key-12345", body["publicKey"])
		}
	})

	t.Run("OPTIONS /v1/push/public-key returns 204 with CORS wildcard", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodOptions, httpServer.URL+"/v1/push/public-key", nil)
		req.Header.Set("Origin", "https://anything.example.com")
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("preflight failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusNoContent {
			t.Fatalf("status = %d, want 204", resp.StatusCode)
		}
		if resp.Header.Get("Access-Control-Allow-Origin") != "*" {
			t.Errorf("allow-origin = %q, want *", resp.Header.Get("Access-Control-Allow-Origin"))
		}
	})
}

func TestSubscriptionLifecycleAndDispatch(t *testing.T) {
	httpServer, pushServer, storage, sender := setupTestServer(t)

	subID := "sub_opaque_9f82a1"
	putURL := httpServer.URL + "/v1/push/subscriptions/" + subID

	now := time.Now().UTC()
	oneShotTime := now.Add(1 * time.Hour).Format(time.RFC3339)

	input := SubscriptionInput{
		Subscription: WebPushSubscription{
			Endpoint: "https://push.apple.com/endpoint/test-1",
			Keys: WebPushKeys{
				P256dh: "key-p256dh-abc",
				Auth:   "auth-secret-xyz",
			},
		},
		Timezone: "UTC",
		Reminders: []ReminderInput{
			{
				ID:         "rem_oneshot_1",
				DeliverAt:  oneShotTime,
				Ciphertext: "ciphertext-oneshot",
			},
			{
				ID:         "rem_cron_annual",
				Schedule:   "0 9 14 5 *", // May 14 at 09:00 UTC
				Ciphertext: "ciphertext-alice-birthday",
			},
		},
	}

	bodyBytes, _ := json.Marshal(input)

	// Step 1: PUT subscription
	req, _ := http.NewRequest(http.MethodPut, putURL, bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("PUT failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("PUT status = %d, want 200", resp.StatusCode)
	}

	// Verify persisted on disk
	stored, err := storage.Get(subID)
	if err != nil {
		t.Fatalf("expected record on disk: %v", err)
	}
	if len(stored.Reminders) != 2 {
		t.Fatalf("stored reminders count = %d, want 2", len(stored.Reminders))
	}

	// Step 2: Dispatcher tick at now -> nothing due
	dispatched, err := pushServer.dispatcher.Tick(context.Background(), now)
	if err != nil {
		t.Fatalf("tick failed: %v", err)
	}
	if dispatched != 0 || sender.count() != 0 {
		t.Fatalf("expected 0 dispatched at now, got %d", dispatched)
	}

	// Step 3: Advance tick past one-shot time -> one-shot dispatches
	advanceToOneShot := now.Add(2 * time.Hour)
	dispatched, err = pushServer.dispatcher.Tick(context.Background(), advanceToOneShot)
	if err != nil {
		t.Fatalf("tick failed: %v", err)
	}
	if dispatched != 1 || sender.count() != 1 {
		t.Fatalf("expected 1 dispatched, got %d (sender count %d)", dispatched, sender.count())
	}

	lastDel, _ := sender.last()
	if lastDel.Payload != "ciphertext-oneshot" {
		t.Errorf("got payload %q, want ciphertext-oneshot", lastDel.Payload)
	}
	if lastDel.Endpoint != "https://push.apple.com/endpoint/test-1" {
		t.Errorf("got endpoint %q", lastDel.Endpoint)
	}

	// Verify one-shot is pruned from storage, recurring cron remains
	stored, err = storage.Get(subID)
	if err != nil {
		t.Fatalf("expected record to remain: %v", err)
	}
	if len(stored.Reminders) != 1 {
		t.Fatalf("expected 1 remaining reminder, got %d", len(stored.Reminders))
	}
	if stored.Reminders[0].ID != "rem_cron_annual" {
		t.Errorf("remaining reminder = %s, want rem_cron_annual", stored.Reminders[0].ID)
	}

	// Step 4: Advance tick past May 14, 2026 09:00 UTC -> cron reminder dispatches
	may14Next := time.Date(now.Year(), 5, 14, 9, 30, 0, 0, time.UTC)
	if may14Next.Before(now) {
		may14Next = time.Date(now.Year()+1, 5, 14, 9, 30, 0, 0, time.UTC)
	}

	dispatched, err = pushServer.dispatcher.Tick(context.Background(), may14Next)
	if err != nil {
		t.Fatalf("tick failed: %v", err)
	}
	if dispatched != 1 || sender.count() != 2 {
		t.Fatalf("expected 1 dispatched, got %d (sender count %d)", dispatched, sender.count())
	}

	lastDel, _ = sender.last()
	if lastDel.Payload != "ciphertext-alice-birthday" {
		t.Errorf("got payload %q, want ciphertext-alice-birthday", lastDel.Payload)
	}

	// Verify cron reminder was not deleted, but advanced to the next year
	stored, err = storage.Get(subID)
	if err != nil {
		t.Fatalf("failed to get stored: %v", err)
	}
	if len(stored.Reminders) != 1 {
		t.Fatalf("expected 1 remaining reminder, got %d", len(stored.Reminders))
	}
	expectedNextYear := time.Date(may14Next.Year()+1, 5, 14, 9, 0, 0, 0, time.UTC)
	if !stored.Reminders[0].NextRun.Equal(expectedNextYear) {
		t.Errorf("next run = %v, want %v", stored.Reminders[0].NextRun, expectedNextYear)
	}

	// Step 5: DELETE subscription
	delReq, _ := http.NewRequest(http.MethodDelete, putURL, nil)
	delResp, err := http.DefaultClient.Do(delReq)
	if err != nil {
		t.Fatalf("DELETE failed: %v", err)
	}
	defer delResp.Body.Close()

	if delResp.StatusCode != http.StatusOK {
		t.Fatalf("DELETE status = %d, want 200", delResp.StatusCode)
	}

	// Verify deleted from disk
	_, err = storage.Get(subID)
	if err == nil {
		t.Fatal("expected record to be deleted, but still exists")
	}
}

func TestExpiredSubscriptionAutoCleanup(t *testing.T) {
	_, pushServer, storage, sender := setupTestServer(t)

	// Simulate Apple/Google returning 410 Gone / expired
	sender.errToReturn = ErrSubscriptionExpired

	subID := "sub_expired_test"
	now := time.Now().UTC()

	record := &SubscriptionRecord{
		SubID: subID,
		Subscription: WebPushSubscription{
			Endpoint: "https://push.google.com/expired",
			Keys: WebPushKeys{
				P256dh: "key",
				Auth:   "auth",
			},
		},
		Reminders: []StoredReminder{
			{
				ID:         "rem_1",
				NextRun:    now.Add(-10 * time.Minute), // past due
				Ciphertext: "secret",
			},
		},
		UpdatedAt: now,
	}

	if err := storage.Save(record); err != nil {
		t.Fatalf("failed to save: %v", err)
	}

	// Dispatcher tick
	_, err := pushServer.dispatcher.Tick(context.Background(), now)
	if err != nil {
		t.Fatalf("tick error: %v", err)
	}

	// Record must be automatically deleted from disk
	_, err = storage.Get(subID)
	if err == nil {
		t.Fatal("expected expired subscription to be deleted from disk, but still exists")
	}
}

func TestValidationErrors(t *testing.T) {
	httpServer, _, _, _ := setupTestServer(t)

	t.Run("rejects unsafe subId", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodPut, httpServer.URL+"/v1/push/subscriptions/../../bad", bytes.NewReader([]byte("{}")))
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusBadRequest && resp.StatusCode != http.StatusNotFound {
			t.Errorf("status = %d, want 400 or 404", resp.StatusCode)
		}
	})

	t.Run("rejects invalid cron expression", func(t *testing.T) {
		input := SubscriptionInput{
			Subscription: WebPushSubscription{
				Endpoint: "https://example.com/push",
				Keys:     WebPushKeys{P256dh: "abc", Auth: "xyz"},
			},
			Reminders: []ReminderInput{
				{
					ID:         "bad_cron",
					Schedule:   "invalid cron string",
					Ciphertext: "secret",
				},
			},
		}
		b, _ := json.Marshal(input)
		req, _ := http.NewRequest(http.MethodPut, httpServer.URL+"/v1/push/subscriptions/sub_valid", bytes.NewReader(b))
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusBadRequest {
			t.Errorf("status = %d, want 400 Bad Request", resp.StatusCode)
		}
	})

	t.Run("rejects missing subscription keys", func(t *testing.T) {
		input := SubscriptionInput{
			Subscription: WebPushSubscription{
				Endpoint: "https://example.com/push",
				// Missing Keys
			},
			Reminders: []ReminderInput{},
		}
		b, _ := json.Marshal(input)
		req, _ := http.NewRequest(http.MethodPut, httpServer.URL+"/v1/push/subscriptions/sub_valid", bytes.NewReader(b))
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusBadRequest {
			t.Errorf("status = %d, want 400 Bad Request", resp.StatusCode)
		}
	})
}
