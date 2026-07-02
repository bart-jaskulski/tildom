export const hasStorageDirectory = (): boolean => {
  const storage = (globalThis.navigator as WorkerNavigator & {
    storage?: { getDirectory?: unknown };
  }).storage;

  return typeof storage?.getDirectory === "function";
};

export const getOpfsDiagnostics = () => ({
  secureContext: globalThis.isSecureContext,
  crossOriginIsolated: globalThis.crossOriginIsolated,
  sharedArrayBuffer: typeof globalThis.SharedArrayBuffer === "function",
  storageGetDirectory: hasStorageDirectory(),
  workerContext: typeof WorkerGlobalScope !== "undefined" && globalThis instanceof WorkerGlobalScope,
});

export const assertOpfsAvailable = (sqlite3: any): void => {
  const hasOpfsDb = typeof sqlite3.oo1?.OpfsDb === "function";
  const hasOpfsVfs = Boolean(sqlite3.capi?.sqlite3_vfs_find?.("opfs"));

  if (hasOpfsDb && hasOpfsVfs) {
    return;
  }

  const diagnostics = getOpfsDiagnostics();
  throw new Error(
    `SQLite OPFS is not available in this browser context: ${JSON.stringify({
      ...diagnostics,
      sqliteOpfsDb: hasOpfsDb,
      sqliteOpfsVfs: hasOpfsVfs,
    })}`,
  );
};
