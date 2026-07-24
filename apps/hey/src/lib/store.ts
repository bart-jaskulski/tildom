import { exec, query } from "./db";
import type { Chat, MemoryFile, Message, Settings } from "./types";

type ChatRow = { id: string; title: string; created_at: number; updated_at: number };
type MessageRow = { id: string; chat_id: string; role: Message["role"]; body: string; created_at: number };
type MemoryRow = { path: string; content: string; updated_at: number };

export const listChats = async (): Promise<Chat[]> =>
  (await query<ChatRow>("SELECT * FROM chats ORDER BY updated_at DESC")).map((row) => ({
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

export const listMessages = async (chatId: string): Promise<Message[]> =>
  (await query<MessageRow>(
    "SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at",
    [chatId],
  )).map((row) => ({
    id: row.id,
    chatId: row.chat_id,
    role: row.role,
    body: row.body,
    createdAt: row.created_at,
  }));

export const createChat = async () => {
  const id = crypto.randomUUID();
  const now = Date.now();
  await exec(
    "INSERT INTO chats (id, title, created_at, updated_at) VALUES (?, 'New conversation', ?, ?)",
    [id, now, now],
  );
  return id;
};

export const renameChat = (id: string, title: string) =>
  exec("UPDATE chats SET title = ?, updated_at = ? WHERE id = ?", [title, Date.now(), id]);

export const deleteChat = (id: string) => exec("DELETE FROM chats WHERE id = ?", [id]);

export const addMessage = async (chatId: string, role: Message["role"], body: string) => {
  const message: Message = {
    id: crypto.randomUUID(),
    chatId,
    role,
    body,
    createdAt: Date.now(),
  };
  await exec(
    "INSERT INTO messages (id, chat_id, role, body, created_at) VALUES (?, ?, ?, ?, ?)",
    [message.id, chatId, role, body, message.createdAt],
  );
  await exec("UPDATE chats SET updated_at = ? WHERE id = ?", [message.createdAt, chatId]);
  return message;
};

export const readChatDraft = async (chatId: string) => {
  const rows = await query<{ body: string }>("SELECT body FROM chat_drafts WHERE chat_id = ?", [chatId]);
  return rows[0]?.body ?? "";
};

export const writeChatDraft = (chatId: string, body: string) =>
  exec(
    `INSERT INTO chat_drafts (chat_id, body, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(chat_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`,
    [chatId, body, Date.now()],
  );

export const listMemoryFiles = async (): Promise<MemoryFile[]> =>
  (await query<MemoryRow>("SELECT * FROM memory_files ORDER BY path")).map((row) => ({
    path: row.path,
    content: row.content,
    updatedAt: row.updated_at,
  }));

export const writeMemoryFile = async (file: Pick<MemoryFile, "path">, content: string) => {
  await exec(
    `INSERT INTO memory_files (path, content, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(path) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
    [file.path, content, Date.now()],
  );
};

const defaultSettings: Settings = {
  tone: "balanced",
  responseLength: "balanced",
  instructions: "Be warm, practical, and honest. Help me make the next step smaller when I am overwhelmed.",
  memoryEnabled: true,
  vimEnabled: false,
};

export const readSettings = async (): Promise<Settings> => {
  const rows = await query<{ value: string }>("SELECT value FROM settings WHERE key = 'preferences'");
  if (!rows[0]) return defaultSettings;
  return { ...defaultSettings, ...JSON.parse(rows[0].value) };
};

export const writeSettings = (settings: Settings) =>
  exec(
    "INSERT INTO settings (key, value) VALUES ('preferences', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [JSON.stringify(settings)],
  );
