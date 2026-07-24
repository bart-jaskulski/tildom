/// <reference lib="webworker" />

import {
  shouldHandleOfflineNavigation,
} from "~/lib/serviceWorkerRouting";
import {
  SYNC_BACKGROUND_TAG,
  syncState,
} from "~/lib/syncState";
import { createSyncWorker } from "@tildom/sync-client/service-worker";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

const NAVIGATION_CACHE_NAME = "hn-links-navigation-v1";
const STATIC_CACHE_NAME = "hn-links-static-v1";
const ROOT_DOCUMENT_PATH = "/";
const STATIC_PWA_ASSET_PATHS = self.__WB_MANIFEST.map(({ url }) => `/${url.replace(/^\/+/, "")}`);

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

const { prefetchLatestSnapshot, runBackgroundSync } = createSyncWorker(syncState);

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(Promise.all([
    cacheAppShell(),
    caches.open(STATIC_CACHE_NAME).then((cache) => cache.addAll(STATIC_PWA_ASSET_PATHS)),
  ]));
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
