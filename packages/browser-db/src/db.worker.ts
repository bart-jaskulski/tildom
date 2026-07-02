import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import type { DbRequest, DbResponse } from "./types";
import { assertOpfsAvailable } from "./diagnostics";

let db: any = null;
let sqlite3Api: any = null;
let activeTxId: number | null = null;
let totalChangesBeforeTx = 0;

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

const importDb = async (dbName: string, bytes: Uint8Array) => {
  if (!db || !sqlite3Api) {
    throw new Error("Database is not initialized");
  }

  db.close();
  db = null;

  try {
    await sqlite3Api.oo1.OpfsDb.importDb(dbName, bytes);
    db = new sqlite3Api.oo1.OpfsDb(dbName, "c");
    execSql("PRAGMA foreign_keys = ON");
  } catch (err) {
    db = new sqlite3Api.oo1.OpfsDb(dbName, "c");
    execSql("PRAGMA foreign_keys = ON");
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

const initDb = async (dbName: string, schema?: string) => {
  try {
    if (db) {
      return;
    }

    sqlite3Api ??= await sqlite3InitModule();
    console.debug("SQLite WASM module initialized", sqlite3Api.version.libVersion);

    assertOpfsAvailable(sqlite3Api);

    db = new sqlite3Api.oo1.OpfsDb(dbName, "c");
    execSql("PRAGMA foreign_keys = ON");

    if (schema) {
      execSql(schema);
    }
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
        const dbName = msg.dbName || "tildom.sqlite3";
        const schema = msg.schema;
        await initDb(dbName, schema);
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
