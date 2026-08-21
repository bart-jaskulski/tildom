package api

import (
	"net/http"
	"encoding/json"
	"github.com/bart-jaskulski/tildom/services/go-api/internal/article"
)

type contentRequest struct {
	URL string `json:"url"`
}

type contentResponse struct {
	Body string `json:"body"`
}

func ContentHandler(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Content-Type") != "application/json" {
		http.Error(w, "Content-Type must be application/json", http.StatusUnsupportedMediaType)
		return
	}

	var contentReq contentRequest
	if err := json.NewDecoder(r.Body).Decode(&contentReq); err != nil {
		http.Error(w, "Failed to decode JSON body", http.StatusBadRequest)
		return
	}

	if contentReq.URL == "" {
		http.Error(w, "URL cannot be empty", http.StatusBadRequest)
		return
	}

	art, err := article.Fetch(r.Context(), contentReq.URL)

	if err != nil {
		http.Error(w, "Failed to fetch article content", http.StatusInternalServerError)
		return
	}

	contentRes := contentResponse{
		Body: art.Markdown,
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(&contentRes); err != nil {
		http.Error(w, "Failed to encode JSON response", http.StatusInternalServerError)
		return
	}
}
