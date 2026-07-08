import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "./app";
import * as metadata from "./metadata";
import { resetRateLimitStore } from "./rateLimit";
import * as tags from "./tags";

describe("metadata API", () => {
  afterEach(() => {
    resetRateLimitStore();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns metadata for valid metadata requests", async () => {
    const fetchMetadata = vi.spyOn(metadata, "fetchPageMetadata").mockResolvedValue({
      title: "Example title",
      excerpt: "Example excerpt",
    });

    const response = await app.request("/api/metadata", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: "https://example.com/article" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      title: "Example title",
      excerpt: "Example excerpt",
    });
    expect(fetchMetadata).toHaveBeenCalledWith("https://example.com/article");
  });

  it("rejects non-post metadata requests", async () => {
    const response = await app.request("/api/metadata", { method: "GET" });

    expect(response.status).toBe(405);
    expect(await response.json()).toEqual({ error: "Method not allowed" });
  });

  it("returns an invalid json error when metadata body cannot be parsed", async () => {
    const response = await app.request("/api/metadata", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: "{",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON body" });
  });

  it("returns AI tag suggestions", async () => {
    const suggestTags = vi.spyOn(tags, "suggestTags").mockResolvedValue(["ai", "sqlite"]);

    const response = await app.request("/api/tags", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "SQLite in the browser",
        url: "https://example.com/sqlite",
        excerpt: "Using SQLite with OPFS",
        existingTags: ["ai", "sqlite"],
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ tags: ["ai", "sqlite"] });
    expect(suggestTags).toHaveBeenCalledWith({
      title: "SQLite in the browser",
      url: "https://example.com/sqlite",
      excerpt: "Using SQLite with OPFS",
      existingTags: ["ai", "sqlite"],
    });
  });

  it("returns a 503 when AI tagging is not configured", async () => {
    vi.stubEnv("GOOGLE_API_KEY", "");

    const response = await app.request("/api/tags", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "SQLite in the browser",
        url: "https://example.com/sqlite",
        excerpt: null,
        existingTags: [],
      }),
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "AI tagging is not configured" });
  });
});
