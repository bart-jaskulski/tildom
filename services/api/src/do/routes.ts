import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, tool } from "ai";
import { Hono } from "hono";
import { z } from "zod";
import { consumeRateLimit } from "../rateLimit.ts";

const createTasksSchema = z.object({
  title: z.string(),
  tasks: z.array(z.object({
    content: z.string(),
    dueDate: z.string().optional(),
  })),
});
const askClarificationSchema = z.object({ question: z.string() });
const policies = [
  { id: "ai-breakdown-1m", maxRequests: 5, windowMs: 60_000 },
  { id: "ai-breakdown-1h", maxRequests: 30, windowMs: 60 * 60_000 },
] as const;

export const doRoutes = new Hono();

doRoutes.post("/breakdown", async (context) => {
  const rateLimit = consumeRateLimit(context.req.raw, "ai-breakdown", policies);
  if (!rateLimit.allowed) {
    return context.json(
      { error: "Too many AI breakdown requests. Please wait a minute and try again." },
      429,
      { "retry-after": String(Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1000))) },
    );
  }

  const body = await context.req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return context.json({ error: "Invalid JSON body" }, 400);
  if (typeof body.task !== "string" || !body.task.trim()) {
    return context.json({ error: "Missing or invalid 'task' parameter" }, 400);
  }
  if (!process.env.GOOGLE_API_KEY) return context.json({ error: "AI breakdown is not configured" }, 503);

  const granularity = body.granularity === "low" || body.granularity === "high"
    ? body.granularity
    : "medium";
  const clarification = typeof body.clarification === "string" ? body.clarification.trim() : "";
  const instruction = granularity === "low"
    ? "Keep tasks high-level and broad. Do not over-fragment."
    : granularity === "high"
      ? "Break tasks into very small, atomic micro-steps."
      : "Break tasks into standard, manageable chunks.";

  try {
    const result = await generateText({
      model: createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_API_KEY })("gemini-2.5-flash-lite"),
      prompt: clarification
        ? `Original task:\n${body.task}\n\nAdditional clarification:\n${clarification}`
        : body.task,
      instructions: `You are an expert task decomposer for neurodivergent users.
${instruction}
Output tasks in the same language as the user's prompt.
${clarification ? "" : "If the request is too vague, use askClarification."}
If the request is actionable, use createTasks immediately. Do not be chatty. Only use tools.`,
      tools: {
        createTasks: tool({ description: "Create tasks from the prompt", inputSchema: createTasksSchema }),
        ...(!clarification && {
          askClarification: tool({
            description: "Ask for details when the prompt is too vague",
            inputSchema: askClarificationSchema,
          }),
        }),
      },
    });

    const call = result.toolCalls[0];
    if (call?.toolName === "createTasks") {
      return context.json({ ok: true, action: "createTasks", ...createTasksSchema.parse(call.input) });
    }
    if (call?.toolName === "askClarification") {
      return context.json({
        ok: true,
        action: "askClarification",
        ...askClarificationSchema.parse(call.input),
      });
    }
    return context.json({ error: "AI response did not produce a supported tool call" }, 422);
  } catch (error) {
    return context.json({ error: error instanceof Error ? error.message : "AI generation failed" }, 500);
  }
});
