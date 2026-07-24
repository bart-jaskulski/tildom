import type { DbMigration } from "@tildom/browser-db";

export const KIN_DB_MIGRATIONS: DbMigration[] = [
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
];

export const KIN_REQUIRED_TABLES = ["contacts", "relationships", "notes"];
