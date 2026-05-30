/// <reference lib="webworker" />

import {
  OFFLINE_DOCUMENT_PATHS,
  shouldHandleOfflineNavigation,
  toNavigationCacheKey,
} from "~/lib/serviceWorkerRouting";

declare const self: ServiceWorkerGlobalScope;

const NAVIGATION_CACHE_NAME = "hn-links-navigation-v1";
const STATIC_CACHE_NAME = "hn-links-static-v1";
const ROOT_DOCUMENT_PATH = "/";
const STATIC_PWA_ASSET_PATHS = ["/favicon.ico", "/icon-192.png", "/icon-512.png", "/manifest.json"];

const toScopedDocumentUrl = (path: string) => new URL(path, self.registration.scope).toString();

const cacheOfflineDocuments = async () => {
  const cache = await caches.open(NAVIGATION_CACHE_NAME);

  await Promise.all(
    OFFLINE_DOCUMENT_PATHS.map(async (path) => {
      try {
        const url = toScopedDocumentUrl(path);
        const response = await fetch(new Request(url, { cache: "reload" }));

        if (response.ok) {
          await cache.put(url, response.clone());
        }
      } catch {
        // Keep the install alive even if one document cannot be refreshed yet.
      }
    }),
  );
};

const cacheStaticAssets = async () => {
  const cache = await caches.open(STATIC_CACHE_NAME);

  await Promise.all(
    STATIC_PWA_ASSET_PATHS.map(async (path) => {
      try {
        const url = toScopedDocumentUrl(path);
        const response = await fetch(new Request(url, { cache: "reload" }));

        if (response.ok) {
          await cache.put(url, response.clone());
        }
      } catch {
        // Icons and manifest are optional for offline data access.
      }
    }),
  );
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

const handleNavigation = async (request: Request) => {
  const url = new URL(request.url);
  const cache = await caches.open(NAVIGATION_CACHE_NAME);
  const cacheKey = toScopedDocumentUrl(toNavigationCacheKey(url));
  const rootFallbackKey = toScopedDocumentUrl(ROOT_DOCUMENT_PATH);

  try {
    const response = await fetch(request);

    if (response.ok && response.headers.get("content-type")?.includes("text/html")) {
      await cache.put(cacheKey, response.clone());
    }

    return response;
  } catch {
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      return cachedResponse;
    }

    const rootFallback = await cache.match(rootFallbackKey);
    if (rootFallback) {
      return rootFallback;
    }

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

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(Promise.all([cacheOfflineDocuments(), cacheStaticAssets()]));
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

  event.respondWith(handleNavigation(request));
});
