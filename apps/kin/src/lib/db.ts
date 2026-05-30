import { createSignal } from "solid-js";
import type { DbRequest, DbRequestBody, DbResponse } from "./db.types";

let worker: Worker | null = null;
let nextId = 1;
let isReady = false;

const pending = new Map<number, { resolve: (data: any) => void; reject: (err: Error) => void }>();
const queue: Array<{ msg: DbRequest; resolve: (data: any) => void; reject: (err: Error) => void }> = [];

const [dbVersion, setDbVersion] = createSignal(0);

const handleMessage = (event: MessageEvent<DbResponse>) => {
  console.debug("Received message from DB worker:", event.data);
  const msg = event.data;

  if (msg.type === "change") {
    setDbVersion(v => v + 1);
    return;
  }

  const handler = pending.get(msg.id);
  if (!handler) return;
  pending.delete(msg.id);

  if (msg.type === "error") {
    handler.reject(new Error(msg.message));
  } else {
    handler.resolve(msg.data);
  }
};

const postAndWait = <T = any>(msg: DbRequestBody): Promise<T> => {
  console.debug("Posting message to DB worker:", msg);
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const fullMsg = { ...msg, id } as DbRequest;

    if (!isReady && msg.type !== "init") {
      queue.push({ msg: fullMsg, resolve, reject });
      return;
    }

    pending.set(id, { resolve, reject });
    console.debug("Sending message to DB worker:", fullMsg);
    worker!.postMessage(fullMsg);
  });
};

const flushQueue = () => {
  console.debug("Flushing DB worker message queue, length:", queue.length);
  isReady = true;
  while (queue.length > 0) {
    const { msg, resolve, reject } = queue.shift()!;
    pending.set(msg.id, { resolve, reject });
    worker!.postMessage(msg);
  }
};

export const initDb = async (): Promise<void> => {
  console.debug("Initializing DB worker...");
  if (worker) {
    console.warn("DB worker is already initialized");
    return;
  }

  worker = new Worker(new URL("../workers/db.worker.ts", import.meta.url), {
    type: "module",
  });
  console.debug("DB worker created:", worker);

  worker.onmessage = handleMessage;

  await postAndWait({ type: "init" });
  flushQueue();
};

export const exec = (sql: string, params?: any[]): Promise<void> => {
  return postAndWait({ type: "exec", sql, params });
};

export const query = <T = any>(sql: string, params?: any[]): Promise<T[]> => {
  return postAndWait<{ rows: T[] }>({ type: "query", sql, params }).then(data => data?.rows ?? []);
};

export const exportDatabase = (): Promise<Uint8Array> => {
  return postAndWait<{ bytes: Uint8Array }>({ type: "export" }).then(data => data.bytes);
};

export const importDatabase = (bytes: Uint8Array): Promise<void> => {
  return postAndWait({ type: "import", bytes });
};

export { dbVersion };

export const closeDb = () => {
  if (worker) {
    worker.terminate();
    worker = null;
    isReady = false;
  }
};
