import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateSyncSecret } from "./crypto";
import { createSuiteKeyringClient, deriveSuiteAppSecret, generateRecoveryKey, parseRecoveryKey } from "./suite";

describe("suite recovery crypto", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("parses generated keys and derives isolated stable app secrets", async () => {
    const recoveryKey = generateRecoveryKey();
    expect(parseRecoveryKey(recoveryKey)).toHaveLength(43);
    expect(await deriveSuiteAppSecret(recoveryKey, "mark")).toBe(await deriveSuiteAppSecret(recoveryKey, "mark"));
    expect(await deriveSuiteAppSecret(recoveryKey, "mark")).not.toBe(await deriveSuiteAppSecret(recoveryKey, "kin"));
  });

  it("rejects malformed keys and app IDs", async () => {
    expect(() => parseRecoveryKey("nope")).toThrow("Invalid recovery key");
    await expect(deriveSuiteAppSecret(generateRecoveryKey(), "../mark")).rejects.toThrow("Invalid app ID");
  });

  it("handles suite keyring creation, registration, conflicts, and resolution", async () => {
    const recoveryKey = generateRecoveryKey();
    const appSecret = generateSyncSecret();
    let remoteRevision: string | null = null;
    let remoteBody: ArrayBuffer | null = null;

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") {
        const ifNoneMatch = (init.headers as Record<string, string>)["If-None-Match"];
        if (ifNoneMatch === "*" && remoteRevision !== null) {
          return new Response(null, { status: 409 });
        }
        remoteRevision = "rev-" + Math.random().toString(36).slice(2);
        remoteBody = init.body as ArrayBuffer;
        return new Response(JSON.stringify({ revision: remoteRevision }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/latest")) {
        if (!remoteBody || !remoteRevision) return new Response(null, { status: 404 });
        return new Response(remoteBody, {
          status: 200,
          headers: { "x-tildom-revision": remoteRevision },
        });
      }
      return new Response(null, { status: 404 });
    }));

    const client = await createSuiteKeyringClient(recoveryKey, "http://sync.test");

    // Initially 404
    const initial = await client.read();
    expect(initial.revision).toBeNull();
    expect(initial.keyring.appSecrets).toEqual({});

    // create() uploads initial empty keyring
    const createdRev = await client.create();
    expect(createdRev).toMatch(/^rev-/);

    // Second create() should fail with 409
    await expect(client.create()).rejects.toThrow("Suite keyring already exists");

    // Rejects invalid app ID or invalid app secret
    await expect(client.registerAppSecret("invalid!", appSecret)).rejects.toThrow("Invalid app ID");
    await expect(client.registerAppSecret("mark", "too-short")).rejects.toThrow("Invalid app secret");

    // Registers mark app secret
    const updatedRev = await client.registerAppSecret("mark", appSecret);
    expect(updatedRev).toMatch(/^rev-/);

    // Resolves registered secret for mark
    expect(await client.resolveAppSecret("mark")).toBe(appSecret);

    // Resolves derived fallback for kin
    const kinDerived = await deriveSuiteAppSecret(recoveryKey, "kin");
    expect(await client.resolveAppSecret("kin")).toBe(kinDerived);

    // Rejects conflicting secret for mark
    const otherSecret = generateSyncSecret();
    await expect(client.registerAppSecret("mark", otherSecret)).rejects.toThrow("Conflicting suite secret for mark");
  });
});
