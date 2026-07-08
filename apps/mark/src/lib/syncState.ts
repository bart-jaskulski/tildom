import { createStore, del, get, set, update } from "idb-keyval";

export const SYNC_APP_ID = "mark";
export const SYNC_IDB_NAME = "mark-sync";
export const SYNC_IDB_STORE = "keyval";
export const SYNC_BACKGROUND_TAG = "mark-sync";

export type SyncConfig = {
  version: 1;
  appId: typeof SYNC_APP_ID;
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

export const SYNC_KEYS = {
  config: "config",
  runtime: "runtime",
  pendingUpload: "pendingUpload",
  prefetchedSnapshot: "prefetchedSnapshot",
} as const;

const store = createStore(SYNC_IDB_NAME, SYNC_IDB_STORE);

export const defaultRuntimeState = (): SyncRuntimeState => ({
  lastSeenRevision: null,
  hasLocalChanges: false,
  pendingGeneration: 0,
  lastSyncedAt: null,
  lastError: null,
});

export const getSyncConfig = () => get<SyncConfig>(SYNC_KEYS.config, store);

export const setSyncConfig = (config: SyncConfig) => set(SYNC_KEYS.config, config, store);

export const clearSyncConfig = async () => {
  await Promise.all([
    del(SYNC_KEYS.config, store),
    del(SYNC_KEYS.runtime, store),
    del(SYNC_KEYS.pendingUpload, store),
    del(SYNC_KEYS.prefetchedSnapshot, store),
  ]);
};

export const getSyncRuntime = async () =>
  (await get<SyncRuntimeState>(SYNC_KEYS.runtime, store)) ?? defaultRuntimeState();

export const setSyncRuntime = (state: SyncRuntimeState) => set(SYNC_KEYS.runtime, state, store);

export const updateSyncRuntime = (updater: (state: SyncRuntimeState) => SyncRuntimeState) =>
  update<SyncRuntimeState>(SYNC_KEYS.runtime, (state) => updater(state ?? defaultRuntimeState()), store);

export const markSyncDirty = async () => {
  await updateSyncRuntime((state) => ({
    ...state,
    hasLocalChanges: true,
    pendingGeneration: state.pendingGeneration + 1,
    lastError: null,
  }));

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("mark-sync-dirty"));
  }
};

export const getPendingUpload = () => get<PendingUpload>(SYNC_KEYS.pendingUpload, store);
export const setPendingUpload = (pending: PendingUpload) => set(SYNC_KEYS.pendingUpload, pending, store);
export const clearPendingUpload = () => del(SYNC_KEYS.pendingUpload, store);

export const getPrefetchedSnapshot = () => get<PrefetchedSnapshot>(SYNC_KEYS.prefetchedSnapshot, store);
export const setPrefetchedSnapshot = (snapshot: PrefetchedSnapshot) =>
  set(SYNC_KEYS.prefetchedSnapshot, snapshot, store);
export const clearPrefetchedSnapshot = () => del(SYNC_KEYS.prefetchedSnapshot, store);
