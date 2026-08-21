package article

import (
	readability "codeberg.org/readeck/go-readability/v2"
	htmltomarkdown "github.com/JohannesKaufmann/html-to-markdown/v2"
	"io"
	"net/http"
	"net/url"
	"strings"
)

func parseHTML(input io.Reader, pageURL *url.URL) (Article, error) {
	req, err := http.NewRequest(http.MethodGet, pageURL.String(), nil)
	if err != nil {
		return Article{}, err
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return Article{}, err
	}
	defer resp.Body.Close()

	art, err := readability.FromReader(resp.Body, pageURL)
	if err != nil {
		return Article{}, err
	}

	var writer strings.Builder
	if err = art.RenderText(&writer); err != nil {
		return Article{}, err
	}

	md, err := htmltomarkdown.ConvertString(writer.String())

	return Article{
		Markdown: md,
		Title:    art.Title(),
	}, nil
}
