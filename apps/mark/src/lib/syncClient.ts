import { createSyncClient } from "@tildom/sync-client";
import { client as databaseClient } from "./db";
import { syncState, SYNC_BACKGROUND_TAG } from "./syncState";
import { refreshEntries } from "~/stores/entryStore";
import { audioSyncError, audioSyncing, cancelAudioSync, flushCompletedAudio } from "./listenSyncQueue";

const configuredBaseUrl = import.meta.env.VITE_SYNC_BASE_URL as string | undefined;
const baseUrl = configuredBaseUrl || (import.meta.env.DEV ? "/sync" : "");

const requestPrefetch = () => navigator.serviceWorker?.ready
  .then((registration) => registration.active?.postMessage({ type: "MARK_SYNC_PREFETCH" }))
  .catch(() => undefined);

const client = createSyncClient({
  appId: "mark",
  baseUrl,
  state: syncState,
  exportDatabase: databaseClient.exportDatabase,
  importDatabase: databaseClient.importDatabase,
  afterImport: async () => { await refreshEntries(); void flushCompletedAudio(); },
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

export const syncSignals = {
  ...client.signals,
  status: () => client.signals.status() === "error" || audioSyncError() ? "error" as const : audioSyncing() ? "syncing" as const : client.signals.status(),
  statusText: () => client.signals.status() === "error" ? client.signals.statusText() : audioSyncError() || (audioSyncing() ? "Syncing article audio" : client.signals.statusText()),
};
export const { refreshSyncState, scheduleSync } = client;
export const syncNow = async () => { await client.syncNow(); await flushCompletedAudio(); };
export const initializeSync = async () => {
  await client.initializeSync();
  window.addEventListener("online", () => void flushCompletedAudio());
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void flushCompletedAudio(); });
  void flushCompletedAudio();
};
export const createSyncVault = async () => { await cancelAudioSync(); const config = await client.createSyncVault(); void flushCompletedAudio(); return config; };
export const joinSyncVault = async (secret: string) => { await cancelAudioSync(); const config = await client.joinSyncVault(secret); void flushCompletedAudio(); return config; };
export const disconnectSync = async () => { await cancelAudioSync(); await client.disconnectSync(); };
