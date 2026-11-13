import { afterEach, describe, expect, it, vi } from "vitest";
import { createSyncClient } from "./client";
import { defaultRuntimeState, type SyncConfig, type SyncRuntimeState, type SyncState } from "./state";

afterEach(() => vi.unstubAllGlobals());

describe("sync client", () => {
  it("can create a vault after an unpaired sync check", async () => {
    let config: SyncConfig | undefined;
    let runtime = defaultRuntimeState();
    const state = {
      appId: "kin",
      dirtyEvent: "kin-sync-dirty",
      backgroundTag: "kin-sync",
      getSyncConfig: async () => config,
      setSyncConfig: async (next: SyncConfig) => { config = next; },
      clearSyncConfig: async () => { config = undefined; },
      getSyncRuntime: async () => runtime,
      setSyncRuntime: async (next: typeof runtime) => { runtime = next; },
      updateSyncRuntime: async (update: (current: typeof runtime) => typeof runtime) => { runtime = update(runtime); },
      markSyncDirty: async () => { runtime = { ...runtime, hasLocalChanges: true, pendingGeneration: 1 }; },
      getPendingUpload: async () => undefined,
      setPendingUpload: async () => undefined,
      clearPendingUpload: async () => undefined,
      getPrefetchedSnapshot: async () => undefined,
      setPrefetchedSnapshot: async () => undefined,
      clearPrefetchedSnapshot: async () => undefined,
    } as unknown as SyncState;
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ revision: "revision-1" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      })));

    const client = createSyncClient({
      appId: "kin",
      baseUrl: "/sync",
      state,
      exportDatabase: async () => new Uint8Array([1]),
      importDatabase: async () => undefined,
    });

    await client.syncNow();
    await client.createSyncVault();

    expect(config?.appId).toBe("kin");
    expect(runtime).toMatchObject({ lastSeenRevision: "revision-1", hasLocalChanges: false });

    const secret = config!.secret;
    await client.disconnectSync();
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ revision: "revision-2" }), {
        status: 201, headers: { "Content-Type": "application/json" },
      }));
    await client.joinSyncVault(secret);
    expect(runtime).toMatchObject({ lastSeenRevision: "revision-2", hasLocalChanges: false });
  });

  it("merges remote database and uploads merged snapshot when local changes exist", async () => {
    let config: SyncConfig | undefined;
    let runtime = defaultRuntimeState();
    const state = {
      appId: "mark",
      dirtyEvent: "mark-sync-dirty",
      backgroundTag: "mark-sync",
      getSyncConfig: async () => config,
      setSyncConfig: async (next: SyncConfig) => { config = next; },
      clearSyncConfig: async () => { config = undefined; },
      getSyncRuntime: async () => runtime,
      setSyncRuntime: async (next: typeof runtime) => { runtime = next; },
      updateSyncRuntime: async (update: (current: typeof runtime) => typeof runtime) => { runtime = update(runtime); },
      markSyncDirty: async () => { runtime = { ...runtime, hasLocalChanges: true, pendingGeneration: 1 }; },
      getPendingUpload: async () => undefined,
      setPendingUpload: async () => undefined,
      clearPendingUpload: async () => undefined,
      getPrefetchedSnapshot: async () => undefined,
      setPrefetchedSnapshot: async () => undefined,
      clearPrefetchedSnapshot: async () => undefined,
    } as unknown as SyncState;

    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ revision: "revision-1" }), {
        status: 201, headers: { "Content-Type": "application/json" },
      })));

    let localDbBytes = new Uint8Array([1, 2, 3]);
    const mergeDatabase = vi.fn().mockImplementation(async (remoteBytes: Uint8Array) => {
      // simulate merging remoteBytes into localDbBytes
      localDbBytes = new Uint8Array([...localDbBytes, ...remoteBytes]);
    });
    const afterImport = vi.fn().mockResolvedValue(undefined);

    const client = createSyncClient({
      appId: "mark",
      baseUrl: "/sync",
      state,
      exportDatabase: async () => localDbBytes,
      importDatabase: async () => undefined,
      mergeDatabase,
      afterImport,
    });

    await client.createSyncVault();
    expect(runtime.lastSeenRevision).toBe("revision-1");

    // Local changes happen while remote has revision-2
    runtime = { ...runtime, hasLocalChanges: true };

    const { encryptSnapshot } = await import("./crypto");
    const remoteEncrypted = await encryptSnapshot(config!, new Uint8Array([9, 9]));

    vi.mocked(fetch)
      // 1. listRevisions -> ["revision-2"]
      .mockResolvedValueOnce(new Response(JSON.stringify({ revisions: ["revision-2"] }), {
        status: 200, headers: { "Content-Type": "application/json" },
      }))
      // 2. downloadLatest -> remote snapshot
      .mockResolvedValueOnce(new Response(remoteEncrypted, {
        status: 200,
        headers: { "Content-Type": "application/octet-stream", "ETag": "revision-2" },
      }))
      // 3. uploadSnapshot -> merged revision-3
      .mockResolvedValueOnce(new Response(JSON.stringify({ revision: "revision-3" }), {
        status: 201, headers: { "Content-Type": "application/json" },
      }));

    await client.syncNow();

    expect(mergeDatabase).toHaveBeenCalledWith(new Uint8Array([9, 9]));
    expect(afterImport).toHaveBeenCalled();
    expect(runtime).toMatchObject({
      lastSeenRevision: "revision-3",
      hasLocalChanges: false,
    });
  });

  it("keeps hasLocalChanges: true and schedules follow-up sync when local mutations occur during upload", async () => {
    vi.useFakeTimers();
    let config: SyncConfig | undefined;
    let runtime: SyncRuntimeState = {
      ...defaultRuntimeState(),
      lastSeenRevision: "revision-1",
      hasLocalChanges: true,
      pendingGeneration: 1,
    };
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
      markSyncDirty: async () => { runtime = { ...runtime, hasLocalChanges: true, pendingGeneration: runtime.pendingGeneration + 1 }; },
      getPendingUpload: async () => undefined,
      setPendingUpload: async () => undefined,
      clearPendingUpload: async () => undefined,
      getPrefetchedSnapshot: async () => undefined,
      setPrefetchedSnapshot: async () => undefined,
      clearPrefetchedSnapshot: async () => undefined,
    } as unknown as SyncState;

    const { deriveSyncConfig, generateSyncSecret } = await import("./crypto");
    config = await deriveSyncConfig("mark", generateSyncSecret(), "/sync");

    let exportCount = 0;
    const client = createSyncClient({
      appId: "mark",
      baseUrl: "/sync",
      state,
      exportDatabase: async () => {
        exportCount++;
        return new Uint8Array([exportCount]);
      },
      importDatabase: async () => undefined,
    });

    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ revisions: ["revision-1"] }), {
        status: 200, headers: { "Content-Type": "application/json" },
      }))
      .mockImplementationOnce(async () => {
        // Simulate concurrent mutation while upload is in flight:
        await state.markSyncDirty();
        return new Response(JSON.stringify({ revision: "revision-2" }), {
          status: 201, headers: { "Content-Type": "application/json" },
        });
      })
      .mockResolvedValueOnce(new Response(JSON.stringify({ revisions: ["revision-2"] }), {
        status: 200, headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ revision: "revision-3" }), {
        status: 201, headers: { "Content-Type": "application/json" },
      })));

    await client.syncNow();

    // First upload completed with revision-2, but generation changed, so hasLocalChanges remains true
    expect(runtime.lastSeenRevision).toBe("revision-2");
    expect(runtime.hasLocalChanges).toBe(true);

    // Fast-forward debounce timer (1500ms) and await the scheduled follow-up sync
    await vi.advanceTimersByTimeAsync(1500);
    await client.syncNow();

    // Second upload finished with revision-3, hasLocalChanges now false
    expect(runtime.lastSeenRevision).toBe("revision-3");
    expect(runtime.hasLocalChanges).toBe(false);
    vi.useRealTimers();
  });

  it("updates lastSeenRevision and schedules retry when upload of merged snapshot gets a 409 conflict", async () => {
    vi.useFakeTimers();
    let config: SyncConfig | undefined;
    let runtime: SyncRuntimeState = {
      ...defaultRuntimeState(),
      lastSeenRevision: "revision-1",
      hasLocalChanges: true,
      pendingGeneration: 1,
    };
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
      markSyncDirty: async () => { runtime = { ...runtime, hasLocalChanges: true, pendingGeneration: runtime.pendingGeneration + 1 }; },
      getPendingUpload: async () => undefined,
      setPendingUpload: async () => undefined,
      clearPendingUpload: async () => undefined,
      getPrefetchedSnapshot: async () => undefined,
      setPrefetchedSnapshot: async () => undefined,
      clearPrefetchedSnapshot: async () => undefined,
    } as unknown as SyncState;

    const { deriveSyncConfig, generateSyncSecret, encryptSnapshot } = await import("./crypto");
    config = await deriveSyncConfig("mark", generateSyncSecret(), "/sync");

    const remoteEncrypted2 = await encryptSnapshot(config, new Uint8Array([2, 2]));
    const remoteEncrypted3 = await encryptSnapshot(config, new Uint8Array([3, 3]));

    const mergeDatabase = vi.fn().mockResolvedValue(undefined);

    const client = createSyncClient({
      appId: "mark",
      baseUrl: "/sync",
      state,
      exportDatabase: async () => new Uint8Array([1, 2, 3]),
      importDatabase: async () => undefined,
      mergeDatabase,
    });

    vi.stubGlobal("fetch", vi.fn()
      // Pass 1:
      // 1. listRevisions -> ["revision-2"]
      .mockResolvedValueOnce(new Response(JSON.stringify({ revisions: ["revision-2"] }), {
        status: 200, headers: { "Content-Type": "application/json" },
      }))
      // 2. downloadLatest -> revision-2
      .mockResolvedValueOnce(new Response(remoteEncrypted2, {
        status: 200,
        headers: { "Content-Type": "application/octet-stream", "ETag": "revision-2" },
      }))
      // 3. uploadSnapshot with If-Match: revision-2 -> 409 Conflict
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Conflict" }), {
        status: 409, headers: { "Content-Type": "application/json" },
      }))
      // Pass 2 (Retry scheduled by scheduleSync):
      // 4. listRevisions -> ["revision-3"]
      .mockResolvedValueOnce(new Response(JSON.stringify({ revisions: ["revision-3"] }), {
        status: 200, headers: { "Content-Type": "application/json" },
      }))
      // 5. downloadLatest -> revision-3
      .mockResolvedValueOnce(new Response(remoteEncrypted3, {
        status: 200,
        headers: { "Content-Type": "application/octet-stream", "ETag": "revision-3" },
      }))
      // 6. uploadSnapshot with If-Match: revision-3 -> 201 Created revision-4
      .mockResolvedValueOnce(new Response(JSON.stringify({ revision: "revision-4" }), {
        status: 201, headers: { "Content-Type": "application/json" },
      })));

    await client.syncNow();

    // After pass 1, 409 conflict updated lastSeenRevision to revision-2, keeping hasLocalChanges: true
    expect(runtime.lastSeenRevision).toBe("revision-2");
    expect(runtime.hasLocalChanges).toBe(true);
    expect(mergeDatabase).toHaveBeenCalledWith(new Uint8Array([2, 2]));

    // Fast-forward debounce timer (1500ms) and await the scheduled retry
    await vi.advanceTimersByTimeAsync(1500);
    await client.syncNow();

    // After retry pass, revision-3 was merged and revision-4 was uploaded
    expect(runtime.lastSeenRevision).toBe("revision-4");
    expect(runtime.hasLocalChanges).toBe(false);
    expect(mergeDatabase).toHaveBeenCalledWith(new Uint8Array([3, 3]));
    vi.useRealTimers();
  });
});
