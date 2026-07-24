import type { MemoryFile, Message, Settings } from "./types";

type ChatEvent =
  | { type: "text"; text: string }
  | { type: "done"; memories: Array<{ path: string; content: string }> }
  | { type: "error"; error: string };

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  || (import.meta.env.DEV ? "http://localhost:8788" : "https://api.tildom.app");

export const generateChatTitle = async (message: string) => {
  const response = await fetch(`${API_BASE_URL}/v1/hey/title`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!response.ok) throw new Error("Failed to generate chat title.");
  return ((await response.json()) as { title: string }).title;
};

export const streamChat = async (
  messages: Message[],
  memories: MemoryFile[],
  settings: Settings,
  onText: (text: string) => void,
  signal?: AbortSignal,
) => {
  const response = await fetch(`${API_BASE_URL}/v1/hey/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      messages: messages.map(({ role, body }) => ({ role, body })),
      memories: memories.map(({ path, content }) => ({ path, content })),
      settings,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || `Chat request failed (${response.status}).`);
  }
  if (!response.body) throw new Error("The chat response did not include a stream.");

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let memoryWrites: Array<{ path: string; content: string }> = [];

  while (true) {
    const { done, value = "" } = await reader.read();
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line) continue;
      const event = JSON.parse(line) as ChatEvent;
      if (event.type === "text") onText(event.text);
      if (event.type === "done") memoryWrites = event.memories;
      if (event.type === "error") throw new Error(event.error);
    }
    if (done) break;
  }

  return memoryWrites;
};
