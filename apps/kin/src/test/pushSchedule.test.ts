import { describe, expect, it } from "vitest";
import {
  computeBirthdayCron,
  formatBirthdayNotification,
  hashOpaqueId,
  buildContactReminders,
} from "~/lib/pushSchedule";
import { decryptPayload } from "~/lib/pushCrypto";
import type { Contact } from "~/lib/db";

describe("pushSchedule", () => {
  it("computes cron on the day at the configured time", () => {
    // May 14 at 09:00, 0 days advance -> "0 9 14 5 *"
    const cron = computeBirthdayCron(5, 14, 0, "09:00");
    expect(cron).toBe("0 9 14 5 *");
  });

  it("computes cron 1 day before at the configured time", () => {
    // May 14 at 08:30, 1 day advance -> May 13 at 08:30 -> "30 8 13 5 *"
    const cron = computeBirthdayCron(5, 14, 1, "08:30");
    expect(cron).toBe("30 8 13 5 *");
  });

  it("computes cron across month boundaries", () => {
    // March 1, 1 day advance -> Feb 29 (in leap year base) -> "0 9 29 2 *"
    const cron = computeBirthdayCron(3, 1, 1, "09:00");
    expect(cron).toBe("0 9 29 2 *");
  });

  it("formats notification copy appropriately", () => {
    expect(formatBirthdayNotification("Alice", 0)).toEqual({
      title: "Birthday today",
      body: "Today is Alice's birthday!",
    });

    expect(formatBirthdayNotification("Bob", 1)).toEqual({
      title: "Birthday tomorrow",
      body: "Tomorrow is Bob's birthday!",
    });

    expect(formatBirthdayNotification("Charlie", 3)).toEqual({
      title: "Upcoming birthday",
      body: "Charlie's birthday is in 3 days!",
    });
  });

  it("produces deterministic opaque IDs without leaking contact ID", async () => {
    const id1 = await hashOpaqueId("kin:bday:contact_123");
    const id2 = await hashOpaqueId("kin:bday:contact_123");
    const id3 = await hashOpaqueId("kin:bday:contact_456");

    expect(id1).toBe(id2);
    expect(id1).not.toBe(id3);
    expect(id1).toHaveLength(16);
    expect(id1).toMatch(/^[0-9a-f]{16}$/);
    expect(id1).not.toContain("contact_123");
  });

  it("builds encrypted reminders for contacts with valid birthdays", async () => {
    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );

    const testContacts: Contact[] = [
      {
        id: "c1",
        name: "Alice",
        birthday: "1995-05-14",
        relationship: "",
        location: "",
        phone: "",
        email: "",
        created_at: 1000,
        updated_at: 1000,
      },
      {
        id: "c2",
        name: "Bob",
        birthday: "--11-20", // without year
        relationship: "",
        location: "",
        phone: "",
        email: "",
        created_at: 2000,
        updated_at: 2000,
      },
      {
        id: "c3",
        name: "Charlie",
        birthday: "1990", // year only, no day/month
        relationship: "",
        location: "",
        phone: "",
        email: "",
        created_at: 3000,
        updated_at: 3000,
      },
      {
        id: "c4",
        name: "Diana",
        birthday: "", // no birthday
        relationship: "",
        location: "",
        phone: "",
        email: "",
        created_at: 4000,
        updated_at: 4000,
      },
    ];

    const reminders = await buildContactReminders(testContacts, 0, "09:00", key);

    // Only Alice and Bob have specific month+day
    expect(reminders).toHaveLength(2);

    expect(reminders[0].schedule).toBe("0 9 14 5 *");
    expect(reminders[1].schedule).toBe("0 9 20 11 *");

    // Decrypt Alice's payload to verify encryption integrity
    const decryptedAlice = await decryptPayload(reminders[0].ciphertext, key);
    expect(decryptedAlice).toEqual({
      title: "Birthday today",
      body: "Today is Alice's birthday!",
    });
  });
});
