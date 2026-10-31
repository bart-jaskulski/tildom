import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkBiometricSupport,
  checkIdleLock,
  disableBiometric,
  enableBiometric,
  IDLE_TIMEOUT_MS,
  isBiometricBusy,
  isBiometricEnabled,
  isBiometricSupported,
  isUnlocked,
  lockBiometrics,
  refreshBiometricState,
  reportUserActivity,
  STORAGE_CRED_ID,
  STORAGE_ENABLED,
  unlockWithBiometrics,
} from "../lib/biometrics";

describe("Biometrics lock logic", () => {
  beforeEach(() => {
    localStorage.clear();
    refreshBiometricState();
    vi.restoreAllMocks();
  });

  it("reports unsupported if PublicKeyCredential is missing", async () => {
    // @ts-expect-error test environment
    delete window.PublicKeyCredential;
    const supported = await checkBiometricSupport();
    expect(supported).toBe(false);
    expect(isBiometricSupported()).toBe(false);
  });

  it("reports supported when platform authenticator is available", async () => {
    window.PublicKeyCredential = {
      isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
    } as unknown as typeof PublicKeyCredential;

    const supported = await checkBiometricSupport();
    expect(supported).toBe(true);
    expect(isBiometricSupported()).toBe(true);
  });

  it("registers a platform credential and enables lock", async () => {
    window.PublicKeyCredential = {
      isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
    } as unknown as typeof PublicKeyCredential;

    const fakeRawId = new Uint8Array([1, 2, 3, 4]).buffer;
    const createMock = vi.fn().mockResolvedValue({
      rawId: fakeRawId,
    });
    vi.stubGlobal("navigator", {
      ...navigator,
      credentials: { create: createMock },
    });

    const success = await enableBiometric();
    expect(success).toBe(true);
    expect(isBiometricEnabled()).toBe(true);
    expect(isUnlocked()).toBe(true);
    expect(localStorage.getItem(STORAGE_ENABLED)).toBe("true");
    expect(localStorage.getItem(STORAGE_CRED_ID)).toBeTruthy();
  });

  it("requires verification before disabling biometric lock", async () => {
    localStorage.setItem(STORAGE_ENABLED, "true");
    localStorage.setItem(STORAGE_CRED_ID, "test-cred-id");
    refreshBiometricState();

    const getMock = vi.fn().mockRejectedValue(new Error("User cancelled"));
    vi.stubGlobal("navigator", {
      ...navigator,
      credentials: { get: getMock },
    });

    const disabled = await disableBiometric();
    expect(disabled).toBe(false);
    expect(localStorage.getItem(STORAGE_ENABLED)).toBe("true");

    // Now mock success
    getMock.mockResolvedValueOnce({ id: "verified" });
    const disabledSuccess = await disableBiometric();
    expect(disabledSuccess).toBe(true);
    expect(isBiometricEnabled()).toBe(false);
    expect(localStorage.getItem(STORAGE_ENABLED)).toBeNull();
    expect(localStorage.getItem(STORAGE_CRED_ID)).toBeNull();
  });

  it("locks the app and clears memory on lockBiometrics", () => {
    localStorage.setItem(STORAGE_ENABLED, "true");
    localStorage.setItem(STORAGE_CRED_ID, "test-cred-id");
    refreshBiometricState();

    lockBiometrics();
    expect(isUnlocked()).toBe(false);
  });

  it("unlocks when biometric assertion succeeds", async () => {
    localStorage.setItem(STORAGE_ENABLED, "true");
    localStorage.setItem(STORAGE_CRED_ID, "dGVzdC1jcmVkLWlk"); // base64url "test-cred-id"
    refreshBiometricState();

    const getMock = vi.fn().mockResolvedValue({ id: "unlocked" });
    vi.stubGlobal("navigator", {
      ...navigator,
      credentials: { get: getMock },
    });

    lockBiometrics();
    expect(isUnlocked()).toBe(false);

    const unlocked = await unlockWithBiometrics();
    expect(unlocked).toBe(true);
    expect(isUnlocked()).toBe(true);
  });

  it("locks after idle period exceeds threshold", () => {
    localStorage.setItem(STORAGE_ENABLED, "true");
    localStorage.setItem(STORAGE_CRED_ID, "test-cred-id");
    refreshBiometricState();

    // In refreshBiometricState(), isUnlocked was set to false because enabled=true.
    // Simulate user having unlocked and being active:
    vi.spyOn(navigator.credentials, "get").mockResolvedValueOnce({ id: "ok" } as unknown as Credential);
    // Directly set activity and state
    unlockWithBiometrics();
    reportUserActivity();

    // Simulate passing of time
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + IDLE_TIMEOUT_MS + 1000);

    checkIdleLock();
    expect(isUnlocked()).toBe(false);
  });
});
