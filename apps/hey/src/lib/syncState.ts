import { createSyncState } from "@tildom/sync-client";

export const syncState = createSyncState("hey");
export const { getSyncConfig, markSyncDirty } = syncState;
