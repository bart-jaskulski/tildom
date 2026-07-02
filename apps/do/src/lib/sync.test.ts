import { describe, it, expect } from "vitest";
import { syncStateStore, initializeSync } from "./sync";

describe("sync stub", () => {
  it("should initialize in idle state", async () => {
    await initializeSync();
    expect(syncStateStore.status).toBe("idle");
  });
});
