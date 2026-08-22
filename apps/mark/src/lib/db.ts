import { BrowserDbClient } from "@tildom/browser-db";
import { MARK_DB_MIGRATIONS } from "./schema";

export const client = new BrowserDbClient("entries.sqlite3", {
  migrations: MARK_DB_MIGRATIONS,
  requiredTables: ["entries", "comments", "tags", "entry_tags"],
});
