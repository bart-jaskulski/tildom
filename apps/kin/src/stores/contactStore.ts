import { createEffect, createRoot } from "solid-js";
import { createStore } from "solid-js/store";
import { dbVersion, exec, initDb, query } from "~/lib/db";

export type Contact = {
  id: string;
  name: string;
  relationship: string;
  location: string;
  birthday: string;
  phone: string;
  email: string;
  created_at: number;
  updated_at: number;
};

export type ContactSearchMatch = {
  kind: "profile" | "timeline";
  text: string;
  createdAt?: number;
};

export type ContactSearchResult = Contact & {
  matches: ContactSearchMatch[];
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

export const slugifyContactName = (name: string): string => name
  .normalize("NFKD")
  .toLowerCase()
  .replace(/\p{Mark}/gu, "")
  .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
  .replace(/^-|-$/g, "") || "person";

export const contactSlugs = (allContacts: Contact[]): Map<string, string> => {
  const slugs = new Map<string, string>();
  const used = new Set<string>();

  for (const contact of [...allContacts].sort((a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id))) {
    const base = slugifyContactName(contact.name);
    let slug = base;
    let suffix = 2;
    while (used.has(slug)) slug = `${base}-${suffix++}`;
    used.add(slug);
    slugs.set(contact.id, slug);
  }

  return slugs;
};

const fetchContactRoutes = async (): Promise<{ contacts: Contact[]; slugs: Map<string, string> }> => {
  const allContacts = await query<Contact>("SELECT * FROM contacts ORDER BY created_at ASC, id ASC");
  return { contacts: allContacts, slugs: contactSlugs(allContacts) };
};

export const fetchContactPath = async (id: string): Promise<`/person/${string}` | "/"> => {
  const { slugs } = await fetchContactRoutes();
  const slug = slugs.get(id);
  return slug ? `/person/${slug}` : "/";
};

export const fetchContactBySlug = async (slug: string): Promise<Contact | null> => {
  const { contacts: allContacts, slugs } = await fetchContactRoutes();
  return allContacts.find((contact) => slugs.get(contact.id) === slug) ?? null;
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

  const refreshContacts = async () => setState("contacts", await query<Contact>("SELECT * FROM contacts ORDER BY name ASC"));

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
export const refreshContacts = appStore.refreshContacts;
export const isContactStoreReady = () => appStore.state.isReady;
export const searchQuery = () => appStore.state.searchQuery;
export const setSearchQuery = (q: string) => {
  appStore.setState("searchQuery", q);
};

export const searchContacts = async (rawQuery: string): Promise<ContactSearchResult[]> => {
  const search = rawQuery.trim();
  if (!search) return contacts().map((contact) => ({ ...contact, matches: [] }));

  const pattern = `%${search}%`;
  const profileRows = search.startsWith("#") ? [] : await query<Contact>(
    `SELECT * FROM contacts
     WHERE name LIKE ? OR relationship LIKE ? OR location LIKE ? OR email LIKE ? OR phone LIKE ? OR birthday LIKE ?
     ORDER BY name ASC`,
    Array(6).fill(pattern),
  );
  const noteRows = await query<Contact & { note_body: string; note_created_at: number }>(
    `SELECT c.*, n.body AS note_body, n.created_at AS note_created_at
     FROM notes n JOIN contacts c ON c.id = n.contact_id
     WHERE ${search.startsWith("#") ? "n.tags LIKE ?" : "n.body LIKE ?"}
     ORDER BY c.name ASC, n.created_at DESC`,
    [search.startsWith("#") ? `% ${search.slice(1).toLowerCase()} %` : pattern],
  );
  const results = new Map<string, ContactSearchResult>();
  const ensure = (contact: Contact) => {
    if (!results.has(contact.id)) results.set(contact.id, { ...contact, matches: [] });
    return results.get(contact.id)!;
  };
  const lower = search.toLowerCase();

  for (const contact of profileRows) {
    const matchedDetails = [contact.relationship, contact.location, contact.email, contact.phone, contact.birthday]
      .filter((value) => value.toLowerCase().includes(lower));
    ensure(contact).matches.push({ kind: "profile", text: matchedDetails.join(" · ") || contact.name });
  }
  for (const row of noteRows) {
    ensure(row).matches.push({ kind: "timeline", text: row.note_body, createdAt: row.note_created_at });
  }

  return [...results.values()].sort((left, right) => left.name.localeCompare(right.name));
};

// CRUD: Contacts
export const createContact = async (name: string, relationship = "", location = ""): Promise<string> => {
  const id = crypto.randomUUID();
  const now = Date.now();
  await exec(
    `
      INSERT INTO contacts (id, name, relationship, location, birthday, phone, email, created_at, updated_at)
      VALUES (?, ?, ?, ?, '', '', '', ?, ?)
    `,
    [id, name.trim(), relationship.trim(), location.trim(), now, now]
  );
  return id;
};

export const updateContact = async (
  id: string,
  data: { name: string; relationship: string; location: string; birthday: string; phone: string; email: string }
): Promise<void> => {
  const now = Date.now();
  await exec(
    `
      UPDATE contacts
      SET name = ?, relationship = ?, location = ?, birthday = ?, phone = ?, email = ?, updated_at = ?
      WHERE id = ?
    `,
    [data.name.trim(), data.relationship.trim(), data.location.trim(), data.birthday.trim(), data.phone.trim(), data.email.trim(), now, id]
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

export const createNote = async (contactId: string, body: string, isPinned: boolean, createdAt = Date.now()): Promise<string> => {
  const id = crypto.randomUUID();
  const now = Date.now();
  const tags = parseTags(body);
  await exec(
    `
      INSERT INTO notes (id, contact_id, body, tags, is_pinned, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [id, contactId, body.trim(), tags, isPinned ? 1 : 0, createdAt, now]
  );
  return id;
};

export const updateNote = async (noteId: string, body: string, isPinned: boolean, createdAt?: number): Promise<void> => {
  const now = Date.now();
  const tags = parseTags(body);
  await exec(
    `
      UPDATE notes
      SET body = ?, tags = ?, is_pinned = ?, created_at = COALESCE(?, created_at), updated_at = ?
      WHERE id = ?
    `,
    [body.trim(), tags, isPinned ? 1 : 0, createdAt ?? null, now, noteId]
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

    // The stored role describes A's relationship to B. The opposite page uses
    // the inverse when one is known, while custom relationship names stay intact.
    const rawRole = row.role.toLowerCase();
    const roleKey = isA ? rawRole : (INVERSE_ROLES[rawRole] ?? rawRole);
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
