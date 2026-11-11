import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { Blob } from "node:buffer";
import { deriveSyncConfig, type SyncConfig } from "@tildom/sync-client";
import { recordingKey, writeRecordingJson } from "./listenRecording";
import { prepareListenArticle } from "./listenText";
import { audioSyncTag } from "./listenSync";

let config: SyncConfig;
let rows: { title: string; markdown: string }[];
vi.mock("./syncState", () => ({ getSyncConfig: () => Promise.resolve(config) }));
vi.mock("./db", () => ({ client: { sql: () => Promise.resolve(rows) } }));
import { cancelAudioSync, flushCompletedAudio, queueAudioDeletion } from "./listenSyncQueue";

class Directory {
  kind = "directory";
  children = new Map<string, Directory | { kind: "file"; content: Blob }>();
  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<Directory> {
    if (!this.children.has(name) && options?.create) this.children.set(name, new Directory());
    const result = this.children.get(name);
    if (!(result instanceof Directory)) throw new DOMException("Missing", "NotFoundError");
    return result;
  }
  async getFileHandle(name: string, options?: { create?: boolean }) {
    if (!this.children.has(name) && options?.create) this.children.set(name, { kind: "file", content: new Blob() });
    const file = this.children.get(name);
    if (!file || file instanceof Directory) throw new DOMException("Missing", "NotFoundError");
    return { getFile: async () => file.content, createWritable: async () => ({ write: async (value: string | Blob) => { file.content = new Blob([value]); }, close: async () => {} }) };
  }
  async removeEntry(name: string) { this.children.delete(name); }
  async *entries() { yield* this.children.entries(); }
}
let root: Directory;
let browser: { onLine: boolean; storage: { getDirectory: () => Promise<Directory> } };
let transfers: { method?: string }[];
beforeEach(async () => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("Blob", Blob);
  root = new Directory();
  rows = [];
  browser = { onLine: false, storage: { getDirectory: async () => root } };
  vi.stubGlobal("navigator", browser);
  config = await deriveSyncConfig("mark", "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc", "/sync");
  transfers = [];
  vi.stubGlobal("fetch", async (_url: string, options: RequestInit) => { transfers.push({ method: options.method }); return new Response(null, { status: 204 }); });
});
afterEach(async () => { await cancelAudioSync(); vi.unstubAllGlobals(); });

it("removes complete and partial orphan files offline, then retries remote deletion on reconnect", async () => {
  const recordings = await root.getDirectoryHandle("mark-listen", { create: true });
  await recordings.getDirectoryHandle("completed-old", { create: true });
  await recordings.getDirectoryHandle("partial-old", { create: true });
  await flushCompletedAudio();
  expect(recordings.children.size).toBe(0);
  const deletions = await root.getDirectoryHandle("mark-listen-deletions");
  expect(deletions.children.size).toBe(2);
  expect(transfers).toHaveLength(0);
  browser.onLine = true;
  await flushCompletedAudio();
  expect(transfers).toEqual([{ method: "DELETE" }, { method: "DELETE" }]);
  expect(deletions.children.size).toBe(0);
});

it("deletes remote audio even when this device never downloaded a recording", async () => {
  await queueAudioDeletion("Removed", "An article.");
  await flushCompletedAudio();
  expect(transfers).toHaveLength(0);
  browser.onLine = true;
  await flushCompletedAudio();
  expect(transfers).toEqual([{ method: "DELETE" }]);
});

it("retains audio when another saved article still uses the same recording", async () => {
  rows = [{ title: "Shared", markdown: "Same article." }];
  const key = await recordingKey(prepareListenArticle(rows[0].title, rows[0].markdown).sentences);
  const recordings = await root.getDirectoryHandle("mark-listen", { create: true });
  const directory = await recordings.getDirectoryHandle(key, { create: true });
  await writeRecordingJson(directory as unknown as FileSystemDirectoryHandle, "synced.json", audioSyncTag(config));
  await queueAudioDeletion(rows[0].title, rows[0].markdown);
  browser.onLine = true;
  await flushCompletedAudio();
  expect(recordings.children.has(key)).toBe(true);
  expect(transfers).toHaveLength(0);
  expect((await root.getDirectoryHandle("mark-listen-deletions")).children.size).toBe(1);
  rows = [];
  await flushCompletedAudio();
  expect(transfers).toEqual([{ method: "DELETE" }]);
  expect((await root.getDirectoryHandle("mark-listen-deletions")).children.size).toBe(0);
});
