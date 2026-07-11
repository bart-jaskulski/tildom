import { describe, expect, it } from "vitest";
import { shouldHandleOfflineNavigation } from "./serviceWorkerRouting";

describe("serviceWorkerRouting", () => {
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
});
