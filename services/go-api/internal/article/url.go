package article

import (
	"net/url"
	"fmt"
)

func parseURL(rawURL string) (*url.URL, error) {
	u, err := url.ParseRequestURI(rawURL)

	if err != nil {
		return nil, err
	}

	if u.Scheme != "http" && u.Scheme != "https" {
		return nil, fmt.Errorf("invalid URL scheme: %s", u.Scheme)
	}

	if u.Host == "" {
		return nil, fmt.Errorf("invalid URL host: %s", u.Host)
	}

	return u, nil
}
