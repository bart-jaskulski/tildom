import type { SyncConfig } from "./state";

export const syncEndpoint = (config: SyncConfig, suffix = "") =>
  `${config.baseUrl.replace(/\/$/, "")}/v1/apps/${config.appId}/vaults/${config.vaultId}/snapshots${suffix}`;

export const syncHeaders = (config: SyncConfig) => ({ Authorization: `Bearer ${config.bearerToken}` });

export const listRevisions = async (config: SyncConfig) => {
  const response = await fetch(syncEndpoint(config), { headers: syncHeaders(config) });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`Sync list failed (${response.status})`);
  const body = await response.json() as { revisions?: unknown };
  return Array.isArray(body.revisions) ? body.revisions.filter((item): item is string => typeof item === "string") : [];
};

export const downloadLatest = async (config: SyncConfig) => {
  const response = await fetch(syncEndpoint(config, "/latest"), { headers: syncHeaders(config) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Sync download failed (${response.status})`);
  const revision = response.headers.get("x-tildom-revision") || response.headers.get("etag");
  if (!revision) throw new Error("Sync download missing revision");
  return { revision, body: new Uint8Array(await response.arrayBuffer()) };
};

export const uploadSnapshot = async (config: SyncConfig, body: ArrayBuffer, expectedRevision: string | null) => {
  const response = await fetch(syncEndpoint(config), {
    method: "POST",
    headers: {
      ...syncHeaders(config),
      "Content-Type": "application/octet-stream",
      ...(expectedRevision ? { "If-Match": expectedRevision } : { "If-None-Match": "*" }),
    },
    body,
  });
  if (response.status === 409) return null;
  if (!response.ok) throw new Error(`Sync upload failed (${response.status})`);
  const result = await response.json() as { revision?: unknown };
  if (typeof result.revision !== "string") throw new Error("Sync upload missing revision");
  return result.revision;
};

export const toArrayBuffer = (bytes: Uint8Array) => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
};
