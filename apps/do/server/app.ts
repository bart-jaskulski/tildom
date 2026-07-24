import { Hono } from "hono";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, tool } from "ai";
import { z } from "zod";
import {
  buildRateLimitBucketKey,
  consumeRateLimit,
} from "../src/lib/requestSecurity.ts";

const BREAKDOWN_PATH = "/api/breakdown";

const openai = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

const createTasksSchema = z.object({
  title: z.string().describe("The title of the task list"),
  tasks: z.array(
    z.object({
      content: z.string().describe("The task description"),
      dueDate: z.string().optional().describe("ISO date string if a specific deadline is mentioned"),
    })
  ),
});

const askClarificationSchema = z.object({
  question: z.string().describe("The clarifying question to ask the user"),
});

const AI_RATE_LIMIT_POLICIES = [
  {
    id: "ai-breakdown-1m",
    maxRequests: 5,
    windowMs: 60_000,
  },
  {
    id: "ai-breakdown-1h",
    maxRequests: 30,
    windowMs: 60 * 60_000,
  },
] as const;

export const isApiRequestPath = (pathname: string) => pathname.startsWith("/api/");

export const app = new Hono();

app.post(BREAKDOWN_PATH, async (context) => {
  const request = context.req.raw;
  
  // Extract client address if forwarded
  const clientAddress = context.req.header("x-forwarded-for") || context.req.header("x-real-ip");
  
  const rateLimitResult = consumeRateLimit(
    buildRateLimitBucketKey(request, "ai-breakdown", clientAddress),
    AI_RATE_LIMIT_POLICIES,
  );
  
  if (!rateLimitResult.allowed) {
    return context.json({ error: "Too many AI breakdown requests. Please wait a minute and try again." }, 429);
  }

  let body: any;
  try {
    body = await context.req.json();
  } catch {
    return context.json({ error: "Invalid JSON body" }, 400);
  }

  const { task, granularity, clarification } = body;
  if (typeof task !== "string" || !task.trim()) {
    return context.json({ error: "Missing or invalid 'task' parameter" }, 400);
  }

  const normalizedGranularity = granularity === "low" || granularity === "high" ? granularity : "medium";
  const hasClarification = typeof clarification === "string" && !!clarification.trim();

  let granularityInstruction = "Break tasks into standard, manageable chunks.";
  if (normalizedGranularity === "low") granularityInstruction = "Keep tasks high-level and broad. Do not over-fragment.";
  if (normalizedGranularity === "high") granularityInstruction = "Break tasks into very small, atomic, micro-steps. Be extremely detailed.";

  const prompt = hasClarification
    ? `Original task:\n${task}\n\nAdditional clarification:\n${clarification}`
    : task;

  try {
    const { steps } = await generateText({
      model: openai("gemini-2.5-flash-lite"),
      prompt,
      system: `
You are an expert task decomposer for neurodivergent users.

RULES:
1. ${granularityInstruction}
2. DETECT LANGUAGE: Output tasks in the SAME language as the user's prompt.
${
  !hasClarification 
    ? `3. If the user's request is too vague (e.g., "work", "project"), use the 'askClarification' tool.` 
    : ""
}
4. If the request is actionable, use the 'createTasks' tool immediately.
5. Do not be chatty. Only use tools.
`,
      tools: {
        createTasks: tool({
          description: "Create a list of tasks from the prompt",
          inputSchema: createTasksSchema,
        }),
        ...(!hasClarification && {
          askClarification: tool({
            description: "Ask the user for more details if the prompt is too vague",
            inputSchema: askClarificationSchema,
          }),
        })
      },
    });

    const lastToolCall = steps[steps.length - 1]?.content[0] as any;

    if (lastToolCall?.toolName === "createTasks") {
      return context.json({
        ok: true,
        action: "createTasks",
        ...createTasksSchema.parse(lastToolCall.input),
      });
    }

    if (lastToolCall?.toolName === "askClarification") {
      return context.json({
        ok: true,
        action: "askClarification",
        ...askClarificationSchema.parse(lastToolCall.input),
      });
    }

    return context.json({ error: "AI response did not produce a supported tool call" }, 422);
  } catch (error) {
    return context.json({ error: error instanceof Error ? error.message : "AI generation failed" }, 500);
  }
});
