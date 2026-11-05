package mark

import (
	"context"
	"errors"
	"testing"

	"google.golang.org/genai"
)

type fakeAIClient struct {
	fnCalls []*genai.FunctionCall
	err     error
}

func (f *fakeAIClient) GenerateContent(ctx context.Context, model string, contents []*genai.Content, config *genai.GenerateContentConfig) (*genai.GenerateContentResponse, error) {
	if f.err != nil {
		return nil, f.err
	}

	parts := make([]*genai.Part, 0, len(f.fnCalls))
	for _, call := range f.fnCalls {
		parts = append(parts, &genai.Part{
			FunctionCall: call,
		})
	}

	return &genai.GenerateContentResponse{
		Candidates: []*genai.Candidate{
			{
				Content: &genai.Content{
					Parts: parts,
				},
			},
		},
	}, nil
}

func TestSuggestTags(t *testing.T) {
	client := &fakeAIClient{
		fnCalls: []*genai.FunctionCall{
			{
				Name: "setTags",
				Args: map[string]any{
					"tags": []any{"golang", "tutorials"},
				},
			},
		},
	}

	excerpt := "A tutorial on Go"
	req := TagSuggestionRequest{
		Title:        "Go Tutorial",
		URL:          "https://golang.org/doc",
		Excerpt:      &excerpt,
		ExistingTags: []string{"golang", "programming"},
	}

	tags, err := SuggestTags(context.Background(), client, "gemini-3.5-flash-lite", req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(tags) != 2 || tags[0] != "golang" || tags[1] != "tutorials" {
		t.Errorf("got tags %v, want ['golang', 'tutorials']", tags)
	}
}

func TestSuggestTags_Unconfigured(t *testing.T) {
	req := TagSuggestionRequest{
		Title: "Go Tutorial",
		URL:   "https://golang.org/doc",
	}
	_, err := SuggestTags(context.Background(), nil, "gemini-3.5-flash-lite", req)
	if !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("expected unconfigured error, got %v", err)
	}
}

func TestSuggestTagsRejectsMalformedToolResults(t *testing.T) {
	for _, args := range []map[string]any{
		{}, {"tags": "go"}, {"tags": nil}, {"tags": []any{"go", 1}},
		{"tags": []any{"a", "b", "c", "d", "e", "f"}},
	} {
		client := &fakeAIClient{fnCalls: []*genai.FunctionCall{{Name: "setTags", Args: args}}}
		_, err := SuggestTags(context.Background(), client, "test", TagSuggestionRequest{Title: "Go", URL: "https://example.com"})
		if !errors.Is(err, ErrInvalidResponse) {
			t.Fatalf("args %v: expected invalid response, got %v", args, err)
		}
	}
}

func TestSuggestTagsProviderFailure(t *testing.T) {
	providerErr := errors.New("provider unavailable")
	_, err := SuggestTags(context.Background(), &fakeAIClient{err: providerErr}, "test", TagSuggestionRequest{Title: "Go", URL: "https://example.com"})
	if !errors.Is(err, providerErr) {
		t.Fatalf("provider error lost: %v", err)
	}
}
