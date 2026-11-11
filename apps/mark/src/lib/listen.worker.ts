import { PhononTTS } from "phonon-tts";
import { createMp3Encoder } from "wasm-media-encoders";
import { listenFailure } from "./listenFailure";
import { checkpointSamples, LISTEN_SAMPLE_RATE, readRecordingJson, writeRecordingJson, type ListenManifest } from "./listenRecording";

import { getSyncConfig } from "./syncState";
import { audioSyncTag, downloadCompletedAudio } from "./listenSync";

declare const self: DedicatedWorkerGlobalScope;
let recording = "";
let directory: FileSystemDirectoryHandle;
let pcm: FileSystemSyncAccessHandle | undefined;
let manifest: ListenManifest = { ends: [], complete: false };
let sentences: string[] = [];
let available = 0;
let closing = false;
let ready = Promise.resolve();
let generation: Promise<void> | undefined;
const controller = new AbortController();
let viewWrites = Promise.resolve();
const persistView = (file: string, value: number) => {
  const write = viewWrites.then(() => writeRecordingJson(directory, file, value));
  viewWrites = write.catch(() => undefined);
  return write;
};

const notify = () => self.postMessage({ type: "available", available, ends: manifest.ends });

async function open(key: string, text: string[]) {
  recording = key;
  sentences = text;
  const root = await navigator.storage.getDirectory();
  const recordings = await root.getDirectoryHandle("mark-listen", { create: true });
  directory = await recordings.getDirectoryHandle(key, { create: true });
  manifest = await readRecordingJson(directory, "manifest.json", { ends: [], complete: false });
  const position = await readRecordingJson(directory, "position.json", 0);
  const scrollY = await readRecordingJson<number | null>(directory, "scroll.json", null);
  if (manifest.complete) {
    const audio = await (await directory.getFileHandle("audio.mp3")).getFile();
    self.postMessage({ type: "ready", audio, ends: manifest.ends, position, scrollY, complete: true });
    await directory.removeEntry("pcm").catch(() => undefined);
  } else {
    const file = await directory.getFileHandle("pcm", { create: true });
    pcm = await file.createSyncAccessHandle();
    available = checkpointSamples(manifest, pcm.getSize(), sentences.length);
    pcm.truncate(available * 4);
    self.postMessage({ type: "ready", ends: manifest.ends, position, scrollY, available, complete: false });
  }
}

async function restoreSyncedAudio() {
  let remote;
  let config;
  try {
    config = await getSyncConfig();
    if (!config || navigator.onLine === false) return false;
    remote = await downloadCompletedAudio(config, recording, sentences.length,
      AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]));
  } catch (error) {
    if (!closing) self.postMessage({ type: "sync-error", error: `Audio sync: ${error instanceof Error ? error.message : "Download failed"}` });
    return false;
  }
  if (!remote || closing) return false;
  const file = await directory.getFileHandle("audio.mp3", { create: true });
  const stream = await file.createWritable();
  await stream.write(remote.audio);
  await stream.close();
  await writeRecordingJson(directory, "manifest.json", remote.manifest);
  manifest = remote.manifest;
  available = manifest.ends.at(-1)!;
  pcm?.close();
  pcm = undefined;
  await directory.removeEntry("pcm").catch(() => undefined);
  await writeRecordingJson(directory, "synced.json", audioSyncTag(config)).catch(() => undefined);
  self.postMessage({ type: "remote", audio: await file.getFile(), ends: manifest.ends, available });
  return true;
}

async function generate() {
  let tts: PhononTTS | undefined;
  let mp3: FileSystemSyncAccessHandle | undefined;
  try {
    if (await restoreSyncedAudio() || closing) return;
    self.postMessage({ type: "generating" });
    available = checkpointSamples(manifest, pcm!.getSize(), sentences.length);
    pcm!.truncate(available * 4);
    const encoder = await createMp3Encoder();
    encoder.configure({ sampleRate: LISTEN_SAMPLE_RATE, channels: 1, bitrate: 96 });
    mp3 = await (await directory.getFileHandle("audio.mp3", { create: true })).createSyncAccessHandle();
    mp3.truncate(0);
    let encodedBytes = 0;
    const encode = (samples: Float32Array) => {
      const bytes = encoder.encode([samples]);
      if (mp3!.write(bytes, { at: encodedBytes }) !== bytes.length) throw new Error("Could not save article audio. Check device storage.");
      encodedBytes += bytes.length;
    };
    for (let offset = 0; offset < available; offset += LISTEN_SAMPLE_RATE) {
      const buffer = new Float32Array(Math.min(LISTEN_SAMPLE_RATE, available - offset));
      pcm!.read(buffer, { at: offset * 4 });
      encode(buffer);
    }
    if (manifest.ends.length < sentences.length && !closing) {
      tts = await PhononTTS.load({ lang: "en", device: "auto" });
      for (let index = manifest.ends.length; index < sentences.length && !closing; index++) {
        for await (const samples of tts.stream(sentences[index], { signal: controller.signal })) {
          if (closing) break;
          if (pcm!.write(samples, { at: available * 4 }) !== samples.byteLength) throw new Error("Could not save article audio. Check device storage.");
          encode(samples);
          available += samples.length;
          notify();
        }
        if (closing) break;
        pcm!.flush();
        manifest.ends.push(available);
        await writeRecordingJson(directory, "manifest.json", manifest);
        notify();
      }
    }
    if (closing) return;
    const tail = encoder.finalize();
    if (mp3.write(tail, { at: encodedBytes }) !== tail.length) throw new Error("Could not finish saving audio.");
    mp3.flush();
    mp3.close();
    mp3 = undefined;
    manifest.complete = true;
    await writeRecordingJson(directory, "manifest.json", manifest);
    self.postMessage({ type: "complete", ends: manifest.ends, available });
  } catch (error) {
    if (!closing) self.postMessage({ type: "error", ...listenFailure(error) });
  } finally {
    tts?.dispose();
    mp3?.close();
  }
}

self.onmessage = ({ data }) => {
  if (data.type === "open") {
    ready = open(data.key, data.sentences);
    void ready.catch((error) => self.postMessage({ type: "error", ...listenFailure(error) }));
    return;
  }
  void (async () => {
    await ready;
    if (data.type === "generate" && !generation && !manifest.complete) generation = generate().finally(() => { generation = undefined; });
    if (data.type === "read" && pcm) {
      const start = Math.max(0, Math.min(data.start, available));
      const samples = new Float32Array(Math.min(LISTEN_SAMPLE_RATE, available - start));
      pcm.read(samples, { at: start * 4 });
      self.postMessage({ type: "pcm", start, samples, requestId: data.requestId }, [samples.buffer]);
    }
    if (data.type === "position") await persistView("position.json", data.position);
    if (data.type === "scroll") await persistView("scroll.json", data.scrollY);
    if (data.type === "close") {
      closing = true;
      controller.abort();
      await persistView("position.json", data.position);
      await persistView("scroll.json", data.scrollY);
      await generation;
      pcm?.close();
      pcm = undefined;
      if (manifest.complete) await directory.removeEntry("pcm").catch(() => undefined);
      self.postMessage({ type: "closed" });
      self.close();
    }
  })().catch((error) => {
    if (!closing) self.postMessage({ type: "error", ...listenFailure(error) });
  });
};
