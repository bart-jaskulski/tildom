import { Hono } from "hono";
import { fetchPageMetadata } from "./metadata.ts";

const METADATA_PATH = "/api/metadata";

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

export const handleApiRequest = (request: Request) => app.fetch(request);
