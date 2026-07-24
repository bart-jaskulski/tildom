import { Hono } from "hono";
import { consumeRateLimit } from "../rateLimit.ts";
import { fetchPageMetadata } from "./metadata.ts";
import * as tags from "./tags.ts";

const tagPolicies = [
  { id: "ai-tags-1m", maxRequests: 10, windowMs: 60_000 },
  { id: "ai-tags-1h", maxRequests: 100, windowMs: 60 * 60_000 },
] as const;

export const markRoutes = new Hono();

markRoutes.post("/metadata", async (context) => {
  const body = await context.req.json().catch(() => null) as { url?: unknown } | null;
  if (!body) return context.json({ error: "Invalid JSON body" }, 400);
  if (typeof body.url !== "string" || !body.url) return context.json({ error: "Missing url" }, 400);

  try {
    return context.json(await fetchPageMetadata(body.url));
  } catch (error) {
    return context.json({ error: error instanceof Error ? error.message : "Metadata fetch failed" }, 422);
  }
});

markRoutes.post("/tags", async (context) => {
  const rateLimit = consumeRateLimit(context.req.raw, "ai-tags", tagPolicies);
  if (!rateLimit.allowed) {
    return context.json(
      { error: "Too many AI tagging requests. Please wait a minute and try again." },
      429,
      { "retry-after": String(Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1000))) },
    );
  }

  const body = tags.tagSuggestionBodySchema.safeParse(await context.req.json().catch(() => null));
  if (!body.success) return context.json({ error: "Invalid tag request" }, 400);

  try {
    return context.json({
      tags: await tags.suggestTags({ ...body.data, excerpt: body.data.excerpt ?? null }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI tagging failed";
    return context.json({ error: message }, message === "AI tagging is not configured" ? 503 : 500);
  }
});
