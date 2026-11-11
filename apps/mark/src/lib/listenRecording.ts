export const LISTEN_SAMPLE_RATE = 24000;
export const LISTEN_VERSION = "phonon-31m-0.6.0-q8-default-sentences-v1";

export interface ListenManifest {
  ends: number[];
  complete: boolean;
}

export async function readRecordingJson<T>(directory: FileSystemDirectoryHandle, name: string, fallback: T): Promise<T> {
  try {
    const handle = await directory.getFileHandle(name);
    return JSON.parse(await (await handle.getFile()).text()) as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return fallback;
    throw error;
  }
}

export async function writeRecordingJson(directory: FileSystemDirectoryHandle, name: string, value: unknown) {
  const file = await directory.getFileHandle(name, { create: true });
  const stream = await file.createWritable();
  await stream.write(JSON.stringify(value));
  await stream.close();
}

export function checkpointSamples(manifest: ListenManifest, byteLength: number, sentenceCount: number) {
  let previous = 0;
  if (!Array.isArray(manifest.ends) || manifest.ends.length > sentenceCount) throw new Error("Invalid audio checkpoints.");
  for (const end of manifest.ends) {
    if (!Number.isSafeInteger(end) || end <= previous || end * 4 > byteLength) throw new Error("Invalid audio checkpoint.");
    previous = end;
  }
  return previous;
}

export async function recordingKey(sentences: string[]) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([LISTEN_VERSION, sentences])));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
