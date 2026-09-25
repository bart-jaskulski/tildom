import { base64UrlDecode, base64UrlEncode, decryptSnapshot, deriveBits, deriveSyncConfig, encryptSnapshot, generateSyncSecret } from "./crypto";
import { downloadLatest, uploadSnapshot } from "./transport";

const PREFIX = "tildom-recovery-v1.";
const APP_ID = /^[a-z][a-z0-9-]{0,31}$/;
const encoder = new TextEncoder();

const validSecret = (secret: string) => {
  try { return base64UrlDecode(secret).byteLength === 32; } catch { return false; }
};

export type SuiteKeyring = { version: 1; appSecrets: Record<string, string> };

export const generateRecoveryKey = () => `${PREFIX}${generateSyncSecret()}`;

export const parseRecoveryKey = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed.startsWith(PREFIX)) throw new Error("Invalid recovery key");
  const secret = trimmed.slice(PREFIX.length);
  if (!validSecret(secret)) throw new Error("Invalid recovery key");
  return secret;
};

export const deriveSuiteAppSecret = async (recoveryKey: string, appId: string) => {
  if (!APP_ID.test(appId) || appId === "suite") throw new Error("Invalid app ID");
  return base64UrlEncode(await deriveBits(parseRecoveryKey(recoveryKey), `suite:app:${appId}`, 256));
};

const parseKeyring = (bytes: Uint8Array): SuiteKeyring => {
  let value: unknown;
  try { value = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error("Invalid suite keyring"); }
  if (!value || typeof value !== "object" || (value as { version?: unknown }).version !== 1) throw new Error("Invalid suite keyring");
  const appSecrets = (value as { appSecrets?: unknown }).appSecrets;
  if (!appSecrets || typeof appSecrets !== "object" || Array.isArray(appSecrets)) throw new Error("Invalid suite keyring");
  for (const [appId, secret] of Object.entries(appSecrets)) {
    if (!APP_ID.test(appId) || typeof secret !== "string") throw new Error("Invalid suite keyring");
    if (!validSecret(secret)) throw new Error("Invalid suite keyring");
  }
  return { version: 1, appSecrets: { ...appSecrets } as Record<string, string> };
};

export const createSuiteKeyringClient = async (recoveryKey: string, baseUrl: string) => {
  const secret = parseRecoveryKey(recoveryKey);
  const config = await deriveSyncConfig("suite", secret, baseUrl);

  const read = async (): Promise<{ revision: string | null; keyring: SuiteKeyring }> => {
    const remote = await downloadLatest(config);
    if (!remote) return { revision: null, keyring: { version: 1, appSecrets: {} } satisfies SuiteKeyring };
    return { revision: remote.revision, keyring: parseKeyring(await decryptSnapshot(config, remote.body)) };
  };

  const write = async (keyring: SuiteKeyring, revision: string | null) =>
    uploadSnapshot(config, (await encryptSnapshot(config, encoder.encode(JSON.stringify(keyring)))).buffer as ArrayBuffer, revision);

  return {
    read,
    registerAppSecret: async (appId: string, appSecret: string) => {
      if (!APP_ID.test(appId)) throw new Error("Invalid app ID");
      if (!validSecret(appSecret)) throw new Error("Invalid app secret");
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const { revision, keyring } = await read();
        const existing = keyring.appSecrets[appId];
        if (existing && existing !== appSecret) throw new Error(`Conflicting suite secret for ${appId}`);
        keyring.appSecrets[appId] = appSecret;
        const uploaded = await write(keyring, revision);
        if (uploaded) return uploaded;
      }
      throw new Error("Suite keyring changed; try again");
    },
    create: async () => {
      const uploaded = await write({ version: 1, appSecrets: {} }, null);
      if (!uploaded) throw new Error("Suite keyring already exists");
      return uploaded;
    },
    resolveAppSecret: async (appId: string) =>
      (await read()).keyring.appSecrets[appId] ?? deriveSuiteAppSecret(recoveryKey, appId),
  };
};
