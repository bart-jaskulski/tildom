import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPageMetadata, parsePageMetadata } from "./metadata";

describe("metadata parsing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the document title when social title metadata is missing", () => {
    const metadata = parsePageMetadata(`
      <html>
        <head>
          <title>Example article title</title>
        </head>
      </html>
    `);

    expect(metadata.title).toBe("Example article title");
  });

  it("reads enough HTML to find late document titles", async () => {
    const html = `<!doctype html><html><head>${" ".repeat(700_000)}<title>Late title</title></head><body></body></html>`;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(html, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      }),
    );

    const metadata = await fetchPageMetadata("https://example.com/article");
    expect(metadata.title).toBe("Late title");
  });
});
