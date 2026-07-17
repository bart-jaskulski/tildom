import { createSyncState } from "@tildom/sync-client";

export const SYNC_APP_ID = "mark";
export const syncState = createSyncState(SYNC_APP_ID);
export const SYNC_BACKGROUND_TAG = syncState.backgroundTag;

export const {
  clearPendingUpload,
  clearPrefetchedSnapshot,
  clearSyncConfig,
  getPendingUpload,
  getPrefetchedSnapshot,
  getSyncConfig,
  getSyncRuntime,
  markSyncDirty,
  setPendingUpload,
  setPrefetchedSnapshot,
  setSyncConfig,
  setSyncRuntime,
  updateSyncRuntime,
} = syncState;

export type { PendingUpload, PrefetchedSnapshot, SyncConfig, SyncRuntimeState } from "@tildom/sync-client";
