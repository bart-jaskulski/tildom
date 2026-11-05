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
	"github.com/bart-jaskulski/tildom/services/api/internal/mark"
	"github.com/bart-jaskulski/tildom/services/api/internal/push"
	"google.golang.org/genai"
)

func main() {
	cfg := DefaultConfig()

	// If VAPID keys were not configured, auto-generate ephemeral keys for local dev
	if cfg.VAPIDPrivateKey == "" || cfg.VAPIDPublicKey == "" {
		log.Println("no VAPID keys provided in environment, generating ephemeral keypair for session...")
		priv, pub, err := webpush.GenerateVAPIDKeys()
		if err != nil {
			log.Fatalf("failed to generate VAPID keys: %v", err)
		}
		cfg.VAPIDPrivateKey = priv
		cfg.VAPIDPublicKey = pub
	}

	pushOpts := push.PushOptions{
		StorageRoot:     cfg.PushStorageRoot,
		VAPIDPublicKey:  cfg.VAPIDPublicKey,
		VAPIDPrivateKey: cfg.VAPIDPrivateKey,
		VAPIDSubject:    cfg.VAPIDSubject,
		TickInterval:    30 * time.Second,
	}

	pushStorage, err := push.NewStorage(pushOpts.StorageRoot)
	if err != nil {
		log.Fatalf("failed to initialize push storage: %v", err)
	}

	pushSender := push.NewLivePushSender(pushOpts.VAPIDPublicKey, pushOpts.VAPIDPrivateKey, pushOpts.VAPIDSubject)
	pushServer := push.NewPushServer(pushOpts, pushStorage, pushSender)

	var aiClient mark.AIClient
	if cfg.GoogleAPIKey != "" {
		ctx := context.Background()
		gClient, err := genai.NewClient(ctx, &genai.ClientConfig{
			APIKey:  cfg.GoogleAPIKey,
			Backend: genai.BackendGeminiAPI,
		})
		if err != nil {
			log.Printf("warning: failed to initialize Gemini client: %v", err)
		} else {
			aiClient = &AIClientWrapper{client: gClient}
			log.Printf("initialized Gemini client with model %s", cfg.GeminiModel)
		}
	} else {
		log.Println("GOOGLE_API_KEY not provided; AI endpoints will respond 503")
	}

	server := NewServer(cfg, aiClient, pushServer)
	addr := ":" + cfg.Port

	httpServer := &http.Server{
		Addr:              addr,
		Handler:           server,
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Start push dispatcher background loop
	go pushServer.Dispatcher().Start(ctx)

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	go func() {
		log.Printf("tildom-api listening on %s (push storage: %s)", addr, cfg.PushStorageRoot)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server error: %v", err)
		}
	}()

	<-stop
	log.Println("shutting down tildom-api...")

	cancel() // stop dispatcher

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("forced shutdown: %v", err)
	}
	log.Println("tildom-api stopped cleanly")
}
