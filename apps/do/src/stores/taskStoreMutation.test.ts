import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DO_DB_MIGRATIONS } from "~/lib/schema";

let memDb: DatabaseSync;
const { setSubscriber } = vi.hoisted(() => {
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
  for (const m of DO_DB_MIGRATIONS) {
    db.exec(m.sql);
  }
  return db;
};

vi.mock("~/lib/db", () => ({
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
      const normalizedValues = values.map((val) => (val === undefined ? null : val));
      return Promise.resolve(stmt.all(...(normalizedValues as any[])));
    }),
  },
}));

vi.mock("~/lib/syncState", () => ({
  syncState: {
    markSyncDirty: vi.fn(),
  },
}));

import {
  addTask,
  createWorkspace,
  DEFAULT_WORKSPACE_ID,
  deleteTask,
  initializeTaskStore,
  moveTask,
  renameWorkspace,
  updateTask,
} from "./taskStore";

describe("taskStore (Real SQLite Behavioral Integration)", () => {
  beforeEach(async () => {
    memDb = createTestDb();
    await initializeTaskStore();
  });

  const queryTasks = (where = "1=1", params: any[] = []) =>
    memDb.prepare(`SELECT * FROM tasks WHERE ${where}`).all(...params) as any[];

  const queryWorkspaces = (where = "1=1", params: any[] = []) =>
    memDb.prepare(`SELECT * FROM workspaces WHERE ${where}`).all(...params) as any[];

  it("inserts a root task into SQLite with generated rank and default workspace", async () => {
    const task = await addTask({ content: "Prepare quarterly roadmap" });

    expect(task.text).toBe("Prepare quarterly roadmap");
    expect(task.parentId).toBeNull();
    expect(task.completed).toBe(false);

    const rows = queryTasks("id = ?", [task.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe("Prepare quarterly roadmap");
    expect(rows[0].parent_id).toBeNull();
    expect(rows[0].completed).toBe(0);
    expect(rows[0].workspace_id).toBe(DEFAULT_WORKSPACE_ID);
    expect(rows[0].rank).toBeTruthy();
  });

  it("creates a subtask linked to parent with computed rank and inherited workspace", async () => {
    const parent = await addTask({ content: "Annual tax return" });
    const subtask = await addTask({ content: "Collect W-2 forms" }, parent.id);

    expect(subtask.parentId).toBe(parent.id);
    expect(subtask.workspaceId).toBe(DEFAULT_WORKSPACE_ID);

    const rows = queryTasks("parent_id = ?", [parent.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(subtask.id);
    expect(rows[0].text).toBe("Collect W-2 forms");
  });

  it("updates task content, completion, and due date in SQLite", async () => {
    const task = await addTask({ content: "Initial draft" });
    const targetDue = Date.UTC(2026, 11, 31);

    await updateTask(task.id, {
      text: "Revised proposal",
      completed: true,
      dueAt: targetDue,
    });

    const rows = queryTasks("id = ?", [task.id]);
    expect(rows[0].text).toBe("Revised proposal");
    expect(rows[0].completed).toBe(1);
    expect(rows[0].due_at).toBe(targetDue);
    expect(rows[0].updated_at).toBeGreaterThanOrEqual(task.createdAt);
  });

  it("moves a task under a new parent with recomputed LexoRank", async () => {
    const parentA = await addTask({ content: "Project Alpha" });
    const parentB = await addTask({ content: "Project Beta" });
    const child = await addTask({ content: "Wireframing" }, parentA.id);

    await moveTask(child.id, parentB.id);

    const rows = queryTasks("id = ?", [child.id]);
    expect(rows[0].parent_id).toBe(parentB.id);
    expect(rows[0].rank).toBeTruthy();
  });

  it("recursively deletes a task and all nested descendants", async () => {
    const root = await addTask({ content: "Epic: Authentication overhaul" });
    const child = await addTask({ content: "Feature: Passkeys support" }, root.id);
    const grandchild = await addTask({ content: "Task: Implement WebAuthn ceremony" }, child.id);
    const unrelated = await addTask({ content: "Unrelated maintenance" });

    // Delete the root epic
    await deleteTask(root.id);

    // Root, child, and grandchild should all be deleted
    expect(queryTasks("id = ?", [root.id])).toHaveLength(0);
    expect(queryTasks("id = ?", [child.id])).toHaveLength(0);
    expect(queryTasks("id = ?", [grandchild.id])).toHaveLength(0);

    // Unrelated task must remain untouched
    expect(queryTasks("id = ?", [unrelated.id])).toHaveLength(1);
  });

  it("creates and renames custom workspaces in SQLite", async () => {
    const wsId = await createWorkspace("Client Work");
    expect(wsId).toBeTruthy();

    const createdRows = queryWorkspaces("id = ?", [wsId!]);
    expect(createdRows).toHaveLength(1);
    expect(createdRows[0].name).toBe("Client Work");

    await renameWorkspace(wsId!, "Freelance Projects");
    const updatedRows = queryWorkspaces("id = ?", [wsId!]);
    expect(updatedRows[0].name).toBe("Freelance Projects");
  });
});
