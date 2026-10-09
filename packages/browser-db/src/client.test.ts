// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserDbClient } from "./client";
import { DbRequest, DbResponse } from "./types";

// Full-fidelity mock database state to avoid race conditions or timing differences
let mockDatabase: any[] = [];
let activeTx: any[] | null = null;

class MockWorker implements Worker {
  public postMessage = vi.fn();
  public terminate = vi.fn();
  public onmessage: ((this: Worker, ev: MessageEvent) => any) | null = null;
  public onmessageerror = null;
  public onerror = null;

  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  dispatchEvent = vi.fn();

  constructor() {
    this.postMessage.mockImplementation((msg: DbRequest) => {
      setTimeout(() => {
        if (!this.onmessage) return;

        if (msg.type === "init") {
          mockDatabase = []; // Reset on init
          activeTx = null;
          this.onmessage({
            data: { id: msg.id, type: "success" },
          } as MessageEvent<DbResponse>);
        } else if (msg.type === "tx:start") {
          activeTx = [...mockDatabase];
          this.onmessage({
            data: { id: msg.id, type: "success" },
          } as MessageEvent<DbResponse>);
        } else if (msg.type === "exec") {
          const target = activeTx ?? mockDatabase;
          if (msg.sql.includes("INSERT")) {
            const name = msg.params?.[0] || "rice";
            const newRow = { id: 42, name };
            target.push(newRow);

            this.onmessage({
              data: { id: msg.id, type: "success", data: { rows: [newRow] } },
            } as MessageEvent<DbResponse>);

            // Only notify immediately if NOT in an active transaction
            if (activeTx === null) {
              this.onmessage({
                data: { type: "change", source: "local" },
              } as MessageEvent<DbResponse>);
            }
          } else if (msg.sql.includes("SELECT")) {
            this.onmessage({
              data: { id: msg.id, type: "success", data: { rows: [...target] } },
            } as MessageEvent<DbResponse>);
          } else {
            this.onmessage({
              data: { id: msg.id, type: "success", data: { rows: [] } },
            } as MessageEvent<DbResponse>);
          }
        } else if (msg.type === "tx:commit") {
          if (activeTx !== null) {
            mockDatabase = activeTx;
            activeTx = null;
          }
          this.onmessage({
            data: { id: msg.id, type: "success" },
          } as MessageEvent<DbResponse>);
          this.onmessage({
            data: { type: "change", source: "local" },
          } as MessageEvent<DbResponse>);
        } else if (msg.type === "tx:rollback") {
          activeTx = null; // discard staged changes
          this.onmessage({
            data: { id: msg.id, type: "success" },
          } as MessageEvent<DbResponse>);
        } else if (msg.type === "export") {
          this.onmessage({
            data: { id: msg.id, type: "success", data: { bytes: new Uint8Array([1, 2, 3]) } },
          } as MessageEvent<DbResponse>);
        } else if (msg.type === "import") {
          this.onmessage({
            data: { id: msg.id, type: "success" },
          } as MessageEvent<DbResponse>);
          this.onmessage({
            data: { type: "change", source: msg.source ?? "import" },
          } as MessageEvent<DbResponse>);
        } else if (msg.type === "close" || msg.type === "delete") {
          this.onmessage({
            data: { id: msg.id, type: "success" },
          } as MessageEvent<DbResponse>);
        }
      }, 5);
    });
  }
}

describe("BrowserDbClient Suite", () => {
  let client: BrowserDbClient;
  let mockWorkerConstructor: any;

  beforeEach(() => {
    mockWorkerConstructor = vi.fn(function (this: any) {
      return new MockWorker();
    });
    client = new BrowserDbClient("groceries.sqlite3", {
      workerConstructor: mockWorkerConstructor,
      migrations: [{ version: 1, sql: "CREATE TABLE groceries (id INTEGER PRIMARY KEY, name TEXT);" }],
    });
  });

  it("executes top-level template queries correctly", async () => {
    await client.init();

    await client.exec("INSERT INTO groceries (name) VALUES (?)", ["rice"]);

    const rows = await client.sql`SELECT * FROM groceries WHERE name = ${"rice"}`;
    expect(rows).toEqual([{ id: 42, name: "rice" }]);
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
      const items = await tx.sql<{ id: number; name: string }>`SELECT * FROM groceries`;
      return items;
    });

    expect(txResult).toHaveLength(2);
    // Notification should fire on commit
    expect(listener).toHaveBeenCalledTimes(1);

    const committed = await client.sql<{ id: number; name: string }>`SELECT * FROM groceries`;
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

    // Staged change must NOT be in the database
    const afterRollback = await client.sql<{ id: number; name: string }>`SELECT * FROM groceries`;
    expect(afterRollback.map((r) => r.name)).toEqual(["bread", "milk"]);
  });

  it("queues commands called before init() finishes", async () => {
    const promise = client.exec("INSERT INTO groceries (name) VALUES (?)", ["queued"]);
    await client.init();

    const rows = await promise;
    expect(rows).toEqual([{ id: 42, name: "queued" }]);
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
    const worker = mockWorkerConstructor.mock.results[0].value as MockWorker;

    await client.close();

    expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "close" }));
    expect(worker.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "delete" }));
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("deletes only through the explicit destroy operation", async () => {
    await client.init();
    const worker = mockWorkerConstructor.mock.results[0].value as MockWorker;

    await client.deleteDatabaseFile();

    expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "delete",
      dbName: "groceries.sqlite3",
    }));
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("passes migrations to the worker", async () => {
    client = new BrowserDbClient("groceries.sqlite3", {
      workerConstructor: mockWorkerConstructor,
      migrations: [{ version: 1, sql: "CREATE TABLE groceries (id INTEGER PRIMARY KEY);" }],
    });

    await client.init();
    const worker = mockWorkerConstructor.mock.results[0].value as MockWorker;

    expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "init",
      migrations: [{ version: 1, sql: "CREATE TABLE groceries (id INTEGER PRIMARY KEY);" }],
    }));
  });
});
