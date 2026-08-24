import { createEffect, createRoot } from "solid-js";
import { createStore } from "solid-js/store";
import { client } from "~/lib/db";
import {
  buildUrlFallbackTitle,
  createRecordId,
  deriveNoteTitle,
  isUrlOnlyInput,
  normalizeUrlInput,
  splitLeadingUrl,
  splitNoteIntoTitleAndBody,
  type Entry,
  type EntryComment,
  type EntryDetail,
  type ReaderCapture,
  type ReaderCaptureStatus,
} from "~/lib/entries";
import { fetchLinkMetadata, type ExtractedCapture } from "~/lib/linkMetadata";
import { markStartup, measureStartup } from "~/lib/startupPerformance";
import { markSyncDirty } from "~/lib/syncState";
import { fetchSuggestedTags } from "~/lib/tagSuggestions";
import { MAX_TAGS_PER_ENTRY, MAX_USED_TAGS, normalizeTagList, parseHashTags, parseTagInput } from "~/lib/tags";

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
  first_opened_at: number | null;
  last_opened_at: number | null;
  comment_count: number;
  reader_text_length: number;
  tag_names: string | null;
};

type CommentRow = {
  id: string;
  entry_id: string;
  body: string;
  created_at: number;
  updated_at: number;
};

type ReaderCaptureRow = {
  entry_id: string;
  status: ReaderCaptureStatus;
  markdown: string;
  text_content: string;
  byline: string | null;
  site_name: string | null;
  published_at: string | null;
  language: string | null;
  captured_at: number | null;
  source_url: string | null;
  error: string | null;
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
  firstOpenedAt: row.first_opened_at,
  lastOpenedAt: row.last_opened_at,
  commentCount: row.comment_count,
  readerTextLength: row.reader_text_length,
  tags: row.tag_names ? row.tag_names.split(" ").filter(Boolean) : [],
});

type TagRow = {
  id: string;
  name: string;
};

type EntryIdRow = {
  id: string;
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

const readerCaptureRowToCapture = (row: ReaderCaptureRow): ReaderCapture => ({
  entryId: row.entry_id,
  status: row.status,
  markdown: row.markdown,
  textContent: row.text_content,
  byline: row.byline,
  siteName: row.site_name,
  publishedAt: row.published_at,
  language: row.language,
  capturedAt: row.captured_at,
  sourceUrl: row.source_url,
  error: row.error,
});

const entryStore = createRoot(() => {
  const [state, setState] = createStore({
    entries: [] as Entry[],
    isReady: false,
  });

  const refreshEntries = async () => {
    const rows = await client.query<EntryRow>(
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
          e.first_opened_at,
          e.last_opened_at,
          COALESCE(comment_totals.comment_count, 0) AS comment_count,
          COALESCE(length(reader_captures.text_content), 0) AS reader_text_length,
          tag_totals.tag_names
        FROM entries e
        LEFT JOIN reader_captures ON reader_captures.entry_id = e.id
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
    const version = client.dbVersion;
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
  const rows = await client.query<EntryRow>(
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
        e.first_opened_at,
        e.last_opened_at,
        COALESCE(comment_totals.comment_count, 0) AS comment_count,
        COALESCE(length(reader_captures.text_content), 0) AS reader_text_length,
        tag_totals.tag_names
      FROM entries e
      LEFT JOIN reader_captures ON reader_captures.entry_id = e.id
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

const findEntryIdByCanonicalUrl = async (canonicalUrl: string) => {
  const rows = await client.query<EntryIdRow>(
    "SELECT id FROM entries WHERE canonical_url = ? LIMIT 1",
    [canonicalUrl],
  );

  return rows[0]?.id ?? null;
};

const isDuplicateUrlError = (error: unknown) =>
  error instanceof Error && /UNIQUE constraint failed: entries\.canonical_url/i.test(error.message);

const placeholders = (values: unknown[]) => values.map(() => "?").join(", ");

export const fetchTagVocabulary = async () => {
  const rows = await client.query<{ name: string }>(
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
  const rows = await client.query<{ name: string }>(
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

  const rows = await client.query<TagRow>(
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
  await client.exec(`
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

  await client.exec("DELETE FROM entry_tags WHERE entry_id = ?", [entryId]);

  for (const tagName of tagNames) {
    let tagId = existingTags.get(tagName);

    if (!tagId) {
      tagId = createRecordId();
      existingTags.set(tagName, tagId);
      await client.exec(
        "INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)",
        [tagId, tagName, now],
      );
    }

    await client.exec(
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
  })().catch(() => {
    // Tagging is intentionally best-effort.
  });
};

const enrichUrlEntryInBackground = (
  entryId: string,
  input: { title: string; url: string },
) => {
  void (async () => {
    const metadata = await fetchLinkMetadata(input.url);

    if (metadata.title || metadata.excerpt) {
      await client.exec(
        `
          UPDATE entries
          SET
            title = CASE WHEN title = ? THEN COALESCE(?, title) ELSE title END,
            excerpt = ?,
            excerpt_status = ?,
            updated_at = ?
          WHERE id = ?
        `,
        [
          input.title,
          metadata.title,
          metadata.excerpt,
          metadata.excerpt ? "ready" : "idle",
          Date.now(),
          entryId,
        ],
      );
    }

    if (metadata.capture) {
      await saveReaderCapture(entryId, "ready", metadata.capture);
    }

    tagEntryInBackground(entryId, {
      title: metadata.title ?? input.title,
      url: input.url,
      excerpt: metadata.excerpt,
    });
  })().catch(() => {
    // Enrichment is intentionally best-effort.
  });
};

const saveReaderCapture = async (
  entryId: string,
  status: ReaderCaptureStatus,
  capture?: ExtractedCapture,
  error: string | null = null,
) => {
  await client.exec(
    `
      INSERT INTO reader_captures (
        entry_id, status, markdown, text_content, byline, site_name,
        published_at, language, captured_at, source_url, error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(entry_id) DO UPDATE SET
        status = excluded.status,
        markdown = excluded.markdown,
        text_content = excluded.text_content,
        byline = excluded.byline,
        site_name = excluded.site_name,
        published_at = excluded.published_at,
        language = excluded.language,
        captured_at = excluded.captured_at,
        source_url = excluded.source_url,
        error = excluded.error
    `,
    [
      entryId,
      status,
      capture?.markdown ?? "",
      capture?.textContent ?? "",
      capture?.byline ?? null,
      capture?.siteName ?? null,
      capture?.publishedAt ?? null,
      capture?.language ?? null,
      capture ? Date.now() : null,
      capture?.sourceUrl ?? null,
      error,
    ],
  );
};

export const initializeEntryStore = async () => {
  console.debug("Initializing entry store...");
  markStartup("db:init:start");

  try {
    await client.init();
    markStartup("db:init:ready");
    measureStartup("db:init", "db:init:start", "db:init:ready");

    await entryStore.refreshEntries();
    markStartup("entries:query:ready");
    measureStartup("entries:initial-query", "db:init:ready", "entries:query:ready");

    entryStore.setReady(true);
    markStartup("entries:ready");
    measureStartup("boot-to-entries-ready", "boot:start", "entries:ready");

    requestAnimationFrame(() => {
      markStartup("entries:painted");
      measureStartup("boot-to-entries-painted", "boot:start", "entries:painted");
    });
  } catch (error) {
    markStartup("db:init:error");
    console.error("Failed to initialize entry store:", error);
  }
};

export const entries = () => entryStore.state.entries;
export const isEntryStoreReady = () => entryStore.state.isReady;
export const refreshEntries = entryStore.refreshEntries;

export const fetchEntryDetail = async (entryId: string): Promise<EntryDetail> => {
  const [entryRow, comments, captures] = await Promise.all([
    fetchEntryRow(entryId),
    client.query<CommentRow>(
    `
      SELECT id, entry_id, body, created_at, updated_at
      FROM comments
      WHERE entry_id = ?
      ORDER BY created_at ASC
    `,
    [entryId],
    ),
    client.query<ReaderCaptureRow>(
      `
        SELECT entry_id, status, markdown, text_content, byline, site_name,
          published_at, language, captured_at, source_url, error
        FROM reader_captures
        WHERE entry_id = ?
        LIMIT 1
      `,
      [entryId],
    ),
  ]);

  return {
    entry: entryRow ? entryRowToEntry(entryRow) : null,
    comments: comments.map(commentRowToComment),
    capture: captures[0] ? readerCaptureRowToCapture(captures[0]) : null,
  };
};

export const captureEntry = async (entryId: string, url: string) => {
  await saveReaderCapture(entryId, "pending");
  const metadata = await fetchLinkMetadata(url);

  if (!metadata.capture) {
    await saveReaderCapture(entryId, "unavailable", undefined, "Reader view is unavailable for this page");
    await markSyncDirty();
    return null;
  }

  await saveReaderCapture(entryId, "ready", metadata.capture);
  await markSyncDirty();
  return metadata.capture;
};

export const recordEntryOpen = async (entryId: string) => {
  const openedAt = Date.now();
  await client.exec(
    `
      UPDATE entries
      SET
        first_opened_at = COALESCE(first_opened_at, ?),
        last_opened_at = ?
      WHERE id = ?
    `,
    [openedAt, openedAt, entryId],
  );
  await markSyncDirty();
  return { firstOpenedAt: openedAt, lastOpenedAt: openedAt };
};

const insertUrlEntry = async (urlInput: string) => {
  const normalizedUrl = normalizeUrlInput(urlInput);
  const existingEntryId = await findEntryIdByCanonicalUrl(normalizedUrl.canonicalUrl);
  if (existingEntryId) {
    return existingEntryId;
  }

  const now = Date.now();
  const entryId = createRecordId();
  const title = buildUrlFallbackTitle(normalizedUrl);

  try {
    await client.exec(
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
        null,
        "idle",
        now,
        now,
        now,
      ],
    );
  } catch (error) {
    if (isDuplicateUrlError(error)) {
      const duplicateEntryId = await findEntryIdByCanonicalUrl(normalizedUrl.canonicalUrl);
      if (duplicateEntryId) {
        return duplicateEntryId;
      }
    }

    throw error;
  }

  enrichUrlEntryInBackground(entryId, {
    title,
    url: normalizedUrl.canonicalUrl,
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

  await client.exec(
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

  const tags = await validateManualTags("", parseHashTags(body).join(" "));
  const entryId = isUrlOnlyInput(body) ? await insertUrlEntry(body) : await insertNoteEntry(body);
  if (tags.length > 0) {
    await setEntryTags(entryId, tags);
  }
  await markSyncDirty();
  return entryId;
};

export const updateEntry = async (
  entryId: string,
  input: { title: string; content: string; tags?: string },
) => {
  const content = input.content.trim();
  const leadingUrl = content ? splitLeadingUrl(content) : null;
  const normalizedUrl = leadingUrl ? normalizeUrlInput(leadingUrl.url) : null;
  const titleInput = input.title.trim();

  if (!titleInput && !content) {
    throw new Error("Entry needs a title or content");
  }

  const nextTags = input.tags === undefined ? null : await validateManualTags(entryId, input.tags);

  const title = titleInput || (normalizedUrl ? buildUrlFallbackTitle(normalizedUrl) : deriveNoteTitle(content));
  const body = normalizedUrl ? leadingUrl!.body : content;
  const updatedAt = Date.now();

  try {
    await client.exec(
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
        updatedAt,
        entryId,
      ],
    );
  } catch (error) {
    if (isDuplicateUrlError(error)) {
      throw new Error("This link is already saved");
    }

    throw error;
  }

  if (nextTags) {
    await setEntryTags(entryId, nextTags);
  }

  await markSyncDirty();
  return {
    sourceUrl: normalizedUrl?.sourceUrl ?? null,
    canonicalUrl: normalizedUrl?.canonicalUrl ?? null,
    domain: normalizedUrl?.domain ?? null,
    title,
    body,
    updatedAt,
    tags: nextTags,
  };
};

export const deleteEntry = async (entryId: string) => {
  await client.exec("DELETE FROM comments WHERE entry_id = ?", [entryId]);
  await client.exec("DELETE FROM entry_tags WHERE entry_id = ?", [entryId]);
  await client.exec("DELETE FROM entries WHERE id = ?", [entryId]);
  await pruneOrphanTags();
  await markSyncDirty();
};

export const addCommentToEntry = async (entryId: string, bodyInput: string) => {
  const body = bodyInput.trim();
  if (!body) {
    throw new Error("Note is required");
  }

  const now = Date.now();
  const commentId = createRecordId();

  await client.exec(
    `
      INSERT INTO comments (id, entry_id, body, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `,
    [commentId, entryId, body, now, now],
  );

  await client.exec(
    `
      UPDATE entries
      SET updated_at = ?, last_commented_at = ?
      WHERE id = ?
    `,
    [now, now, entryId],
  );

  await markSyncDirty();
  return {
    id: commentId,
    entryId,
    body,
    createdAt: now,
    updatedAt: now,
  };
};

export const updateComment = async (commentId: string, bodyInput: string) => {
  const body = bodyInput.trim();
  if (!body) {
    throw new Error("Note is required");
  }

  const updatedAt = Date.now();

  await client.exec(
    `
      UPDATE comments
      SET body = ?, updated_at = ?
      WHERE id = ?
    `,
    [body, updatedAt, commentId],
  );
  await markSyncDirty();
  return { body, updatedAt };
};

export const deleteComment = async (commentId: string) => {
  await client.exec("DELETE FROM comments WHERE id = ?", [commentId]);
  await markSyncDirty();
};
