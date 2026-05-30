import { createEffect, createRoot } from "solid-js";
import { createStore } from "solid-js/store";
import { dbVersion, exec, initDb, query } from "~/lib/db";

export type Contact = {
  id: string;
  name: string;
  location: string;
  birthday: string;
  phone: string;
  email: string;
  created_at: number;
  updated_at: number;
};

export type ContactNote = {
  id: string;
  contact_id: string;
  body: string;
  tags: string;
  is_pinned: number;
  created_at: number;
  updated_at: number;
};

export type SymmetricalRelationship = {
  contactId: string; // The related person's ID
  name: string; // The related person's name
  roleLabel: string; // E.g., "Parent" or "Child" (mapped for UI)
  rawRole: string; // The role stored in DB (e.g. "parent")
  contactIdA: string;
  contactIdB: string;
};

export const INVERSE_ROLES: Record<string, string> = {
  parent: "child",
  child: "parent",
  mentor: "mentee",
  mentee: "mentor",
  spouse: "spouse",
  sibling: "sibling",
  friend: "friend",
  partner: "partner",
  colleague: "colleague"
};

export const ROLE_LABELS: Record<string, string> = {
  parent: "Parent",
  child: "Child",
  mentor: "Mentor",
  mentee: "Mentee",
  spouse: "Spouse",
  sibling: "Sibling",
  friend: "Friend",
  partner: "Partner",
  colleague: "Colleague"
};

// Helper to parse hashtags from note text
export const parseTags = (text: string): string => {
  const matches = text.match(/#([a-zA-Z0-9_-]+)/g);
  if (!matches) return "";
  const uniqueTags = Array.from(
    new Set(matches.map(m => m.slice(1).toLowerCase()))
  );
  if (uniqueTags.length === 0) return "";
  return ` ${uniqueTags.join(" ")} `;
};

const appStore = createRoot(() => {
  const [state, setState] = createStore({
    contacts: [] as Contact[],
    isReady: false,
    searchQuery: "",
  });

  const refreshContacts = async () => {
    const q = state.searchQuery.trim();
    let rows: Contact[] = [];

    if (q.startsWith("#") && q.length > 1) {
      // Tag search
      const tag = q.slice(1).toLowerCase();
      rows = await query<Contact>(
        `
          SELECT DISTINCT c.*
          FROM contacts c
          JOIN notes n ON n.contact_id = c.id
          WHERE n.tags LIKE ?
          ORDER BY c.name ASC
        `,
        [`% ${tag} %`]
      );
    } else if (q !== "") {
      // Text search (name, location, email)
      rows = await query<Contact>(
        `
          SELECT * FROM contacts
          WHERE name LIKE ? OR location LIKE ? OR email LIKE ?
          ORDER BY name ASC
        `,
        [`%${q}%`, `%${q}%`, `%${q}%`]
      );
    } else {
      // Load all contacts
      rows = await query<Contact>("SELECT * FROM contacts ORDER BY name ASC");
    }

    setState("contacts", rows);
  };

  createEffect(() => {
    const version = dbVersion();
    // Re-run contact loading whenever database revisions happen
    if (version > 0 || state.isReady) {
      void refreshContacts();
    }
  });

  return {
    state,
    setState,
    refreshContacts,
    setReady: (value: boolean) => setState("isReady", value),
  };
});

export const initializeContactStore = async () => {
  console.debug("Initializing contact store...");
  try {
    await initDb();
    await appStore.refreshContacts();
    appStore.setReady(true);
  } catch (error) {
    console.error("Failed to initialize contact store:", error);
  }
};

export const contacts = () => appStore.state.contacts;
export const isContactStoreReady = () => appStore.state.isReady;
export const searchQuery = () => appStore.state.searchQuery;
export const setSearchQuery = (q: string) => {
  appStore.setState("searchQuery", q);
  void appStore.refreshContacts();
};

// CRUD: Contacts
export const createContact = async (name: string): Promise<string> => {
  const id = crypto.randomUUID();
  const now = Date.now();
  await exec(
    `
      INSERT INTO contacts (id, name, location, birthday, phone, email, created_at, updated_at)
      VALUES (?, ?, '', '', '', '', ?, ?)
    `,
    [id, name.trim(), now, now]
  );
  return id;
};

export const updateContact = async (
  id: string,
  data: { name: string; location: string; birthday: string; phone: string; email: string }
): Promise<void> => {
  const now = Date.now();
  await exec(
    `
      UPDATE contacts
      SET name = ?, location = ?, birthday = ?, phone = ?, email = ?, updated_at = ?
      WHERE id = ?
    `,
    [data.name.trim(), data.location.trim(), data.birthday.trim(), data.phone.trim(), data.email.trim(), now, id]
  );
};

export const deleteContact = async (id: string): Promise<void> => {
  // Cascading deletes are configured via foreign keys for notes and relationships in db.worker
  await exec("DELETE FROM contacts WHERE id = ?", [id]);
};

export const fetchContact = async (id: string): Promise<Contact | null> => {
  const rows = await query<Contact>("SELECT * FROM contacts WHERE id = ? LIMIT 1", [id]);
  return rows[0] ?? null;
};

// CRUD: Notes
export const fetchNotes = async (contactId: string): Promise<ContactNote[]> => {
  return query<ContactNote>(
    `
      SELECT * FROM notes
      WHERE contact_id = ?
      ORDER BY is_pinned DESC, created_at DESC
    `,
    [contactId]
  );
};

export const createNote = async (contactId: string, body: string, isPinned: boolean): Promise<string> => {
  const id = crypto.randomUUID();
  const now = Date.now();
  const tags = parseTags(body);
  await exec(
    `
      INSERT INTO notes (id, contact_id, body, tags, is_pinned, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [id, contactId, body.trim(), tags, isPinned ? 1 : 0, now, now]
  );
  return id;
};

export const updateNote = async (noteId: string, body: string, isPinned: boolean): Promise<void> => {
  const now = Date.now();
  const tags = parseTags(body);
  await exec(
    `
      UPDATE notes
      SET body = ?, tags = ?, is_pinned = ?, updated_at = ?
      WHERE id = ?
    `,
    [body.trim(), tags, isPinned ? 1 : 0, now, noteId]
  );
};

export const deleteNote = async (noteId: string): Promise<void> => {
  await exec("DELETE FROM notes WHERE id = ?", [noteId]);
};

// CRUD: Relationships & Symmetrical Resolver
export const fetchRelationships = async (contactId: string): Promise<SymmetricalRelationship[]> => {
  const rows = await query<{
    contact_id_a: string;
    contact_id_b: string;
    role: string;
    name_a: string;
    name_b: string;
  }>(
    `
      SELECT r.contact_id_a, r.contact_id_b, r.role,
             c_a.name as name_a, c_b.name as name_b
      FROM relationships r
      JOIN contacts c_a ON r.contact_id_a = c_a.id
      JOIN contacts c_b ON r.contact_id_b = c_b.id
      WHERE r.contact_id_a = ? OR r.contact_id_b = ?
    `,
    [contactId, contactId]
  );

  return rows.map((row) => {
    const isA = row.contact_id_a === contactId;
    const relatedId = isA ? row.contact_id_b : row.contact_id_a;
    const relatedName = isA ? row.name_b : row.name_a;

    // Symmetrical role translation
    // If the database stores Bob (A) is Parent of Alice (B) (role = "parent"):
    // - On Bob's page (isA === true): Alice is Bob's Child (use inverse).
    // - On Alice's page (isA === false): Bob is Alice's Parent (use rawRole as-is).
    const rawRole = row.role.toLowerCase();
    const roleKey = isA ? (INVERSE_ROLES[rawRole] ?? rawRole) : rawRole;
    const roleLabel = ROLE_LABELS[roleKey] ?? (roleKey.charAt(0).toUpperCase() + roleKey.slice(1));

    return {
      contactId: relatedId,
      name: relatedName,
      roleLabel,
      rawRole: row.role,
      contactIdA: row.contact_id_a,
      contactIdB: row.contact_id_b,
    };
  });
};

export const createRelationship = async (
  contactIdA: string,
  contactIdB: string,
  role: string
): Promise<void> => {
  if (contactIdA === contactIdB) {
    throw new Error("A contact cannot have a relationship with themselves.");
  }

  // To prevent inverse duplicates at database constraint levels (e.g. spouse of Bob is Alice, and spouse of Alice is Bob),
  // we check if a connection already exists in any direction.
  const existing = await query(
    `
      SELECT * FROM relationships
      WHERE (contact_id_a = ? AND contact_id_b = ?)
         OR (contact_id_a = ? AND contact_id_b = ?)
    `,
    [contactIdA, contactIdB, contactIdB, contactIdA]
  );

  if (existing.length > 0) {
    throw new Error("A relationship already exists between these two contacts.");
  }

  await exec(
    `
      INSERT INTO relationships (contact_id_a, contact_id_b, role)
      VALUES (?, ?, ?)
    `,
    [contactIdA, contactIdB, role.trim().toLowerCase()]
  );
};

export const deleteRelationship = async (contactIdA: string, contactIdB: string): Promise<void> => {
  await exec(
    `
      DELETE FROM relationships
      WHERE (contact_id_a = ? AND contact_id_b = ?)
         OR (contact_id_a = ? AND contact_id_b = ?)
    `,
    [contactIdA, contactIdB, contactIdB, contactIdA]
  );
};

export const togglePinNote = async (noteId: string, currentIsPinned: number): Promise<void> => {
  const next = currentIsPinned === 1 ? 0 : 1;
  const now = Date.now();
  await exec(
    `
      UPDATE notes
      SET is_pinned = ?, updated_at = ?
      WHERE id = ?
    `,
    [next, now, noteId]
  );
};
