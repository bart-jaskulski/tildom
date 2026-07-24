/// <reference lib="webworker" />

import { shouldHandleOfflineNavigation } from "~/lib/serviceWorkerRouting";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

const NAVIGATION_CACHE = "hey-navigation-v1";
const STATIC_CACHE = "hey-static-v1";
const STATIC_ASSETS = self.__WB_MANIFEST.map(({ url }) => `/${url.replace(/^\/+/, "")}`);
const scoped = (path: string) => new URL(path, self.registration.scope).toString();

const cacheShell = async () => {
  const response = await fetch(new Request(scoped("/"), { cache: "no-cache" }));
  if (response.ok && response.headers.get("content-type")?.includes("text/html")) {
    await (await caches.open(NAVIGATION_CACHE)).put(scoped("/"), response.clone());
  }
  return response;
};

const offline = () => new Response("Offline content unavailable", { status: 503 });

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(Promise.all([
    cacheShell(),
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)),
  ]));
});
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (shouldHandleOfflineNavigation(event.request.mode, url, self.location.origin)) {
    event.respondWith(
      caches.open(NAVIGATION_CACHE).then(async (cache) => {
        const cached = await cache.match(scoped("/"));
        if (cached) {
          event.waitUntil(cacheShell().catch(() => undefined));
          return cached;
        }
        return cacheShell().catch(offline);
      }),
    );
    return;
  }
  if (url.origin === self.location.origin && (url.pathname.startsWith("/assets/") || STATIC_ASSETS.includes(url.pathname))) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request, { ignoreVary: true });
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      }).catch(offline),
    );
  }
});
