package mark

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"google.golang.org/genai"
)

var (
	ErrNotConfigured   = errors.New("AI tagging is not configured")
	ErrInvalidRequest  = errors.New("Invalid tag request")
	ErrInvalidResponse = errors.New("Invalid AI tagging response")
)

type TagSuggestionRequest struct {
	Title        string   `json:"title"`
	URL          string   `json:"url"`
	Excerpt      *string  `json:"excerpt,omitempty"`
	ExistingTags []string `json:"existingTags,omitempty"`
}

func (r *TagSuggestionRequest) Validate() error {
	r.Title = strings.TrimSpace(r.Title)
	if len(r.Title) < 1 || len(r.Title) > 300 {
		return ErrInvalidRequest
	}

	r.URL = strings.TrimSpace(r.URL)
	if len(r.URL) < 1 || len(r.URL) > 2048 {
		return ErrInvalidRequest
	}

	if r.Excerpt != nil {
		trimmed := strings.TrimSpace(*r.Excerpt)
		if len(trimmed) > 2000 {
			return ErrInvalidRequest
		}
		r.Excerpt = &trimmed
	}

	if len(r.ExistingTags) > 50 {
		return ErrInvalidRequest
	}

	cleanedTags := make([]string, 0, len(r.ExistingTags))
	for _, t := range r.ExistingTags {
		trimmed := strings.TrimSpace(t)
		if len(trimmed) < 1 || len(trimmed) > 32 {
			return ErrInvalidRequest
		}
		cleanedTags = append(cleanedTags, trimmed)
	}
	r.ExistingTags = cleanedTags

	return nil
}

type AIClient interface {
	GenerateContent(ctx context.Context, model string, contents []*genai.Content, config *genai.GenerateContentConfig) (*genai.GenerateContentResponse, error)
}

func SuggestTags(ctx context.Context, client AIClient, model string, req TagSuggestionRequest) ([]string, error) {
	if err := req.Validate(); err != nil {
		return nil, err
	}
	if client == nil {
		return nil, ErrNotConfigured
	}

	excerptText := "(none)"
	if req.Excerpt != nil && *req.Excerpt != "" {
		excerptText = *req.Excerpt
	}

	existingTagsText := "(none)"
	if len(req.ExistingTags) > 0 {
		existingTagsText = strings.Join(req.ExistingTags, ", ")
	}

	promptText := fmt.Sprintf("Title: %s\nURL: %s\nExcerpt: %s\nExisting tags: %s",
		req.Title, req.URL, excerptText, existingTagsText)

	max5 := int64(5)
	tagToolDeclaration := &genai.FunctionDeclaration{
		Name:        "setTags",
		Description: "Set bookmark tags",
		Parameters: &genai.Schema{
			Type:     genai.TypeObject,
			Required: []string{"tags"},
			Properties: map[string]*genai.Schema{
				"tags": {
					Type:        genai.TypeArray,
					MaxItems:    &max5,
					Description: "Short tag names for this bookmark",
					Items: &genai.Schema{
						Type: genai.TypeString,
					},
				},
			},
		},
	}

	config := &genai.GenerateContentConfig{
		SystemInstruction: &genai.Content{
			Parts: []*genai.Part{
				genai.NewPartFromText(`You tag personal bookmarks.
Use the setTags tool. Return at most 5 short lowercase slug tags. Prefer existing tags whenever they fit.
Create a new tag only when no existing tag fits. Avoid synonyms or variants of existing tags.
Use only the title, URL, and excerpt.`),
			},
		},
		Tools: []*genai.Tool{
			{
				FunctionDeclarations: []*genai.FunctionDeclaration{tagToolDeclaration},
			},
		},
		ToolConfig: &genai.ToolConfig{
			FunctionCallingConfig: &genai.FunctionCallingConfig{
				Mode:                 genai.FunctionCallingConfigModeAny,
				AllowedFunctionNames: []string{"setTags"},
			},
		},
	}

	contents := []*genai.Content{
		{
			Parts: []*genai.Part{
				genai.NewPartFromText(promptText),
			},
		},
	}

	resp, err := client.GenerateContent(ctx, model, contents, config)
	if err != nil {
		return nil, err
	}

	if resp == nil {
		return nil, ErrInvalidResponse
	}
	for _, call := range resp.FunctionCalls() {
		if call.Name != "setTags" {
			continue
		}
		tags, ok := call.Args["tags"].([]any)
		if !ok || len(tags) > 5 {
			return nil, ErrInvalidResponse
		}
		result := make([]string, 0, len(tags))
		for _, value := range tags {
			tag, ok := value.(string)
			if !ok {
				return nil, ErrInvalidResponse
			}
			result = append(result, tag)
		}
		return result, nil
	}
	return []string{}, nil
}
