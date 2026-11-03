import { describe, expect, it } from "vitest";
import { encryptPayload, decryptPayload } from "~/lib/pushCrypto";

describe("pushCrypto", () => {
  it("encrypts and decrypts payload with a provided key", async () => {
    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );

    const payload = {
      title: "Birthday today",
      body: "Today is Alice's birthday!",
    };

    const ciphertext = await encryptPayload(payload, key);
    expect(typeof ciphertext).toBe("string");
    expect(ciphertext.length).toBeGreaterThan(20);
    // Ensure plaintext is not exposed in base64
    expect(atob(ciphertext)).not.toContain("Alice");

    const decrypted = await decryptPayload(ciphertext, key);
    expect(decrypted).toEqual(payload);
  });

  it("fails to decrypt when using an incorrect key", async () => {
    const key1 = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
    const key2 = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );

    const payload = { title: "Title", body: "Body" };
    const ciphertext = await encryptPayload(payload, key1);

    await expect(decryptPayload(ciphertext, key2)).rejects.toThrow();
  });

  it("fails to decrypt invalid or truncated ciphertext", async () => {
    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );

    await expect(decryptPayload("short", key)).rejects.toThrow();
  });
});
