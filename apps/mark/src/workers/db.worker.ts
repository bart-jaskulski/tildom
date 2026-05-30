import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import type { DbRequest, DbResponse } from "../lib/db.types";

const DB_FILENAME = "/hn-links/entries.sqlite3";

let db: any = null;
let sqlite3Api: any = null;

const hasStorageDirectory = () => {
  const storage = (globalThis.navigator as WorkerNavigator & {
    storage?: { getDirectory?: unknown };
  }).storage;

  return typeof storage?.getDirectory === "function";
};

const getOpfsDiagnostics = () => ({
  secureContext: globalThis.isSecureContext,
  crossOriginIsolated: globalThis.crossOriginIsolated,
  sharedArrayBuffer: typeof globalThis.SharedArrayBuffer === "function",
  storageGetDirectory: hasStorageDirectory(),
  workerContext: typeof WorkerGlobalScope !== "undefined" && globalThis instanceof WorkerGlobalScope,
});

const assertOpfsAvailable = (sqlite3: any) => {
  const hasOpfsDb = typeof sqlite3.oo1?.OpfsDb === "function";
  const hasOpfsVfs = Boolean(sqlite3.capi?.sqlite3_vfs_find?.("opfs"));

  if (hasOpfsDb && hasOpfsVfs) {
    return;
  }

  const diagnostics = getOpfsDiagnostics();
  throw new Error(
    `SQLite OPFS is not available in this browser context: ${JSON.stringify({
      ...diagnostics,
      sqliteOpfsDb: hasOpfsDb,
      sqliteOpfsVfs: hasOpfsVfs,
    })}`,
  );
};

const execSql = (sql: string, params?: any[]) => {
  if (!db) {
    throw new Error("Database is not initialized");
  }

  if (params?.length) {
    db.exec({ sql, bind: params });
    return;
  }

  db.exec(sql);
};

const querySql = <T,>(sql: string, params?: any[]): T[] => {
  if (!db) {
    throw new Error("Database is not initialized");
  }

  return db.exec({
    sql,
    bind: params ?? [],
    rowMode: "object",
    returnValue: "resultRows",
  }) as T[];
};

const ensureEntryTable = async () => {
  execSql(`
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
  `);
};

const ensureCommentTable = async () => {
  execSql(`
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT NOT NULL PRIMARY KEY DEFAULT '',
      entry_id TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
  `);
};

const ensureSearchDocumentsTable = async () => {
  execSql(`
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
  `);
};

const ensureSearchDocumentTriggers = async () => {
  execSql(`
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
  `);
};

const backfillSearchDocuments = async () => {
  execSql(`
    DELETE FROM search_documents;
    DELETE FROM search_documents_fts;

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
    FROM search_documents;
  `);
};

const ensureSchema = async () => {
  await ensureEntryTable();
  await ensureCommentTable();
  await ensureSearchDocumentsTable();
  await ensureSearchDocumentTriggers();
  await backfillSearchDocuments();
};

const exportDb = () => {
  if (!db || !sqlite3Api) {
    throw new Error("Database is not initialized");
  }

  return sqlite3Api.capi.sqlite3_js_db_export(db);
};

const validateImportedDb = async (bytes: Uint8Array) => {
  if (!sqlite3Api) {
    throw new Error("Database is not initialized");
  }

  const tempFilename = `/hn-links/import-${crypto.randomUUID()}.sqlite3`;

  try {
    await sqlite3Api.oo1.OpfsDb.importDb(tempFilename, bytes);

    const importedDb = new sqlite3Api.oo1.OpfsDb(tempFilename, "r");
    try {
      const integrity = importedDb.exec({
        sql: "PRAGMA integrity_check",
        rowMode: "array",
        returnValue: "resultRows",
      });
      if (integrity[0]?.[0] !== "ok") {
        throw new Error("Imported database failed integrity check");
      }

      const tables = importedDb.exec({
        sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('entries', 'comments')",
        rowMode: "array",
        returnValue: "resultRows",
      });
      if (tables.length !== 2) {
        throw new Error("Imported database is missing mark.tildom tables");
      }
    } finally {
      importedDb.close();
    }
  } finally {
    await sqlite3Api.opfs?.unlink(tempFilename);
  }
};

const importDb = async (bytes: Uint8Array) => {
  if (!db || !sqlite3Api) {
    throw new Error("Database is not initialized");
  }

  await validateImportedDb(bytes);

  const currentBytes = exportDb();
  db.close();
  db = null;

  try {
    await sqlite3Api.oo1.OpfsDb.importDb(DB_FILENAME, bytes);
    db = new sqlite3Api.oo1.OpfsDb(DB_FILENAME, "c");
    execSql("PRAGMA foreign_keys = ON");
    await ensureSchema();
  } catch (err) {
    await sqlite3Api.oo1.OpfsDb.importDb(DB_FILENAME, currentBytes);
    db = new sqlite3Api.oo1.OpfsDb(DB_FILENAME, "c");
    execSql("PRAGMA foreign_keys = ON");
    await ensureSchema();
    throw err;
  }
};

const initDb = async () => {
  try {
    if (db) {
      return;
    }

    sqlite3Api ??= await sqlite3InitModule();
    console.debug("SQLite WASM module initialized", sqlite3Api.version.libVersion);

    assertOpfsAvailable(sqlite3Api);

    db = new sqlite3Api.oo1.OpfsDb(DB_FILENAME, "c");
    execSql("PRAGMA foreign_keys = ON");

    await ensureSchema();
    console.debug("Database schema ensured");
  } catch (err) {
    console.error("Error initializing database:", err);
    throw err;
  }
};

self.onmessage = async (event: MessageEvent<DbRequest>) => {
  console.debug("Received message in DB worker:", event.data);
  const msg = event.data;

  try {
    switch (msg.type) {
      case "init": {
        await initDb();
        self.postMessage({ id: msg.id, type: "success" } as DbResponse);
        break;
      }
      case "exec": {
        execSql(msg.sql, msg.params);
        self.postMessage({ id: msg.id, type: "success" } as DbResponse);
        self.postMessage({ type: "change", table: "entries" } as DbResponse);
        break;
      }
      case "query": {
        const rows = querySql(msg.sql, msg.params);
        self.postMessage({ id: msg.id, type: "success", data: { rows } } as DbResponse);
        break;
      }
      case "export": {
        const bytes = exportDb();
        self.postMessage({ id: msg.id, type: "success", data: { bytes } } as DbResponse);
        break;
      }
      case "import": {
        await importDb(msg.bytes);
        self.postMessage({ id: msg.id, type: "success" } as DbResponse);
        self.postMessage({ type: "change", table: "entries" } as DbResponse);
        break;
      }
    }
  } catch (err: any) {
    if ("id" in msg) {
      self.postMessage({
        id: msg.id,
        type: "error",
        message: err.message || String(err),
      } as DbResponse);
    }
  }
};
