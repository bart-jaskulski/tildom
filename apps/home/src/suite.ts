import {
  base64UrlDecode,
  base64UrlEncode,
  createSuiteKeyringClient,
  generateRecoveryKey,
  parseRecoveryKey,
  unwrapSuiteKey,
  wrapSuiteKey,
  type WrappedSuiteKey,
} from "@tildom/sync-client";

const DB_NAME = "tildom-suite";
const STORE_NAME = "keyval";
const PASSKEY_KEY = "passkey";
const SESSION_KEY = "tildom-suite-session";
const SESSION_MS = 15 * 60 * 1000;

export const syncBaseUrl = import.meta.env.VITE_SYNC_BASE_URL ?? (import.meta.env.DEV ? "http://localhost:8787" : "https://sync.tildom.app");

type PasskeyRecord = {
  version: 1;
  credentialId: string;
  prfInput: string;
  wrapped: WrappedSuiteKey;
};

type PrfResults = { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } } };

const bytes = (length = 32) => crypto.getRandomValues(new Uint8Array(length));

const openDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const dbGet = async <T>(key: string) => {
  const db = await openDb();
  return new Promise<T | undefined>((resolve, reject) => {
    const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  }).finally(() => db.close());
};

const dbSet = async (key: string, value: unknown) => {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  }).finally(() => db.close());
};

const prfOutput = async (credentialId: string, prfInput: string) => {
  const credential = await navigator.credentials.get({ publicKey: {
    challenge: bytes(),
    allowCredentials: [{ type: "public-key", id: base64UrlDecode(credentialId) }],
    userVerification: "required",
    extensions: { prf: { eval: { first: base64UrlDecode(prfInput) } } },
  } as PublicKeyCredentialRequestOptions });
  const first = (credential as PublicKeyCredential | null)?.getClientExtensionResults() as PrfResults | undefined;
  if (!first?.prf?.results?.first) throw new Error("This passkey does not support secure suite unlock");
  return new Uint8Array(first.prf.results.first);
};

export const hasPasskey = async () => Boolean(await dbGet<PasskeyRecord>(PASSKEY_KEY));

export const protectWithPasskey = async (recoveryKey: string) => {
  parseRecoveryKey(recoveryKey);
  if (!window.PublicKeyCredential) throw new Error("Passkeys are not supported on this device");
  const prfInput = bytes();
  const credential = await navigator.credentials.create({ publicKey: {
    rp: { id: location.hostname, name: "Tildom" },
    user: { id: bytes(), name: "tildom-suite", displayName: "Tildom suite" },
    challenge: bytes(),
    pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
    attestation: "none",
    extensions: { prf: { eval: { first: prfInput } } },
  } as PublicKeyCredentialCreationOptions }) as PublicKeyCredential | null;
  if (!credential) throw new Error("Passkey creation was cancelled");
  const credentialId = base64UrlEncode(new Uint8Array(credential.rawId));
  const encodedInput = base64UrlEncode(prfInput);
  const createResults = (credential as PublicKeyCredential).getClientExtensionResults() as PrfResults | undefined;
  const output = createResults?.prf?.results?.first
    ? new Uint8Array(createResults.prf.results.first)
    : await prfOutput(credentialId, encodedInput);
  await dbSet(PASSKEY_KEY, { version: 1, credentialId, prfInput: encodedInput,
    wrapped: await wrapSuiteKey(recoveryKey, output) } satisfies PasskeyRecord);
};

export const unlockWithPasskey = async () => {
  const record = await dbGet<PasskeyRecord>(PASSKEY_KEY);
  if (!record || record.version !== 1) throw new Error("No passkey is registered on this device");
  return unwrapSuiteKey(record.wrapped, await prfOutput(record.credentialId, record.prfInput));
};

export const startSuiteSession = (recoveryKey: string) => {
  parseRecoveryKey(recoveryKey);
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ recoveryKey, expiresAt: Date.now() + SESSION_MS }));
};

export const getSuiteSession = () => {
  try {
    const value = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null") as { recoveryKey?: unknown; expiresAt?: unknown } | null;
    if (!value || typeof value.recoveryKey !== "string" || typeof value.expiresAt !== "number" || value.expiresAt < Date.now()) throw new Error();
    parseRecoveryKey(value.recoveryKey);
    return value.recoveryKey;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
};

export const clearSuiteSession = () => sessionStorage.removeItem(SESSION_KEY);

export const createSuite = async () => {
  const recoveryKey = generateRecoveryKey();
  await (await createSuiteKeyringClient(recoveryKey, syncBaseUrl)).create();
  startSuiteSession(recoveryKey);
  return recoveryKey;
};

export const openSuite = async (recoveryKey: string) => {
  parseRecoveryKey(recoveryKey);
  const client = await createSuiteKeyringClient(recoveryKey, syncBaseUrl);
  const { revision } = await client.read();
  if (!revision) throw new Error("Suite recovery key not found on server");
  startSuiteSession(recoveryKey);
  return recoveryKey;
};
