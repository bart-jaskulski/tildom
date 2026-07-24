import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPageMetadata, parsePageMetadata } from "../src/mark/metadata.ts";

describe("metadata parsing", () => {
  afterEach(() => vi.restoreAllMocks());

  it("uses the document title when social metadata is missing", () => {
    expect(parsePageMetadata("<title>Example article title</title>").title)
      .toBe("Example article title");
  });

  it("reads enough HTML to find late titles", async () => {
    const html = `<html><head>${" ".repeat(700_000)}<title>Late title</title></head></html>`;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8" },
    }));
    const resolve = async () => [{ address: "93.184.216.34", family: 4 }] as const;
    expect((await fetchPageMetadata("https://example.com/article", resolve)).title).toBe("Late title");
  });

  it("rejects private network targets", async () => {
    await expect(fetchPageMetadata("http://127.0.0.1/private")).rejects
      .toThrow("Private network URLs are not supported");
  });
});
