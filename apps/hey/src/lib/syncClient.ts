import { createSyncClient } from "@tildom/sync-client";
import { exportDatabase, importDatabase } from "./db";
import { syncState } from "./syncState";

const configuredBaseUrl = import.meta.env.VITE_SYNC_BASE_URL as string | undefined;
const baseUrl = configuredBaseUrl || (import.meta.env.DEV ? "/sync" : "");

const client = createSyncClient({
  appId: "hey",
  baseUrl,
  state: syncState,
  exportDatabase,
  importDatabase,
  afterImport: async () => window.setTimeout(() => window.location.reload()),
});

export const syncSignals = client.signals;
export const {
  createSyncVault,
  disconnectSync,
  initializeSync,
  joinSyncVault,
  refreshSyncState,
  syncNow,
} = client;
