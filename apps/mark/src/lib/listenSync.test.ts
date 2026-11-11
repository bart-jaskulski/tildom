import { afterEach, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { Blob } from "node:buffer";
import { deriveSyncConfig, generateSyncSecret } from "@tildom/sync-client";
import { audioSyncConfig, deleteCompletedAudio, downloadCompletedAudio, packAudio, unpackAudio, uploadCompletedAudio } from "./listenSync";

function setup() {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("Blob", Blob);
  const snapshots = new Map<string, Uint8Array>();
  vi.stubGlobal("fetch", async (url: string, options?: RequestInit) => {
    const root = url.replace(/\/latest$/, "");
    if (options?.method === "DELETE") { snapshots.delete(root); return new Response(null, { status: 204 }); }
    if (options?.method === "POST") {
      if (snapshots.has(root)) return new Response(null, { status: 409 });
      snapshots.set(root, new Uint8Array(options.body as ArrayBuffer));
      return Response.json({ revision: "one" });
    }
    const bytes = snapshots.get(root);
    if (!bytes) return new Response(null, { status: 404 });
    return url.endsWith("/latest")
      ? new Response(new Uint8Array(bytes), { headers: { "x-tildom-revision": "one" } })
      : Response.json({ revisions: ["one"] });
  });
  return snapshots;
}
afterEach(() => vi.unstubAllGlobals());

it("syncs one encrypted complete MP3 and timings without local playback state", async () => {
  const snapshots = setup();
  const config = await deriveSyncConfig("mark", generateSyncSecret(), "/sync");
  const manifest = { complete: true, ends: [24000, 48000], position: 123, scrollY: 456 };
  const mp3 = new Blob([new Uint8Array([0xff, 0xfb, 1, 2])]);
  await uploadCompletedAudio(config, "article-one", manifest, mp3);
  await uploadCompletedAudio(config, "article-one", manifest, mp3);
  expect(snapshots.size).toBe(1);
  const remote = await downloadCompletedAudio(config, "article-one", 2);
  expect(remote?.manifest).toEqual({ complete: true, ends: [24000, 48000] });
  expect(new Uint8Array(await remote!.audio.arrayBuffer())).toEqual(new Uint8Array(await mp3.arrayBuffer()));
  expect(await downloadCompletedAudio(config, "another-article", 2)).toBeNull();
  const other = await deriveSyncConfig("mark", generateSyncSecret(), "/sync");
  expect((await audioSyncConfig(other, "article-one")).vaultId).not.toBe((await audioSyncConfig(config, "article-one")).vaultId);
  const stored = [...snapshots.values()][0];
  stored[stored.length - 1] ^= 1;
  await expect(downloadCompletedAudio(config, "article-one", 2)).rejects.toThrow();
});

it("never uploads partials and rejects mismatched or corrupt sentence timings", async () => {
  const snapshots = setup();
  const config = await deriveSyncConfig("mark", generateSyncSecret(), "/sync");
  const mp3 = new Blob(["audio"]);
  await expect(uploadCompletedAudio(config, "partial", { complete: false, ends: [24000] }, mp3)).rejects.toThrow();
  expect(snapshots.size).toBe(0);
  const bytes = await packAudio({ complete: true, ends: [24000, 48000] }, mp3);
  expect(() => unpackAudio(bytes, 3)).toThrow();
  expect(() => unpackAudio(new Uint8Array([255, 255, 255, 255, 1]), 2)).toThrow();
  await expect(packAudio({ complete: true, ends: [24000, 12000] }, mp3)).rejects.toThrow();
});

it("removes a synced recording while leaving another article available", async () => {
  const snapshots = setup();
  const config = await deriveSyncConfig("mark", generateSyncSecret(), "/sync");
  const manifest = { complete: true, ends: [24000] };
  await uploadCompletedAudio(config, "removed", manifest, new Blob(["mp3"]));
  await uploadCompletedAudio(config, "retained", manifest, new Blob(["mp3"]));
  await deleteCompletedAudio(config, "removed");
  await deleteCompletedAudio(config, "removed");
  expect(snapshots.size).toBe(1);
  expect(await downloadCompletedAudio(config, "removed", 1)).toBeNull();
  expect(await downloadCompletedAudio(config, "retained", 1)).not.toBeNull();
});
