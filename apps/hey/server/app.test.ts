import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { safePath } from "./memory.ts";

describe("memory paths", () => {
  it("accepts relative Markdown paths without traversal", () => {
    assert.equal(safePath("preferences/communication.md"), true);
    assert.equal(safePath("../private.md"), false);
    assert.equal(safePath("/private.md"), false);
  });
});
