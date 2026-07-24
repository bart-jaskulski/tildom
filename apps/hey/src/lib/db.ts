import { BrowserDbClient } from "@tildom/browser-db";

const schema = `
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
`;

const client = new BrowserDbClient("hey.sqlite3", { schema });

const seed = async () => {
  const [{ count = 0 } = {}] = await client.query<{ count: number }>("SELECT COUNT(*) AS count FROM chats");
  if (count) return;

  const now = Date.now();
  await client.transaction(async (tx) => {
    const chats = [
      ["clinic-call", "Calling the clinic", now - 30_000],
      ["unfair", "Am I being unfair?", now - 86_400_000],
      ["workday", "Starting the workday", now - 172_800_000],
      ["recovery", "After a crowded afternoon", now - 345_600_000],
    ];
    for (const [id, title, updatedAt] of chats) {
      await tx.sql`INSERT INTO chats (id, title, created_at, updated_at) VALUES (${id}, ${title}, ${updatedAt}, ${updatedAt})`;
    }

    const messages = [
      ["m1", "clinic-call", "user", "I have to call the clinic and I’m freezing. I keep rehearsing every possible branch of the conversation.", now - 28_000],
      ["m2", "clinic-call", "assistant", "Let’s make the job smaller. You don’t need to handle every branch right now—only decide what the first sentence is.\n\nSomething plain would work: “Hi, I’m calling to ask about rescheduling my appointment.”", now - 27_000],
      ["m3", "clinic-call", "user", "That helps. The hard part is when they ask why.", now - 26_000],
      ["m4", "clinic-call", "assistant", "You can keep that answer just as short: “The current time no longer works for me.” You don’t owe them a detailed defense.\n\nIf they press, repeat the practical request: “Could you tell me what other times are available?”", now - 25_000],
    ];
    for (const [id, chatId, role, body, createdAt] of messages) {
      await tx.sql`INSERT INTO messages (id, chat_id, role, body, created_at) VALUES (${id}, ${chatId}, ${role}, ${body}, ${createdAt})`;
    }

    const memories = [
      ["memory_summary.md", "# About me\n\nI’m autistic and have ADHD. I use Hey for practical consultation, emotional untangling, and ordinary company.\n\nPrefer concrete next steps and do not make difficulty sound like a character flaw."],
      ["preferences/communication.md", "# Communication\n\nBe warm, plain, and direct. When I am overloaded, make the next action smaller before offering a complete plan."],
      ["topics/phone-calls.md", "# Phone calls\n\nUnscripted phone calls can cause freezing. Short opening lines and permission to repeat the practical request usually help."],
    ];
    for (const [path, content] of memories) {
      await tx.sql`INSERT INTO memory_files (path, content, updated_at) VALUES (${path}, ${content}, ${now})`;
    }
  });
};

export const initDb = async () => {
  await client.init();
  const columns = await client.query<{ name: string }>("PRAGMA table_info(memory_files)");
  if (columns.some((column) => column.name === "revision")) {
    await client.exec("ALTER TABLE memory_files DROP COLUMN revision");
  }
  await seed();
};

export const exec = client.exec;
export const query = client.query;
export const exportDatabase = client.exportDatabase;
export const importDatabase = client.importDatabase;
export const dbVersion = () => client.dbVersion;
