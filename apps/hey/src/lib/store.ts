import { db } from "./db";
import type { Chat, MemoryFile, Message, Settings } from "./types";

type ChatRow = { id: string; title: string; created_at: number; updated_at: number };
type MessageRow = { id: string; chat_id: string; role: Message["role"]; body: string; created_at: number };
type MemoryRow = { path: string; content: string; updated_at: number };

export const listChats = async (): Promise<Chat[]> =>
  (await db.sql<ChatRow>`SELECT * FROM chats ORDER BY updated_at DESC`).map((row) => ({
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

export const listMessages = async (chatId: string): Promise<Message[]> =>
  (await db.sql<MessageRow>`SELECT * FROM messages WHERE chat_id = ${chatId} ORDER BY created_at`).map((row) => ({
    id: row.id,
    chatId: row.chat_id,
    role: row.role,
    body: row.body,
    createdAt: row.created_at,
  }));

export const createChat = async () => {
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.sql`INSERT INTO chats (id, title, created_at, updated_at) VALUES (${id}, 'New conversation', ${now}, ${now})`;
  return id;
};

export const renameChat = (id: string, title: string) =>
  db.sql`UPDATE chats SET title = ${title}, updated_at = ${Date.now()} WHERE id = ${id}`;

export const titleChat = (id: string, title: string) =>
  db.sql`UPDATE chats SET title = ${title} WHERE id = ${id} AND title = 'New conversation'`;

export const deleteChat = (id: string) => db.sql`DELETE FROM chats WHERE id = ${id}`;

export const addMessage = async (chatId: string, role: Message["role"], body: string) => {
  const message: Message = {
    id: crypto.randomUUID(),
    chatId,
    role,
    body,
    createdAt: Date.now(),
  };
  await db.sql`INSERT INTO messages (id, chat_id, role, body, created_at) VALUES (${message.id}, ${chatId}, ${role}, ${body}, ${message.createdAt})`;
  await db.sql`UPDATE chats SET updated_at = ${message.createdAt} WHERE id = ${chatId}`;
  return message;
};

export const updateMessage = async (message: Message, body: string) => {
  await db.sql`UPDATE messages SET body = ${body} WHERE id = ${message.id}`;
  await db.sql`UPDATE chats SET updated_at = ${Date.now()} WHERE id = ${message.chatId}`;
  return { ...message, body };
};

export const readChatDraft = async (chatId: string) => {
  const rows = await db.sql<{ body: string }>`SELECT body FROM chat_drafts WHERE chat_id = ${chatId}`;
  return rows[0]?.body ?? "";
};

export const writeChatDraft = (chatId: string, body: string) =>
  db.sql`
    INSERT INTO chat_drafts (chat_id, body, updated_at) VALUES (${chatId}, ${body}, ${Date.now()})
    ON CONFLICT(chat_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at
  `;

export const listMemoryFiles = async (): Promise<MemoryFile[]> =>
  (await db.sql<MemoryRow>`SELECT * FROM memory_files ORDER BY path`).map((row) => ({
    path: row.path,
    content: row.content,
    updatedAt: row.updated_at,
  }));

export const writeMemoryFile = async (file: Pick<MemoryFile, "path">, content: string) => {
  await db.sql`
    INSERT INTO memory_files (path, content, updated_at) VALUES (${file.path}, ${content}, ${Date.now()})
    ON CONFLICT(path) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at
  `;
};

const defaultSettings: Settings = {
  tone: "balanced",
  responseLength: "balanced",
  instructions: "Be warm, practical, and honest. Help me make the next step smaller when I am overwhelmed.",
  memoryEnabled: true,
  vimEnabled: false,
};

export const readSettings = async (): Promise<Settings> => {
  const rows = await db.sql<{ value: string }>`SELECT value FROM settings WHERE key = 'preferences'`;
  if (!rows[0]) return defaultSettings;
  return { ...defaultSettings, ...JSON.parse(rows[0].value) };
};

export const writeSettings = (settings: Settings) =>
  db.sql`
    INSERT INTO settings (key, value) VALUES ('preferences', ${JSON.stringify(settings)})
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `;
