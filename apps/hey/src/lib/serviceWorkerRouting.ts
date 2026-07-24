const STATIC_FILE_PATTERN = /\/[^/?]+\.[^/]+$/;

export const shouldHandleOfflineNavigation = (requestMode: string, url: URL, scopeOrigin: string) =>
  requestMode === "navigate" &&
  url.origin === scopeOrigin &&
  !url.pathname.startsWith("/api/") &&
  !STATIC_FILE_PATTERN.test(url.pathname);
