import { BrowserDbClient } from "@tildom/browser-db";
import { syncState } from "./syncState";
import { DO_DB_MIGRATIONS } from "./schema";

export const db = new BrowserDbClient("microstep.sqlite3", {
  migrations: DO_DB_MIGRATIONS,
});

db.subscribe((event) => {
  if (event.source === "local") void syncState.markSyncDirty();
});
