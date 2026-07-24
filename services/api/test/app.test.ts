import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.ts";
import * as metadata from "../src/mark/metadata.ts";
import { resetRateLimitStore } from "../src/rateLimit.ts";

describe("feature API", () => {
  afterEach(() => {
    resetRateLimitStore();
    vi.restoreAllMocks();
  });

  it("serves Mark metadata under its versioned route", async () => {
    vi.spyOn(metadata, "fetchPageMetadata").mockResolvedValue({
      title: "Example title",
      excerpt: "Example excerpt",
    });

    const response = await app.request("/v1/mark/metadata", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://mark.tildom.app",
      },
      body: JSON.stringify({ url: "https://example.com/article" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://mark.tildom.app");
    expect(await response.json()).toEqual({
      title: "Example title",
      excerpt: "Example excerpt",
    });
  });

  it("does not grant CORS to unknown origins", async () => {
    const response = await app.request("/v1/hey/health", {
      headers: { Origin: "https://example.com" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});
