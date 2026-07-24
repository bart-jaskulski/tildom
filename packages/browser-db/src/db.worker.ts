import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import type { DbMigration, DbRequest, DbResponse } from "./types";
import { assertOpfsAvailable } from "./diagnostics";

let db: any = null;
let sqlite3Api: any = null;
let activeTxId: number | null = null;
let totalChangesBeforeTx = 0;
let databaseName = "tildom.sqlite3";
let schemaSql: string | undefined;
let databaseMigrations: DbMigration[] = [];
let requiredTableNames: string[] = [];

const getTotalChanges = (): number => {
  if (!db || !sqlite3Api) return 0;
  return sqlite3Api.capi.sqlite3_total_changes(db);
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

const exportDb = () => {
  if (!db || !sqlite3Api) {
    throw new Error("Database is not initialized");
  }

  return sqlite3Api.capi.sqlite3_js_db_export(db);
};

const ensureParentDirectory = async (dbName: string) => {
  const separator = dbName.lastIndexOf("/");
  if (separator <= 0) return;

  const path = dbName.slice(0, separator);
  const segments = path.split("/").filter(Boolean);
  let current = "";
  for (const segment of segments) {
    current += `/${segment}`;
    try {
      await sqlite3Api.opfs?.mkdir(current);
    } catch {
      // Existing directories are fine.
    }
  }
};

const applyMigrations = () => {
  if (!databaseMigrations.length) return;

  const rows = db.exec({
    sql: "PRAGMA user_version",
    rowMode: "array",
    returnValue: "resultRows",
  });
  let currentVersion = Number(rows[0]?.[0] ?? 0);
  const migrations = [...databaseMigrations].sort((left, right) => left.version - right.version);

  for (const migration of migrations) {
    if (migration.version <= currentVersion) continue;
    if (migration.version !== currentVersion + 1) {
      throw new Error(`Missing database migration from version ${currentVersion} to ${migration.version}`);
    }

    execSql("BEGIN TRANSACTION;");
    try {
      execSql(migration.sql);
      execSql(`PRAGMA user_version = ${migration.version}`);
      execSql("COMMIT;");
      currentVersion = migration.version;
    } catch (error) {
      execSql("ROLLBACK;");
      throw error;
    }
  }
};

const ensureSchema = () => {
  if (databaseMigrations.length) {
    applyMigrations();
  } else if (schemaSql) {
    execSql(schemaSql);
  }
};

const validateImportedDb = async (bytes: Uint8Array) => {
  const tempFilename = `/browser-db-import-${crypto.randomUUID()}.sqlite3`;

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

      if (requiredTableNames.length) {
        const placeholders = requiredTableNames.map(() => "?").join(", ");
        const tables = importedDb.exec({
          sql: `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders})`,
          bind: requiredTableNames,
          rowMode: "array",
          returnValue: "resultRows",
        });
        if (tables.length !== requiredTableNames.length) {
          throw new Error("Imported database is missing required application tables");
        }
      }
    } finally {
      importedDb.close();
    }
  } finally {
    try {
      await sqlite3Api.opfs?.unlink(tempFilename);
    } catch {
      // Validation may fail before the temporary file is created.
    }
  }
};

const importDb = async (dbName: string, bytes: Uint8Array) => {
  if (!db || !sqlite3Api) {
    throw new Error("Database is not initialized");
  }

  await validateImportedDb(bytes);
  const currentBytes = exportDb();
  db.close();
  db = null;

  try {
    await sqlite3Api.oo1.OpfsDb.importDb(dbName, bytes);
    db = new sqlite3Api.oo1.OpfsDb(dbName, "c");
    execSql("PRAGMA foreign_keys = ON");
    ensureSchema();
  } catch (err) {
    await sqlite3Api.oo1.OpfsDb.importDb(dbName, currentBytes);
    db = new sqlite3Api.oo1.OpfsDb(dbName, "c");
    execSql("PRAGMA foreign_keys = ON");
    ensureSchema();
    throw err;
  }
};

const deleteDb = async (dbName: string) => {
  if (db) {
    db.close();
    db = null;
  }

  if (sqlite3Api?.opfs) {
    try {
      await sqlite3Api.opfs.unlink(dbName);
    } catch {
      // Ignore if file doesn't exist
    }
  }
};

const initDb = async (
  dbName: string,
  schema?: string,
  migrations?: DbMigration[],
  requiredTables?: string[],
) => {
  try {
    if (db) {
      return;
    }

    databaseName = dbName;
    schemaSql = schema;
    databaseMigrations = migrations ?? [];
    requiredTableNames = requiredTables ?? [];
    sqlite3Api ??= await sqlite3InitModule();
    console.debug("SQLite WASM module initialized", sqlite3Api.version.libVersion);

    assertOpfsAvailable(sqlite3Api);

    await ensureParentDirectory(dbName);
    db = new sqlite3Api.oo1.OpfsDb(dbName, "c");
    execSql("PRAGMA foreign_keys = ON");
    ensureSchema();
    console.debug("Database schema ensured");
  } catch (err) {
    db?.close();
    db = null;
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
        const dbName = msg.dbName || "tildom.sqlite3";
        await initDb(dbName, msg.schema, msg.migrations, msg.requiredTables);
        self.postMessage({ id: msg.id, type: "success" } as DbResponse);
        break;
      }
      case "exec": {
        const previousTotalChanges = getTotalChanges();
        const rows = querySql(msg.sql, msg.params);
        self.postMessage({ id: msg.id, type: "success", data: { rows } } as DbResponse);

        // Defer change notifications inside transactions
        if (activeTxId === null) {
          const currentTotalChanges = getTotalChanges();
          if (currentTotalChanges !== previousTotalChanges) {
            self.postMessage({ type: "change" } as DbResponse);
          }
        }
        break;
      }
      case "query": {
        const rows = querySql(msg.sql, msg.params);
        self.postMessage({ id: msg.id, type: "success", data: { rows } } as DbResponse);
        break;
      }
      case "tx:start": {
        if (activeTxId !== null) {
          throw new Error(`A transaction is already active inside worker (active transaction id: ${activeTxId})`);
        }
        activeTxId = msg.txId;
        totalChangesBeforeTx = getTotalChanges();
        execSql("BEGIN TRANSACTION;");
        self.postMessage({ id: msg.id, type: "success" } as DbResponse);
        break;
      }
      case "tx:commit": {
        if (activeTxId !== msg.txId) {
          throw new Error(`Cannot commit: active transaction ID is ${activeTxId}, but commit requested for ${msg.txId}`);
        }
        execSql("COMMIT;");
        activeTxId = null;
        self.postMessage({ id: msg.id, type: "success" } as DbResponse);

        // Check if database was mutated during the transaction block
        const currentTotalChanges = getTotalChanges();
        if (currentTotalChanges !== totalChangesBeforeTx) {
          self.postMessage({ type: "change" } as DbResponse);
        }
        break;
      }
      case "tx:rollback": {
        if (activeTxId === msg.txId) {
          execSql("ROLLBACK;");
          activeTxId = null;
        }
        self.postMessage({ id: msg.id, type: "success" } as DbResponse);
        break;
      }
      case "export": {
        const bytes = exportDb();
        self.postMessage({ id: msg.id, type: "success", data: { bytes } } as DbResponse);
        break;
      }
      case "import": {
        const dbName = msg.dbName || "tildom.sqlite3";
        await importDb(dbName, msg.bytes);
        self.postMessage({ id: msg.id, type: "success" } as DbResponse);
        self.postMessage({ type: "change" } as DbResponse);
        break;
      }
      case "close": {
        db?.close();
        db = null;
        self.postMessage({ id: msg.id, type: "success" } as DbResponse);
        break;
      }
      case "delete": {
        await deleteDb(msg.dbName || databaseName);
        self.postMessage({ id: msg.id, type: "success" } as DbResponse);
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
