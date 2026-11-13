import { afterEach, describe, expect, it, vi } from "vitest";
import { createSyncWorker } from "./service-worker";
import { defaultRuntimeState, type PendingUpload, type PrefetchedSnapshot, type SyncConfig, type SyncRuntimeState, type SyncState } from "./state";
import { deriveSyncConfig, generateSyncSecret } from "./crypto";

afterEach(() => vi.unstubAllGlobals());

describe("sync service-worker", () => {
  it("keeps hasLocalChanges intact and prefetches latest when upload encounters a 409 conflict", async () => {
    let config: SyncConfig | undefined = await deriveSyncConfig("mark", generateSyncSecret(), "/sync");
    let runtime: SyncRuntimeState = {
      ...defaultRuntimeState(),
      lastSeenRevision: "revision-1",
      hasLocalChanges: true,
      pendingGeneration: 2,
    };
    let pending: PendingUpload | undefined = {
      revision: "revision-1",
      generation: 2,
      createdAt: Date.now(),
      body: new Uint8Array([1, 2, 3]).buffer,
    };
    let prefetched: PrefetchedSnapshot | undefined;

    const state = {
      appId: "mark",
      dirtyEvent: "mark-sync-dirty",
      backgroundTag: "mark-sync",
      getSyncConfig: async () => config,
      setSyncConfig: async (next: SyncConfig) => { config = next; },
      clearSyncConfig: async () => { config = undefined; },
      getSyncRuntime: async () => runtime,
      setSyncRuntime: async (next: SyncRuntimeState) => { runtime = next; },
      updateSyncRuntime: async (update: (current: SyncRuntimeState) => SyncRuntimeState) => { runtime = update(runtime); },
      getPendingUpload: async () => pending,
      setPendingUpload: async (p: PendingUpload) => { pending = p; },
      clearPendingUpload: async () => { pending = undefined; },
      getPrefetchedSnapshot: async () => prefetched,
      setPrefetchedSnapshot: async (p: PrefetchedSnapshot) => { prefetched = p; },
      clearPrefetchedSnapshot: async () => { prefetched = undefined; },
    } as unknown as SyncState;

    const worker = createSyncWorker(state);

    vi.stubGlobal("fetch", vi.fn()
      // 1. uploadSnapshot with If-Match: revision-1 -> returns 409 Conflict
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Conflict" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }))
      // 2. prefetchLatestSnapshot -> GET /latest returns revision-2
      .mockResolvedValueOnce(new Response(new Uint8Array([9, 9]), {
        status: 200,
        headers: {
          "Content-Type": "application/octet-stream",
          "x-tildom-revision": "revision-2",
        },
      }))
      // 3. listRevisions -> ["revision-2"]
      .mockResolvedValueOnce(new Response(JSON.stringify({ revisions: ["revision-2"] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }))
      // 4. second prefetchLatestSnapshot -> GET /latest returns revision-2
      .mockResolvedValueOnce(new Response(new Uint8Array([9, 9]), {
        status: 200,
        headers: {
          "Content-Type": "application/octet-stream",
          "x-tildom-revision": "revision-2",
        },
      })));

    await worker.runBackgroundSync();

    // Pending upload must be cleared because its expected revision was stale
    expect(pending).toBeUndefined();

    // hasLocalChanges MUST remain true so the app merges on startup
    expect(runtime.hasLocalChanges).toBe(true);

    // Latest remote revision must be prefetched
    expect(prefetched).toBeDefined();
    expect(prefetched?.revision).toBe("revision-2");
  });
});
