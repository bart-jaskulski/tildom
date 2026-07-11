import { beforeEach, describe, expect, it, vi } from "vitest";

const execMock = vi.hoisted(() => vi.fn());
const queryMock = vi.hoisted(() => vi.fn());

vi.mock("~/lib/db", () => ({
  dbVersion: () => 0,
  exec: execMock,
  initDb: vi.fn(),
  query: queryMock,
}));

import { addCommentToEntry, createEntry, deleteComment, deleteEntry, fetchEntryDetail, replaceEntryTags, updateComment, updateEntry } from "./entryStore";

describe("entryStore mutations", () => {
  beforeEach(() => {
    execMock.mockReset().mockResolvedValue(undefined);
    queryMock.mockReset().mockResolvedValue([]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000001");
  });

  it("creates note entries locally", async () => {
    await createEntry("A useful note");

    expect(execMock).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO entries"), expect.arrayContaining(["00000000-0000-4000-8000-000000000001", "A useful note"]));
  });

  it("uses first line as title and keeps the rest as note body", async () => {
    await createEntry("Trip notes\n- day 1\n- day 2");

    expect(execMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO entries"),
      expect.arrayContaining(["00000000-0000-4000-8000-000000000001", "Trip notes", "- day 1\n- day 2"]),
    );
  });

  it("creates URL entries with normalized local URL fields", async () => {
    await createEntry("example.com/path#fragment");

    expect(execMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO entries"),
      expect.arrayContaining(["00000000-0000-4000-8000-000000000001", "https://example.com/path", "https://example.com/path", "example.com"]),
    );
  });

  it("prefills URL entries with fetched metadata", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ title: "Fetched title", excerpt: "Fetched excerpt" }),
    } as Response);

    await createEntry("https://example.com/article");

    expect(fetch).toHaveBeenCalledWith(
      "/api/metadata",
      expect.objectContaining({
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/article" }),
      }),
    );
    expect(execMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO entries"),
      expect.arrayContaining(["Fetched title", "Fetched excerpt", "ready"]),
    );
  });

  it("adds comments and touches the parent entry", async () => {
    await addCommentToEntry("entry-1", "follow-up");

    expect(execMock).toHaveBeenNthCalledWith(1, expect.stringContaining("INSERT INTO comments"), expect.arrayContaining(["00000000-0000-4000-8000-000000000001", "entry-1", "follow-up"]));
    expect(execMock).toHaveBeenNthCalledWith(2, expect.stringContaining("UPDATE entries"), expect.arrayContaining(["entry-1"]));
  });

  it("updates entries", async () => {
    await updateEntry("entry-1", {
      title: "Updated title",
      content: "example.com/updated#fragment",
    });

    expect(execMock).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE entries"),
      expect.arrayContaining([
        "example.com/updated#fragment",
        "https://example.com/updated",
        "example.com",
        "Updated title",
        "",
        "entry-1",
      ]),
    );
  });

  it("stores non-url content as note body and clears URL fields", async () => {
    await updateEntry("entry-1", {
      title: "Updated note",
      content: "updated note body",
    });

    expect(execMock).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE entries"),
      expect.arrayContaining([
        null,
        null,
        null,
        "Updated note",
        "updated note body",
        "entry-1",
      ]),
    );
  });

  it("deletes entries with their comments", async () => {
    await deleteEntry("entry-1");

    expect(execMock).toHaveBeenNthCalledWith(1, "DELETE FROM comments WHERE entry_id = ?", ["entry-1"]);
    expect(execMock).toHaveBeenNthCalledWith(2, "DELETE FROM entry_tags WHERE entry_id = ?", ["entry-1"]);
    expect(execMock).toHaveBeenNthCalledWith(3, "DELETE FROM entries WHERE id = ?", ["entry-1"]);
  });

  it("updates comments", async () => {
    await updateComment("comment-1", "updated comment");

    expect(execMock).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE comments"),
      expect.arrayContaining(["updated comment", "comment-1"]),
    );
  });

  it("deletes comments", async () => {
    await deleteComment("comment-1");

    expect(execMock).toHaveBeenCalledWith("DELETE FROM comments WHERE id = ?", ["comment-1"]);
  });

  it("maps entry detail queries into entry and comment objects", async () => {
    queryMock.mockImplementation((sql: string) => {
      if (sql.includes("WHERE e.id = ?")) {
        return Promise.resolve([
          {
            id: "entry-1",
            source_url: "example.com",
            canonical_url: "https://example.com",
            domain: "example.com",
            title: "Example",
            body: "private context",
            excerpt: "excerpt",
            excerpt_status: "ready",
            excerpt_error: null,
            created_at: 10,
            updated_at: 11,
            last_commented_at: 12,
            comment_count: 1,
            tag_names: "ai sqlite",
          },
        ]);
      }

      if (sql.includes("FROM comments")) {
        return Promise.resolve([
          {
            id: "comment-1",
            entry_id: "entry-1",
            body: "first comment",
            created_at: 20,
            updated_at: 21,
          },
        ]);
      }

      return Promise.resolve([]);
    });

    const detail = await fetchEntryDetail("entry-1");

    expect(detail.entry?.title).toBe("Example");
    expect(detail.entry?.commentCount).toBe(1);
    expect(detail.entry?.tags).toEqual(["ai", "sqlite"]);
    expect(detail.comments).toEqual([
      {
        id: "comment-1",
        entryId: "entry-1",
        body: "first comment",
        createdAt: 20,
        updatedAt: 21,
      },
    ]);
  });

  it("rejects manual tag edits over the per-entry limit", async () => {
    await expect(replaceEntryTags("entry-1", "one two three four five six")).rejects.toThrow("Use 5 tags or fewer");
  });
});
