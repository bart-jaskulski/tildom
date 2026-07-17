import { afterEach, describe, expect, it, vi } from "vitest";
import { createSyncClient } from "./client";
import { defaultRuntimeState, type SyncConfig, type SyncState } from "./state";

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
  });
});
