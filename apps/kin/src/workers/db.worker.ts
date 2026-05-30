import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import type { DbRequest, DbResponse } from "../lib/db.types";

const DB_FILENAME = "/kin/kin.sqlite3";

let db: any = null;
let sqlite3Api: any = null;

const hasStorageDirectory = () => {
  const storage = (globalThis.navigator as any).storage;

  return typeof storage?.getDirectory === "function";
};

const getOpfsDiagnostics = () => ({
  secureContext: globalThis.isSecureContext,
  crossOriginIsolated: globalThis.crossOriginIsolated,
  sharedArrayBuffer: typeof globalThis.SharedArrayBuffer === "function",
  storageGetDirectory: hasStorageDirectory(),
  workerContext: typeof (globalThis as any).WorkerGlobalScope !== "undefined" && globalThis instanceof (globalThis as any).WorkerGlobalScope,
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

const ensureSchema = async () => {
  // Check migration version
  const rows = db.exec({
    sql: "PRAGMA user_version",
    rowMode: "array",
    returnValue: "resultRows",
  });
  const currentVersion = rows[0]?.[0] ?? 0;

  if (currentVersion === 0) {
    console.debug("Initializing Kin database schema (version 0 -> 1)...");

    execSql(`
      CREATE TABLE IF NOT EXISTS contacts (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        location TEXT DEFAULT '',
        birthday TEXT DEFAULT '',
        phone TEXT DEFAULT '',
        email TEXT DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    execSql(`
      CREATE TABLE IF NOT EXISTS relationships (
        contact_id_a TEXT NOT NULL,
        contact_id_b TEXT NOT NULL,
        role TEXT NOT NULL,
        PRIMARY KEY (contact_id_a, contact_id_b),
        FOREIGN KEY (contact_id_a) REFERENCES contacts(id) ON DELETE CASCADE,
        FOREIGN KEY (contact_id_b) REFERENCES contacts(id) ON DELETE CASCADE
      );
    `);

    execSql(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY NOT NULL,
        contact_id TEXT NOT NULL,
        body TEXT NOT NULL,
        tags TEXT DEFAULT '',
        is_pinned INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
      );
    `);

    // Unique index on relationships is already enforced by the composite PRIMARY KEY,
    // but let's make sure it's explicitly documented and fully enforced.
    
    execSql("PRAGMA user_version = 1");
    console.debug("Kin database schema version set to 1");
  }
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

  const tempFilename = `/kin/import-${crypto.randomUUID()}.sqlite3`;

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
        sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('contacts', 'relationships', 'notes')",
        rowMode: "array",
        returnValue: "resultRows",
      });
      if (tables.length !== 3) {
        throw new Error("Imported database is missing kin.tildom tables");
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

    // Make sure parent directory directory exists in OPFS
    try {
      await sqlite3Api.opfs?.mkdir("/kin");
    } catch {
      // Might already exist
    }

    db = new sqlite3Api.oo1.OpfsDb(DB_FILENAME, "c");
    execSql("PRAGMA foreign_keys = ON");

    await ensureSchema();
    console.debug("Database schema ensured");
  } catch (err) {
    console.error("Error initializing database in worker:", err);
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
        self.postMessage({ type: "change", table: "contacts" } as DbResponse);
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
        self.postMessage({ type: "change", table: "contacts" } as DbResponse);
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
