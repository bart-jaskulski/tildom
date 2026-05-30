import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "./app";
import * as metadata from "./metadata";

describe("metadata API", () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
});
