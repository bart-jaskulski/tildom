import { beforeEach, describe, expect, it, vi } from "vitest";

const sqlMock = vi.hoisted(() => vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => Promise.resolve([])));
const queryMock = vi.hoisted(() => vi.fn());

const sqlCalls = () =>
  sqlMock.mock.calls.map(([strings, ...values]) => ({
    sql: (strings as unknown as string[]).join("?"),
    values,
  }));

vi.mock("~/lib/db", () => ({
  client: {
    subscribe: vi.fn(),
    sql: sqlMock,
    init: vi.fn(),
    query: queryMock,
  },
}));

vi.mock("~/lib/syncState", () => ({
  markSyncDirty: vi.fn(),
}));

import { addCommentToEntry, createEntry, deleteComment, deleteEntry, fetchEntryDetail, recordEntryOpen, replaceEntryTags, updateComment, updateEntry } from "./entryStore";

describe("entryStore mutations", () => {
  beforeEach(() => {
    sqlMock.mockReset().mockResolvedValue([]);
    queryMock.mockReset().mockResolvedValue([]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000001");
  });

  it("creates note entries locally", async () => {
    await createEntry("A useful note");

    const call = sqlCalls()[0];
    expect(call.sql).toContain("INSERT INTO entries");
    expect(call.values).toEqual(expect.arrayContaining(["00000000-0000-4000-8000-000000000001", "A useful note"]));
  });

  it("indexes hashtags written in a note", async () => {
    await createEntry("Garden plans\nPlant #herbs with #local-first notes");

    const tagCall = sqlCalls().find((call) => call.sql.includes("INSERT INTO entry_tags"));
    expect(tagCall?.values).toEqual(expect.arrayContaining(["00000000-0000-4000-8000-000000000001"]));
  });

  it("uses first line as title and keeps the rest as note body", async () => {
    await createEntry("Trip notes\n- day 1\n- day 2");

    const call = sqlCalls()[0];
    expect(call.sql).toContain("INSERT INTO entries");
    expect(call.values).toEqual(expect.arrayContaining(["00000000-0000-4000-8000-000000000001", "Trip notes", "- day 1\n- day 2"]));
  });

  it("creates URL entries with normalized local URL fields", async () => {
    await createEntry("example.com/path#fragment");

    const call = sqlCalls()[0];
    expect(call.sql).toContain("INSERT INTO entries");
    expect(call.values).toEqual(expect.arrayContaining(["00000000-0000-4000-8000-000000000001", "https://example.com/path", "https://example.com/path", "example.com"]));
  });

  it("reuses an existing entry for a duplicate URL", async () => {
    queryMock.mockResolvedValue([{ id: "entry-1" }]);

    await expect(createEntry("https://example.com/article")).resolves.toBe("entry-1");
    expect(sqlMock).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("saves URL entries before metadata enrichment completes", async () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));

    await createEntry("https://example.com/article");

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8788/v1/mark/metadata",
      expect.objectContaining({
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/article" }),
      }),
    );
    const call = sqlCalls()[0];
    expect(call.sql).toContain("INSERT INTO entries");
    expect(call.values).toEqual(expect.arrayContaining(["example.com", null, "idle"]));
  });

  it("adds comments and touches the parent entry", async () => {
    await addCommentToEntry("entry-1", "follow-up");

    const calls = sqlCalls();
    expect(calls[0].sql).toContain("INSERT INTO comments");
    expect(calls[0].values).toEqual(expect.arrayContaining(["00000000-0000-4000-8000-000000000001", "entry-1", "follow-up"]));
    expect(calls[1].sql).toContain("UPDATE entries");
    expect(calls[1].values).toEqual(expect.arrayContaining(["entry-1"]));
  });

  it("updates entries", async () => {
    await updateEntry("entry-1", {
      title: "Updated title",
      content: "example.com/updated#fragment",
    });

    const call = sqlCalls()[0];
    expect(call.sql).toContain("UPDATE entries");
    expect(call.values).toEqual(
      expect.arrayContaining([
        "https://example.com/updated",
        "https://example.com/updated",
        "example.com",
        "Updated title",
        "",
        "entry-1",
      ]),
    );
  });

  it("reports duplicate links when updating an entry", async () => {
    sqlMock.mockRejectedValue(new Error("UNIQUE constraint failed: entries.canonical_url"));

    await expect(updateEntry("entry-1", {
      title: "Updated title",
      content: "example.com/updated",
    })).rejects.toThrow("This link is already saved");
  });

  it("stores non-url content as note body and clears URL fields", async () => {
    await updateEntry("entry-1", {
      title: "Updated note",
      content: "updated note body",
    });

    const call = sqlCalls()[0];
    expect(call.sql).toContain("UPDATE entries");
    expect(call.values).toEqual(
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

  it("keeps a leading URL when tags follow it", async () => {
    await updateEntry("entry-1", {
      title: "Saved article",
      content: "example.com/article\n\n#read #research",
    });

    const call = sqlCalls()[0];
    expect(call.sql).toContain("UPDATE entries");
    expect(call.values).toEqual(expect.arrayContaining(["https://example.com/article", "#read #research", "entry-1"]));
  });

  it("deletes entries with their comments", async () => {
    await deleteEntry("entry-1");

    const calls = sqlCalls();
    expect(calls[0].sql).toContain("DELETE FROM comments WHERE entry_id = ?");
    expect(calls[0].values).toEqual(["entry-1"]);
    expect(calls[1].sql).toContain("DELETE FROM entry_tags WHERE entry_id = ?");
    expect(calls[1].values).toEqual(["entry-1"]);
    expect(calls[2].sql).toContain("DELETE FROM entries WHERE id = ?");
    expect(calls[2].values).toEqual(["entry-1"]);
  });

  it("updates comments", async () => {
    await updateComment("comment-1", "updated comment");

    const call = sqlCalls()[0];
    expect(call.sql).toContain("UPDATE comments");
    expect(call.values).toEqual(expect.arrayContaining(["updated comment", "comment-1"]));
  });

  it("deletes comments", async () => {
    await deleteComment("comment-1");

    const call = sqlCalls()[0];
    expect(call.sql).toContain("DELETE FROM comments WHERE id = ?");
    expect(call.values).toEqual(["comment-1"]);
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
            first_opened_at: null,
            last_opened_at: null,
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

  it("records when an entry is opened without changing its content", async () => {
    await recordEntryOpen("entry-1");

    const call = sqlCalls()[0];
    expect(call.sql).toContain("first_opened_at = COALESCE(first_opened_at, ?)");
    expect(call.values).toEqual(expect.arrayContaining(["entry-1"]));
  });
});
