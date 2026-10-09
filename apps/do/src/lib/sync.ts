import { createSyncClient } from "@tildom/sync-client";
import { db } from "./db";
import { syncState } from "./syncState";
import { initializeTaskStore } from "~/stores/taskStore";

const requestPrefetch = () => navigator.serviceWorker?.ready
  .then((registration) => registration.active?.postMessage({ type: "DO_SYNC_PREFETCH" }))
  .catch(() => undefined);

const client = createSyncClient({
  appId: "do",
  baseUrl: import.meta.env.VITE_SYNC_BASE_URL || (import.meta.env.DEV ? "/sync" : ""),
  state: syncState,
  exportDatabase: db.exportDatabase,
  importDatabase: db.importDatabase,
  afterImport: initializeTaskStore,
  requestPrefetch,
  queueBackgroundSync: async () => {
    const registration = await navigator.serviceWorker?.ready;
    const backgroundSync = registration && "sync" in registration
      ? (registration as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } }).sync
      : null;
    if (backgroundSync) await backgroundSync.register(syncState.backgroundTag);
    else requestPrefetch();
  },
});

export const syncSignals = client.signals;
export const { createSyncVault, joinSyncVault, disconnectSync, syncNow } = client;
let initialization: Promise<void> | undefined;
export const initializeSync = () => initialization ??= client.initializeSync();
