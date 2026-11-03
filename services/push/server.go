package main

import (
	"encoding/json"
	"net/http"
	"time"
)

type PushOptions struct {
	StorageRoot     string
	VAPIDPublicKey  string
	VAPIDPrivateKey string
	VAPIDSubject    string
	TickInterval    time.Duration
}

func DefaultOptions() PushOptions {
	return PushOptions{
		StorageRoot:  "./storage",
		VAPIDSubject: "mailto:push@tildom.app",
		TickInterval: 30 * time.Second,
	}
}

type PushServer struct {
	options    PushOptions
	storage    *Storage
	sender     PushSender
	dispatcher *Dispatcher
	mux        *http.ServeMux
	handler    http.Handler
}

func NewPushServer(opts PushOptions, storage *Storage, sender PushSender) *PushServer {
	dispatcher := NewDispatcher(storage, sender, opts.TickInterval)
	s := &PushServer{
		options:    opts,
		storage:    storage,
		sender:     sender,
		dispatcher: dispatcher,
		mux:        http.NewServeMux(),
	}
	s.registerRoutes()
	s.handler = s.corsMiddleware(s.mux)
	return s
}

func (s *PushServer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.handler.ServeHTTP(w, r)
}

func (s *PushServer) registerRoutes() {
	s.mux.HandleFunc("GET /health", s.handleHealth)
	s.mux.HandleFunc("GET /v1/push/public-key", s.handlePublicKey)
	s.mux.HandleFunc("PUT /v1/push/subscriptions/{subId}", s.handlePutSubscription)
	s.mux.HandleFunc("DELETE /v1/push/subscriptions/{subId}", s.handleDeleteSubscription)
}

func (s *PushServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *PushServer) handlePublicKey(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"publicKey": s.options.VAPIDPublicKey,
	})
}

func (s *PushServer) handlePutSubscription(w http.ResponseWriter, r *http.Request) {
	subID := r.PathValue("subId")
	if !s.storage.isSafeSubID(subID) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid subscription ID format"})
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 1024*1024) // 1MB limit
	var input SubscriptionInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "malformed JSON body"})
		return
	}

	if input.Subscription.Endpoint == "" || input.Subscription.Keys.P256dh == "" || input.Subscription.Keys.Auth == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "incomplete web push subscription"})
		return
	}

	if len(input.Reminders) > 500 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "maximum 500 reminders allowed per subscription"})
		return
	}

	now := time.Now().UTC()
	var storedReminders []StoredReminder

	for _, rem := range input.Reminders {
		if rem.ID == "" || rem.Ciphertext == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "reminder must have id and ciphertext"})
			return
		}

		nextRun, err := CalculateNextRun(rem.Schedule, rem.DeliverAt, input.Timezone, now)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{
				"error": "invalid reminder schedule: " + err.Error(),
			})
			return
		}

		storedReminders = append(storedReminders, StoredReminder{
			ID:         rem.ID,
			Schedule:   rem.Schedule,
			NextRun:    nextRun,
			Ciphertext: rem.Ciphertext,
		})
	}

	record := &SubscriptionRecord{
		SubID:        subID,
		Subscription: input.Subscription,
		Timezone:     input.Timezone,
		Reminders:    storedReminders,
		UpdatedAt:    now,
	}

	if err := s.storage.Save(record); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to persist subscription"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":             true,
		"remindersCount": len(storedReminders),
	})
}

func (s *PushServer) handleDeleteSubscription(w http.ResponseWriter, r *http.Request) {
	subID := r.PathValue("subId")
	if !s.storage.isSafeSubID(subID) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid subscription ID format"})
		return
	}

	if err := s.storage.Delete(subID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to delete subscription"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *PushServer) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Methods", "GET, PUT, DELETE, OPTIONS")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}
