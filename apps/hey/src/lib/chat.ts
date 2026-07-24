import type { MemoryFile, Message, Settings } from "./types";

type ChatEvent =
  | { type: "text"; text: string }
  | { type: "done"; memories: Array<{ path: string; content: string }> }
  | { type: "error"; error: string };

export const streamChat = async (
  messages: Message[],
  memories: MemoryFile[],
  settings: Settings,
  onText: (text: string) => void,
) => {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
