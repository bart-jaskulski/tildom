import { describe, expect, it } from "vitest";
import { deriveNoteTitle, isUrlOnlyInput, normalizeUrlInput, splitNoteIntoTitleAndBody } from "./entries";

describe("entry helpers", () => {
  it("normalizes URLs for capture and search", () => {
    expect(normalizeUrlInput("www.example.com/path/#section")).toEqual({
      sourceUrl: "https://www.example.com/path",
      canonicalUrl: "https://www.example.com/path",
      domain: "example.com",
    });
  });

  it("strips advertising and tracking query parameters before saving", () => {
    expect(normalizeUrlInput("https://example.com/article?utm_source=newsletter&gclid=ad-click&page=2&fbclid=social")).toMatchObject({
      sourceUrl: "https://example.com/article?page=2",
      canonicalUrl: "https://example.com/article?page=2",
    });
  });

  it("rejects non-http URL schemes", () => {
    expect(() => normalizeUrlInput("javascript:alert(1)")).toThrow("Only http and https URLs are supported");
  });

  it("uses the first note line as title", () => {
    expect(deriveNoteTitle("  this is a personal note\nwith more detail ")).toBe("this is a personal note");
  });

  it("splits note title from note body", () => {
    expect(splitNoteIntoTitleAndBody("My note title\n- first line\n- second line")).toEqual({
      title: "My note title",
      body: "- first line\n- second line",
    });
  });

  it("consumes one optional blank separator after the title", () => {
    expect(splitNoteIntoTitleAndBody("My note title\n\nBody starts here")).toEqual({
      title: "My note title",
      body: "Body starts here",
    });
  });

  it("only treats standalone URLs as links", () => {
    expect(isUrlOnlyInput(" https://example.com/post?x=1 ")).toBe(true);
    expect(isUrlOnlyInput("example.com/post")).toBe(true);
    expect(isUrlOnlyInput("read https://example.com/post later")).toBe(false);
  });
});
