import { describe, expect, it } from "vitest";
import { unwrapSuiteKey, wrapSuiteKey } from "./passkey";
import { generateRecoveryKey } from "./suite";

describe("passkey suite-key wrapping", () => {
  it("round trips only with the same PRF output", async () => {
    const recoveryKey = generateRecoveryKey();
    const prf = crypto.getRandomValues(new Uint8Array(32));
    const wrapped = await wrapSuiteKey(recoveryKey, prf);
    expect(await unwrapSuiteKey(wrapped, prf)).toBe(recoveryKey);
    await expect(unwrapSuiteKey(wrapped, crypto.getRandomValues(new Uint8Array(32)))).rejects.toThrow("Could not unlock");
  });
});
