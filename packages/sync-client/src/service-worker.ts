import type { SyncState } from "./state";
import { listRevisions, syncEndpoint, syncHeaders, uploadSnapshot } from "./transport";

export const createSyncWorker = (state: SyncState) => {
  const prefetchLatestSnapshot = async () => {
    const config = await state.getSyncConfig();
    if (!config) return;
    const response = await fetch(syncEndpoint(config, "/latest"), { headers: syncHeaders(config) });
    if (!response.ok) return;
    const revision = response.headers.get("x-tildom-revision") || response.headers.get("etag");
    if (!revision || revision === (await state.getSyncRuntime()).lastSeenRevision) return;
    await state.setPrefetchedSnapshot({ revision, fetchedAt: Date.now(), body: await response.arrayBuffer() });
  };

  const uploadPendingSnapshot = async () => {
    const config = await state.getSyncConfig();
    const pending = await state.getPendingUpload();
    if (!config || !pending) return;
    const revision = await uploadSnapshot(config, pending.body, pending.revision);
    if (!revision) {
      await state.clearPendingUpload();
      await state.setSyncRuntime({ ...(await state.getSyncRuntime()), hasLocalChanges: false, lastError: null });
      await prefetchLatestSnapshot();
      return;
    }
    const runtime = await state.getSyncRuntime();
    if (runtime.pendingGeneration === pending.generation) {
      await state.setSyncRuntime({ ...runtime, lastSeenRevision: revision, hasLocalChanges: false, lastSyncedAt: Date.now(), lastError: null });
    }
    await state.clearPendingUpload();
  };

  const runBackgroundSync = async () => {
    await uploadPendingSnapshot();
    const config = await state.getSyncConfig();
    if (config && (await listRevisions(config))[0] !== (await state.getSyncRuntime()).lastSeenRevision) {
      await prefetchLatestSnapshot();
    }
  };

  return { prefetchLatestSnapshot, runBackgroundSync };
};
