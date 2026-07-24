import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import type { DbRequest, DbResponse } from "../lib/db.types";

const DB_FILENAME = "/hey/hey.sqlite3";
let db: any;

const execute = (sql: string, params: unknown[] = []) => {
  if (!db) throw new Error("Database is not initialized");
  db.exec({ sql, bind: params });
};

const query = (sql: string, params: unknown[] = []) => {
  if (!db) throw new Error("Database is not initialized");
  return db.exec({
    sql,
    bind: params,
    rowMode: "object",
    returnValue: "resultRows",
  });
};

const ensureSchema = () => {
  execute(`
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
    CREATE INDEX IF NOT EXISTS messages_chat_created
      ON messages(chat_id, created_at);
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
  `);
  const hasRevisionColumn = query("PRAGMA table_info(memory_files)")
    .some((column: { name: string }) => column.name === "revision");
  if (hasRevisionColumn) execute("ALTER TABLE memory_files DROP COLUMN revision");
};

const seed = () => {
  const count = query("SELECT COUNT(*) AS count FROM chats")[0]?.count ?? 0;
  if (count) return;
  const now = Date.now();
  execute("BEGIN");
  try {
    const chats = [
      ["clinic-call", "Calling the clinic", now - 30_000],
      ["unfair", "Am I being unfair?", now - 86_400_000],
      ["workday", "Starting the workday", now - 172_800_000],
      ["recovery", "After a crowded afternoon", now - 345_600_000],
    ];
    for (const [id, title, updatedAt] of chats) {
      execute(
        "INSERT INTO chats (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
        [id, title, updatedAt, updatedAt],
      );
    }
    const messages = [
      ["m1", "clinic-call", "user", "I have to call the clinic and I’m freezing. I keep rehearsing every possible branch of the conversation.", now - 28_000],
      ["m2", "clinic-call", "assistant", "Let’s make the job smaller. You don’t need to handle every branch right now—only decide what the first sentence is.\n\nSomething plain would work: “Hi, I’m calling to ask about rescheduling my appointment.”", now - 27_000],
      ["m3", "clinic-call", "user", "That helps. The hard part is when they ask why.", now - 26_000],
      ["m4", "clinic-call", "assistant", "You can keep that answer just as short: “The current time no longer works for me.” You don’t owe them a detailed defense.\n\nIf they press, repeat the practical request: “Could you tell me what other times are available?”", now - 25_000],
    ];
    for (const message of messages) {
      execute(
        "INSERT INTO messages (id, chat_id, role, body, created_at) VALUES (?, ?, ?, ?, ?)",
        message,
      );
    }
    const memories = [
      ["memory_summary.md", "# About me\n\nI’m autistic and have ADHD. I use Hey for practical consultation, emotional untangling, and ordinary company.\n\nPrefer concrete next steps and do not make difficulty sound like a character flaw."],
      ["preferences/communication.md", "# Communication\n\nBe warm, plain, and direct. When I am overloaded, make the next action smaller before offering a complete plan."],
      ["topics/phone-calls.md", "# Phone calls\n\nUnscripted phone calls can cause freezing. Short opening lines and permission to repeat the practical request usually help."],
    ];
    for (const [path, content] of memories) {
      execute(
        "INSERT INTO memory_files (path, content, updated_at) VALUES (?, ?, ?)",
        [path, content, now],
      );
    }
    execute("COMMIT");
  } catch (error) {
    execute("ROLLBACK");
    throw error;
  }
};

const initialize = async () => {
  if (db) return;
  const sqlite3 = await sqlite3InitModule();
  if (typeof sqlite3.oo1?.OpfsDb !== "function" || !sqlite3.capi?.sqlite3_vfs_find?.("opfs")) {
    throw new Error("SQLite OPFS is unavailable. Open Hey in a secure, cross-origin-isolated browser context.");
  }
  try {
    await (sqlite3 as any).opfs?.mkdir("/hey");
  } catch {
    // Directory already exists.
  }
  db = new sqlite3.oo1.OpfsDb(DB_FILENAME, "c");
  ensureSchema();
  seed();
};

self.onmessage = async (event: MessageEvent<DbRequest>) => {
  const message = event.data;
  try {
    if (message.type === "init") await initialize();
    if (message.type === "exec") execute(message.sql, message.params);
    const rows = message.type === "query" ? query(message.sql, message.params) : undefined;
    self.postMessage({ id: message.id, type: "success", data: rows ? { rows } : undefined } satisfies DbResponse);
  } catch (error) {
    self.postMessage({
      id: message.id,
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    } satisfies DbResponse);
  }
};
