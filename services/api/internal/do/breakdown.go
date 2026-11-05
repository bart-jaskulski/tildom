package do

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"google.golang.org/genai"
)

var (
	ErrNotConfigured   = errors.New("AI breakdown is not configured")
	ErrInvalidRequest  = errors.New("Missing or invalid 'task' parameter")
	ErrInvalidResponse = errors.New("AI response did not produce a supported tool call")
)

type BreakdownRequest struct {
	Task          string `json:"task"`
	Granularity   string `json:"granularity,omitempty"`
	Clarification string `json:"clarification,omitempty"`
}

type SubTask struct {
	Content string  `json:"content"`
	DueDate *string `json:"dueDate,omitempty"`
}

type BreakdownResult struct {
	OK       bool      `json:"ok"`
	Action   string    `json:"action"`
	Title    string    `json:"title,omitempty"`
	Tasks    []SubTask `json:"tasks,omitempty"`
	Question string    `json:"question,omitempty"`
}

type AIClient interface {
	GenerateContent(ctx context.Context, model string, contents []*genai.Content, config *genai.GenerateContentConfig) (*genai.GenerateContentResponse, error)
}

func BreakdownTask(ctx context.Context, client AIClient, model string, req BreakdownRequest) (*BreakdownResult, error) {
	task := strings.TrimSpace(req.Task)
	if task == "" {
		return nil, ErrInvalidRequest
	}
	if client == nil {
		return nil, ErrNotConfigured
	}

	granularity := req.Granularity
	if granularity != "low" && granularity != "high" {
		granularity = "medium"
	}

	instruction := "Break tasks into standard, manageable chunks."
	if granularity == "low" {
		instruction = "Keep tasks high-level and broad. Do not over-fragment."
	} else if granularity == "high" {
		instruction = "Break tasks into very small, atomic micro-steps."
	}

	clarification := strings.TrimSpace(req.Clarification)

	var promptText string
	if clarification != "" {
		promptText = fmt.Sprintf("Original task:\n%s\n\nAdditional clarification:\n%s", task, clarification)
	} else {
		promptText = task
	}

	vagueInstruction := ""
	if clarification == "" {
		vagueInstruction = "If the request is too vague, use askClarification.\n"
	}

	systemText := fmt.Sprintf(`You are an expert task decomposer for neurodivergent users.
%s
Output tasks in the same language as the user's prompt.
%sIf the request is actionable, use createTasks immediately. Do not be chatty. Only use tools.`, instruction, vagueInstruction)

	createTasksDecl := &genai.FunctionDeclaration{
		Name:        "createTasks",
		Description: "Create tasks from the prompt",
		Parameters: &genai.Schema{
			Type:     genai.TypeObject,
			Required: []string{"title", "tasks"},
			Properties: map[string]*genai.Schema{
				"title": {Type: genai.TypeString},
				"tasks": {
					Type: genai.TypeArray,
					Items: &genai.Schema{
						Type:     genai.TypeObject,
						Required: []string{"content"},
						Properties: map[string]*genai.Schema{
							"content": {Type: genai.TypeString},
							"dueDate": {Type: genai.TypeString},
						},
					},
				},
			},
		},
	}

	tools := []*genai.Tool{
		{FunctionDeclarations: []*genai.FunctionDeclaration{createTasksDecl}},
	}
	allowedFuncs := []string{"createTasks"}

	if clarification == "" {
		askClarificationDecl := &genai.FunctionDeclaration{
			Name:        "askClarification",
			Description: "Ask for details when the prompt is too vague",
			Parameters: &genai.Schema{
				Type:     genai.TypeObject,
				Required: []string{"question"},
				Properties: map[string]*genai.Schema{
					"question": {Type: genai.TypeString},
				},
			},
		}
		tools[0].FunctionDeclarations = append(tools[0].FunctionDeclarations, askClarificationDecl)
		allowedFuncs = append(allowedFuncs, "askClarification")
	}

	config := &genai.GenerateContentConfig{
		SystemInstruction: &genai.Content{
			Parts: []*genai.Part{
				genai.NewPartFromText(systemText),
			},
		},
		Tools: tools,
		ToolConfig: &genai.ToolConfig{
			FunctionCallingConfig: &genai.FunctionCallingConfig{
				Mode:                 genai.FunctionCallingConfigModeAny,
				AllowedFunctionNames: allowedFuncs,
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
		if call.Name == "createTasks" {
			title, ok := call.Args["title"].(string)
			if !ok {
				return nil, ErrInvalidResponse
			}
			rawTasks, ok := call.Args["tasks"].([]any)
			if !ok {
				return nil, ErrInvalidResponse
			}
			subTasks := make([]SubTask, 0, len(rawTasks))
			for _, value := range rawTasks {
				item, ok := value.(map[string]any)
				if !ok {
					return nil, ErrInvalidResponse
				}
				content, ok := item["content"].(string)
				if !ok {
					return nil, ErrInvalidResponse
				}
				var dueDate *string
				if value, exists := item["dueDate"]; exists {
					date, ok := value.(string)
					if !ok {
						return nil, ErrInvalidResponse
					}
					dueDate = &date
				}
				subTasks = append(subTasks, SubTask{Content: content, DueDate: dueDate})
			}
			return &BreakdownResult{
				OK:     true,
				Action: "createTasks",
				Title:  title,
				Tasks:  subTasks,
			}, nil
		}

		if call.Name == "askClarification" && clarification == "" {
			question, ok := call.Args["question"].(string)
			if !ok {
				return nil, ErrInvalidResponse
			}
			return &BreakdownResult{
				OK:       true,
				Action:   "askClarification",
				Question: question,
			}, nil
		}
	}

	return nil, ErrInvalidResponse
}
