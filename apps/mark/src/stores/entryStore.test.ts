import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MARK_DB_MIGRATIONS } from "~/lib/schema";

let memDb: DatabaseSync;

const createTestDb = () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  for (const m of MARK_DB_MIGRATIONS) {
    db.exec(m.sql);
  }
  return db;
};

vi.mock("~/lib/db", () => ({
  client: {
    subscribe: vi.fn(() => () => {}),
    init: vi.fn(),
    query: vi.fn((sql: string, params: unknown[] = []) => {
      const stmt = memDb.prepare(sql);
      return Promise.resolve(stmt.all(...(params as any[])));
    }),
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?");
      const stmt = memDb.prepare(sql);
      return Promise.resolve(stmt.all(...(values as any[])));
    }),
  },
}));

vi.mock("~/lib/syncState", () => ({
  markSyncDirty: vi.fn(),
}));

import {
  addCommentToEntry,
  createEntry,
  deleteComment,
  deleteEntry,
  fetchEntryDetail,
  recordEntryOpen,
  replaceEntryTags,
  updateComment,
  updateEntry,
} from "./entryStore";

describe("entryStore (Real SQLite Behavioral Integration)", () => {
  beforeEach(() => {
    memDb = createTestDb();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
  });

  const queryEntries = (where = "1=1", params: any[] = []) =>
    memDb.prepare(`SELECT * FROM entries WHERE ${where}`).all(...params) as any[];

  const queryTagsForEntry = (entryId: string) => {
    const rows = memDb.prepare(`
      SELECT tags.name
      FROM entry_tags
      JOIN tags ON tags.id = entry_tags.tag_id
      WHERE entry_tags.entry_id = ?
      ORDER BY tags.name ASC
    `).all(entryId) as { name: string }[];
    return rows.map((r) => r.name);
  };

  it("creates note entries in SQLite", async () => {
    const entryId = await createEntry("A useful note");

    const rows = queryEntries("id = ?", [entryId]);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("A useful note");
    expect(rows[0].body).toBe("");
    expect(rows[0].canonical_url).toBeNull();
  });

  it("indexes hashtags into real SQLite tag tables", async () => {
    const entryId = await createEntry("Garden plans\nPlant #herbs with #local-first notes");

    const tags = queryTagsForEntry(entryId);
    expect(tags).toEqual(["herbs", "local-first"]);
  });

  it("uses first line as title and keeps the rest as note body", async () => {
    const entryId = await createEntry("Trip notes\n- day 1\n- day 2");

    const rows = queryEntries("id = ?", [entryId]);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Trip notes");
    expect(rows[0].body).toBe("- day 1\n- day 2");
  });

  it("creates URL entries with normalized URL fields", async () => {
    const entryId = await createEntry("example.com/path#fragment");

    const rows = queryEntries("id = ?", [entryId]);
    expect(rows).toHaveLength(1);
    expect(rows[0].source_url).toBe("https://example.com/path");
    expect(rows[0].canonical_url).toBe("https://example.com/path");
    expect(rows[0].domain).toBe("example.com");
  });

  it("reuses an existing entry for a duplicate URL", async () => {
    const firstId = await createEntry("https://example.com/article");
    const secondId = await createEntry("https://example.com/article");

    expect(secondId).toBe(firstId);

    const rows = queryEntries("canonical_url = ?", ["https://example.com/article"]);
    expect(rows).toHaveLength(1);
  });

  it("adds comments to an entry and touches last_commented_at", async () => {
    const entryId = await createEntry("Entry with comments");
    const beforeEntry = queryEntries("id = ?", [entryId])[0];

    const commentId = await addCommentToEntry(entryId, "first follow-up");
    expect(commentId).toBeTruthy();

    const comments = memDb.prepare("SELECT * FROM comments WHERE entry_id = ?").all(entryId) as any[];
    expect(comments).toHaveLength(1);
    expect(comments[0].body).toBe("first follow-up");

    const afterEntry = queryEntries("id = ?", [entryId])[0];
    expect(afterEntry.last_commented_at).toBeGreaterThanOrEqual(beforeEntry.last_commented_at);
  });

  it("updates note entries in SQLite", async () => {
    const entryId = await createEntry("Initial title\nInitial body");

    await updateEntry(entryId, {
      title: "Updated title",
      content: "updated note body",
    });

    const rows = queryEntries("id = ?", [entryId]);
    expect(rows[0].title).toBe("Updated title");
    expect(rows[0].body).toBe("updated note body");
  });

  it("enforces canonical_url uniqueness and rejects duplicate URLs on update", async () => {
    await createEntry("https://example.com/first");
    const secondId = await createEntry("https://example.com/second");

    await expect(
      updateEntry(secondId, {
        title: "Colliding title",
        content: "https://example.com/first",
      }),
    ).rejects.toThrow("This link is already saved");
  });

  it("keeps a leading URL when tags follow it in update", async () => {
    const entryId = await createEntry("Initial");

    await updateEntry(entryId, {
      title: "Saved article",
      content: "example.com/article\n\n#read #research",
    });

    const rows = queryEntries("id = ?", [entryId]);
    expect(rows[0].canonical_url).toBe("https://example.com/article");
    expect(rows[0].body).toBe("#read #research");
  });

  it("deletes entries with cascading comments and tags in SQLite", async () => {
    const entryId = await createEntry("To delete #temporary");
    await addCommentToEntry(entryId, "temporary comment");

    await deleteEntry(entryId);

    expect(queryEntries("id = ?", [entryId])).toHaveLength(0);
    const comments = memDb.prepare("SELECT * FROM comments WHERE entry_id = ?").all(entryId);
    expect(comments).toHaveLength(0);
    const entryTags = memDb.prepare("SELECT * FROM entry_tags WHERE entry_id = ?").all(entryId);
    expect(entryTags).toHaveLength(0);
  });

  it("updates comments", async () => {
    const entryId = await createEntry("Entry");
    const comment = (await addCommentToEntry(entryId, "initial comment"))!;

    await updateComment(comment.id, "updated comment");

    const comments = memDb.prepare("SELECT * FROM comments WHERE id = ?").all(comment.id) as any[];
    expect(comments[0].body).toBe("updated comment");
  });

  it("deletes comments", async () => {
    const entryId = await createEntry("Entry");
    const comment = (await addCommentToEntry(entryId, "to delete"))!;

    await deleteComment(comment.id);

    const comments = memDb.prepare("SELECT * FROM comments WHERE id = ?").all(comment.id);
    expect(comments).toHaveLength(0);
  });

  it("retrieves full entry detail with tags and comments from real tables", async () => {
    const entryId = await createEntry("Detailed Entry\nBody text\n#sqlite #local-first");
    await addCommentToEntry(entryId, "Comment one");

    const detail = await fetchEntryDetail(entryId);

    expect(detail.entry?.title).toBe("Detailed Entry");
    expect(detail.entry?.body).toBe("Body text\n#sqlite #local-first");
    expect(detail.entry?.commentCount).toBe(1);
    expect(detail.entry?.tags).toEqual(expect.arrayContaining(["local-first", "sqlite"]));
    expect(detail.comments).toHaveLength(1);
    expect(detail.comments[0].body).toBe("Comment one");
  });

  it("rejects manual tag edits over the per-entry limit", async () => {
    const entryId = await createEntry("Tag limit test");

    await expect(replaceEntryTags(entryId, "one two three four five six")).rejects.toThrow(
      "Use 5 tags or fewer",
    );
  });

  it("records when an entry is opened without changing its content", async () => {
    const entryId = await createEntry("Open test");
    const before = queryEntries("id = ?", [entryId])[0];
    expect(before.first_opened_at).toBeNull();

    await recordEntryOpen(entryId);

    const after = queryEntries("id = ?", [entryId])[0];
    expect(after.first_opened_at).toBeGreaterThan(0);
    expect(after.last_opened_at).toBeGreaterThan(0);
  });
});
