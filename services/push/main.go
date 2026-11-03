package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/SherClockHolmes/webpush-go"
)

func main() {
	opts := DefaultOptions()

	if root := os.Getenv("PUSH_STORAGE_ROOT"); root != "" {
		opts.StorageRoot = root
	}
	if pub := os.Getenv("VAPID_PUBLIC_KEY"); pub != "" {
		opts.VAPIDPublicKey = pub
	}
	if priv := os.Getenv("VAPID_PRIVATE_KEY"); priv != "" {
		opts.VAPIDPrivateKey = priv
	}
	if subj := os.Getenv("VAPID_SUBJECT"); subj != "" {
		opts.VAPIDSubject = subj
	}

	// If VAPID keys were not configured, auto-generate ephemeral keys for local dev
	if opts.VAPIDPrivateKey == "" || opts.VAPIDPublicKey == "" {
		log.Println("no VAPID keys provided in environment, generating ephemeral keypair for session...")
		priv, pub, err := webpush.GenerateVAPIDKeys()
		if err != nil {
			log.Fatalf("failed to generate VAPID keys: %v", err)
		}
		opts.VAPIDPrivateKey = priv
		opts.VAPIDPublicKey = pub
	}

	storage, err := NewStorage(opts.StorageRoot)
	if err != nil {
		log.Fatalf("failed to initialize storage: %v", err)
	}

	sender := NewLivePushSender(opts.VAPIDPublicKey, opts.VAPIDPrivateKey, opts.VAPIDSubject)
	server := NewPushServer(opts, storage, sender)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8789"
	}
	addr := ":" + port

	httpServer := &http.Server{
		Addr:              addr,
		Handler:           server,
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Start dispatcher background worker
	go server.dispatcher.Start(ctx)

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	go func() {
		log.Printf("tildom-push listening on %s (storage: %s)", addr, opts.StorageRoot)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server error: %v", err)
		}
	}()

	<-stop
	log.Println("shutting down tildom-push...")

	cancel() // stop dispatcher

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("forced shutdown: %v", err)
	}
	log.Println("tildom-push stopped cleanly")
}
