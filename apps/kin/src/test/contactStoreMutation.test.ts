import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { migrations } from "~/lib/db";

let memDb: DatabaseSync;
const { getSubscriber, setSubscriber } = vi.hoisted(() => {
  let cb: (() => void) | null = null;
  return {
    getSubscriber: () => cb,
    setSubscriber: (val: any) => {
      cb = val;
    },
  };
});

const createTestDb = () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  for (const m of migrations) {
    db.exec(m.sql);
  }
  return db;
};

vi.mock("~/lib/db", async () => {
  const actual = await vi.importActual<typeof import("~/lib/db")>("~/lib/db");
  return {
    ...actual,
    db: {
      init: vi.fn(),
      subscribe: vi.fn((cb: () => void) => {
        setSubscriber(cb);
        return () => {
          setSubscriber(null);
        };
      }),
      query: vi.fn((sql: string, params: unknown[] = []) => {
        const stmt = memDb.prepare(sql);
        return Promise.resolve(stmt.all(...(params as any[])));
      }),
      sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join("?");
        const stmt = memDb.prepare(sql);
        return Promise.resolve(stmt.all(...(values as any[])));
      }),
    },
  };
});

import {
  contacts,
  createContact,
  createNote,
  createRelationship,
  deleteContact,
  deleteNote,
  fetchNotes,
  fetchRelationships,
  refreshContacts,
  searchContacts,
  togglePinNote,
  updateContact,
  updateNote,
} from "../stores/contactStore";

describe("contactStore (Real SQLite Behavioral Integration)", () => {
  beforeEach(async () => {
    memDb = createTestDb();
    await refreshContacts();
  });

  const queryContacts = (where = "1=1", params: any[] = []) =>
    memDb.prepare(`SELECT * FROM contacts WHERE ${where}`).all(...params) as any[];

  it("creates a contact in SQLite", async () => {
    const id = await createContact("Ada Lovelace", "Colleague", "London");

    const rows = queryContacts("id = ?", [id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Ada Lovelace");
    expect(rows[0].relationship).toBe("Colleague");
    expect(rows[0].location).toBe("London");
  });

  it("updates a contact in SQLite", async () => {
    const id = await createContact("Ada Lovelace");

    await updateContact(id, {
      name: "Ada King",
      relationship: "Friend",
      location: "UK",
      birthday: "1815-12-10",
      phone: "+441234567",
      email: "ada@example.com",
    });

    const rows = queryContacts("id = ?", [id]);
    expect(rows[0].name).toBe("Ada King");
    expect(rows[0].relationship).toBe("Friend");
    expect(rows[0].location).toBe("UK");
    expect(rows[0].birthday).toBe("1815-12-10");
    expect(rows[0].email).toBe("ada@example.com");
  });

  it("deletes a contact and cascades deletion to notes and relationships", async () => {
    const adaId = await createContact("Ada Lovelace");
    const graceId = await createContact("Grace Hopper");

    await createNote(adaId, "Note about Ada", false);
    await createRelationship(adaId, graceId, "mentor");

    await deleteContact(adaId);

    expect(queryContacts("id = ?", [adaId])).toHaveLength(0);
    const remainingNotes = memDb.prepare("SELECT * FROM notes WHERE contact_id = ?").all(adaId);
    expect(remainingNotes).toHaveLength(0);
    const remainingRelations = memDb
      .prepare("SELECT * FROM relationships WHERE contact_id_a = ? OR contact_id_b = ?")
      .all(adaId, adaId);
    expect(remainingRelations).toHaveLength(0);
  });

  it("creates and resolves symmetrical relationships with role inversion", async () => {
    const adaId = await createContact("Ada Lovelace");
    const graceId = await createContact("Grace Hopper");

    await createRelationship(adaId, graceId, "mentor");

    // On Ada's profile: Grace Hopper is the mentee/target
    const adaRelations = await fetchRelationships(adaId);
    expect(adaRelations).toHaveLength(1);
    expect(adaRelations[0]).toEqual(
      expect.objectContaining({
        contactId: graceId,
        name: "Grace Hopper",
        roleLabel: "Mentor",
        rawRole: "mentor",
      }),
    );

    // On Grace's profile: Ada Lovelace is mapped to the inverse role "Mentee"
    const graceRelations = await fetchRelationships(graceId);
    expect(graceRelations).toHaveLength(1);
    expect(graceRelations[0]).toEqual(
      expect.objectContaining({
        contactId: adaId,
        name: "Ada Lovelace",
        roleLabel: "Mentee",
        rawRole: "mentor",
      }),
    );
  });

  it("prevents self-relationships and duplicate bidirectional relationships", async () => {
    const adaId = await createContact("Ada Lovelace");
    const graceId = await createContact("Grace Hopper");

    await expect(createRelationship(adaId, adaId, "friend")).rejects.toThrow(
      "cannot have a relationship with themselves",
    );

    await createRelationship(adaId, graceId, "colleague");
    await expect(createRelationship(graceId, adaId, "colleague")).rejects.toThrow(
      "relationship already exists",
    );
  });

  it("creates, updates, pins, and deletes notes with hashtag extraction", async () => {
    const contactId = await createContact("Grace Hopper");

    const noteId = await createNote(
      contactId,
      "Invented the first compiler #compiler #nanoseconds",
      false,
    );

    const notes = await fetchNotes(contactId);
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toBe("Invented the first compiler #compiler #nanoseconds");
    expect(notes[0].tags).toBe(" compiler nanoseconds ");
    expect(notes[0].is_pinned).toBe(0);

    // Toggle pin
    await togglePinNote(noteId, 0);
    const pinnedNotes = await fetchNotes(contactId);
    expect(pinnedNotes[0].is_pinned).toBe(1);

    // Update note body
    await updateNote(noteId, "Updated compiler note #compiler", true);
    const updatedNotes = await fetchNotes(contactId);
    expect(updatedNotes[0].body).toBe("Updated compiler note #compiler");
    expect(updatedNotes[0].tags).toBe(" compiler ");

    // Delete note
    await deleteNote(noteId);
    expect(await fetchNotes(contactId)).toHaveLength(0);
  });

  it("searches contacts by profile and timeline tags in SQLite", async () => {
    const adaId = await createContact("Ada Lovelace", "Pioneer", "London");
    const graceId = await createContact("Grace Hopper", "Admiral", "New York");

    await createNote(graceId, "Briefing on #cobol language development", false);

    // Search by profile name
    const byName = await searchContacts("Ada");
    expect(byName).toHaveLength(1);
    expect(byName[0].id).toBe(adaId);

    // Search by hashtag in timeline note
    const byTag = await searchContacts("#cobol");
    expect(byTag).toHaveLength(1);
    expect(byTag[0].id).toBe(graceId);
    expect(byTag[0].matches[0]).toEqual(
      expect.objectContaining({
        kind: "timeline",
        text: "Briefing on #cobol language development",
      }),
    );
  });

  it("refreshes store contacts when change notification arrives", async () => {
    expect(contacts()).toHaveLength(0);

    await createContact("Katherine Johnson");

    // Trigger reactive subscription notification
    getSubscriber()?.();

    await Promise.resolve();
    await Promise.resolve();

    expect(contacts().map((c) => c.name)).toContain("Katherine Johnson");
  });
});
