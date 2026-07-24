export type Surface = "chats" | "memory" | "settings";

export type Chat = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};

export type Message = {
  id: string;
  chatId: string;
  role: "user" | "assistant";
  body: string;
  createdAt: number;
};

export type MemoryFile = {
  path: string;
  content: string;
  updatedAt: number;
};

export type Settings = {
  tone: "gentle" | "balanced" | "direct";
  responseLength: "short" | "balanced" | "detailed";
  instructions: string;
  memoryEnabled: boolean;
  vimEnabled: boolean;
};

export type SearchResult =
  | { kind: "chat"; id: string; title: string; detail: string }
  | { kind: "memory"; id: string; title: string; detail: string };
