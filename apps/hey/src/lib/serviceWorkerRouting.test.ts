import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shouldHandleOfflineNavigation } from "./serviceWorkerRouting.ts";

describe("service worker routing", () => {
  it("handles app routes but not APIs, static files, or other origins", () => {
    const origin = "https://hey.test";
    assert.equal(shouldHandleOfflineNavigation("navigate", new URL(`${origin}/settings`), origin), true);
    assert.equal(shouldHandleOfflineNavigation("navigate", new URL(`${origin}/api/chat`), origin), false);
    assert.equal(shouldHandleOfflineNavigation("navigate", new URL(`${origin}/icon.svg`), origin), false);
    assert.equal(shouldHandleOfflineNavigation("navigate", new URL("https://other.test/"), origin), false);
  });
});
