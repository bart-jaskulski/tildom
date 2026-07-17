import { createSyncState } from "@tildom/sync-client";

export const syncState = createSyncState("kin");
export const { getSyncConfig, markSyncDirty } = syncState;
