package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"github.com/SherClockHolmes/webpush-go"
)

var (
	ErrSubscriptionExpired = errors.New("webpush subscription expired or gone (404/410)")
)

// PushSender defines the contract for dispatching a push message to a browser subscription.
type PushSender interface {
	Send(ctx context.Context, sub *WebPushSubscription, payload []byte) error
}

// LivePushSender sends real RFC 8291/8292 encrypted Web Push notifications using VAPID.
type LivePushSender struct {
	VAPIDPublicKey  string
	VAPIDPrivateKey string
	VAPIDSubject    string
}

func NewLivePushSender(pubKey, privKey, subject string) *LivePushSender {
	return &LivePushSender{
		VAPIDPublicKey:  pubKey,
		VAPIDPrivateKey: privKey,
		VAPIDSubject:    subject,
	}
}

func (s *LivePushSender) Send(ctx context.Context, sub *WebPushSubscription, payload []byte) error {
	sSubscription := &webpush.Subscription{
		Endpoint: sub.Endpoint,
		Keys: webpush.Keys{
			P256dh: sub.Keys.P256dh,
			Auth:   sub.Keys.Auth,
		},
	}

	resp, err := webpush.SendNotificationWithContext(ctx, payload, sSubscription, &webpush.Options{
		Subscriber:      s.VAPIDSubject,
		VAPIDPublicKey:  s.VAPIDPublicKey,
		VAPIDPrivateKey: s.VAPIDPrivateKey,
		TTL:             86400,
		Urgency:         webpush.UrgencyNormal,
	})
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusGone {
		return ErrSubscriptionExpired
	}

	if resp.StatusCode >= 400 {
		return fmt.Errorf("webpush returned status %d", resp.StatusCode)
	}

	return nil
}
