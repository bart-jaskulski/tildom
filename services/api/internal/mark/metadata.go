package mark

import (
	"context"
	"errors"
	"fmt"
	"html"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	readability "codeberg.org/readeck/go-readability/v2"
	htmltomarkdown "github.com/JohannesKaufmann/html-to-markdown/v2"
	xhtml "golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

type PageMetadata struct {
	Title   *string      `json:"title"`
	Excerpt *string      `json:"excerpt"`
	Capture *PageCapture `json:"capture"`
}

type PageCapture struct {
	Markdown    string  `json:"markdown"`
	TextContent string  `json:"textContent"`
	Byline      *string `json:"byline"`
	SiteName    *string `json:"siteName"`
	PublishedAt *string `json:"publishedAt"`
	Language    *string `json:"language"`
	SourceURL   string  `json:"sourceUrl"`
}

const (
	maxHTMLBytes = 2_000_000
	fetchTimeout = 7 * time.Second
	maxRedirects = 5
)

var whitespaceRegex = regexp.MustCompile(`\s+`)
var htmlTagRegex = regexp.MustCompile(`<[^>]*>`)

func isPrivateIP(ip net.IP) bool {
	if ip == nil || ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsMulticast() || ip.IsUnspecified() {
		return true
	}
	if ip4 := ip.To4(); ip4 != nil {
		return ip4[0] == 0 ||
			ip4[0] == 10 ||
			ip4[0] == 127 ||
			(ip4[0] == 169 && ip4[1] == 254) ||
			(ip4[0] == 172 && ip4[1] >= 16 && ip4[1] <= 31) ||
			(ip4[0] == 192 && ip4[1] == 168) ||
			ip4[0] >= 224
	}
	// IPv6 checks
	s := ip.String()
	return s == "::" || s == "::1" || strings.HasPrefix(s, "fc") || strings.HasPrefix(s, "fd") || strings.HasPrefix(s, "fe8") || strings.HasPrefix(s, "fe9") || strings.HasPrefix(s, "fea") || strings.HasPrefix(s, "feb") || strings.HasPrefix(s, "ff")
}

var ErrPrivateURL = errors.New("Private network URLs are not supported")

func assertPublicURL(u *url.URL) error {
	if u.Scheme != "http" && u.Scheme != "https" {
		return errors.New("Only http and https URLs are supported")
	}
	if u.User != nil {
		return errors.New("URL credentials are not supported")
	}
	hostname := u.Hostname()
	if hostname == "localhost" || strings.HasSuffix(hostname, ".localhost") {
		return ErrPrivateURL
	}

	return nil
}

// Resolve and dial the same address so DNS changes cannot bypass the private-IP check.
func publicDialContext(lookup func(context.Context, string, string) ([]net.IP, error), dial func(context.Context, string, string) (net.Conn, error)) func(context.Context, string, string) (net.Conn, error) {
	return func(ctx context.Context, network, address string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(address)
		if err != nil {
			return nil, err
		}
		ips, err := lookup(ctx, "ip", host)
		if err != nil {
			return nil, err
		}
		if len(ips) == 0 {
			return nil, ErrPrivateURL
		}
		for _, ip := range ips {
			if isPrivateIP(ip) {
				return nil, ErrPrivateURL
			}
		}
		var dialErr error
		for _, ip := range ips {
			conn, err := dial(ctx, network, net.JoinHostPort(ip.String(), port))
			if err == nil {
				return conn, nil
			}
			dialErr = err
		}
		return nil, dialErr
	}
}

func normalizeText(val string) *string {
	decoded := html.UnescapeString(val)
	stripped := htmlTagRegex.ReplaceAllString(decoded, " ")
	cleaned := strings.TrimSpace(whitespaceRegex.ReplaceAllString(stripped, " "))
	if cleaned == "" {
		return nil
	}
	return &cleaned
}

func isTrackingParam(key string) bool {
	lower := strings.ToLower(key)
	return strings.HasPrefix(lower, "utm_") ||
		lower == "fbclid" ||
		lower == "gclid" ||
		lower == "dclid" ||
		lower == "msclkid" ||
		lower == "_ga" ||
		lower == "_gl" ||
		lower == "mc_cid" ||
		lower == "mc_eid" ||
		lower == "igshid"
}

func cleanURL(rawURL string, base *url.URL) string {
	parsed, err := base.Parse(rawURL)
	if err != nil {
		return rawURL
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return rawURL
	}
	q := parsed.Query()
	modified := false
	for k := range q {
		if isTrackingParam(k) {
			q.Del(k)
			modified = true
		}
	}
	if modified {
		parsed.RawQuery = q.Encode()
	}
	return parsed.String()
}

func cleanDOMForReader(n *xhtml.Node, baseURL *url.URL) {
	var walk func(parent, node *xhtml.Node)
	walk = func(parent, node *xhtml.Node) {
		if node == nil {
			return
		}
		next := node.NextSibling

		// Remove img, picture, source
		if node.Type == xhtml.ElementNode && (node.DataAtom == atom.Img || node.DataAtom == atom.Picture || node.DataAtom == atom.Source) {
			if parent != nil {
				parent.RemoveChild(node)
			}
			walk(parent, next)
			return
		}

		// Recurse children first
		walk(node, node.FirstChild)

		// Anchor cleaning
		if node.Type == xhtml.ElementNode && node.DataAtom == atom.A {
			var hrefIdx = -1
			for i, attr := range node.Attr {
				if attr.Key == "href" {
					hrefIdx = i
					break
				}
			}

			// Clean tracking params in href
			if hrefIdx != -1 {
				cleaned := cleanURL(node.Attr[hrefIdx].Val, baseURL)
				node.Attr[hrefIdx].Val = cleaned
			}

			// If empty text and no children, remove
			text := strings.TrimSpace(extractNodeText(node))
			if text == "" && node.FirstChild == nil {
				if parent != nil {
					parent.RemoveChild(node)
				}
			}
		}

		walk(parent, next)
	}

	walk(nil, n)
}

func extractNodeText(n *xhtml.Node) string {
	if n == nil {
		return ""
	}
	if n.Type == xhtml.TextNode {
		return n.Data
	}
	var sb strings.Builder
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		sb.WriteString(extractNodeText(c))
	}
	return sb.String()
}

func extractMeta(doc *xhtml.Node) (titleFallback, excerptFallback *string) {
	var titles []string
	var excerpts []string
	var htmlTitle string

	var walk func(*xhtml.Node)
	walk = func(n *xhtml.Node) {
		if n == nil {
			return
		}
		if n.Type == xhtml.ElementNode {
			if n.DataAtom == atom.Title && htmlTitle == "" {
				htmlTitle = extractNodeText(n)
			}
			if n.DataAtom == atom.Meta {
				var name, property, content string
				for _, attr := range n.Attr {
					k := strings.ToLower(attr.Key)
					if k == "name" {
						name = strings.ToLower(attr.Val)
					} else if k == "property" || k == "itemprop" {
						property = strings.ToLower(attr.Val)
					} else if k == "content" {
						content = attr.Val
					}
				}

				propOrName := property
				if propOrName == "" {
					propOrName = name
				}

				if propOrName == "og:title" || propOrName == "twitter:title" {
					if content != "" {
						titles = append(titles, content)
					}
				} else if propOrName == "og:description" || propOrName == "description" || propOrName == "twitter:description" {
					if content != "" {
						excerpts = append(excerpts, content)
					}
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}

	walk(doc)

	if len(titles) > 0 {
		titleFallback = normalizeText(titles[0])
	} else if htmlTitle != "" {
		titleFallback = normalizeText(htmlTitle)
	}

	if len(excerpts) > 0 {
		excerptFallback = normalizeText(excerpts[0])
	}

	return titleFallback, excerptFallback
}

func ParsePageMetadata(htmlContent string, sourceURL string) PageMetadata {
	parsedURL, _ := url.Parse(sourceURL)
	if parsedURL == nil {
		parsedURL, _ = url.Parse("https://example.com")
	}

	doc, _ := xhtml.Parse(strings.NewReader(htmlContent))
	var titleFallback, excerptFallback *string
	if doc != nil {
		titleFallback, excerptFallback = extractMeta(doc)
	}

	article, err := readability.FromReader(strings.NewReader(htmlContent), parsedURL)
	if err != nil || article.Node == nil {
		return PageMetadata{
			Title:   titleFallback,
			Excerpt: excerptFallback,
			Capture: nil,
		}
	}

	var textBuf strings.Builder
	_ = article.RenderText(&textBuf)
	textContent := strings.TrimSpace(textBuf.String())
	if textContent == "" {
		return PageMetadata{
			Title:   titleFallback,
			Excerpt: excerptFallback,
			Capture: nil,
		}
	}

	title := titleFallback
	if artTitle := article.Title(); artTitle != "" {
		if norm := normalizeText(artTitle); norm != nil {
			title = norm
		}
	}

	excerpt := excerptFallback
	if artExcerpt := article.Excerpt(); artExcerpt != "" {
		if norm := normalizeText(artExcerpt); norm != nil {
			excerpt = norm
		}
	}

	// Clean the readability DOM tree
	cleanDOMForReader(article.Node, parsedURL)

	mdBytes, err := htmltomarkdown.ConvertNode(article.Node)
	var markdownStr string
	if err == nil {
		markdownStr = strings.TrimSpace(string(mdBytes))
	}

	var byline, siteName, publishedAt, language *string
	if b := article.Byline(); b != "" {
		byline = normalizeText(b)
	}
	if s := article.SiteName(); s != "" {
		siteName = normalizeText(s)
	}
	if l := article.Language(); l != "" {
		language = normalizeText(l)
	}
	if pubTime, err := article.PublishedTime(); err == nil && !pubTime.IsZero() {
		timeStr := pubTime.Format(time.RFC3339)
		publishedAt = &timeStr
	}

	return PageMetadata{
		Title:   title,
		Excerpt: excerpt,
		Capture: &PageCapture{
			Markdown:    markdownStr,
			TextContent: textContent,
			Byline:      byline,
			SiteName:    siteName,
			PublishedAt: publishedAt,
			Language:    language,
			SourceURL:   sourceURL,
		},
	}
}

func FetchPageMetadata(ctx context.Context, targetURL string) (PageMetadata, error) {
	transport := &http.Transport{
		// Proxying would move destination resolution outside the validated dialer.
		DialContext:         publicDialContext(net.DefaultResolver.LookupIP, (&net.Dialer{}).DialContext),
		TLSHandshakeTimeout: fetchTimeout,
	}
	defer transport.CloseIdleConnections()
	return fetchPageMetadata(ctx, targetURL, transport)
}

func fetchPageMetadata(ctx context.Context, targetURL string, transport http.RoundTripper) (PageMetadata, error) {
	u, err := url.Parse(targetURL)
	if err != nil {
		return PageMetadata{}, errors.New("Invalid URL")
	}

	if err := assertPublicURL(u); err != nil {
		return PageMetadata{}, err
	}

	client := &http.Client{
		Timeout:   fetchTimeout,
		Transport: transport,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) > maxRedirects {
				return errors.New("Metadata fetch followed too many redirects")
			}
			if err := assertPublicURL(req.URL); err != nil {
				return err
			}
			return nil
		},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return PageMetadata{}, err
	}
	req.Header.Set("Accept", "text/html,application/xhtml+xml")
	req.Header.Set("User-Agent", "api.tildom metadata fetcher")

	resp, err := client.Do(req)
	if err != nil {
		return PageMetadata{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return PageMetadata{}, fmt.Errorf("Metadata fetch failed with status %d", resp.StatusCode)
	}

	contentType := resp.Header.Get("Content-Type")
	if contentType != "" && !strings.Contains(contentType, "text/html") && !strings.Contains(contentType, "application/xhtml+xml") {
		return PageMetadata{}, errors.New("URL did not return HTML")
	}

	bodyBytes, err := io.ReadAll(io.LimitReader(resp.Body, maxHTMLBytes))
	if err != nil {
		return PageMetadata{}, err
	}

	finalURL := resp.Request.URL.String()
	return ParsePageMetadata(string(bodyBytes), finalURL), nil
}
