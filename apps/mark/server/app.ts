import { Hono } from "hono";
import { fetchPageMetadata } from "./metadata.ts";
import { consumeRateLimit } from "./rateLimit.ts";
import * as tagSuggestions from "./tags.ts";

const METADATA_PATH = "/api/metadata";
const TAGS_PATH = "/api/tags";

const TAG_RATE_LIMIT_POLICIES = [
  { id: "ai-tags-1m", maxRequests: 10, windowMs: 60_000 },
  { id: "ai-tags-1h", maxRequests: 100, windowMs: 60 * 60_000 },
] as const;

const readTargetUrlFromBody = (rawBody: string) => {
  const parsedBody: unknown = rawBody ? JSON.parse(rawBody) : {};

  if (typeof parsedBody !== "object" || parsedBody === null) {
    return null;
  }

  const { url } = parsedBody as { url?: unknown };
  return typeof url === "string" ? url : null;
};

export const isApiRequestPath = (pathname: string) => pathname.startsWith("/api/");

export const app = new Hono();

app.all(METADATA_PATH, async (context) => {
  if (context.req.method !== "POST") {
    return context.json({ error: "Method not allowed" }, 405);
  }

  let targetUrl: string | null;
  try {
    targetUrl = readTargetUrlFromBody(await context.req.text());
  } catch {
    return context.json({ error: "Invalid JSON body" }, 400);
  }

  if (!targetUrl) {
    return context.json({ error: "Missing url" }, 400);
  }

  try {
    return context.json(await fetchPageMetadata(targetUrl), 200);
  } catch (error) {
    return context.json({ error: error instanceof Error ? error.message : "Metadata fetch failed" }, 422);
  }
});

app.all(TAGS_PATH, async (context) => {
  if (context.req.method !== "POST") {
    return context.json({ error: "Method not allowed" }, 405);
  }

  const rateLimit = consumeRateLimit(
    context.req.raw,
    "ai-tags",
    TAG_RATE_LIMIT_POLICIES,
    context.req.header("x-forwarded-for") || context.req.header("x-real-ip"),
  );

  if (!rateLimit.allowed) {
    return context.json(
      { error: "Too many AI tagging requests. Please wait a minute and try again." },
      429,
      { "retry-after": String(Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1000))) },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await context.req.json();
  } catch {
    return context.json({ error: "Invalid JSON body" }, 400);
  }

  const parsedBody = tagSuggestions.tagSuggestionBodySchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return context.json({ error: "Invalid tag request" }, 400);
  }

  try {
    return context.json({ tags: await tagSuggestions.suggestTags({
      ...parsedBody.data,
      excerpt: parsedBody.data.excerpt ?? null,
    }) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI tagging failed";
    return context.json({ error: message }, message === "AI tagging is not configured" ? 503 : 500);
  }
});
