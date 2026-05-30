import { describe, expect, it } from "vitest";
import {
  OFFLINE_DOCUMENT_PATHS,
  shouldHandleOfflineNavigation,
  toNavigationCacheKey,
} from "./serviceWorkerRouting";

describe("serviceWorkerRouting", () => {
  it("tracks the known offline-capable document routes", () => {
    expect(OFFLINE_DOCUMENT_PATHS).toEqual(["/", "/search", "/share-target", "/settings"]);
  });

  it("allows same-origin navigation requests for app routes", () => {
    expect(
      shouldHandleOfflineNavigation(
        "navigate",
        new URL("https://app.test/search"),
        "https://app.test",
      ),
    ).toBe(true);
  });

  it("rejects api requests, static files, and cross-origin navigations", () => {
    expect(
      shouldHandleOfflineNavigation(
        "navigate",
        new URL("https://app.test/api/local-only"),
        "https://app.test",
      ),
    ).toBe(false);

    expect(
      shouldHandleOfflineNavigation(
        "navigate",
        new URL("https://app.test/icon-192.png"),
        "https://app.test",
      ),
    ).toBe(false);

    expect(
      shouldHandleOfflineNavigation(
        "navigate",
        new URL("https://cdn.test/share-target"),
        "https://app.test",
      ),
    ).toBe(false);
  });

  it("normalizes navigation cache keys to pathname only", () => {
    expect(toNavigationCacheKey(new URL("https://app.test/share-target?tab=storage"))).toBe("/share-target");
  });
});
