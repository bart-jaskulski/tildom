import { base64UrlDecode, base64UrlEncode } from "./crypto";
import { parseRecoveryKey } from "./suite";

const encoder = new TextEncoder();
const SALT = encoder.encode("tildom-passkey-wrap-v1");
const AAD = encoder.encode("tildom:suite-key:v1");

export type WrappedSuiteKey = { version: 1; iv: string; ciphertext: string };

const buffer = (bytes: Uint8Array) => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
};

const wrappingKey = async (prfOutput: Uint8Array) => {
  if (prfOutput.byteLength !== 32) throw new Error("Invalid passkey PRF output");
  const material = await crypto.subtle.importKey("raw", buffer(prfOutput), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: SALT, info: AAD }, material,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
};

export const wrapSuiteKey = async (recoveryKey: string, prfOutput: Uint8Array): Promise<WrappedSuiteKey> => {
  parseRecoveryKey(recoveryKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: AAD },
    await wrappingKey(prfOutput), encoder.encode(recoveryKey));
  return { version: 1, iv: base64UrlEncode(iv), ciphertext: base64UrlEncode(new Uint8Array(ciphertext)) };
};

export const unwrapSuiteKey = async (wrapped: WrappedSuiteKey, prfOutput: Uint8Array) => {
  if (wrapped.version !== 1) throw new Error("Invalid wrapped suite key");
  try {
    const plaintext = await crypto.subtle.decrypt({
      name: "AES-GCM", iv: base64UrlDecode(wrapped.iv), additionalData: AAD,
    }, await wrappingKey(prfOutput), buffer(base64UrlDecode(wrapped.ciphertext)));
    const recoveryKey = new TextDecoder().decode(plaintext);
    parseRecoveryKey(recoveryKey);
    return recoveryKey;
  } catch {
    throw new Error("Could not unlock suite key");
  }
};
