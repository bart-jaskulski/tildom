package do

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

func TestBreakdownTask_CreateTasks(t *testing.T) {
	client := &fakeAIClient{
		fnCalls: []*genai.FunctionCall{
			{
				Name: "createTasks",
				Args: map[string]any{
					"title": "Clean kitchen",
					"tasks": []any{
						map[string]any{"content": "Wash dishes"},
						map[string]any{"content": "Wipe counters"},
					},
				},
			},
		},
	}

	res, err := BreakdownTask(context.Background(), client, "gemini-3.5-flash-lite", BreakdownRequest{
		Task: "Clean the kitchen",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !res.OK || res.Action != "createTasks" || res.Title != "Clean kitchen" {
		t.Errorf("got unexpected result: %+v", res)
	}
	if len(res.Tasks) != 2 || res.Tasks[0].Content != "Wash dishes" {
		t.Errorf("got tasks: %+v", res.Tasks)
	}
}

func TestBreakdownTask_AskClarification(t *testing.T) {
	client := &fakeAIClient{
		fnCalls: []*genai.FunctionCall{
			{
				Name: "askClarification",
				Args: map[string]any{
					"question": "Which room are you organizing?",
				},
			},
		},
	}

	res, err := BreakdownTask(context.Background(), client, "gemini-3.5-flash-lite", BreakdownRequest{
		Task: "Organize",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !res.OK || res.Action != "askClarification" || res.Question != "Which room are you organizing?" {
		t.Errorf("got unexpected clarification result: %+v", res)
	}
}

func TestBreakdownTask_Validation(t *testing.T) {
	_, err := BreakdownTask(context.Background(), &fakeAIClient{}, "gemini-3.5-flash-lite", BreakdownRequest{
		Task: "   ",
	})
	if !errors.Is(err, ErrInvalidRequest) {
		t.Errorf("expected task error, got %v", err)
	}

	_, err = BreakdownTask(context.Background(), nil, "gemini-3.5-flash-lite", BreakdownRequest{
		Task: "Valid task",
	})
	if !errors.Is(err, ErrNotConfigured) {
		t.Errorf("expected unconfigured error, got %v", err)
	}
}

func TestBreakdownRejectsMalformedToolResults(t *testing.T) {
	for _, args := range []map[string]any{
		{}, {"title": 1, "tasks": []any{}}, {"title": "Title", "tasks": "bad"},
		{"title": "Title", "tasks": []any{42}},
		{"title": "Title", "tasks": []any{map[string]any{}}},
		{"title": "Title", "tasks": []any{map[string]any{"content": "Do it", "dueDate": 42}}},
	} {
		client := &fakeAIClient{fnCalls: []*genai.FunctionCall{{Name: "createTasks", Args: args}}}
		_, err := BreakdownTask(context.Background(), client, "test", BreakdownRequest{Task: "Clean"})
		if !errors.Is(err, ErrInvalidResponse) {
			t.Fatalf("args %v: expected invalid response, got %v", args, err)
		}
	}
}

func TestBreakdownRejectsUnexpectedClarification(t *testing.T) {
	client := &fakeAIClient{fnCalls: []*genai.FunctionCall{{Name: "askClarification", Args: map[string]any{"question": "Again?"}}}}
	_, err := BreakdownTask(context.Background(), client, "test", BreakdownRequest{Task: "Clean", Clarification: "Kitchen"})
	if !errors.Is(err, ErrInvalidResponse) {
		t.Fatalf("unexpected clarification accepted: %v", err)
	}
}

func TestBreakdownProviderFailure(t *testing.T) {
	providerErr := errors.New("provider unavailable")
	_, err := BreakdownTask(context.Background(), &fakeAIClient{err: providerErr}, "test", BreakdownRequest{Task: "Clean"})
	if !errors.Is(err, providerErr) {
		t.Fatalf("provider error lost: %v", err)
	}
}
