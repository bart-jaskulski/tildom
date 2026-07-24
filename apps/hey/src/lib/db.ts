import type { DbRequest, DbRequestBody, DbResponse } from "./db.types";

let worker: Worker | undefined;
let nextId = 1;
const pending = new Map<number, {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}>();

const request = <T = void>(body: DbRequestBody) => new Promise<T>((resolve, reject) => {
  if (!worker) {
    reject(new Error("Database is not initialized"));
    return;
  }
  const id = nextId++;
  pending.set(id, { resolve, reject });
  worker!.postMessage({ ...body, id } satisfies DbRequest);
});

export async function initDb() {
  if (worker) return;
  worker = new Worker(new URL("../workers/db.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<DbResponse>) => {
    const response = event.data;
    const handler = pending.get(response.id);
    if (!handler) return;
    pending.delete(response.id);
    if (response.type === "error") handler.reject(new Error(response.message));
    else handler.resolve(response.data);
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || "Database worker failed");
    for (const handler of pending.values()) handler.reject(error);
    pending.clear();
  };
  await request({ type: "init" });
}

export const exec = (sql: string, params?: unknown[]) =>
  request({ type: "exec", sql, params });

export const query = <T>(sql: string, params?: unknown[]) =>
  request<{ rows?: T[] }>({ type: "query", sql, params }).then((result) => result?.rows ?? []);
