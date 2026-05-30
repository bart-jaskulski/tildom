import { createEffect, createRoot } from "solid-js";
import { createStore } from "solid-js/store";
import { dbVersion, exec, initDb, query } from "~/lib/db";
import {
  buildUrlFallbackTitle,
  createRecordId,
  deriveNoteTitle,
  isUrlOnlyInput,
  normalizeUrlInput,
  splitNoteIntoTitleAndBody,
  type Entry,
  type EntryComment,
  type EntryDetail,
} from "~/lib/entries";
import { fetchLinkMetadata } from "~/lib/linkMetadata";

type EntryRow = {
  id: string;
  source_url: string | null;
  canonical_url: string | null;
  domain: string | null;
  title: string;
  body: string;
  excerpt: string | null;
  excerpt_status: "idle" | "pending" | "ready" | "error";
  excerpt_error: string | null;
  created_at: number;
  updated_at: number;
  last_commented_at: number | null;
  comment_count: number;
};

type CommentRow = {
  id: string;
  entry_id: string;
  body: string;
  created_at: number;
  updated_at: number;
};

const entryRowToEntry = (row: EntryRow): Entry => ({
  id: row.id,
  sourceUrl: row.source_url,
  canonicalUrl: row.canonical_url,
  domain: row.domain,
  title: row.title,
  body: row.body,
  excerpt: row.excerpt,
  excerptStatus: row.excerpt_status,
  excerptError: row.excerpt_error,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  lastCommentedAt: row.last_commented_at,
  commentCount: row.comment_count,
});

const commentRowToComment = (row: CommentRow): EntryComment => ({
  id: row.id,
  entryId: row.entry_id,
  body: row.body,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const entryStore = createRoot(() => {
  const [state, setState] = createStore({
    entries: [] as Entry[],
    isReady: false,
  });

  const refreshEntries = async () => {
    const rows = await query<EntryRow>(
      `
        SELECT
          e.id,
          e.source_url,
          e.canonical_url,
          e.domain,
          e.title,
          e.body,
          e.excerpt,
          e.excerpt_status,
          e.excerpt_error,
          e.created_at,
          e.updated_at,
          e.last_commented_at,
          COALESCE(comment_totals.comment_count, 0) AS comment_count
        FROM entries e
        LEFT JOIN (
          SELECT entry_id, COUNT(*) AS comment_count
          FROM comments
          GROUP BY entry_id
        ) comment_totals ON comment_totals.entry_id = e.id
        ORDER BY COALESCE(e.last_commented_at, e.created_at) DESC, e.created_at DESC
      `,
    );

    setState("entries", rows.map(entryRowToEntry));
  };

  createEffect(() => {
    const version = dbVersion();
    if (version > 0) {
      void refreshEntries();
    }
  });

  return {
    state,
    refreshEntries,
    setReady: (value: boolean) => setState("isReady", value),
  };
});

const fetchEntryRow = async (entryId: string) => {
  const rows = await query<EntryRow>(
    `
      SELECT
        e.id,
        e.source_url,
        e.canonical_url,
        e.domain,
        e.title,
        e.body,
        e.excerpt,
        e.excerpt_status,
        e.excerpt_error,
        e.created_at,
        e.updated_at,
        e.last_commented_at,
        COALESCE(comment_totals.comment_count, 0) AS comment_count
      FROM entries e
      LEFT JOIN (
        SELECT entry_id, COUNT(*) AS comment_count
        FROM comments
        GROUP BY entry_id
      ) comment_totals ON comment_totals.entry_id = e.id
      WHERE e.id = ?
      LIMIT 1
    `,
    [entryId],
  );

  return rows[0] ?? null;
};

export const initializeEntryStore = async () => {
  console.debug("Initializing entry store...");
  try {
    await initDb();
    await entryStore.refreshEntries();
    entryStore.setReady(true);
  } catch (error) {
    console.error("Failed to initialize entry store:", error);
  }
};

export const entries = () => entryStore.state.entries;
export const isEntryStoreReady = () => entryStore.state.isReady;

export const fetchEntryDetail = async (entryId: string): Promise<EntryDetail> => {
  const entryRow = await fetchEntryRow(entryId);
  const comments = await query<CommentRow>(
    `
      SELECT id, entry_id, body, created_at, updated_at
      FROM comments
      WHERE entry_id = ?
      ORDER BY created_at ASC
    `,
    [entryId],
  );

  return {
    entry: entryRow ? entryRowToEntry(entryRow) : null,
    comments: comments.map(commentRowToComment),
  };
};

const insertUrlEntry = async (urlInput: string) => {
  const normalizedUrl = normalizeUrlInput(urlInput);
  const metadata = await fetchLinkMetadata(normalizedUrl.canonicalUrl);
  const now = Date.now();
  const entryId = createRecordId();
  const title = metadata.title ?? buildUrlFallbackTitle(normalizedUrl);
  const excerptStatus = metadata.excerpt ? "ready" : "idle";

  await exec(
    `
      INSERT INTO entries (
        id,
        source_url,
        canonical_url,
        domain,
        title,
        body,
        excerpt,
        excerpt_status,
        created_at,
        updated_at,
        last_commented_at
      ) VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?)
    `,
    [
      entryId,
      normalizedUrl.sourceUrl,
      normalizedUrl.canonicalUrl,
      normalizedUrl.domain,
      title,
      metadata.excerpt,
      excerptStatus,
      now,
      now,
      now,
    ],
  );

  return entryId;
};

const insertNoteEntry = async (bodyInput: string) => {
  if (!bodyInput.trim()) {
    throw new Error("Entry is required");
  }

  const note = splitNoteIntoTitleAndBody(bodyInput);
  const now = Date.now();
  const entryId = createRecordId();

  await exec(
    `
      INSERT INTO entries (
        id,
        title,
        body,
        excerpt_status,
        created_at,
        updated_at,
        last_commented_at
      ) VALUES (?, ?, ?, 'idle', ?, ?, ?)
    `,
    [entryId, note.title, note.body, now, now, now],
  );

  return entryId;
};

export const createEntry = async (bodyInput: string) => {
  const body = bodyInput.trim();
  if (!body) {
    throw new Error("Entry is required");
  }

  return isUrlOnlyInput(body) ? insertUrlEntry(body) : insertNoteEntry(body);
};

export const updateEntry = async (
  entryId: string,
  input: { title: string; content: string },
) => {
  const content = input.content.trim();
  const normalizedUrl = content && isUrlOnlyInput(content) ? normalizeUrlInput(content) : null;
  const titleInput = input.title.trim();

  if (!titleInput && !content) {
    throw new Error("Entry needs a title or content");
  }

  const title = titleInput || (normalizedUrl ? buildUrlFallbackTitle(normalizedUrl) : deriveNoteTitle(content));
  const body = normalizedUrl ? "" : content;

  await exec(
    `
      UPDATE entries
      SET
        source_url = ?,
        canonical_url = ?,
        domain = ?,
        title = ?,
        body = ?,
        updated_at = ?
      WHERE id = ?
    `,
    [
      normalizedUrl?.sourceUrl ?? null,
      normalizedUrl?.canonicalUrl ?? null,
      normalizedUrl?.domain ?? null,
      title,
      body,
      Date.now(),
      entryId,
    ],
  );
};

export const deleteEntry = async (entryId: string) => {
  await exec("DELETE FROM comments WHERE entry_id = ?", [entryId]);
  await exec("DELETE FROM entries WHERE id = ?", [entryId]);
};

export const addCommentToEntry = async (entryId: string, bodyInput: string) => {
  const body = bodyInput.trim();
  if (!body) {
    throw new Error("Comment is required");
  }

  const now = Date.now();
  const commentId = createRecordId();

  await exec(
    `
      INSERT INTO comments (id, entry_id, body, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `,
    [commentId, entryId, body, now, now],
  );

  await exec(
    `
      UPDATE entries
      SET updated_at = ?, last_commented_at = ?
      WHERE id = ?
    `,
    [now, now, entryId],
  );

  return commentId;
};

export const updateComment = async (commentId: string, bodyInput: string) => {
  const body = bodyInput.trim();
  if (!body) {
    throw new Error("Comment is required");
  }

  await exec(
    `
      UPDATE comments
      SET body = ?, updated_at = ?
      WHERE id = ?
    `,
    [body, Date.now(), commentId],
  );
};

export const deleteComment = async (commentId: string) => {
  await exec("DELETE FROM comments WHERE id = ?", [commentId]);
};
