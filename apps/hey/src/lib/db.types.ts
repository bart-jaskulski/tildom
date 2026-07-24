export type DbRequest =
  | { id: number; type: "init" }
  | { id: number; type: "exec"; sql: string; params?: unknown[] }
  | { id: number; type: "query"; sql: string; params?: unknown[] };

export type DbRequestBody =
  | Omit<Extract<DbRequest, { type: "init" }>, "id">
  | Omit<Extract<DbRequest, { type: "exec" }>, "id">
  | Omit<Extract<DbRequest, { type: "query" }>, "id">;

export type DbResponse =
  | { id: number; type: "success"; data?: { rows?: unknown[] } }
  | { id: number; type: "error"; message: string };
