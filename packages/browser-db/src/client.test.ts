// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserDbClient, createDbQuery } from "./client";
import { DbRequest, DbResponse } from "./types";
import { createRoot } from "solid-js";

// Full-fidelity mock database state to avoid race conditions or timing differences
let mockDatabase: any[] = [];

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
          this.onmessage({
            data: { id: msg.id, type: "success" }
          } as MessageEvent<DbResponse>);
        } else if (msg.type === "tx:start") {
          this.onmessage({
            data: { id: msg.id, type: "success" }
          } as MessageEvent<DbResponse>);
        } else if (msg.type === "exec") {
          if (msg.sql.includes("INSERT")) {
            const name = msg.params?.[0] || "rice";
            const newRow = { id: 42, name };
            mockDatabase.push(newRow);
            
            this.onmessage({
              data: { id: msg.id, type: "success", data: { rows: [newRow] } }
            } as MessageEvent<DbResponse>);
            
            // Send change trigger for writes
            this.onmessage({
              data: { type: "change" }
            } as MessageEvent<DbResponse>);
          } else if (msg.sql.includes("SELECT")) {
            this.onmessage({
              data: { id: msg.id, type: "success", data: { rows: [...mockDatabase] } }
            } as MessageEvent<DbResponse>);
          } else {
            this.onmessage({
              data: { id: msg.id, type: "success", data: { rows: [] } }
            } as MessageEvent<DbResponse>);
          }
        } else if (msg.type === "tx:commit") {
          this.onmessage({
            data: { id: msg.id, type: "success" }
          } as MessageEvent<DbResponse>);
          this.onmessage({
            data: { type: "change" }
          } as MessageEvent<DbResponse>);
        } else if (msg.type === "tx:rollback") {
          this.onmessage({
            data: { id: msg.id, type: "success" }
          } as MessageEvent<DbResponse>);
        } else if (msg.type === "import" || msg.type === "close" || msg.type === "delete") {
          this.onmessage({
            data: { id: msg.id, type: "success" }
          } as MessageEvent<DbResponse>);
        }
      }, 10);
    });
  }
}

describe("BrowserDbClient Encapsulated Transaction Suite", () => {
  let client: BrowserDbClient;
  let mockWorkerConstructor: any;

  beforeEach(() => {
    mockWorkerConstructor = vi.fn(function(this: any) {
      return new MockWorker();
    });
    client = new BrowserDbClient("groceries.sqlite3", {
      workerConstructor: mockWorkerConstructor,
      schema: "CREATE TABLE groceries (id INTEGER PRIMARY KEY, name TEXT);",
    });
  });

  it("executes top-level template queries correctly", async () => {
    await client.init();
    
    // Perform write first
    await client.exec("INSERT INTO groceries (name) VALUES (?)", ["rice"]);
    
    // Run query
    const rows = await client.sql`SELECT * FROM groceries WHERE name = ${"rice"}`;
    expect(rows).toEqual([{ id: 42, name: "rice" }]);
  });

  it("handles complex transacted callables with nested scopes and return parameters", async () => {
    await client.init();

    const productName = "rice";
    const productPrice = 2.99;

    const newProductId = await client.transaction(async (tx) => {
      const [product] = await tx.sql`
        INSERT INTO groceries (name) VALUES (${productName}) RETURNING *
      `;
      expect(product.name).toBe("rice");

      await tx.sql`
        INSERT INTO prices (groceryId, price) VALUES (${product.id}, ${productPrice})
      `;

      return product.id;
    });

    expect(newProductId).toBe(42);
  });

  it("re-triggers SolidJS reactive live query observables", async () => {
    await client.init();

    let groceries: any;

    // Run the synchronous SolidJS reactive root context
    createRoot(() => {
      groceries = createDbQuery(client, "SELECT * FROM groceries");
    });

    // Verify initial empty dataset
    expect(groceries()).toEqual([]);

    // Perform write to increment version changes signal
    await client.exec("INSERT INTO groceries VALUES (42, 'rice')");

    // Await a tick to let the reactive effect database query run
    await new Promise(resolve => setTimeout(resolve, 50));

    // Observable should automatically update!
    expect(groceries()).toEqual([{ id: 42, name: "rice" }]);
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

  it("passes migrations and import requirements to the worker", async () => {
    client = new BrowserDbClient("groceries.sqlite3", {
      workerConstructor: mockWorkerConstructor,
      migrations: [{ version: 1, sql: "CREATE TABLE groceries (id INTEGER PRIMARY KEY);" }],
      requiredTables: ["groceries"],
    });

    await client.init();
    const worker = mockWorkerConstructor.mock.results[0].value as MockWorker;

    expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "init",
      migrations: [{ version: 1, sql: "CREATE TABLE groceries (id INTEGER PRIMARY KEY);" }],
      requiredTables: ["groceries"],
    }));
  });
});
