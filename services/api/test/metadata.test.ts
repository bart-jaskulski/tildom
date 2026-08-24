import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPageMetadata, parsePageMetadata } from "../src/mark/metadata.ts";

describe("metadata parsing", () => {
  afterEach(() => vi.restoreAllMocks());

  it("uses the document title when social metadata is missing", () => {
    expect(parsePageMetadata("<title>Example article title</title>").title)
      .toBe("Example article title");
  });

  it("extracts article text as Markdown for reader mode", () => {
    const metadata = parsePageMetadata(`
      <html><head><title>Reader title</title></head><body>
        <article><h1>Reader title</h1><p>A readable <strong>article</strong>.</p></article>
      </body></html>
    `, "https://example.com/article");

    expect(metadata.title).toBe("Reader title");
    expect(metadata.capture?.markdown).toContain("A readable **article**.");
    expect(metadata.capture?.sourceUrl).toBe("https://example.com/article");
  });

  it("removes images and tracking parameters from reader Markdown", () => {
    const metadata = parsePageMetadata(`
      <html><head><title>Reader title</title></head><body>
        <article><h1>Reader title</h1><p>Read <a href="/next?utm_source=test&keep=yes">more</a>.</p><a href="https://cdn.example.com/image.jpg"><img src="https://cdn.example.com/image.jpg" alt="ignored"></a></article>
      </body></html>
    `, "https://example.com/article");

    expect(metadata.capture?.markdown).toContain("https://example.com/next?keep=yes");
    expect(metadata.capture?.markdown).not.toContain("utm_source");
    expect(metadata.capture?.markdown).not.toContain("![");
    expect(metadata.capture?.markdown).not.toContain("[](");
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
