import { describe, expect, it } from "vitest";
import { safePath } from "../src/hey/memory.ts";

describe("memory paths", () => {
  it("accepts relative Markdown paths without traversal", () => {
    expect(safePath("preferences/communication.md")).toBe(true);
    expect(safePath("../private.md")).toBe(false);
    expect(safePath("/private.md")).toBe(false);
  });
});
