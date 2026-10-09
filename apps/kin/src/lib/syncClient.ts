import { createSyncClient } from "@tildom/sync-client";
import { db } from "./db";
import { syncState } from "./syncState";
import { refreshContacts } from "~/stores/contactStore";

const configuredBaseUrl = import.meta.env.VITE_SYNC_BASE_URL as string | undefined;
const baseUrl = configuredBaseUrl || (import.meta.env.DEV ? "/sync" : "");

const client = createSyncClient({
  appId: "kin",
  baseUrl,
  state: syncState,
  exportDatabase: db.exportDatabase,
  importDatabase: db.importDatabase,
  afterImport: refreshContacts,
});

export const syncSignals = client.signals;
export const {
  createSyncVault, disconnectSync, initializeSync, joinSyncVault, refreshSyncState, syncNow,
} = client;
