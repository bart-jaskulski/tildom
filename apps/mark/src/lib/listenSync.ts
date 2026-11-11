import { deleteSnapshots, base64UrlEncode, deriveBits, deriveSyncConfig, encryptSnapshot, decryptSnapshot, listRevisions, downloadLatest, uploadSnapshot, toArrayBuffer, type SyncConfig } from "@tildom/sync-client";
import type { ListenManifest } from "./listenRecording";

export const audioSyncTag = (config: SyncConfig) => `${config.baseUrl}|${config.vaultId}`;
export async function audioSyncConfig(config: SyncConfig, key: string) {
  const secret = base64UrlEncode(await deriveBits(config.secret, `${config.appId}:audio:${key}`, 256));
  return deriveSyncConfig(`${config.appId}-audio`, secret, config.baseUrl);
}

function validate(manifest: ListenManifest, sentenceCount?: number) {
  if (!manifest.complete || !Array.isArray(manifest.ends) || !manifest.ends.length ||
    (sentenceCount !== undefined && manifest.ends.length !== sentenceCount)) throw new Error("Incomplete article audio.");
  let previous = 0;
  for (const end of manifest.ends) {
    if (!Number.isSafeInteger(end) || end <= previous) throw new Error("Invalid sentence timing.");
    previous = end;
  }
}

export async function packAudio(manifest: ListenManifest, audio: Blob) {
  validate(manifest);
  if (!audio.size) throw new Error("Empty article audio.");
  const header = new TextEncoder().encode(JSON.stringify({ version: 1, ends: manifest.ends }));
  const bytes = new Uint8Array(4 + header.length + audio.size);
  new DataView(bytes.buffer).setUint32(0, header.length);
  bytes.set(header, 4);
  bytes.set(new Uint8Array(await audio.arrayBuffer()), 4 + header.length);
  return bytes;
}

export function unpackAudio(bytes: Uint8Array, sentenceCount: number) {
  if (bytes.length < 5) throw new Error("Invalid article audio.");
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  if (length > bytes.length - 5) throw new Error("Invalid article audio header.");
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + length)));
  if (header.version !== 1) throw new Error("Unsupported article audio.");
  const manifest: ListenManifest = { complete: true, ends: header.ends };
  validate(manifest, sentenceCount);
  return { manifest, audio: new Blob([toArrayBuffer(bytes.subarray(4 + length))], { type: "audio/mpeg" }) };
}

export async function uploadCompletedAudio(config: SyncConfig, key: string, manifest: ListenManifest, audio: Blob, signal?: AbortSignal) {
  validate(manifest);
  const target = await audioSyncConfig(config, key);
  if ((await listRevisions(target, signal)).length) return;
  const encrypted = await encryptSnapshot(target, await packAudio(manifest, audio));
  signal?.throwIfAborted();
  // Each recording is immutable; concurrent uploads keep the first complete copy.
  await uploadSnapshot(target, toArrayBuffer(encrypted), null, signal);
}

export async function downloadCompletedAudio(config: SyncConfig, key: string, sentenceCount: number, signal?: AbortSignal) {
  const target = await audioSyncConfig(config, key);
  const remote = await downloadLatest(target, signal);
  if (!remote) return null;
  const result = unpackAudio(await decryptSnapshot(target, remote.body), sentenceCount);
  signal?.throwIfAborted();
  return result;
}

export async function deleteCompletedAudio(config: SyncConfig, key: string, signal?: AbortSignal) {
  await deleteSnapshots(await audioSyncConfig(config, key), signal);
}
