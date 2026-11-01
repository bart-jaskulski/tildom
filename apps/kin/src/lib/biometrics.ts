import { createSignal } from "solid-js";
import { base64UrlDecode, base64UrlEncode } from "@tildom/sync-client";
let onLockHandler: (() => void) | null = null;
export const setOnBiometricLock = (handler: (() => void) | null) => {
  onLockHandler = handler;
};

export const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
export const STORAGE_ENABLED = "kin:biometric_lock";
export const STORAGE_CRED_ID = "kin:biometric_cred_id";

const [isBiometricSupported, setIsBiometricSupported] = createSignal(false);
const [isBiometricEnabled, setIsBiometricEnabled] = createSignal(
  typeof window !== "undefined" && localStorage.getItem(STORAGE_ENABLED) === "true"
);
const [isUnlocked, setIsUnlocked] = createSignal(!isBiometricEnabled());
const [biometricError, setBiometricError] = createSignal("");
const [isBiometricBusy, setIsBiometricBusy] = createSignal(false);

let lastActivityTime = Date.now();
let isInitialized = false;

const bytes = (length = 32) => crypto.getRandomValues(new Uint8Array(length));

const getRelyingPartyId = () => {
  if (typeof window === "undefined") return "localhost";
  return location.hostname === "127.0.0.1" ? "localhost" : location.hostname;
};

export const checkBiometricSupport = async (): Promise<boolean> => {
  if (typeof window === "undefined" || !window.PublicKeyCredential) {
    setIsBiometricSupported(false);
    return false;
  }
  try {
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    setIsBiometricSupported(available);
    return available;
  } catch {
    setIsBiometricSupported(false);
    return false;
  }
};

export const reportUserActivity = () => {
  lastActivityTime = Date.now();
};

export const refreshBiometricState = () => {
  const enabled = typeof window !== "undefined" && localStorage.getItem(STORAGE_ENABLED) === "true";
  setIsBiometricEnabled(enabled);
  setIsUnlocked(!enabled);
  setBiometricError("");
  setIsBiometricBusy(false);
  lastActivityTime = Date.now();
};

export const lockBiometrics = () => {
  if (!isBiometricEnabled()) return;
  setIsUnlocked(false);
  onLockHandler?.();
};

export const checkIdleLock = () => {
  if (isBiometricEnabled() && isUnlocked()) {
    if (Date.now() - lastActivityTime >= IDLE_TIMEOUT_MS) {
      lockBiometrics();
    }
  }
};

export const unlockWithBiometrics = async (isAutoPrompt = false): Promise<boolean> => {
  if (!isBiometricEnabled()) {
    setIsUnlocked(true);
    return true;
  }
  const credId = localStorage.getItem(STORAGE_CRED_ID);
  if (!credId) {
    // Failsafe: if flag is set without credential, release lock cleanly
    setIsBiometricEnabled(false);
    localStorage.removeItem(STORAGE_ENABLED);
    setIsUnlocked(true);
    return true;
  }

  setIsBiometricBusy(true);
  setBiometricError("");
  try {
    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: bytes(32),
        allowCredentials: [{ type: "public-key", id: base64UrlDecode(credId) }],
        userVerification: "required",
        timeout: 60000,
      },
    });

    if (!credential) throw new Error("Authentication failed");
    setIsUnlocked(true);
    reportUserActivity();
    return true;
  } catch (err) {
    if (isAutoPrompt) {
      // Don't show failure message if auto-prompt on mount was blocked or deferred
      setBiometricError("");
      return false;
    }
    const message = err instanceof Error ? err.message : "Authentication failed";
    setBiometricError(message);
    return false;
  } finally {
    setIsBiometricBusy(false);
  }
};

export const enableBiometric = async (): Promise<boolean> => {
  setIsBiometricBusy(true);
  setBiometricError("");
  try {
    if (!window.PublicKeyCredential || !(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())) {
      throw new Error("Platform authenticator is not supported on this device");
    }

    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: bytes(32),
        rp: { id: getRelyingPartyId(), name: "Kin" },
        user: { id: bytes(16), name: "kin-user", displayName: "Kin User" },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
        },
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;

    if (!credential) throw new Error("Registration cancelled");
    const credId = base64UrlEncode(new Uint8Array(credential.rawId));
    localStorage.setItem(STORAGE_CRED_ID, credId);
    localStorage.setItem(STORAGE_ENABLED, "true");
    setIsBiometricEnabled(true);
    setIsUnlocked(true);
    reportUserActivity();
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to enable biometric lock";
    setBiometricError(message);
    return false;
  } finally {
    setIsBiometricBusy(false);
  }
};

export const disableBiometric = async (): Promise<boolean> => {
  setIsBiometricBusy(true);
  setBiometricError("");
  try {
    const credId = localStorage.getItem(STORAGE_CRED_ID);
    if (credId) {
      // Require platform verification before disabling
      const credential = await navigator.credentials.get({
        publicKey: {
          challenge: bytes(32),
          allowCredentials: [{ type: "public-key", id: base64UrlDecode(credId) }],
          userVerification: "required",
          timeout: 60000,
        },
      });
      if (!credential) throw new Error("Verification required to disable biometric lock");
    }
    localStorage.removeItem(STORAGE_ENABLED);
    localStorage.removeItem(STORAGE_CRED_ID);
    setIsBiometricEnabled(false);
    setIsUnlocked(true);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Verification required to disable lock";
    setBiometricError(message);
    return false;
  } finally {
    setIsBiometricBusy(false);
  }
};

export const initBiometrics = () => {
  if (typeof window === "undefined" || isInitialized) return;
  isInitialized = true;
  void checkBiometricSupport();

  window.addEventListener("pointerdown", reportUserActivity, { passive: true });
  window.addEventListener("keydown", reportUserActivity, { passive: true });
  window.addEventListener("touchstart", reportUserActivity, { passive: true });
  window.addEventListener("scroll", reportUserActivity, { passive: true });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      checkIdleLock();
    }
  });

  window.setInterval(checkIdleLock, 15000);
};

export {
  isBiometricSupported,
  isBiometricEnabled,
  isUnlocked,
  biometricError,
  isBiometricBusy,
};
