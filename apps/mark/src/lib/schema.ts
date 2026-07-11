export const MARK_DB_SCHEMA = `
CREATE TABLE IF NOT EXISTS entries (
  id TEXT NOT NULL PRIMARY KEY DEFAULT '',
  source_url TEXT,
  canonical_url TEXT,
  domain TEXT,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  excerpt TEXT,
  excerpt_status TEXT NOT NULL DEFAULT 'idle',
  excerpt_error TEXT,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  last_commented_at INTEGER
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT NOT NULL PRIMARY KEY DEFAULT '',
  entry_id TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT NOT NULL PRIMARY KEY DEFAULT '',
  name TEXT NOT NULL UNIQUE DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS entry_tags (
  entry_id TEXT NOT NULL DEFAULT '',
  tag_id TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (entry_id, tag_id),
  FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS entries_canonical_url_unique
ON entries(canonical_url)
WHERE canonical_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS entry_tags_tag_id_idx ON entry_tags(tag_id);
CREATE INDEX IF NOT EXISTS entry_tags_entry_id_idx ON entry_tags(entry_id);

CREATE TABLE IF NOT EXISTS search_documents (
  entry_id TEXT NOT NULL PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  domain TEXT NOT NULL DEFAULT '',
  excerpt TEXT NOT NULL DEFAULT '',
  comments_text TEXT NOT NULL DEFAULT '',
  searchable_text TEXT NOT NULL DEFAULT '',
  comment_count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE VIRTUAL TABLE IF NOT EXISTS search_documents_fts USING fts5(
  entry_id UNINDEXED,
  title,
  body,
  url,
  domain,
  excerpt,
  comments_text,
  comment_count UNINDEXED,
  updated_at UNINDEXED
);

CREATE TRIGGER IF NOT EXISTS entries_search_ai
AFTER INSERT ON entries
BEGIN
  DELETE FROM search_documents WHERE entry_id = NEW.id;
  DELETE FROM search_documents_fts WHERE entry_id = NEW.id;

  INSERT INTO search_documents (
    entry_id,
    title,
    body,
    url,
    domain,
    excerpt,
    comments_text,
    searchable_text,
    comment_count,
    updated_at
  )
  SELECT
    e.id,
    e.title,
    e.body,
    COALESCE(e.canonical_url, e.source_url, ''),
    COALESCE(e.domain, ''),
    COALESCE(e.excerpt, ''),
    COALESCE(group_concat(c.body, ' '), ''),
    lower(trim(
      COALESCE(e.title, '') || ' ' ||
      COALESCE(e.body, '') || ' ' ||
      COALESCE(e.source_url, '') || ' ' ||
      COALESCE(e.canonical_url, '') || ' ' ||
      COALESCE(e.domain, '') || ' ' ||
      COALESCE(e.excerpt, '') || ' ' ||
      COALESCE(group_concat(c.body, ' '), '')
    )),
    COUNT(c.id),
    e.updated_at
  FROM entries e
  LEFT JOIN comments c ON c.entry_id = e.id
  WHERE e.id = NEW.id
  GROUP BY
    e.id,
    e.title,
    e.body,
    e.source_url,
    e.canonical_url,
    e.domain,
    e.excerpt,
    e.updated_at;

  INSERT INTO search_documents_fts (
    entry_id,
    title,
    body,
    url,
    domain,
    excerpt,
    comments_text,
    comment_count,
    updated_at
  )
  SELECT
    entry_id,
    title,
    body,
    url,
    domain,
    excerpt,
    comments_text,
    comment_count,
    updated_at
  FROM search_documents
  WHERE entry_id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS entries_search_au
AFTER UPDATE ON entries
BEGIN
  DELETE FROM search_documents WHERE entry_id = NEW.id;
  DELETE FROM search_documents_fts WHERE entry_id = NEW.id;

  INSERT INTO search_documents (
    entry_id,
    title,
    body,
    url,
    domain,
    excerpt,
    comments_text,
    searchable_text,
    comment_count,
    updated_at
  )
  SELECT
    e.id,
    e.title,
    e.body,
    COALESCE(e.canonical_url, e.source_url, ''),
    COALESCE(e.domain, ''),
    COALESCE(e.excerpt, ''),
    COALESCE(group_concat(c.body, ' '), ''),
    lower(trim(
      COALESCE(e.title, '') || ' ' ||
      COALESCE(e.body, '') || ' ' ||
      COALESCE(e.source_url, '') || ' ' ||
      COALESCE(e.canonical_url, '') || ' ' ||
      COALESCE(e.domain, '') || ' ' ||
      COALESCE(e.excerpt, '') || ' ' ||
      COALESCE(group_concat(c.body, ' '), '')
    )),
    COUNT(c.id),
    e.updated_at
  FROM entries e
  LEFT JOIN comments c ON c.entry_id = e.id
  WHERE e.id = NEW.id
  GROUP BY
    e.id,
    e.title,
    e.body,
    e.source_url,
    e.canonical_url,
    e.domain,
    e.excerpt,
    e.updated_at;

  INSERT INTO search_documents_fts (
    entry_id,
    title,
    body,
    url,
    domain,
    excerpt,
    comments_text,
    comment_count,
    updated_at
  )
  SELECT
    entry_id,
    title,
    body,
    url,
    domain,
    excerpt,
    comments_text,
    comment_count,
    updated_at
  FROM search_documents
  WHERE entry_id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS entries_search_ad
AFTER DELETE ON entries
BEGIN
  DELETE FROM search_documents WHERE entry_id = OLD.id;
  DELETE FROM search_documents_fts WHERE entry_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS comments_search_ai
AFTER INSERT ON comments
BEGIN
  UPDATE entries
  SET updated_at = updated_at
  WHERE id = NEW.entry_id;
END;

CREATE TRIGGER IF NOT EXISTS comments_search_au
AFTER UPDATE ON comments
BEGIN
  UPDATE entries
  SET updated_at = updated_at
  WHERE id = OLD.entry_id;

  UPDATE entries
  SET updated_at = updated_at
  WHERE id = NEW.entry_id AND NEW.entry_id <> OLD.entry_id;
END;

CREATE TRIGGER IF NOT EXISTS comments_search_ad
AFTER DELETE ON comments
BEGIN
  UPDATE entries
  SET updated_at = updated_at
  WHERE id = OLD.entry_id;
END;
`;
