import { describe, expect, it } from "vitest";
import { shouldHandleOfflineNavigation } from "./serviceWorkerRouting";

describe("service worker routing", () => {
  it("handles app routes but not APIs, static files, or other origins", () => {
    const origin = "https://kin.test";
    expect(shouldHandleOfflineNavigation("navigate", new URL(`${origin}/person/ada`), origin)).toBe(true);
    expect(shouldHandleOfflineNavigation("navigate", new URL(`${origin}/api/people`), origin)).toBe(false);
    expect(shouldHandleOfflineNavigation("navigate", new URL(`${origin}/icon.svg`), origin)).toBe(false);
    expect(shouldHandleOfflineNavigation("navigate", new URL("https://other.test/"), origin)).toBe(false);
  });
});
