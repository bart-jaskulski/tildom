package article

import (
	"context"
)

type Article struct {
	Title    string
	Markdown string
}

func Fetch(ctx context.Context, rawURL string) (Article, error) {
	url, err := parseURL(rawURL)
	if err != nil {
		return Article{}, err
	}

	art, err := parseHTML(nil, url)

	if err != nil {
		return Article{}, err
	}

	return art, nil
}
