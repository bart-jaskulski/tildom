import type { SyncConfig } from "./state";

const encoder = new TextEncoder();
const MAGIC = encoder.encode("TMS1");
const IV_BYTES = 12;
const SECRET_BYTES = 32;
const HKDF_SALT = encoder.encode("tildom-sync-v1");

const toArrayBuffer = (bytes: Uint8Array) => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
};

export const base64UrlEncode = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

export const base64UrlDecode = (value: string) => {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const importSecret = (secret: string) => {
  const bytes = base64UrlDecode(secret);
  if (bytes.byteLength !== SECRET_BYTES) throw new Error("Invalid sync secret");
  return crypto.subtle.importKey("raw", toArrayBuffer(bytes), "HKDF", false, ["deriveBits", "deriveKey"]);
};

const deriveBits = async (secret: string, info: string, bits: number) =>
  new Uint8Array(await crypto.subtle.deriveBits({
    name: "HKDF", hash: "SHA-256", salt: HKDF_SALT, info: encoder.encode(info),
  }, await importSecret(secret), bits));

const deriveSnapshotKey = async (config: SyncConfig) => crypto.subtle.deriveKey({
  name: "HKDF",
  hash: "SHA-256",
  salt: HKDF_SALT,
  info: encoder.encode(`${config.appId}:snapshot`),
}, await importSecret(config.secret), { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);

export const generateSyncSecret = () => {
  const secret = new Uint8Array(SECRET_BYTES);
  crypto.getRandomValues(secret);
  return base64UrlEncode(secret);
};

export const deriveSyncConfig = async (appId: string, secret: string, baseUrl: string): Promise<SyncConfig> => ({
  version: 1,
  appId,
  baseUrl,
  secret,
  vaultId: base64UrlEncode(await deriveBits(secret, `${appId}:vault-id`, 256)),
  bearerToken: base64UrlEncode(await deriveBits(secret, `${appId}:bearer-token`, 256)),
  pairedAt: Date.now(),
});

const aad = (config: SyncConfig) => encoder.encode(`tildom-sync:v1:${config.appId}:${config.vaultId}`);

export const encryptSnapshot = async (config: SyncConfig, sqliteBytes: Uint8Array) => {
  const appId = encoder.encode(config.appId);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({
    name: "AES-GCM", iv, additionalData: aad(config),
  }, await deriveSnapshotKey(config), toArrayBuffer(sqliteBytes)));
  const envelope = new Uint8Array(MAGIC.length + 1 + appId.length + IV_BYTES + ciphertext.length);
  envelope.set(MAGIC);
  envelope[MAGIC.length] = appId.length;
  envelope.set(appId, MAGIC.length + 1);
  envelope.set(iv, MAGIC.length + 1 + appId.length);
  envelope.set(ciphertext, MAGIC.length + 1 + appId.length + IV_BYTES);
  return envelope;
};

export const decryptSnapshot = async (config: SyncConfig, envelope: Uint8Array) => {
  if (envelope.byteLength < MAGIC.length + 1 + IV_BYTES || MAGIC.some((byte, index) => envelope[index] !== byte)) {
    throw new Error("Invalid sync snapshot");
  }
  const appIdEnd = MAGIC.length + 1 + (envelope[MAGIC.length] ?? 0);
  if (new TextDecoder().decode(envelope.slice(MAGIC.length + 1, appIdEnd)) !== config.appId) {
    throw new Error("Snapshot belongs to another app");
  }
  return new Uint8Array(await crypto.subtle.decrypt({
    name: "AES-GCM",
    iv: envelope.slice(appIdEnd, appIdEnd + IV_BYTES),
    additionalData: aad(config),
  }, await deriveSnapshotKey(config), toArrayBuffer(envelope.slice(appIdEnd + IV_BYTES))));
};

export const buildPairingHash = (secret: string) => `#sync=v1.${secret}`;
export const buildPairingUrl = (origin: string, secret: string) => `${new URL("/pair", origin)}${buildPairingHash(secret)}`;

export const parsePairingSecret = (hash: string) => {
  const value = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash).get("sync");
  if (!value?.startsWith("v1.")) return null;
  const secret = value.slice(3);
  try { return base64UrlDecode(secret).byteLength === SECRET_BYTES ? secret : null; } catch { return null; }
};

export const clearPairingHash = () => {
  const url = new URL(window.location.href);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
};
