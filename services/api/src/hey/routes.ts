import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, isStepCount, streamText, tool } from "ai";
import { Hono } from "hono";
import { z } from "zod";
import { safePath } from "./memory.ts";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  body: z.string().max(100_000),
});
const memorySchema = z.object({
  path: z.string().max(240),
  content: z.string().max(200_000),
});
const settingsSchema = z.object({
  tone: z.enum(["gentle", "balanced", "direct"]),
  responseLength: z.enum(["short", "balanced", "detailed"]),
  instructions: z.string().max(20_000),
  memoryEnabled: z.boolean(),
});
const requestSchema = z.object({
  messages: z.array(messageSchema).min(1).max(500),
  memories: z.array(memorySchema).max(500),
  settings: settingsSchema,
});

const model = (name: string) =>
  createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_API_KEY! })(name);

export const heyRoutes = new Hono();

heyRoutes.get("/health", (context) => context.json({
  ready: Boolean(process.env.GOOGLE_API_KEY),
  model: process.env.HEY_MODEL ?? "gemini-3.6-flash",
  titleModel: process.env.HEY_TITLE_MODEL ?? "gemini-3.5-flash-lite",
}));

heyRoutes.post("/title", async (context) => {
  if (!process.env.GOOGLE_API_KEY) return context.json({ error: "GOOGLE_API_KEY is not configured." }, 503);
  const parsed = z.object({ message: z.string().trim().min(1).max(100_000) })
    .safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "Invalid title request." }, 400);

  const { text } = await generateText({
    model: model(process.env.HEY_TITLE_MODEL ?? "gemini-3.5-flash-lite"),
    instructions: "Write a concise chat title. Return only the title, without quotes or ending punctuation.",
    prompt: parsed.data.message,
    maxOutputTokens: 30,
  });
  const title = text.trim().replace(/^["']|["']$/g, "").slice(0, 80);
  return context.json({ title: title || "New conversation" });
});

heyRoutes.post("/chat", async (context) => {
  if (!process.env.GOOGLE_API_KEY) return context.json({ error: "GOOGLE_API_KEY is not configured." }, 503);
  const parsed = requestSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "Invalid chat request." }, 400);

  const { messages, memories, settings } = parsed.data;
  const files = new Map(memories.map((file) => [file.path, file.content]));
  const writes = new Map<string, string>();
  const tools = settings.memoryEnabled ? {
    listMemory: tool({
      description: "List available memory file paths.",
      inputSchema: z.object({}),
      execute: async () => [...files.keys()].sort(),
    }),
    readMemory: tool({
      description: "Read one memory file.",
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path }) => files.get(path) ?? null,
    }),
    searchMemory: tool({
      description: "Search memory paths and contents.",
      inputSchema: z.object({ query: z.string().min(1).max(200) }),
      execute: async ({ query }) => {
        const needle = query.toLowerCase();
        return [...files]
          .filter(([path, content]) => `${path}\n${content}`.toLowerCase().includes(needle))
          .slice(0, 12)
          .map(([path, content]) => ({ path, excerpt: content.slice(0, 500) }));
      },
    }),
    writeMemory: tool({
      description: "Create or replace a durable Markdown memory file.",
      inputSchema: z.object({ path: z.string(), content: z.string().max(200_000) }),
      execute: async ({ path, content }) => {
        if (!safePath(path) || !path.endsWith(".md")) return { ok: false, error: "Invalid memory path." };
        files.set(path, content);
        writes.set(path, content);
        return { ok: true };
      },
    }),
  } : undefined;

  const result = streamText({
    model: model(process.env.HEY_MODEL ?? "gemini-3.6-flash"),
    instructions: `You are Hey, a private personal companion.
Be ${settings.tone}. Keep responses ${settings.responseLength}.
${settings.instructions}
Memory files are durable user context. Read them when useful. Write only stable facts, preferences, or recurring
context. Do not store passing moods, speculation, unnecessary secrets, or conversation transcripts.
Never mention memory tools or internal files unless asked.`,
    messages: messages.map((message) => ({ role: message.role, content: message.body })),
    tools,
    stopWhen: isStepCount(8),
    abortSignal: context.req.raw.signal,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const text of result.textStream) {
          controller.enqueue(encoder.encode(`${JSON.stringify({ type: "text", text })}\n`));
        }
        controller.enqueue(encoder.encode(`${JSON.stringify({
          type: "done",
          memories: [...writes].map(([path, content]) => ({ path, content })),
        })}\n`));
      } catch (error) {
        controller.enqueue(encoder.encode(`${JSON.stringify({
          type: "error",
          error: error instanceof Error ? error.message : "The model request failed.",
        })}\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "Content-Encoding": "identity",
      "X-Accel-Buffering": "no",
    },
  });
});
