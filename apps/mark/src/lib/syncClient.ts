import { createSyncClient } from "@tildom/sync-client";
import { exportDatabase, importDatabase } from "./db";
import { syncState, SYNC_BACKGROUND_TAG } from "./syncState";
import { refreshEntries } from "~/stores/entryStore";

const configuredBaseUrl = import.meta.env.VITE_SYNC_BASE_URL as string | undefined;
const baseUrl = configuredBaseUrl || (import.meta.env.DEV ? "/sync" : "");

const requestPrefetch = () => navigator.serviceWorker?.ready
  .then((registration) => registration.active?.postMessage({ type: "MARK_SYNC_PREFETCH" }))
  .catch(() => undefined);

const client = createSyncClient({
  appId: "mark",
  baseUrl,
  state: syncState,
  exportDatabase,
  importDatabase,
  afterImport: refreshEntries,
  queueBackgroundSync: async () => {
    const registration = await navigator.serviceWorker?.ready;
    const backgroundSync = registration && "sync" in registration
      ? (registration as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } }).sync
      : null;
    if (backgroundSync) await backgroundSync.register(SYNC_BACKGROUND_TAG);
    else requestPrefetch();
  },
  requestPrefetch,
});

export const syncSignals = client.signals;
export const {
  createSyncVault, disconnectSync, initializeSync, joinSyncVault, refreshSyncState, scheduleSync, syncNow,
} = client;
