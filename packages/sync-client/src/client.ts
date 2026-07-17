import { createSignal } from "solid-js";
import { decryptSnapshot, deriveSyncConfig, encryptSnapshot, generateSyncSecret } from "./crypto";
import { defaultRuntimeState, type SyncState } from "./state";
import { downloadLatest, listRevisions, toArrayBuffer, uploadSnapshot } from "./transport";

type Options = {
  appId: string;
  baseUrl: string;
  state: SyncState;
  exportDatabase: () => Promise<ArrayBuffer | Uint8Array>;
  importDatabase: (bytes: Uint8Array) => Promise<void>;
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

  const storePending = async (config: NonNullable<Awaited<ReturnType<SyncState["getSyncConfig"]>>>, revision: string | null) => {
    const runtime = await options.state.getSyncRuntime();
    const encrypted = await encryptSnapshot(config, new Uint8Array(await options.exportDatabase()));
    await options.state.setPendingUpload({ revision, generation: runtime.pendingGeneration, createdAt: Date.now(), body: toArrayBuffer(encrypted) });
    await options.queueBackgroundSync?.().catch(() => undefined);
  };

  const syncNow = async () => {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const config = await options.state.getSyncConfig();
      if (!config) {
        inFlight = null;
        await refreshSyncState();
        return;
      }
      setStatus("syncing"); setStatusText("syncing");
      try {
        const prefetched = await options.state.getPrefetchedSnapshot();
        if (prefetched) {
          if ((await options.state.getSyncRuntime()).lastSeenRevision !== prefetched.revision) {
            await importRemote(config, prefetched.revision, new Uint8Array(prefetched.body));
          }
          await options.state.clearPrefetchedSnapshot();
        }
        const runtime = await options.state.getSyncRuntime();
        const latest = (await listRevisions(config))[0] ?? null;
        if (runtime.hasLocalChanges) {
          if (latest && latest !== runtime.lastSeenRevision) {
            const remote = await downloadLatest(config);
            if (remote) await importRemote(config, remote.revision, remote.body);
            return;
          }
          const encrypted = await encryptSnapshot(config, new Uint8Array(await options.exportDatabase()));
          const revision = await uploadSnapshot(config, toArrayBuffer(encrypted), runtime.lastSeenRevision);
          if (!revision) {
            const remote = await downloadLatest(config);
            if (remote) await importRemote(config, remote.revision, remote.body);
            return;
          }
          await options.state.clearPendingUpload();
          await options.state.setSyncRuntime({ ...runtime, lastSeenRevision: revision, hasLocalChanges: false, lastSyncedAt: Date.now(), lastError: null });
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
