import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("db worker schema", () => {
  it("defines local entry and comment tables plus a derived search table", async () => {
    const source = await readFile(join(process.cwd(), "src/workers/db.worker.ts"), "utf8");

    expect(source).toContain("CREATE TABLE IF NOT EXISTS entries");
    expect(source).toContain("CREATE TABLE IF NOT EXISTS comments");
    expect(source).toContain("CREATE TABLE IF NOT EXISTS search_documents");
    expect(source).toContain("CREATE VIRTUAL TABLE IF NOT EXISTS search_documents_fts USING fts5");
    expect(source).toContain("CREATE TRIGGER IF NOT EXISTS entries_search_ai");
    expect(source).toContain("CREATE TRIGGER IF NOT EXISTS entries_search_ad");
    expect(source).toContain("CREATE TRIGGER IF NOT EXISTS comments_search_ai");
    expect(source).not.toContain("crsql_as_crr");
    expect(source).not.toContain("site_id");
  });
});
