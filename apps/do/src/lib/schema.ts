export const DO_DB_SCHEMA = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT NOT NULL PRIMARY KEY DEFAULT '',
  parent_id TEXT,
  text TEXT NOT NULL DEFAULT '',
  completed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER,
  due_at INTEGER,
  rank TEXT NOT NULL DEFAULT '',
  workspace_id TEXT,
  site_id BLOB
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT NOT NULL PRIMARY KEY DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  site_id BLOB
);

INSERT OR IGNORE INTO workspaces (id, name, created_at, updated_at)
VALUES ('default', 'Default', strftime('%s','now')*1000, strftime('%s','now')*1000);

UPDATE tasks SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE tasks SET workspace_id = 'default' WHERE workspace_id IS NULL OR workspace_id = '';
`;
