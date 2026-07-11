/// <reference lib="webworker" />

import {
  shouldHandleOfflineNavigation,
} from "~/lib/serviceWorkerRouting";
import {
  SYNC_APP_ID,
  SYNC_BACKGROUND_TAG,
  clearPendingUpload,
  getPendingUpload,
  getSyncConfig,
  getSyncRuntime,
  setPrefetchedSnapshot,
  setSyncRuntime,
  type SyncConfig,
} from "~/lib/syncState";

declare const self: ServiceWorkerGlobalScope;

const NAVIGATION_CACHE_NAME = "hn-links-navigation-v1";
const STATIC_CACHE_NAME = "hn-links-static-v1";
const ROOT_DOCUMENT_PATH = "/";
const STATIC_PWA_ASSET_PATHS = ["/favicon.ico", "/icon-192.png", "/icon-512.png", "/manifest.json"];

const toScopedDocumentUrl = (path: string) => new URL(path, self.registration.scope).toString();

const cacheAppShell = async () => {
  const cache = await caches.open(NAVIGATION_CACHE_NAME);
  const url = toScopedDocumentUrl(ROOT_DOCUMENT_PATH);
  const response = await fetch(new Request(url, { cache: "no-cache" }));

  if (response.ok && response.headers.get("content-type")?.includes("text/html")) {
    await cache.put(url, response.clone());
  }

  return response;
};

const shouldHandleStaticAsset = (url: URL) =>
  url.origin === self.location.origin &&
  (url.pathname.startsWith("/assets/") || STATIC_PWA_ASSET_PATHS.includes(url.pathname));

const handleStaticAsset = async (request: Request) => {
  const cache = await caches.open(STATIC_CACHE_NAME);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const response = await fetch(request);

    if (response.ok) {
      await cache.put(request, response.clone());
    }

    return response;
  } catch {
    return errorResponse();
  }
};

const handleNavigation = async (event: FetchEvent) => {
  const cache = await caches.open(NAVIGATION_CACHE_NAME);
  const appShellKey = toScopedDocumentUrl(ROOT_DOCUMENT_PATH);
  const cachedResponse = await cache.match(appShellKey);

  if (cachedResponse) {
    event.waitUntil(cacheAppShell().catch(() => undefined));
    return cachedResponse;
  }

  try {
    return await cacheAppShell();
  } catch {
    return errorResponse();
  }
};

const errorResponse = () =>
  new Response("Offline content unavailable", {
    status: 503,
    statusText: "Service Unavailable",
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });

const syncEndpoint = (config: SyncConfig, suffix = "") =>
  `${config.baseUrl.replace(/\/$/, "")}/v1/apps/${SYNC_APP_ID}/vaults/${config.vaultId}/snapshots${suffix}`;

const syncHeaders = (config: SyncConfig) => ({
  Authorization: `Bearer ${config.bearerToken}`,
});

const listRemoteRevisions = async (config: SyncConfig) => {
  const response = await fetch(syncEndpoint(config), { headers: syncHeaders(config) });
  if (!response.ok) {
    return [];
  }

  const body = await response.json() as { revisions?: unknown };
  return Array.isArray(body.revisions) ? body.revisions.filter((item): item is string => typeof item === "string") : [];
};

const prefetchLatestSnapshot = async () => {
  const config = await getSyncConfig();
  if (!config) {
    return;
  }

  const response = await fetch(syncEndpoint(config, "/latest"), { headers: syncHeaders(config) });
  if (!response.ok) {
    return;
  }

  const revision = response.headers.get("x-tildom-revision") || response.headers.get("etag");
  if (!revision || revision === (await getSyncRuntime()).lastSeenRevision) {
    return;
  }

  await setPrefetchedSnapshot({
    revision,
    fetchedAt: Date.now(),
    body: await response.arrayBuffer(),
  });
};

const uploadPendingSnapshot = async () => {
  const config = await getSyncConfig();
  const pending = await getPendingUpload();
  if (!config || !pending) {
    return;
  }

  const response = await fetch(syncEndpoint(config), {
    method: "POST",
    headers: {
      ...syncHeaders(config),
      "Content-Type": "application/octet-stream",
      ...(pending.revision ? { "If-Match": pending.revision } : { "If-None-Match": "*" }),
    },
    body: pending.body,
  });

  if (response.status === 409) {
    await clearPendingUpload();
    await setSyncRuntime({
      ...(await getSyncRuntime()),
      hasLocalChanges: false,
      lastError: null,
    });
    await prefetchLatestSnapshot();
    return;
  }

  if (!response.ok) {
    throw new Error(`Background sync upload failed (${response.status})`);
  }

  const body = await response.json() as { revision?: unknown };
  if (typeof body.revision !== "string") {
    return;
  }

  const runtime = await getSyncRuntime();
  if (runtime.pendingGeneration === pending.generation) {
    await setSyncRuntime({
      ...runtime,
      lastSeenRevision: body.revision,
      hasLocalChanges: false,
      lastSyncedAt: Date.now(),
      lastError: null,
    });
  }

  await clearPendingUpload();
};

const runBackgroundSync = async () => {
  await uploadPendingSnapshot();

  const config = await getSyncConfig();
  if (config) {
    const latest = (await listRemoteRevisions(config))[0] ?? null;
    if (latest !== (await getSyncRuntime()).lastSeenRevision) {
      await prefetchLatestSnapshot();
    }
  }
};

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(cacheAppShell().catch(() => undefined));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (!shouldHandleOfflineNavigation(request.mode, url, self.location.origin)) {
    if (shouldHandleStaticAsset(url)) {
      event.respondWith(handleStaticAsset(request));
    }

    return;
  }

  event.respondWith(handleNavigation(event));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "MARK_SYNC_PREFETCH") {
    event.waitUntil(prefetchLatestSnapshot());
  }
});

self.addEventListener("sync", ((event: ExtendableEvent & { tag: string }) => {
  if (event.tag === SYNC_BACKGROUND_TAG) {
    event.waitUntil(runBackgroundSync());
  }
}) as EventListener);
