import { BrowserDbClient } from "@tildom/browser-db";
import { MARK_DB_SCHEMA } from "./schema";

export const client = new BrowserDbClient("entries.sqlite3", {
  schema: MARK_DB_SCHEMA,
  requiredTables: ["entries", "comments", "tags", "entry_tags"],
});
