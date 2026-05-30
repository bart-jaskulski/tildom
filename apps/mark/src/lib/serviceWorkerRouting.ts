export const OFFLINE_DOCUMENT_PATHS = ["/", "/search", "/share-target", "/settings"] as const;

const STATIC_FILE_PATTERN = /\/[^/?]+\.[^/]+$/;

export const shouldHandleOfflineNavigation = (requestMode: string, url: URL, scopeOrigin: string) => {
  if (requestMode !== "navigate") {
    return false;
  }

  if (url.origin !== scopeOrigin) {
    return false;
  }

  if (url.pathname.startsWith("/api/")) {
    return false;
  }

  if (url.pathname === "/manifest.json") {
    return false;
  }

  if (url.pathname.startsWith("/assets/")) {
    return false;
  }

  return !STATIC_FILE_PATTERN.test(url.pathname);
};

export const toNavigationCacheKey = (url: URL) => url.pathname || "/";
