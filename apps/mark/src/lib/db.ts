import { BrowserDbClient } from "@tildom/browser-db";
import { MARK_DB_SCHEMA } from "./schema";

const client = new BrowserDbClient("entries.sqlite3", {
  schema: MARK_DB_SCHEMA
});

export const initDb = client.init;
export const exec = client.exec;
export const query = client.query;
export const exportDatabase = client.exportDatabase;
export const importDatabase = client.importDatabase;
export const closeDb = client.close;

export const dbVersion = () => client.dbVersion;
