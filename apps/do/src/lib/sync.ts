import { createStore } from "solid-js/store";

type SyncStatus = "idle" | "syncing" | "error";

interface SyncState {
  status: SyncStatus;
  lastSyncTimestamp: number | null;
  changesetCounter: number;
}

const [syncState, setSyncState] = createStore<SyncState>({
  status: "idle",
  lastSyncTimestamp: null,
  changesetCounter: 0,
});

export const syncStateStore = syncState;

export const incrementChangesetCounter = async (): Promise<void> => {
  // No-op in stubbed local-only mode
};

export const syncNow = async (): Promise<void> => {
  // No-op in stubbed local-only mode
};

export const initializeSync = async (): Promise<void> => {
  // No-op in stubbed local-only mode
};
