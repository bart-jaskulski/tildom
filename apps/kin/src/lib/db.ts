import { BrowserDbClient } from "@tildom/browser-db";
import { KIN_DB_MIGRATIONS, KIN_REQUIRED_TABLES } from "./schema";
import { markSyncDirty } from "./syncState";

const client = new BrowserDbClient("/kin/kin.sqlite3", {
  migrations: KIN_DB_MIGRATIONS,
  requiredTables: KIN_REQUIRED_TABLES,
});

export const initDb = client.init;

export const exec = async (sql: string, params?: any[]): Promise<void> => {
  await client.exec(sql, params);
  await markSyncDirty();
};

export const query = client.query;
export const exportDatabase = client.exportDatabase;
export const importDatabase = client.importDatabase;
export const closeDb = client.close;
export const dbVersion = () => client.dbVersion;
