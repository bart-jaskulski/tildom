import { createSignal } from "solid-js";
import { getSyncConfig } from "./syncState";
import { readRecordingJson, writeRecordingJson, recordingKey, type ListenManifest } from "./listenRecording";
import { audioSyncTag, deleteCompletedAudio, uploadCompletedAudio } from "./listenSync";

export const [audioSyncError, setAudioSyncError] = createSignal("");
export const [audioSyncing, setAudioSyncing] = createSignal(false);
let running: Promise<void> | undefined;
let controller: AbortController | undefined;
let again = false;

async function reconcileAudio(signal: AbortSignal) {
  if (!navigator.storage?.getDirectory) return;
  const root = await navigator.storage.getDirectory();
  let recordings: FileSystemDirectoryHandle;
  try { recordings = await root.getDirectoryHandle("mark-listen"); }
  catch (error) {
    if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error;
    recordings = await root.getDirectoryHandle("mark-listen", { create: true });
  }
  const deletions = await root.getDirectoryHandle("mark-listen-deletions", { create: true });
  const relevant = new Set<string>();
  const pendingDeletions = new Set<string>();
  for await (const [key, handle] of recordings.entries()) if (handle.kind === "directory") relevant.add(key);
  for await (const [key, handle] of deletions.entries()) if (handle.kind === "file") { relevant.add(key); pendingDeletions.add(key); }
  if (!relevant.size) return;
  const { client } = await import("./db");
  const { prepareListenArticle, stripReaderMedia } = await import("./listenText");
  const rows = await client.sql<{ title: string; markdown: string }>`SELECT e.title, c.markdown FROM entries e JOIN reader_captures c ON c.entry_id = e.id WHERE c.status = 'ready' AND e.deleted_at IS NULL`;
  const active = new Set<string>();
  for (const row of rows) {
    signal.throwIfAborted();
    const key = await recordingKey(prepareListenArticle(row.title, stripReaderMedia(row.markdown)).sentences);
    if (relevant.has(key)) active.add(key);
    if (active.size === relevant.size) break;
  }
  const config = await getSyncConfig();
  for await (const [key, handle] of recordings.entries()) {
    signal.throwIfAborted();
    if (handle.kind !== "directory" || active.has(key)) continue;
    if (config) {
      await writeRecordingJson(deletions, key, audioSyncTag(config));
      pendingDeletions.add(key);
    }
    await recordings.removeEntry(key, { recursive: true });
  }
  if (!config || navigator.onLine === false) return;
  for await (const [key, handle] of deletions.entries()) {
    signal.throwIfAborted();
    if (handle.kind !== "file" || !pendingDeletions.has(key) || await readRecordingJson(deletions, key, "") !== audioSyncTag(config)) continue;
    if (active.has(key)) continue;
    await deleteCompletedAudio(config, key, signal);
    await deletions.removeEntry(key);
  }
  for await (const [key, handle] of recordings.entries()) {
    signal.throwIfAborted();
    if (handle.kind !== "directory" || !active.has(key)) continue;
    const directory = handle as FileSystemDirectoryHandle;
    const manifest = await readRecordingJson<ListenManifest>(directory, "manifest.json", { complete: false, ends: [] });
    if (!manifest.complete || await readRecordingJson(directory, "synced.json", "") === audioSyncTag(config)) continue;
    setAudioSyncing(true);
    const audio = await (await directory.getFileHandle("audio.mp3")).getFile();
    await uploadCompletedAudio(config, key, manifest, audio, signal);
    await writeRecordingJson(directory, "synced.json", audioSyncTag(config));
  }
}

export function flushCompletedAudio() {
  again = true;
  if (running) return running;
  controller = new AbortController();
  const signal = controller.signal;
  running = (async () => {
    do {
      again = false;
      await reconcileAudio(signal);
    } while (again && !signal.aborted);
    setAudioSyncError("");
  })().catch((error) => {
    if (!signal.aborted) setAudioSyncError(`Audio sync: ${error instanceof Error ? error.message : "Transfer failed"}`);
  }).finally(() => { running = undefined; setAudioSyncing(false); });
  return running;
}

export async function cancelAudioSync() {
  again = false;
  controller?.abort();
  await running;
  setAudioSyncError("");
}

export async function queueAudioDeletion(title: string, markdown: string) {
  if (!navigator.storage?.getDirectory) return;
  try {
    const config = await getSyncConfig();
    if (!config) return;
    const { prepareListenArticle, stripReaderMedia } = await import("./listenText");
    const key = await recordingKey(prepareListenArticle(title, stripReaderMedia(markdown)).sentences);
    const root = await navigator.storage.getDirectory();
    const deletions = await root.getDirectoryHandle("mark-listen-deletions", { create: true });
    await writeRecordingJson(deletions, key, audioSyncTag(config));
  } catch (error) {
    setAudioSyncError(`Audio cleanup: ${error instanceof Error ? error.message : "Could not queue deletion"}`);
  }
}
