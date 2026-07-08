import { SYNC_APP_ID, type SyncConfig } from "./syncState";

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
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

export const base64UrlDecode = (value: string) => {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
};

const importSecret = (secret: string) => {
  const bytes = base64UrlDecode(secret);
  if (bytes.byteLength !== SECRET_BYTES) {
    throw new Error("Invalid sync secret");
  }

  return crypto.subtle.importKey("raw", toArrayBuffer(bytes), "HKDF", false, ["deriveBits", "deriveKey"]);
};

const deriveBits = async (secret: string, info: string, bits: number) => {
  const key = await importSecret(secret);
  return new Uint8Array(await crypto.subtle.deriveBits({
    name: "HKDF",
    hash: "SHA-256",
    salt: HKDF_SALT,
    info: encoder.encode(info),
  }, key, bits));
};

const deriveSnapshotKey = async (secret: string) => {
  const key = await importSecret(secret);
  return crypto.subtle.deriveKey({
    name: "HKDF",
    hash: "SHA-256",
    salt: HKDF_SALT,
    info: encoder.encode(`${SYNC_APP_ID}:snapshot`),
  }, key, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
};

export const generateSyncSecret = () => {
  const secret = new Uint8Array(SECRET_BYTES);
  crypto.getRandomValues(secret);
  return base64UrlEncode(secret);
};

export const deriveSyncConfig = async (secret: string, baseUrl: string): Promise<SyncConfig> => ({
  version: 1,
  appId: SYNC_APP_ID,
  baseUrl,
  secret,
  vaultId: base64UrlEncode(await deriveBits(secret, `${SYNC_APP_ID}:vault-id`, 256)),
  bearerToken: base64UrlEncode(await deriveBits(secret, `${SYNC_APP_ID}:bearer-token`, 256)),
  pairedAt: Date.now(),
});

const aad = (vaultId: string) => encoder.encode(`tildom-sync:v1:${SYNC_APP_ID}:${vaultId}`);

export const encryptSnapshot = async (config: SyncConfig, sqliteBytes: Uint8Array) => {
  const appId = encoder.encode(SYNC_APP_ID);
  const iv = new Uint8Array(IV_BYTES);
  crypto.getRandomValues(iv);

  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({
    name: "AES-GCM",
    iv,
    additionalData: aad(config.vaultId),
  }, await deriveSnapshotKey(config.secret), toArrayBuffer(sqliteBytes)));

  const envelope = new Uint8Array(MAGIC.length + 1 + appId.length + IV_BYTES + ciphertext.length);
  let offset = 0;
  envelope.set(MAGIC, offset);
  offset += MAGIC.length;
  envelope[offset] = appId.length;
  offset += 1;
  envelope.set(appId, offset);
  offset += appId.length;
  envelope.set(iv, offset);
  offset += IV_BYTES;
  envelope.set(ciphertext, offset);

  return envelope;
};

export const decryptSnapshot = async (config: SyncConfig, envelope: Uint8Array) => {
  if (envelope.byteLength < MAGIC.length + 1 + IV_BYTES) {
    throw new Error("Invalid sync snapshot");
  }

  for (let i = 0; i < MAGIC.length; i += 1) {
    if (envelope[i] !== MAGIC[i]) {
      throw new Error("Invalid sync snapshot");
    }
  }

  const appIdLength = envelope[MAGIC.length] ?? 0;
  const appIdStart = MAGIC.length + 1;
  const appIdEnd = appIdStart + appIdLength;
  const appId = new TextDecoder().decode(envelope.slice(appIdStart, appIdEnd));
  if (appId !== SYNC_APP_ID) {
    throw new Error("Snapshot belongs to another app");
  }

  const iv = envelope.slice(appIdEnd, appIdEnd + IV_BYTES);
  const ciphertext = envelope.slice(appIdEnd + IV_BYTES);

  return new Uint8Array(await crypto.subtle.decrypt({
    name: "AES-GCM",
    iv,
    additionalData: aad(config.vaultId),
  }, await deriveSnapshotKey(config.secret), toArrayBuffer(ciphertext)));
};

export const buildPairingHash = (secret: string) => `#sync=v1.${secret}`;

export const buildPairingUrl = (origin: string, secret: string) => {
  const url = new URL("/pair", origin);
  return `${url.toString()}${buildPairingHash(secret)}`;
};

export const parsePairingSecret = (hash: string) => {
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
  const value = new URLSearchParams(fragment).get("sync");
  if (!value?.startsWith("v1.")) {
    return null;
  }

  const secret = value.slice(3);
  try {
    return base64UrlDecode(secret).byteLength === SECRET_BYTES ? secret : null;
  } catch {
    return null;
  }
};

export const clearPairingHash = () => {
  const url = new URL(window.location.href);
  url.hash = "";
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
};
