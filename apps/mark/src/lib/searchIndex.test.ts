import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.hoisted(() => vi.fn());

vi.mock("~/lib/db", () => ({
  query: queryMock,
}));

import { searchLocalEntries } from "./searchIndex";

const baseRow = {
  body: "",
  url: "",
  domain: "",
  excerpt: "",
  comments_text: "",
  tag_text: "",
  comment_count: 0,
  updated_at: 1,
  created_at: 1,
  last_commented_at: null,
};

describe("searchIndex", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("ranks title matches above comment-only matches", async () => {
    queryMock.mockResolvedValue([
      {
        ...baseRow,
        entry_id: "comment-match",
        title: "Unrelated",
        comments_text: "sqlite wasm note",
      },
      {
        ...baseRow,
        entry_id: "title-match",
        title: "SQLite WASM notes",
      },
    ]);

    const results = await searchLocalEntries("sqlite wasm");

    expect(results.map((result) => result.id)).toEqual(["title-match", "comment-match"]);
  });

  it("queries all entries without a persisted type filter", async () => {
    queryMock.mockResolvedValue([]);

    await searchLocalEntries("sqlite");

    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("search_documents_fts MATCH ?"), ["\"sqlite\"*"]);
    expect(queryMock.mock.calls[0]?.[0]).not.toContain("kind");
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("search_documents.searchable_text LIKE ?"), ["%sqlite%"]);
    expect(queryMock.mock.calls[1]?.[0]).not.toContain("kind");
  });

  it("uses FTS AND matching for multi-term content and title searches", async () => {
    queryMock.mockResolvedValue([]);

    await searchLocalEntries("sqlite wasm");

    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("bm25(search_documents_fts"), ["\"sqlite\"* AND \"wasm\"*"]);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("search_documents.searchable_text LIKE ?"), ["%sqlite%", "%wasm%"]);
  });

  it("uses FTS prefix matching and fallback contains matching for partial terms", async () => {
    queryMock.mockResolvedValue([]);

    await searchLocalEntries("disc");

    expect(queryMock).toHaveBeenNthCalledWith(1, expect.any(String), ["\"disc\"*"]);
    expect(queryMock).toHaveBeenNthCalledWith(2, expect.any(String), ["%disc%"]);
    expect(queryMock).toHaveBeenNthCalledWith(3, expect.any(String), ["%disc%"]);
  });

  it("tokenizes punctuation before building the FTS query", async () => {
    queryMock.mockResolvedValue([]);

    await searchLocalEntries("example.com sqlite");

    expect(queryMock).toHaveBeenCalledWith(expect.any(String), ["\"example\"* AND \"com\"* AND \"sqlite\"*"]);
  });

  it("uses strict tag filtering for hashtag queries", async () => {
    queryMock.mockResolvedValue([{ ...baseRow, entry_id: "tagged", title: "Tagged", tag_text: "ai sqlite" }]);

    const results = await searchLocalEntries("#AI");

    expect(queryMock).toHaveBeenCalledOnce();
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("WHERE tags.name = ?"), ["ai"]);
    expect(results[0]?.tags).toEqual(["ai", "sqlite"]);
    expect(results[0]?.matchLabel).toBe("Tag");
  });
});
