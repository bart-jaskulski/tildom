import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mergeAttachedRemoteDb, quoteIdent } from "./merge";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("SQLite Row-Level LWW Merge (mergeAttachedRemoteDb)", () => {
  let tmpDir: string;
  let mainDbPath: string;
  let remoteDbPath: string;
  let mainDb: DatabaseSync;
  let remoteDb: DatabaseSync;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tildom-merge-test-"));
    mainDbPath = path.join(tmpDir, "main.sqlite3");
    remoteDbPath = path.join(tmpDir, "remote.sqlite3");

    mainDb = new DatabaseSync(mainDbPath);
    remoteDb = new DatabaseSync(remoteDbPath);

    const schema = `
      CREATE TABLE entries (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER DEFAULT NULL
      );
      CREATE TABLE comments (
        id TEXT PRIMARY KEY,
        entry_id TEXT NOT NULL,
        body TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER DEFAULT NULL,
        FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE
      );
    `;

    mainDb.exec(schema);
    remoteDb.exec(schema);
  });

  afterEach(() => {
    try {
      mainDb.close();
    } catch {}
    try {
      remoteDb.close();
    } catch {}
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const performMerge = (db: DatabaseSync) => {
    db.exec(`ATTACH DATABASE '${remoteDbPath}' AS remote;`);
    try {
      mergeAttachedRemoteDb({
        exec: (sql) => db.exec(sql),
        query: <T>(sql: string): T[] => db.prepare(sql).all() as T[],
      });
    } finally {
      try {
        db.exec("DETACH DATABASE remote;");
      } catch {}
    }
  };

  it("updates field using LWW when remote updated_at is newer", () => {
    // Arrange: Device A has older title, Device B has newer title
    mainDb.exec(`INSERT INTO entries VALUES ('e1', 'Device A Old Title', 100, NULL);`);
    remoteDb.exec(`INSERT INTO entries VALUES ('e1', 'Device B Newer Title', 200, NULL);`);

    // Act
    performMerge(mainDb);

    // Assert: Observable state in database converged to newer title
    const row = mainDb.prepare("SELECT * FROM entries WHERE id = 'e1'").get() as any;
    expect(row.title).toBe("Device B Newer Title");
    expect(row.updated_at).toBe(200);
    expect(row.deleted_at).toBeNull();
  });

  it("preserves local field when local updated_at is newer", () => {
    // Arrange: Device A has newer title (300), Device B has older title (150)
    mainDb.exec(`INSERT INTO entries VALUES ('e1', 'Device A Newer Title', 300, NULL);`);
    remoteDb.exec(`INSERT INTO entries VALUES ('e1', 'Device B Older Title', 150, NULL);`);

    // Act
    performMerge(mainDb);

    // Assert: Local title preserved
    const row = mainDb.prepare("SELECT * FROM entries WHERE id = 'e1'").get() as any;
    expect(row.title).toBe("Device A Newer Title");
    expect(row.updated_at).toBe(300);
  });

  it("applies soft-delete tombstones when remote deletion is newer", () => {
    // Arrange: Device A has active task, Device B deleted it at t=250
    mainDb.exec(`INSERT INTO entries VALUES ('e2', 'Active on Device A', 100, NULL);`);
    remoteDb.exec(`INSERT INTO entries VALUES ('e2', 'Deleted on Device B', 250, 250);`);

    // Act
    performMerge(mainDb);

    // Assert: Record is tombstoned
    const row = mainDb.prepare("SELECT * FROM entries WHERE id = 'e2'").get() as any;
    expect(row.deleted_at).toBe(250);
    expect(row.updated_at).toBe(250);
  });

  it("resurrects or preserves active record when local edit is newer than remote tombstone", () => {
    // Arrange: Device B soft-deleted at t=100, Device A edited at t=200
    mainDb.exec(`INSERT INTO entries VALUES ('e2', 'Edited on Device A', 200, NULL);`);
    remoteDb.exec(`INSERT INTO entries VALUES ('e2', 'Deleted on Device B', 100, 100);`);

    // Act
    performMerge(mainDb);

    // Assert: Record remains active with Device A's data
    const row = mainDb.prepare("SELECT * FROM entries WHERE id = 'e2'").get() as any;
    expect(row.deleted_at).toBeNull();
    expect(row.updated_at).toBe(200);
    expect(row.title).toBe("Edited on Device A");
  });

  it("inserts new rows that only exist on remote", () => {
    // Arrange: Device B created a completely new entry
    remoteDb.exec(`INSERT INTO entries VALUES ('e3', 'Brand New Entry', 500, NULL);`);

    // Act
    performMerge(mainDb);

    // Assert: Device A now has e3
    const row = mainDb.prepare("SELECT * FROM entries WHERE id = 'e3'").get() as any;
    expect(row).toBeDefined();
    expect(row.title).toBe("Brand New Entry");
  });

  it("defers foreign key constraints so child tables can merge cleanly before parent tables", () => {
    // Arrange: Foreign keys strictly enforced
    mainDb.exec("PRAGMA foreign_keys = ON;");

    // Remote has new parent entry and child comment
    remoteDb.exec(`
      INSERT INTO entries VALUES ('e4', 'Parent Entry', 400, NULL);
      INSERT INTO comments VALUES ('c1', 'e4', 'Child Comment', 400, NULL);
    `);

    // Act: Merge remote
    expect(() => performMerge(mainDb)).not.toThrow();

    // Assert: Both parent and child exist in main
    const entry = mainDb.prepare("SELECT * FROM entries WHERE id = 'e4'").get() as any;
    const comment = mainDb.prepare("SELECT * FROM comments WHERE id = 'c1'").get() as any;
    expect(entry.title).toBe("Parent Entry");
    expect(comment.body).toBe("Child Comment");
  });

  it("safely merges tables without primary keys using INSERT OR IGNORE", () => {
    // Arrange: Create a table without PK (e.g. log / history)
    const logSchema = `
      CREATE TABLE sync_logs (
        event TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );
    `;
    mainDb.exec(logSchema);
    remoteDb.exec(logSchema);

    mainDb.exec(`INSERT INTO sync_logs VALUES ('init', 1);`);
    remoteDb.exec(`INSERT INTO sync_logs VALUES ('remote_event', 2);`);

    // Act
    performMerge(mainDb);

    // Assert: Remote log row inserted
    const logs = mainDb.prepare("SELECT * FROM sync_logs ORDER BY timestamp ASC").all() as any[];
    expect(logs).toHaveLength(2);
    expect(logs[1].event).toBe("remote_event");
  });

  it("properly quotes SQLite keywords used as column or table names", () => {
    // Arrange: Table and columns named after SQLite keywords ('order', 'key', 'group')
    const keywordSchema = `
      CREATE TABLE "order" (
        "key" TEXT PRIMARY KEY,
        "group" TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `;
    mainDb.exec(keywordSchema);
    remoteDb.exec(keywordSchema);

    mainDb.exec(`INSERT INTO "order" VALUES ('k1', 'Group A', 100);`);
    remoteDb.exec(`INSERT INTO "order" VALUES ('k1', 'Group B Newer', 200);`);

    // Act
    expect(() => performMerge(mainDb)).not.toThrow();

    // Assert: LWW applied on keyword-named table & columns
    const row = mainDb.prepare(`SELECT * FROM "order" WHERE "key" = 'k1'`).get() as any;
    expect(row.group).toBe("Group B Newer");
    expect(row.updated_at).toBe(200);
  });
});
