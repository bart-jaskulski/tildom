import { createSignal, createEffect, createComputed, Signal } from "solid-js";
import type { DbRequest, DbRequestBody, DbResponse } from "./types";
import DbWorker from "./db.worker?worker";

export interface BrowserDbClientOptions {
  schema?: string;
  workerConstructor?: new () => Worker;
}

export type QueryInput = string | { sql: string; params?: any[] };

export type TaggedExecutor = (strings: TemplateStringsArray, ...values: any[]) => Promise<any[]>;

export class TransactionProxy {
  constructor(private executeFn: (sql: string, params?: any[]) => Promise<any[]>) {}

  sql: TaggedExecutor = (strings, ...values) => {
    return this.executeFn(strings.join("?"), values);
  };
}

export class BrowserDbClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private nextTxId = 1;
  private isReady = false;
  private pending = new Map<number, { resolve: (data: any) => void; reject: (err: Error) => void }>();
  private queue: Array<{ msg: DbRequest; resolve: (data: any) => void; reject: (err: Error) => void }> = [];
  
  private dbVersionSignal: Signal<number>;

  constructor(private dbName: string, private options?: BrowserDbClientOptions) {
    this.dbVersionSignal = createSignal(0);
  }

  get dbVersion() {
    return this.dbVersionSignal[0]();
  }

  init = async (): Promise<void> => {
    if (typeof window === "undefined") {
      return;
    }

    if (this.worker) return;

    const WorkerCtor = this.options?.workerConstructor || DbWorker;
    this.worker = new WorkerCtor();

    this.worker.onmessage = this.handleMessage;

    await this.postAndWait({ 
      type: "init",
      dbName: this.dbName,
      schema: this.options?.schema
    } as any);
    this.flushQueue();
  };

  private handleMessage = (event: MessageEvent<DbResponse>) => {
    const msg = event.data;

    if (msg.type === "change") {
      const setVersion = this.dbVersionSignal[1];
      setVersion(v => v + 1);
      return;
    }

    const handler = this.pending.get(msg.id);
    if (!handler) return;
    this.pending.delete(msg.id);

    if (msg.type === "error") {
      handler.reject(new Error(msg.message));
    } else {
      handler.resolve(msg.data);
    }
  };

  private postAndWait = <T = any>(msg: DbRequestBody): Promise<T> => {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const fullMsg = { ...msg, id } as DbRequest;

      if (!this.isReady && msg.type !== "init") {
        this.queue.push({ msg: fullMsg, resolve, reject });
        return;
      }

      this.pending.set(id, { resolve, reject });
      this.worker!.postMessage(fullMsg);
    });
  };

  private flushQueue = () => {
    this.isReady = true;
    while (this.queue.length > 0) {
      const { msg, resolve, reject } = this.queue.shift()!;
      this.pending.set(msg.id, { resolve, reject });
      this.worker!.postMessage(msg);
    }
  };

  exec = <T = any>(input: QueryInput, rawParams?: any[]): Promise<T[]> => {
    const resolved = typeof input === "string" ? { sql: input, params: rawParams } : input;
    return this.postAndWait<{ rows: T[] }>({
      type: "exec",
      sql: resolved.sql,
      params: resolved.params
    } as any).then(data => data?.rows ?? []);
  };

  sql: TaggedExecutor = (strings, ...values) => {
    return this.exec(strings.join("?"), values);
  };

  transaction = async <T>(callback: (tx: TransactionProxy) => Promise<T>): Promise<T> => {
    if (typeof window === "undefined") {
      throw new Error("Transactions cannot be run on the server");
    }

    const txId = this.nextTxId++;
    await this.postAndWait({ type: "tx:start", txId });

    const txExecutor = (sql: string, params?: any[]) => {
      return this.postAndWait<{ rows: any[] }>({
        type: "exec",
        sql,
        params,
        txId
      } as any).then(data => data?.rows ?? []);
    };

    const txProxy = new TransactionProxy(txExecutor);

    try {
      const result = await callback(txProxy);
      await this.postAndWait({ type: "tx:commit", txId });
      return result;
    } catch (err) {
      await this.postAndWait({ type: "tx:rollback", txId });
      throw err;
    }
  };

  getDatabaseFile = (): Promise<Uint8Array> => {
    return this.postAndWait<{ bytes: Uint8Array }>({ type: "export" }).then(
      data => data.bytes
    );
  };

  overwriteDatabaseFile = (bytes: Uint8Array): Promise<void> => {
    return this.postAndWait({ 
      type: "import", 
      bytes,
      dbName: this.dbName
    } as any);
  };

  deleteDatabaseFile = async (): Promise<void> => {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.isReady = false;
    }
    
    // Perform unlinking via a temp worker or local script
    const WorkerCtor = this.options?.workerConstructor || DbWorker;
    const tempWorker = new WorkerCtor();
    
    await new Promise<void>((resolve, reject) => {
      tempWorker.onmessage = (event) => {
        const msg = event.data;
        if (msg.type === "success") {
          tempWorker.terminate();
          resolve();
        } else if (msg.type === "error") {
          tempWorker.terminate();
          reject(new Error(msg.message));
        }
      };
      
      tempWorker.postMessage({
        id: 1,
        type: "import",
        bytes: new Uint8Array(0),
        dbName: this.dbName
      });
    });
  };

  // Backwards compatibility aliases
  query = <T = any>(input: QueryInput, rawParams?: any[]): Promise<T[]> => {
    return this.exec<T>(input, rawParams);
  };

  exportDatabase = (): Promise<Uint8Array> => {
    return this.getDatabaseFile();
  };

  importDatabase = (bytes: Uint8Array): Promise<void> => {
    return this.overwriteDatabaseFile(bytes);
  };

  close = (): Promise<void> => {
    return this.deleteDatabaseFile();
  };
}

export function createDbQuery<T = any>(
  client: BrowserDbClient,
  queryInput: QueryInput,
  rawParams?: any[]
) {
  const [data, setData] = createSignal<T[]>([]);

  const query = typeof queryInput === "string" 
    ? { sql: queryInput, params: rawParams } 
    : queryInput;

  createComputed(() => {
    // Reactive subscription to database changes signal
    const version = client.dbVersion; 

    client.exec(query.sql, query.params)
      .then(rows => {
        setData(rows);
      })
      .catch(err => {
        console.error("Live query subscription failed:", err);
      });
  });

  return data;
}
