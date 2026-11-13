import { createSignal } from "solid-js";
import { decryptSnapshot, deriveSyncConfig, encryptSnapshot, generateSyncSecret } from "./crypto";
import { defaultRuntimeState, type SyncRuntimeState, type SyncState } from "./state";
import { downloadLatest, listRevisions, toArrayBuffer, uploadSnapshot } from "./transport";

type Options = {
  appId: string;
  baseUrl: string;
  state: SyncState;
  exportDatabase: () => Promise<ArrayBuffer | Uint8Array>;
  importDatabase: (bytes: Uint8Array) => Promise<void>;
  mergeDatabase?: (bytes: Uint8Array) => Promise<void>;
  afterImport?: () => Promise<void>;
  queueBackgroundSync?: () => Promise<void>;
  requestPrefetch?: () => void;
};

export const createSyncClient = (options: Options) => {
  const [status, setStatus] = createSignal<"unpaired" | "idle" | "syncing" | "error">("unpaired");
  const [statusText, setStatusText] = createSignal("sync disabled");
  const [isPaired, setIsPaired] = createSignal(false);
  const [lastSeenRevision, setLastSeenRevision] = createSignal<string | null>(null);
  const [hasLocalChanges, setHasLocalChanges] = createSignal(false);
  const [isReady, setIsReady] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> | null = null;
  let hasPendingRun = false;

  const refreshSyncState = async () => {
    const config = await options.state.getSyncConfig();
    const runtime = await options.state.getSyncRuntime();
    setIsPaired(Boolean(config));
    setLastSeenRevision(runtime.lastSeenRevision);
    setHasLocalChanges(runtime.hasLocalChanges);
    setStatus(config ? (runtime.lastError ? "error" : "idle") : "unpaired");
    setStatusText(runtime.lastError ?? (config ? "sync idle" : "sync disabled"));
    setIsReady(true);
  };

  const importRemote = async (config: NonNullable<Awaited<ReturnType<SyncState["getSyncConfig"]>>>, revision: string, body: Uint8Array) => {
    await options.importDatabase(await decryptSnapshot(config, body));
    await options.state.setSyncRuntime({
      ...(await options.state.getSyncRuntime()), lastSeenRevision: revision, hasLocalChanges: false,
      lastSyncedAt: Date.now(), lastError: null,
    });
    await options.afterImport?.();
  };

  const mergeRemote = async (config: NonNullable<Awaited<ReturnType<SyncState["getSyncConfig"]>>>, revision: string, body: Uint8Array) => {
    const decrypted = await decryptSnapshot(config, body);
    if (options.mergeDatabase) {
      await options.mergeDatabase(decrypted);
    } else {
      await options.importDatabase(decrypted);
    }
    await options.afterImport?.();
  };

  const storePending = async (config: NonNullable<Awaited<ReturnType<SyncState["getSyncConfig"]>>>, revision: string | null) => {
    const runtime = await options.state.getSyncRuntime();
    const encrypted = await encryptSnapshot(config, new Uint8Array(await options.exportDatabase()));
    await options.state.setPendingUpload({ revision, generation: runtime.pendingGeneration, createdAt: Date.now(), body: toArrayBuffer(encrypted) });
    await options.queueBackgroundSync?.().catch(() => undefined);
  };

  const finalizeUploadSuccess = async (newRevision: string, baseRuntime: SyncRuntimeState) => {
    await options.state.clearPendingUpload();
    const current = await options.state.getSyncRuntime();
    const hasMoreLocalChanges = current.pendingGeneration !== baseRuntime.pendingGeneration;
    await options.state.setSyncRuntime({
      ...current,
      lastSeenRevision: newRevision,
      hasLocalChanges: hasMoreLocalChanges,
      lastSyncedAt: Date.now(),
      lastError: null,
    });
    if (hasMoreLocalChanges) {
      scheduleSync();
    }
  };

  const syncNow = async () => {
    if (inFlight) {
      hasPendingRun = true;
      return inFlight;
    }
    inFlight = (async () => {
      try {
        const config = await options.state.getSyncConfig();
        if (!config) {
          return;
        }
        setStatus("syncing"); setStatusText("syncing");
        const prefetched = await options.state.getPrefetchedSnapshot();
        if (prefetched) {
          try {
            const currentRuntime = await options.state.getSyncRuntime();
            if (currentRuntime.lastSeenRevision !== prefetched.revision) {
              if (currentRuntime.hasLocalChanges && options.mergeDatabase) {
                await mergeRemote(config, prefetched.revision, new Uint8Array(prefetched.body));
                const freshRuntime = await options.state.getSyncRuntime();
                await options.state.setSyncRuntime({
                  ...freshRuntime,
                  lastSeenRevision: prefetched.revision,
                  hasLocalChanges: true,
                  lastSyncedAt: Date.now(),
                  lastError: null,
                });
              } else if (!currentRuntime.hasLocalChanges) {
                await importRemote(config, prefetched.revision, new Uint8Array(prefetched.body));
              }
            }
          } finally {
            await options.state.clearPrefetchedSnapshot();
          }
        }

        const runtime = await options.state.getSyncRuntime();
        const latest = (await listRevisions(config))[0] ?? null;

        if (runtime.hasLocalChanges) {
          if (latest && latest !== runtime.lastSeenRevision) {
            const remote = await downloadLatest(config);
            if (remote) {
              if (options.mergeDatabase) {
                await mergeRemote(config, remote.revision, remote.body);
                const encrypted = await encryptSnapshot(config, new Uint8Array(await options.exportDatabase()));
                const mergedRevision = await uploadSnapshot(config, toArrayBuffer(encrypted), remote.revision);
                if (mergedRevision) {
                  await finalizeUploadSuccess(mergedRevision, runtime);
                  return;
                }
                const current = await options.state.getSyncRuntime();
                await options.state.setSyncRuntime({ ...current, lastSeenRevision: remote.revision });
                scheduleSync();
                return;
              }
              await importRemote(config, remote.revision, remote.body);
              return;
            }
          }

          const encrypted = await encryptSnapshot(config, new Uint8Array(await options.exportDatabase()));
          const revision = await uploadSnapshot(config, toArrayBuffer(encrypted), runtime.lastSeenRevision);
          if (!revision) {
            const remote = await downloadLatest(config);
            if (!remote) {
              throw new Error("Sync upload conflict, but remote revision is unavailable");
            }
            if (options.mergeDatabase) {
              await mergeRemote(config, remote.revision, remote.body);
              const mergedEncrypted = await encryptSnapshot(config, new Uint8Array(await options.exportDatabase()));
              const mergedRev = await uploadSnapshot(config, toArrayBuffer(mergedEncrypted), remote.revision);
              if (mergedRev) {
                await finalizeUploadSuccess(mergedRev, runtime);
                return;
              }
              const current = await options.state.getSyncRuntime();
              await options.state.setSyncRuntime({ ...current, lastSeenRevision: remote.revision });
              scheduleSync();
              return;
            }
            await importRemote(config, remote.revision, remote.body);
            return;
          }
          await finalizeUploadSuccess(revision, runtime);
        } else if (latest && latest !== runtime.lastSeenRevision) {
          const remote = await downloadLatest(config);
          if (remote) await importRemote(config, remote.revision, remote.body);
        }
      } catch (error) {
        const config = await options.state.getSyncConfig();
        const runtime = await options.state.getSyncRuntime();
        if (config && runtime.hasLocalChanges) await storePending(config, runtime.lastSeenRevision).catch(() => undefined);
        await options.state.updateSyncRuntime((state) => ({ ...state, lastError: error instanceof Error ? error.message : "Sync failed" }));
      } finally {
        inFlight = null;
        await refreshSyncState();
        if (hasPendingRun) {
          hasPendingRun = false;
          void syncNow();
        }
      }
    })();
    return inFlight;
  };

  const scheduleSync = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), 1500);
  };

  return {
    signals: { status, statusText, isPaired, lastSeenRevision, hasLocalChanges, isReady },
    refreshSyncState,
    syncNow,
    scheduleSync,
    createSyncVault: async () => {
      if (!options.baseUrl) throw new Error("VITE_SYNC_BASE_URL is required for production sync");
      const config = await deriveSyncConfig(options.appId, generateSyncSecret(), options.baseUrl);
      await options.state.setSyncConfig(config);
      await options.state.markSyncDirty();
      await syncNow();
      return config;
    },
    joinSyncVault: async (secret: string) => {
      if (!options.baseUrl) throw new Error("VITE_SYNC_BASE_URL is required for production sync");
      const config = await deriveSyncConfig(options.appId, secret, options.baseUrl);
      await options.state.setSyncConfig(config);
      await options.state.setSyncRuntime(defaultRuntimeState());
      const remote = await downloadLatest(config);
      if (remote) await importRemote(config, remote.revision, remote.body);
      else {
        await options.state.markSyncDirty();
        await syncNow();
      }
      await refreshSyncState();
      return config;
    },
    disconnectSync: async () => { await options.state.clearSyncConfig(); await refreshSyncState(); },
    initializeSync: async () => {
      await refreshSyncState();
      window.addEventListener(options.state.dirtyEvent, scheduleSync);
      window.addEventListener("online", () => void syncNow());
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void syncNow(); });
      window.addEventListener("pagehide", () => void syncNow());
      await syncNow();
      options.requestPrefetch?.();
    },
  };
};
