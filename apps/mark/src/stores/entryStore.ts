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
import { markSyncDirty } from "~/lib/syncState";
import { fetchSuggestedTags } from "~/lib/tagSuggestions";
import { MAX_TAGS_PER_ENTRY, MAX_USED_TAGS, normalizeTagList, parseTagInput } from "~/lib/tags";

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
  tag_names: string | null;
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
  tags: row.tag_names ? row.tag_names.split(" ").filter(Boolean) : [],
});

type TagRow = {
  id: string;
  name: string;
};

const tagSelectSql = `
  LEFT JOIN (
    SELECT entry_tags.entry_id, group_concat(tags.name, ' ') AS tag_names
    FROM entry_tags
    JOIN tags ON tags.id = entry_tags.tag_id
    GROUP BY entry_tags.entry_id
  ) tag_totals ON tag_totals.entry_id = e.id
`;

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
          COALESCE(comment_totals.comment_count, 0) AS comment_count,
          tag_totals.tag_names
        FROM entries e
        LEFT JOIN (
          SELECT entry_id, COUNT(*) AS comment_count
          FROM comments
          GROUP BY entry_id
        ) comment_totals ON comment_totals.entry_id = e.id
        ${tagSelectSql}
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
        COALESCE(comment_totals.comment_count, 0) AS comment_count,
        tag_totals.tag_names
      FROM entries e
      LEFT JOIN (
        SELECT entry_id, COUNT(*) AS comment_count
        FROM comments
        GROUP BY entry_id
      ) comment_totals ON comment_totals.entry_id = e.id
      ${tagSelectSql}
      WHERE e.id = ?
      LIMIT 1
    `,
    [entryId],
  );

  return rows[0] ?? null;
};

const placeholders = (values: unknown[]) => values.map(() => "?").join(", ");

export const fetchTagVocabulary = async () => {
  const rows = await query<{ name: string }>(
    `
      SELECT tags.name
      FROM tags
      WHERE EXISTS (
        SELECT 1 FROM entry_tags
        WHERE entry_tags.tag_id = tags.id
      )
      ORDER BY tags.name ASC
    `,
  );

  return rows.map((row) => row.name);
};

const fetchUsedTagsOutsideEntry = async (entryId: string) => {
  const rows = await query<{ name: string }>(
    `
      SELECT DISTINCT tags.name
      FROM tags
      JOIN entry_tags ON entry_tags.tag_id = tags.id
      WHERE entry_tags.entry_id <> ?
    `,
    [entryId],
  );

  return rows.map((row) => row.name);
};

const fetchExistingTags = async (tagNames: string[]) => {
  if (tagNames.length === 0) {
    return new Map<string, string>();
  }

  const rows = await query<TagRow>(
    `
      SELECT id, name
      FROM tags
      WHERE name IN (${placeholders(tagNames)})
    `,
    tagNames,
  );

  return new Map(rows.map((row) => [row.name, row.id]));
};

const pruneOrphanTags = async () => {
  await exec(`
    DELETE FROM tags
    WHERE NOT EXISTS (
      SELECT 1 FROM entry_tags
      WHERE entry_tags.tag_id = tags.id
    )
  `);
};

const setEntryTags = async (entryId: string, tagNames: string[]) => {
  const now = Date.now();
  const existingTags = await fetchExistingTags(tagNames);

  await exec("DELETE FROM entry_tags WHERE entry_id = ?", [entryId]);

  for (const tagName of tagNames) {
    let tagId = existingTags.get(tagName);

    if (!tagId) {
      tagId = createRecordId();
      existingTags.set(tagName, tagId);
      await exec(
        "INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)",
        [tagId, tagName, now],
      );
    }

    await exec(
      "INSERT INTO entry_tags (entry_id, tag_id, created_at) VALUES (?, ?, ?)",
      [entryId, tagId, now],
    );
  }

  await pruneOrphanTags();
};

const validateManualTags = async (entryId: string, input: string) => {
  const tagNames = parseTagInput(input);
  if (tagNames.length > MAX_TAGS_PER_ENTRY) {
    throw new Error(`Use ${MAX_TAGS_PER_ENTRY} tags or fewer`);
  }

  const usedOutsideEntry = await fetchUsedTagsOutsideEntry(entryId);
  const totalUsed = new Set([...usedOutsideEntry, ...tagNames]).size;
  if (totalUsed > MAX_USED_TAGS) {
    throw new Error(`Tag limit is ${MAX_USED_TAGS}`);
  }

  return tagNames;
};

export const replaceEntryTags = async (entryId: string, input: string) => {
  await setEntryTags(entryId, await validateManualTags(entryId, input));
  await markSyncDirty();
};

const applySuggestedTags = async (entryId: string, rawTags: string[]) => {
  const suggestedTags = normalizeTagList(rawTags).slice(0, MAX_TAGS_PER_ENTRY);
  if (suggestedTags.length === 0) {
    return;
  }

  const currentVocabulary = new Set(await fetchTagVocabulary());
  let usedCount = currentVocabulary.size;
  const acceptedTags: string[] = [];

  for (const tag of suggestedTags) {
    if (currentVocabulary.has(tag)) {
      acceptedTags.push(tag);
      continue;
    }

    if (usedCount >= MAX_USED_TAGS) {
      continue;
    }

    currentVocabulary.add(tag);
    usedCount += 1;
    acceptedTags.push(tag);
  }

  if (acceptedTags.length > 0) {
    await setEntryTags(entryId, acceptedTags);
    await markSyncDirty();
  }
};

const tagEntryInBackground = (
  entryId: string,
  input: { title: string; url: string; excerpt: string | null },
) => {
  void (async () => {
    const existingTags = await fetchTagVocabulary();
    const tags = await fetchSuggestedTags({ ...input, existingTags });
    await applySuggestedTags(entryId, tags);
    await entryStore.refreshEntries();
  })().catch(() => {
    // Tagging is intentionally best-effort.
  });
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
export const refreshEntries = entryStore.refreshEntries;

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

  tagEntryInBackground(entryId, {
    title,
    url: normalizedUrl.canonicalUrl,
    excerpt: metadata.excerpt,
  });

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

  const entryId = isUrlOnlyInput(body) ? await insertUrlEntry(body) : await insertNoteEntry(body);
  await markSyncDirty();
  return entryId;
};

export const updateEntry = async (
  entryId: string,
  input: { title: string; content: string; tags?: string },
) => {
  const content = input.content.trim();
  const normalizedUrl = content && isUrlOnlyInput(content) ? normalizeUrlInput(content) : null;
  const titleInput = input.title.trim();

  if (!titleInput && !content) {
    throw new Error("Entry needs a title or content");
  }

  const nextTags = input.tags === undefined ? null : await validateManualTags(entryId, input.tags);

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

  if (nextTags) {
    await setEntryTags(entryId, nextTags);
  }

  await markSyncDirty();
};

export const deleteEntry = async (entryId: string) => {
  await exec("DELETE FROM comments WHERE entry_id = ?", [entryId]);
  await exec("DELETE FROM entry_tags WHERE entry_id = ?", [entryId]);
  await exec("DELETE FROM entries WHERE id = ?", [entryId]);
  await pruneOrphanTags();
  await markSyncDirty();
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

  await markSyncDirty();
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
  await markSyncDirty();
};

export const deleteComment = async (commentId: string) => {
  await exec("DELETE FROM comments WHERE id = ?", [commentId]);
  await markSyncDirty();
};
