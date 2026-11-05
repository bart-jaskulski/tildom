import { createSignal } from "solid-js";
import { getOrCreatePushKey } from "./pushCrypto";
import { buildContactReminders, hashOpaqueId } from "./pushSchedule";
import type { Contact } from "./db";

export type ReminderSettings = {
  enabled: boolean;
  time: string; // "HH:MM" e.g. "09:00"
  advanceDays: number; // 0, 1, 3
};

const STORAGE_KEY = "kin_reminders_v1";
const DEFAULT_SETTINGS: ReminderSettings = {
  enabled: false,
  time: "09:00",
  advanceDays: 0,
};

const loadSettings = (): ReminderSettings => {
  if (typeof localStorage === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      enabled: Boolean(parsed.enabled),
      time: typeof parsed.time === "string" ? parsed.time : "09:00",
      advanceDays: typeof parsed.advanceDays === "number" ? parsed.advanceDays : 0,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

const saveSettings = (settings: ReminderSettings) => {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
};

export const [reminderSettings, setReminderSettings] = createSignal<ReminderSettings>(loadSettings());
export const [reminderStatus, setReminderStatus] = createSignal<string>("");
export const [reminderError, setReminderError] = createSignal<string>("");

export const isPushSupported = (): boolean => {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
};

export const isIosNonStandalone = (): boolean => {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  return isIos && !isStandalone;
};

export const getApiBaseUrl = (): string => {
  return (import.meta.env.VITE_API_BASE_URL as string | undefined) || "http://localhost:8788";
};

// Converts URL-safe base64 string to Uint8Array for applicationServerKey
const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

export const fetchVapidPublicKey = async (): Promise<string> => {
  const res = await fetch(`${getApiBaseUrl()}/v1/push/public-key`);
  if (!res.ok) {
    throw new Error(`Failed to fetch VAPID public key (HTTP ${res.status})`);
  }
  const data = (await res.json()) as { publicKey?: string };
  if (!data.publicKey) {
    throw new Error("Missing public key in server response");
  }
  return data.publicKey;
};

export const subscribeToWebPush = async (): Promise<PushSubscription> => {
  if (!isPushSupported()) {
    throw new Error("Push notifications are not supported in this browser");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted");
  }

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    const vapidPublicKey = await fetchVapidPublicKey();
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
    });
  }

  // Ensure client encryption key exists
  await getOrCreatePushKey();

  return subscription;
};

export const syncPushReminders = async (contacts: Contact[]): Promise<void> => {
  const current = reminderSettings();
  if (!current.enabled || !isPushSupported()) return;

  setReminderError("");
  setReminderStatus("scheduling reminders...");

  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await subscribeToWebPush();
    }

    const key = await getOrCreatePushKey();
    const reminders = await buildContactReminders(contacts, current.advanceDays, current.time, key);
    const subId = await hashOpaqueId(subscription.endpoint);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

    const res = await fetch(`${getApiBaseUrl()}/v1/push/subscriptions/${subId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        tz,
        reminders,
      }),
    });

    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(errBody.error || `Push service returned HTTP ${res.status}`);
    }

    setReminderStatus(`scheduled ${reminders.length} birthday reminder${reminders.length === 1 ? "" : "s"}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setReminderError(message);
    setReminderStatus("");
  }
};

export const enableReminders = async (contacts: Contact[]): Promise<void> => {
  setReminderError("");
  setReminderStatus("enabling...");

  try {
    if (isIosNonStandalone()) {
      throw new Error("On iOS, Kin must be added to Home Screen before enabling notifications");
    }

    await subscribeToWebPush();
    const updated: ReminderSettings = { ...reminderSettings(), enabled: true };
    saveSettings(updated);
    setReminderSettings(updated);
    await syncPushReminders(contacts);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setReminderError(message);
    setReminderStatus("");
    throw err;
  }
};

export const disableReminders = async (): Promise<void> => {
  setReminderError("");
  setReminderStatus("disabling...");

  try {
    if (isPushSupported()) {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const subId = await hashOpaqueId(subscription.endpoint);
        await fetch(`${getApiBaseUrl()}/v1/push/subscriptions/${subId}`, {
          method: "DELETE",
        }).catch(() => undefined);
        await subscription.unsubscribe().catch(() => undefined);
      }
    }

    const updated: ReminderSettings = { ...reminderSettings(), enabled: false };
    saveSettings(updated);
    setReminderSettings(updated);
    setReminderStatus("reminders disabled");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setReminderError(message);
  }
};

export const updateReminderConfig = async (
  partial: Partial<Pick<ReminderSettings, "time" | "advanceDays">>,
  contacts: Contact[],
): Promise<void> => {
  const updated: ReminderSettings = { ...reminderSettings(), ...partial };
  saveSettings(updated);
  setReminderSettings(updated);
  if (updated.enabled) {
    await syncPushReminders(contacts);
  }
};
