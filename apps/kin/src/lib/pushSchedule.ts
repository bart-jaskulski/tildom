import { birthdayParts } from "./birthday";
import { encryptPayload } from "./pushCrypto";
import type { Contact } from "./db";

export type PushReminderItem = {
  id: string;
  schedule: string;
  ciphertext: string;
};

export const hashOpaqueId = async (input: string): Promise<string> => {
  const buffer = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
};

export const computeBirthdayCron = (
  month: number,
  day: number,
  advanceDays: number,
  timeStr: string,
): string => {
  const d = new Date(2000, month - 1, day - advanceDays);
  const remMonth = d.getMonth() + 1;
  const remDay = d.getDate();

  const [h, m] = (timeStr || "09:00").split(":").map(Number);
  const hour = Number.isFinite(h) && h >= 0 && h <= 23 ? h : 9;
  const minute = Number.isFinite(m) && m >= 0 && m <= 59 ? m : 0;

  return `${minute} ${hour} ${remDay} ${remMonth} *`;
};

export const formatBirthdayNotification = (
  name: string,
  advanceDays: number,
): { title: string; body: string } => {
  if (advanceDays === 0) {
    return {
      title: "Birthday today",
      body: `Today is ${name}'s birthday!`,
    };
  }
  if (advanceDays === 1) {
    return {
      title: "Birthday tomorrow",
      body: `Tomorrow is ${name}'s birthday!`,
    };
  }
  return {
    title: "Upcoming birthday",
    body: `${name}'s birthday is in ${advanceDays} days!`,
  };
};

export const buildContactReminders = async (
  contacts: Contact[],
  advanceDays: number,
  timeStr: string,
  key?: CryptoKey,
): Promise<PushReminderItem[]> => {
  const reminders: PushReminderItem[] = [];

  for (const contact of contacts) {
    if (contact.deleted_at || !contact.birthday) continue;
    const parts = birthdayParts(contact.birthday);
    if (!parts.day || !parts.month) continue;

    const monthNum = Number(parts.month);
    const dayNum = Number(parts.day);
    if (!monthNum || !dayNum) continue;

    const schedule = computeBirthdayCron(monthNum, dayNum, advanceDays, timeStr);
    const payload = formatBirthdayNotification(contact.name, advanceDays);
    const ciphertext = await encryptPayload(payload, key);
    const id = await hashOpaqueId(`kin:bday:${contact.id}`);

    reminders.push({
      id,
      schedule,
      ciphertext,
    });
  }

  return reminders;
};
