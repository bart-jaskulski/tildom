import { BrowserDbClient } from "@tildom/browser-db";
import type { DbMigration } from "@tildom/browser-db";
import { markSyncDirty } from "./syncState";

const migrations: DbMigration[] = [{
  version: 1,
  sql: `
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS messages_chat_created ON messages(chat_id, created_at);
  CREATE TABLE IF NOT EXISTS memory_files (
    path TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  DROP TABLE IF EXISTS memory_revisions;
  CREATE TABLE IF NOT EXISTS chat_drafts (
    chat_id TEXT PRIMARY KEY REFERENCES chats(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  PRAGMA user_version = 1;
`,
}];

export const db = new BrowserDbClient("hey.sqlite3", { migrations });

// Automatically mark sync dirty on local writes
db.subscribe(({ source }) => {
  if (source === "local") {
    void markSyncDirty();
  }
});
