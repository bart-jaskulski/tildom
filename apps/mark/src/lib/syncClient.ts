import { createSignal } from "solid-js";
import { exportDatabase, importDatabase } from "./db";
import { decryptSnapshot, deriveSyncConfig, encryptSnapshot, generateSyncSecret } from "./syncCrypto";
import {
  SYNC_APP_ID,
  SYNC_BACKGROUND_TAG,
  clearPendingUpload,
  clearPrefetchedSnapshot,
  clearSyncConfig,
  getPrefetchedSnapshot,
  getSyncConfig,
  getSyncRuntime,
  markSyncDirty,
  setPendingUpload,
  setSyncConfig,
  setSyncRuntime,
  updateSyncRuntime,
  type SyncConfig,
} from "./syncState";
import { refreshEntries } from "~/stores/entryStore";

type SyncStatus = "unpaired" | "idle" | "syncing" | "error";

const configuredBaseUrl = import.meta.env.VITE_SYNC_BASE_URL as string | undefined;
const syncBaseUrl = configuredBaseUrl || (import.meta.env.DEV ? "/sync" : "");
const DEBOUNCE_MS = 1500;

const [status, setStatus] = createSignal<SyncStatus>("unpaired");
const [statusText, setStatusText] = createSignal("sync disabled");
const [isPaired, setIsPaired] = createSignal(false);
const [lastSeenRevision, setLastSeenRevision] = createSignal<string | null>(null);
const [hasLocalChanges, setHasLocalChanges] = createSignal(false);
const [isReady, setIsReady] = createSignal(false);

let timer: ReturnType<typeof setTimeout> | undefined;
let syncInFlight: Promise<void> | null = null;

const endpoint = (config: SyncConfig, suffix = "") =>
  `${config.baseUrl.replace(/\/$/, "")}/v1/apps/${SYNC_APP_ID}/vaults/${config.vaultId}/snapshots${suffix}`;

const authHeaders = (config: SyncConfig) => ({
  Authorization: `Bearer ${config.bearerToken}`,
});

const toBodyBuffer = (bytes: Uint8Array) => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
};

export const refreshSyncState = async () => {
  const config = await getSyncConfig();
  const runtime = await getSyncRuntime();
  setIsPaired(Boolean(config));
  setLastSeenRevision(runtime.lastSeenRevision);
  setHasLocalChanges(runtime.hasLocalChanges);
  setStatus(config ? (runtime.lastError ? "error" : "idle") : "unpaired");
  setStatusText(runtime.lastError ?? (config ? "sync idle" : "sync disabled"));
  setIsReady(true);
};

export const syncSignals = {
  status,
  statusText,
  isPaired,
  lastSeenRevision,
  hasLocalChanges,
  isReady,
};

export const getSyncBaseUrl = () => {
  if (!syncBaseUrl) {
    throw new Error("VITE_SYNC_BASE_URL is required for production sync");
  }

  return syncBaseUrl;
};

const listRevisions = async (config: SyncConfig) => {
  const response = await fetch(endpoint(config), { headers: authHeaders(config) });
  if (response.status === 404) {
    return [];
  }

  if (!response.ok) {
    throw new Error(`Sync list failed (${response.status})`);
  }

  const body = await response.json() as { revisions?: unknown };
  return Array.isArray(body.revisions) ? body.revisions.filter((item): item is string => typeof item === "string") : [];
};

const downloadLatest = async (config: SyncConfig) => {
  const response = await fetch(endpoint(config, "/latest"), { headers: authHeaders(config) });
  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Sync download failed (${response.status})`);
  }

  const revision = response.headers.get("x-tildom-revision") || response.headers.get("etag");
  if (!revision) {
    throw new Error("Sync download missing revision");
  }

  return {
    revision,
    body: new Uint8Array(await response.arrayBuffer()),
  };
};

const uploadSnapshot = async (
  config: SyncConfig,
  encrypted: Uint8Array,
  expectedRevision: string | null,
) => {
  const response = await fetch(endpoint(config), {
    method: "POST",
    headers: {
      ...authHeaders(config),
      "Content-Type": "application/octet-stream",
      ...(expectedRevision ? { "If-Match": expectedRevision } : { "If-None-Match": "*" }),
    },
    body: toBodyBuffer(encrypted),
  });

  if (response.status === 409) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Sync upload failed (${response.status})`);
  }

  const body = await response.json() as { revision?: unknown };
  if (typeof body.revision !== "string") {
    throw new Error("Sync upload missing revision");
  }

  return body.revision;
};

const registerBackgroundSync = async () => {
  const registration = await navigator.serviceWorker?.ready;
  const sync = registration && "sync" in registration ? (registration as ServiceWorkerRegistration & {
    sync: { register: (tag: string) => Promise<void> };
  }).sync : null;

  if (sync) {
    await sync.register(SYNC_BACKGROUND_TAG);
    return;
  }

  registration?.active?.postMessage({ type: "MARK_SYNC_PREFETCH" });
};

const storePendingUpload = async (config: SyncConfig, expectedRevision: string | null) => {
  const runtime = await getSyncRuntime();
  const encrypted = await encryptSnapshot(config, new Uint8Array(await exportDatabase()));
  await setPendingUpload({
    revision: expectedRevision,
    generation: runtime.pendingGeneration,
    createdAt: Date.now(),
    body: toBodyBuffer(encrypted),
  });
  await registerBackgroundSync().catch(() => undefined);
};

const importRemoteSnapshot = async (config: SyncConfig, revision: string, body: Uint8Array) => {
  await importDatabase(await decryptSnapshot(config, body));
  await setSyncRuntime({
    ...(await getSyncRuntime()),
    lastSeenRevision: revision,
    hasLocalChanges: false,
    lastSyncedAt: Date.now(),
    lastError: null,
  });
  await refreshEntries();
};

const applyPrefetchedSnapshot = async (config: SyncConfig) => {
  const snapshot = await getPrefetchedSnapshot();
  if (!snapshot) {
    return false;
  }

  const runtime = await getSyncRuntime();
  if (runtime.lastSeenRevision !== snapshot.revision) {
    await importRemoteSnapshot(config, snapshot.revision, new Uint8Array(snapshot.body));
  }

  await clearPrefetchedSnapshot();
  return true;
};

export const syncNow = async () => {
  if (syncInFlight) {
    return syncInFlight;
  }

  syncInFlight = (async () => {
    const config = await getSyncConfig();
    if (!config) {
      await refreshSyncState();
      return;
    }

    setStatus("syncing");
    setStatusText("syncing");

    try {
      await applyPrefetchedSnapshot(config);
      const runtime = await getSyncRuntime();
      const latest = (await listRevisions(config))[0] ?? null;

      if (runtime.hasLocalChanges) {
        if (latest && latest !== runtime.lastSeenRevision) {
          const remote = await downloadLatest(config);
          if (remote) {
            await importRemoteSnapshot(config, remote.revision, remote.body);
          }
          return;
        }

        const encrypted = await encryptSnapshot(config, new Uint8Array(await exportDatabase()));
        const uploadedRevision = await uploadSnapshot(config, encrypted, runtime.lastSeenRevision);
        if (!uploadedRevision) {
          const remote = await downloadLatest(config);
          if (remote) {
            await importRemoteSnapshot(config, remote.revision, remote.body);
          }
          return;
        }

        await clearPendingUpload();
        await setSyncRuntime({
          ...runtime,
          lastSeenRevision: uploadedRevision,
          hasLocalChanges: false,
          lastSyncedAt: Date.now(),
          lastError: null,
        });
        return;
      }

      if (latest && latest !== runtime.lastSeenRevision) {
        const remote = await downloadLatest(config);
        if (remote) {
          await importRemoteSnapshot(config, remote.revision, remote.body);
        }
      }
    } catch (error) {
      const configAfterError = await getSyncConfig();
      const runtime = await getSyncRuntime();
      if (configAfterError && runtime.hasLocalChanges) {
        await storePendingUpload(configAfterError, runtime.lastSeenRevision).catch(() => undefined);
      }

      await updateSyncRuntime((state) => ({
        ...state,
        lastError: error instanceof Error ? error.message : "Sync failed",
      }));
    } finally {
      syncInFlight = null;
      await refreshSyncState();
    }
  })();

  return syncInFlight;
};

export const scheduleSync = () => {
  if (timer) {
    clearTimeout(timer);
  }

  timer = setTimeout(() => {
    void syncNow();
  }, DEBOUNCE_MS);
};

export const createSyncVault = async () => {
  const config = await deriveSyncConfig(generateSyncSecret(), getSyncBaseUrl());
  await setSyncConfig(config);
  await markSyncDirty();
  await syncNow();
  return config;
};

export const joinSyncVault = async (secret: string) => {
  const config = await deriveSyncConfig(secret, getSyncBaseUrl());
  await setSyncConfig(config);
  await setSyncRuntime(defaultJoinRuntime());

  const remote = await downloadLatest(config);
  if (remote) {
    await importRemoteSnapshot(config, remote.revision, remote.body);
  }

  await refreshSyncState();
  return config;
};

const defaultJoinRuntime = () => ({
  lastSeenRevision: null,
  hasLocalChanges: false,
  pendingGeneration: 0,
  lastSyncedAt: null,
  lastError: null,
});

export const disconnectSync = async () => {
  await clearSyncConfig();
  await refreshSyncState();
};

export const initializeSync = async () => {
  await refreshSyncState();
  window.addEventListener("mark-sync-dirty", scheduleSync);
  window.addEventListener("online", () => void syncNow());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void syncNow();
    }
  });
  window.addEventListener("pagehide", () => void syncNow());
  await syncNow();
  navigator.serviceWorker?.ready
    .then((registration) => registration.active?.postMessage({ type: "MARK_SYNC_PREFETCH" }))
    .catch(() => undefined);
};
