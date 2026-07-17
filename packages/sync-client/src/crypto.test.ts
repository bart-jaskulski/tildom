import { describe, expect, it } from "vitest";
import { decryptSnapshot, deriveSyncConfig, encryptSnapshot, generateSyncSecret } from "./crypto";

describe("snapshot crypto", () => {
  it("round trips bytes and keeps apps isolated", async () => {
    const secret = generateSyncSecret();
    const kin = await deriveSyncConfig("kin", secret, "/sync");
    const encrypted = await encryptSnapshot(kin, new Uint8Array([1, 2, 3]));
    expect(await decryptSnapshot(kin, encrypted)).toEqual(new Uint8Array([1, 2, 3]));
    await expect(decryptSnapshot({ ...kin, appId: "mark" }, encrypted)).rejects.toThrow("another app");
  });
});
