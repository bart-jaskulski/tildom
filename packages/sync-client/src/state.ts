import { createStore, del, get, set, update } from "idb-keyval";

export type SyncConfig = {
  version: 1;
  appId: string;
  baseUrl: string;
  secret: string;
  vaultId: string;
  bearerToken: string;
  pairedAt: number;
};

export type SyncRuntimeState = {
  lastSeenRevision: string | null;
  hasLocalChanges: boolean;
  pendingGeneration: number;
  lastSyncedAt: number | null;
  lastError: string | null;
};

export type PendingUpload = {
  revision: string | null;
  generation: number;
  createdAt: number;
  body: ArrayBuffer;
};

export type PrefetchedSnapshot = {
  revision: string;
  fetchedAt: number;
  body: ArrayBuffer;
};

const keys = {
  config: "config",
  runtime: "runtime",
  pendingUpload: "pendingUpload",
  prefetchedSnapshot: "prefetchedSnapshot",
} as const;

export const defaultRuntimeState = (): SyncRuntimeState => ({
  lastSeenRevision: null,
  hasLocalChanges: false,
  pendingGeneration: 0,
  lastSyncedAt: null,
  lastError: null,
});

export const createSyncState = (appId: string) => {
  const store = createStore(`${appId}-sync`, "keyval");
  const dirtyEvent = `${appId}-sync-dirty`;

  const getSyncRuntime = async () =>
    (await get<SyncRuntimeState>(keys.runtime, store)) ?? defaultRuntimeState();
  const updateSyncRuntime = (updater: (state: SyncRuntimeState) => SyncRuntimeState) =>
    update<SyncRuntimeState>(keys.runtime, (state) => updater(state ?? defaultRuntimeState()), store);

  return {
    appId,
    dirtyEvent,
    backgroundTag: `${appId}-sync`,
    getSyncConfig: () => get<SyncConfig>(keys.config, store),
    setSyncConfig: (config: SyncConfig) => set(keys.config, config, store),
    clearSyncConfig: () => Promise.all(Object.values(keys).map((key) => del(key, store))).then(() => undefined),
    getSyncRuntime,
    setSyncRuntime: (state: SyncRuntimeState) => set(keys.runtime, state, store),
    updateSyncRuntime,
    markSyncDirty: async () => {
      await updateSyncRuntime((state) => ({
        ...state,
        hasLocalChanges: true,
        pendingGeneration: state.pendingGeneration + 1,
        lastError: null,
      }));
      globalThis.dispatchEvent?.(new CustomEvent(dirtyEvent));
    },
    getPendingUpload: () => get<PendingUpload>(keys.pendingUpload, store),
    setPendingUpload: (pending: PendingUpload) => set(keys.pendingUpload, pending, store),
    clearPendingUpload: () => del(keys.pendingUpload, store),
    getPrefetchedSnapshot: () => get<PrefetchedSnapshot>(keys.prefetchedSnapshot, store),
    setPrefetchedSnapshot: (snapshot: PrefetchedSnapshot) => set(keys.prefetchedSnapshot, snapshot, store),
    clearPrefetchedSnapshot: () => del(keys.prefetchedSnapshot, store),
  };
};

export type SyncState = ReturnType<typeof createSyncState>;
