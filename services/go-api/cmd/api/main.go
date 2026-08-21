package main

import (
	"github.com/bart-jaskulski/tildom/services/go-api/internal/api"
	"net/http"
	"log"
)

func main() {
	http.HandleFunc("GET /healthz", api.HealthHandler)
	http.HandleFunc("POST /content", api.ContentHandler)

	log.Fatal(http.ListenAndServe(":8080", nil))
}
