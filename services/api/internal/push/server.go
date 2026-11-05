package push

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
	dispatcher *Dispatcher
	mux        *http.ServeMux
}

func NewPushServer(opts PushOptions, storage *Storage, sender PushSender) *PushServer {
	dispatcher := NewDispatcher(storage, sender, opts.TickInterval)
	s := &PushServer{
		options:    opts,
		storage:    storage,
		dispatcher: dispatcher,
		mux:        http.NewServeMux(),
	}
	s.RegisterRoutes(s.mux)
	return s
}

func (s *PushServer) Dispatcher() *Dispatcher {
	return s.dispatcher
}

func (s *PushServer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.mux.ServeHTTP(w, r)
}

func (s *PushServer) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /v1/push/public-key", s.HandlePublicKey)
	mux.HandleFunc("PUT /v1/push/subscriptions/{subId}", s.HandlePutSubscription)
	mux.HandleFunc("DELETE /v1/push/subscriptions/{subId}", s.HandleDeleteSubscription)
}

func (s *PushServer) HandlePublicKey(w http.ResponseWriter, r *http.Request) {
	WriteJSON(w, http.StatusOK, map[string]string{
		"publicKey": s.options.VAPIDPublicKey,
	})
}

func (s *PushServer) HandlePutSubscription(w http.ResponseWriter, r *http.Request) {
	subID := r.PathValue("subId")
	if !s.storage.IsSafeSubID(subID) {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid subscription ID format"})
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 1024*1024) // 1MB limit
	var input SubscriptionInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "malformed JSON body"})
		return
	}

	if input.Subscription.Endpoint == "" || input.Subscription.Keys.P256dh == "" || input.Subscription.Keys.Auth == "" {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "incomplete web push subscription"})
		return
	}

	if len(input.Reminders) > 500 {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "maximum 500 reminders allowed per subscription"})
		return
	}

	now := time.Now().UTC()
	var storedReminders []StoredReminder

	for _, rem := range input.Reminders {
		if rem.ID == "" || rem.Ciphertext == "" {
			WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "reminder must have id and ciphertext"})
			return
		}

		nextRun, err := CalculateNextRun(rem.Schedule, rem.DeliverAt, input.Timezone, now)
		if err != nil {
			WriteJSON(w, http.StatusBadRequest, map[string]string{
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
		WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to persist subscription"})
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"ok":             true,
		"remindersCount": len(storedReminders),
	})
}

func (s *PushServer) HandleDeleteSubscription(w http.ResponseWriter, r *http.Request) {
	subID := r.PathValue("subId")
	if !s.storage.IsSafeSubID(subID) {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid subscription ID format"})
		return
	}

	if err := s.storage.Delete(subID); err != nil {
		WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to delete subscription"})
		return
	}

	WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func WriteJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}
