import { BrowserDbClient } from "@tildom/browser-db";
import { MARK_DB_MIGRATIONS } from "./schema";
import { markSyncDirty } from "./syncState";

export const client = new BrowserDbClient("entries.sqlite3", {
  migrations: MARK_DB_MIGRATIONS,
});

// Automatically mark sync dirty on local writes
client.subscribe(({ source }) => {
  if (source === "local") {
    void markSyncDirty();
  }
});
