package main

import (
	"time"
)

// WebPushKeys contains the client's P-256 public key and auth secret.
type WebPushKeys struct {
	P256dh string `json:"p256dh"`
	Auth   string `json:"auth"`
}

// WebPushSubscription is standard Web Push subscription format.
type WebPushSubscription struct {
	Endpoint string      `json:"endpoint"`
	Keys     WebPushKeys `json:"keys"`
}

// ReminderInput is a single reminder submitted by the client.
// Either Schedule (cron expression) or DeliverAt (ISO8601 timestamp) must be provided.
type ReminderInput struct {
	ID         string `json:"id"`
	Schedule   string `json:"schedule,omitempty"`
	DeliverAt  string `json:"deliverAt,omitempty"`
	Ciphertext string `json:"ciphertext"`
}

// SubscriptionInput is the payload sent to PUT /v1/push/subscriptions/:subId.
type SubscriptionInput struct {
	Subscription WebPushSubscription `json:"subscription"`
	Timezone     string              `json:"tz,omitempty"`
	Reminders    []ReminderInput     `json:"reminders"`
}

// StoredReminder is the persisted form with computed next delivery time in UTC.
type StoredReminder struct {
	ID         string    `json:"id"`
	Schedule   string    `json:"schedule,omitempty"` // empty for one-shot
	NextRun    time.Time `json:"nextRun"`            // UTC
	Ciphertext string    `json:"ciphertext"`
}

// SubscriptionRecord is persisted on disk per subscription.
type SubscriptionRecord struct {
	SubID        string              `json:"subId"`
	Subscription WebPushSubscription `json:"subscription"`
	Timezone     string              `json:"tz,omitempty"`
	Reminders    []StoredReminder    `json:"reminders"`
	UpdatedAt    time.Time           `json:"updatedAt"`
}
