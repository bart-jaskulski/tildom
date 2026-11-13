import { BrowserDbClient, type DbMigration } from "@tildom/browser-db";
import { markSyncDirty } from "./syncState";

export interface Contact {
  id: string;
  name: string;
  relationship: string;
  location: string;
  birthday: string;
  phone: string;
  email: string;
  created_at: number;
  updated_at: number;
  deleted_at?: number | null;
}

export interface Note {
  id: string;
  contact_id: string;
  body: string;
  tags: string;
  is_pinned: number;
  created_at: number;
  updated_at: number;
  deleted_at?: number | null;
}

export interface Relationship {
  contact_id_a: string;
  contact_id_b: string;
  role: string;
  updated_at?: number;
  deleted_at?: number | null;
}

export const migrations: DbMigration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS contacts (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        location TEXT DEFAULT '',
        birthday TEXT DEFAULT '',
        phone TEXT DEFAULT '',
        email TEXT DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS relationships (
        contact_id_a TEXT NOT NULL,
        contact_id_b TEXT NOT NULL,
        role TEXT NOT NULL,
        PRIMARY KEY (contact_id_a, contact_id_b),
        FOREIGN KEY (contact_id_a) REFERENCES contacts(id) ON DELETE CASCADE,
        FOREIGN KEY (contact_id_b) REFERENCES contacts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY NOT NULL,
        contact_id TEXT NOT NULL,
        body TEXT NOT NULL,
        tags TEXT DEFAULT '',
        is_pinned INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
      );
    `,
  },
  {
    version: 2,
    sql: "ALTER TABLE contacts ADD COLUMN relationship TEXT DEFAULT '';",
  },
  {
    version: 3,
    sql: `
      ALTER TABLE contacts ADD COLUMN deleted_at INTEGER DEFAULT NULL;
      ALTER TABLE notes ADD COLUMN deleted_at INTEGER DEFAULT NULL;
      ALTER TABLE relationships ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE relationships ADD COLUMN deleted_at INTEGER DEFAULT NULL;
      CREATE INDEX IF NOT EXISTS contacts_deleted_at_idx ON contacts(deleted_at);
      CREATE INDEX IF NOT EXISTS notes_deleted_at_idx ON notes(deleted_at);
      CREATE INDEX IF NOT EXISTS relationships_deleted_at_idx ON relationships(deleted_at);
    `,
  },
];

export const db = new BrowserDbClient("/kin/kin.sqlite3", {
  migrations,
});

// Automatically mark sync dirty on local writes
db.subscribe(({ source }) => {
  if (source === "local") {
    void markSyncDirty();
  }
});
