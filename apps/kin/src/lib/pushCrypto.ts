const DB_NAME = "kin_push_crypto";
const STORE_NAME = "keys";
const KEY_NAME = "aes_gcm_v1";

const openCryptoDb = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const getOrCreatePushKey = async (): Promise<CryptoKey> => {
  const db = await openCryptoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(KEY_NAME);

    getReq.onsuccess = async () => {
      if (getReq.result instanceof CryptoKey) {
        resolve(getReq.result);
        return;
      }

      try {
        const key = await crypto.subtle.generateKey(
          { name: "AES-GCM", length: 256 },
          false,
          ["encrypt", "decrypt"],
        );
        const putTx = db.transaction(STORE_NAME, "readwrite");
        putTx.objectStore(STORE_NAME).put(key, KEY_NAME);
        putTx.oncomplete = () => resolve(key);
        putTx.onerror = () => reject(putTx.error);
      } catch (err) {
        reject(err);
      }
    };

    getReq.onerror = () => reject(getReq.error);
  });
};

export type NotificationPayload = {
  title: string;
  body: string;
};

// Base64 helpers compatible with browser and ServiceWorker
const uint8ToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const base64ToUint8 = (base64: string): Uint8Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

export const encryptPayload = async (
  payload: NotificationPayload,
  key?: CryptoKey,
): Promise<string> => {
  const cryptoKey = key ?? (await getOrCreatePushKey());
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(payload));

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    cryptoKey,
    encoded,
  );

  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);

  return uint8ToBase64(combined);
};

export const decryptPayload = async (
  base64Data: string,
  key?: CryptoKey,
): Promise<NotificationPayload> => {
  const cryptoKey = key ?? (await getOrCreatePushKey());
  const combined = base64ToUint8(base64Data);

  if (combined.byteLength < 13) {
    throw new Error("Ciphertext too short to contain valid IV and payload");
  }

  const iv = combined.subarray(0, 12);
  const ciphertext = combined.subarray(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    cryptoKey,
    ciphertext as BufferSource,
  );

  const decoded = new TextDecoder().decode(decrypted);
  return JSON.parse(decoded) as NotificationPayload;
};
