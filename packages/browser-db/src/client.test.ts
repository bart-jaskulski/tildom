// @vitest-environment jsdom
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserDbClient } from "./client";
import type { DbRequest, DbResponse } from "./types";

class RealSqliteWorker implements Worker {
  public postMessage = vi.fn();
  public terminate = vi.fn();
  public onmessage: ((this: Worker, ev: MessageEvent) => any) | null = null;
  public onmessageerror = null;
  public onerror = null;

  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  dispatchEvent = vi.fn();

  private db: DatabaseSync | null = null;
  private activeTxId: number | null = null;
  private changesBeforeTx = 0;

  constructor() {
    this.postMessage.mockImplementation((msg: DbRequest) => {
      queueMicrotask(() => {
        if (!this.onmessage) return;

        try {
          switch (msg.type) {
            case "init": {
              this.db = new DatabaseSync(":memory:");
              this.db.exec("PRAGMA foreign_keys = ON;");
              if (msg.migrations) {
                const sorted = [...msg.migrations].sort((a, b) => a.version - b.version);
                for (const m of sorted) {
                  this.db.exec(m.sql);
                }
              }
              this.onmessage({
                data: { id: msg.id, type: "success" },
              } as MessageEvent<DbResponse>);
              break;
            }
            case "exec": {
              if (!this.db) throw new Error("Database is not initialized");
              const changesBefore = this.getTotalChanges();
              const isSelect = /^\s*SELECT/i.test(msg.sql);
              const stmt = this.db.prepare(msg.sql);
              const params = (msg.params ?? []).map((p) => (p === undefined ? null : p));

              let rows: any[] = [];
              if (isSelect) {
                rows = stmt.all(...params);
              } else {
                stmt.run(...params);
              }

              this.onmessage({
                data: { id: msg.id, type: "success", data: { rows } },
              } as MessageEvent<DbResponse>);

              // Notify subscribers of local modifications outside transactions
              if (this.activeTxId === null && this.getTotalChanges() !== changesBefore) {
                this.onmessage({
                  data: { type: "change", source: "local" },
                } as MessageEvent<DbResponse>);
              }
              break;
            }
            case "tx:start": {
              if (this.activeTxId !== null) {
                throw new Error(`A transaction is already active (active id: ${this.activeTxId})`);
              }
              this.activeTxId = msg.txId;
              this.changesBeforeTx = this.getTotalChanges();
              this.db?.exec("BEGIN TRANSACTION;");
              this.onmessage({
                data: { id: msg.id, type: "success" },
              } as MessageEvent<DbResponse>);
              break;
            }
            case "tx:commit": {
              if (this.activeTxId !== msg.txId) {
                throw new Error(`Cannot commit: active transaction ID is ${this.activeTxId}, but commit requested for ${msg.txId}`);
              }
              this.db?.exec("COMMIT;");
              const mutated = this.getTotalChanges() !== this.changesBeforeTx;
              this.activeTxId = null;
              this.onmessage({
                data: { id: msg.id, type: "success" },
              } as MessageEvent<DbResponse>);

              if (mutated) {
                this.onmessage({
                  data: { type: "change", source: "local" },
                } as MessageEvent<DbResponse>);
              }
              break;
            }
            case "tx:rollback": {
              if (this.activeTxId === msg.txId) {
                try {
                  this.db?.exec("ROLLBACK;");
                } catch {
                  // Ignore rollback failure if transaction already aborted
                } finally {
                  this.activeTxId = null;
                }
              }
              this.onmessage({
                data: { id: msg.id, type: "success" },
              } as MessageEvent<DbResponse>);
              break;
            }
            case "export": {
              this.onmessage({
                data: { id: msg.id, type: "success", data: { bytes: new Uint8Array([1, 2, 3]) } },
              } as MessageEvent<DbResponse>);
              break;
            }
            case "import": {
              this.onmessage({
                data: { id: msg.id, type: "success" },
              } as MessageEvent<DbResponse>);
              this.onmessage({
                data: { type: "change", source: msg.source ?? "import" },
              } as MessageEvent<DbResponse>);
              break;
            }
            case "merge": {
              this.onmessage({
                data: { id: msg.id, type: "success" },
              } as MessageEvent<DbResponse>);
              this.onmessage({
                data: { type: "change", source: msg.source ?? "merge" },
              } as MessageEvent<DbResponse>);
              break;
            }
            case "close":
            case "delete": {
              this.db?.close();
              this.db = null;
              this.onmessage({
                data: { id: msg.id, type: "success" },
              } as MessageEvent<DbResponse>);
              break;
            }
          }
        } catch (err: any) {
          if ("id" in msg) {
            this.onmessage({
              data: { id: msg.id, type: "error", message: err.message || String(err) },
            } as MessageEvent<DbResponse>);
          }
        }
      });
    });
  }

  private getTotalChanges(): number {
    if (!this.db) return 0;
    try {
      const row = this.db.prepare("SELECT total_changes() as changes").get() as { changes: number };
      return row?.changes ?? 0;
    } catch {
      return 0;
    }
  }
}

describe("BrowserDbClient Suite (Real SQLite Behavioral Verification)", () => {
  let client: BrowserDbClient;
  let mockWorkerConstructor: any;

  beforeEach(() => {
    mockWorkerConstructor = vi.fn(function (this: any) {
      return new RealSqliteWorker();
    });
    client = new BrowserDbClient("groceries.sqlite3", {
      workerConstructor: mockWorkerConstructor,
      migrations: [{ version: 1, sql: "CREATE TABLE groceries (id INTEGER PRIMARY KEY, name TEXT NOT NULL);" }],
    });
  });

  it("executes top-level template queries correctly against real SQLite", async () => {
    await client.init();

    await client.exec("INSERT INTO groceries (name) VALUES (?)", ["rice"]);

    const rows = await client.sql<{ id: number; name: string }>`SELECT * FROM groceries WHERE name = ${"rice"}`;
    expect(rows).toEqual([{ id: 1, name: "rice" }]);
  });

  it("notifies subscribers with change source when changes occur and unsubscribes properly", async () => {
    await client.init();

    const listener = vi.fn();
    const unsubscribe = client.subscribe(listener);

    await client.exec("INSERT INTO groceries (name) VALUES (?)", ["apples"]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ source: "local" });

    unsubscribe();
    await client.exec("INSERT INTO groceries (name) VALUES (?)", ["oranges"]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("executes atomic transactions with commit and rollback, supporting tx.query, tx.exec and tx.sql", async () => {
    await client.init();

    const listener = vi.fn();
    client.subscribe(listener);

    const txResult = await client.transaction(async (tx) => {
      await tx.query("INSERT INTO groceries (name) VALUES (?)", ["bread"]);
      await tx.exec("INSERT INTO groceries (name) VALUES (?)", ["milk"]);
      const items = await tx.sql<{ id: number; name: string }>`SELECT * FROM groceries ORDER BY id ASC`;
      return items;
    });

    expect(txResult).toHaveLength(2);
    // Notification should fire once on transaction commit
    expect(listener).toHaveBeenCalledTimes(1);

    const committed = await client.sql<{ id: number; name: string }>`SELECT * FROM groceries ORDER BY id ASC`;
    expect(committed.map((r) => r.name)).toEqual(["bread", "milk"]);

    // Rollback test: failure should abort staged writes and NOT emit change
    await expect(
      client.transaction(async (tx) => {
        await tx.exec("INSERT INTO groceries (name) VALUES (?)", ["will-fail"]);
        throw new Error("Simulated tx failure");
      })
    ).rejects.toThrow("Simulated tx failure");

    // Notification count must NOT have increased
    expect(listener).toHaveBeenCalledTimes(1);

    // Staged change must NOT be in the real database
    const afterRollback = await client.sql<{ id: number; name: string }>`SELECT * FROM groceries ORDER BY id ASC`;
    expect(afterRollback.map((r) => r.name)).toEqual(["bread", "milk"]);

    // Subsequent transaction must succeed cleanly without activeTxId deadlocks
    const nextResult = await client.transaction(async (tx) => {
      await tx.exec("INSERT INTO groceries (name) VALUES (?)", ["eggs"]);
      return tx.sql<{ id: number; name: string }>`SELECT * FROM groceries WHERE name = ${"eggs"}`;
    });
    expect(nextResult).toEqual([{ id: 3, name: "eggs" }]);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("queues commands called before init() finishes", async () => {
    const promise = client.exec("INSERT INTO groceries (name) VALUES (?)", ["queued"]);
    await client.init();

    await promise;
    const rows = await client.sql<{ id: number; name: string }>`SELECT * FROM groceries WHERE name = ${"queued"}`;
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("queued");
  });

  it("exports and imports database bytes, notifying subscribers with import source", async () => {
    await client.init();

    const listener = vi.fn();
    client.subscribe(listener);

    const bytes = await client.exportDatabase();
    expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(listener).not.toHaveBeenCalled();

    await expect(client.importDatabase(new Uint8Array([4, 5, 6]))).resolves.not.toThrow();
    expect(listener).toHaveBeenCalledWith({ source: "import" });
  });

  it("closes without deleting the database", async () => {
    await client.init();
    const worker = mockWorkerConstructor.mock.results[0].value as RealSqliteWorker;

    await client.close();

    expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "close" }));
    expect(worker.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "delete" }));
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("deletes only through the explicit destroy operation", async () => {
    await client.init();
    const worker = mockWorkerConstructor.mock.results[0].value as RealSqliteWorker;

    await client.deleteDatabaseFile();

    expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "delete",
      dbName: "groceries.sqlite3",
    }));
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("passes migrations to the worker and applies real SQLite constraints", async () => {
    client = new BrowserDbClient("groceries.sqlite3", {
      workerConstructor: mockWorkerConstructor,
      migrations: [
        { version: 1, sql: "CREATE TABLE items (id INTEGER PRIMARY KEY, sku TEXT UNIQUE);" },
      ],
    });

    await client.init();

    // Verify table was created and constraint is active
    await client.exec("INSERT INTO items (sku) VALUES (?)", ["SKU-100"]);
    const items = await client.sql<{ id: number; sku: string }>`SELECT * FROM items`;
    expect(items).toEqual([{ id: 1, sku: "SKU-100" }]);

    // Inserting a duplicate SKU must reject with SQLite UNIQUE constraint violation
    await expect(
      client.exec("INSERT INTO items (sku) VALUES (?)", ["SKU-100"])
    ).rejects.toThrow(/UNIQUE constraint failed/i);
  });

  it("rejects invalid SQL syntax through the client promise", async () => {
    await client.init();

    await expect(
      client.exec("INSERT INTO nonexistent_table VALUES (1, 2, 3)")
    ).rejects.toThrow(/no such table/i);
  });

  it("merges database bytes and notifies subscribers with merge source", async () => {
    await client.init();
    const worker = mockWorkerConstructor.mock.results[0].value as RealSqliteWorker;

    const changeCallback = vi.fn();
    client.subscribe(changeCallback);

    await client.mergeDatabase(new Uint8Array([7, 8, 9]));

    expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "merge",
      bytes: new Uint8Array([7, 8, 9]),
      dbName: "groceries.sqlite3",
      source: "merge",
    }));

    expect(changeCallback).toHaveBeenCalledWith({ source: "merge" });
  });

  it("drains and rejects in-flight pending requests when worker is terminated", async () => {
    await client.init();
    const worker = mockWorkerConstructor.mock.results[0].value as RealSqliteWorker;

    // Simulate an in-flight operation that does not complete before close
    worker.postMessage.mockImplementationOnce(() => {
      // Do not post message back, leaving query in pending state
    });

    const pendingQuery = client.query("SELECT * FROM groceries");

    await client.close();

    await expect(pendingQuery).rejects.toThrow(/Database worker terminated/i);
  });
});
