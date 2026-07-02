import { BrowserDbClient } from "@tildom/browser-db";
import { DO_DB_SCHEMA } from "./schema";

const client = new BrowserDbClient("microstep.sqlite3", {
  schema: DO_DB_SCHEMA
});

export const initDb = client.init;
export const exec = client.exec;
export const query = client.query;
export const exportDb = client.exportDatabase;
export const importDb = client.importDatabase;
export const closeDb = client.close;

export const dbVersion = () => client.dbVersion;
