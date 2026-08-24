import { describe, expect, it } from "vitest";
import { normalizeTagList, normalizeTagName, parseHashTags, parseTagInput, stripTrailingTagLines } from "./tags";

describe("tag normalization", () => {
  it("normalizes supported tag shapes", () => {
    expect(normalizeTagName("#AI")).toBe("ai");
    expect(normalizeTagName("dev_tools")).toBe("dev-tools");
    expect(normalizeTagName("Machine Learning")).toBe("machine-learning");
  });

  it("rejects empty and overlong tags", () => {
    expect(normalizeTagName("---")).toBeNull();
    expect(normalizeTagName("a".repeat(33))).toBeNull();
  });

  it("parses manual tag input with deduplication", () => {
    expect(parseTagInput("AI, local_first ai")).toEqual(["ai", "local-first"]);
  });

  it("normalizes AI tag arrays without splitting phrases", () => {
    expect(normalizeTagList(["Machine Learning", "machine-learning"])).toEqual(["machine-learning"]);
  });

  it("extracts unique hashtags without treating URL fragments as tags", () => {
    expect(parseHashTags("Plan #Local_First with #local-first at https://example.com/#not-a-tag"))
      .toEqual(["local-first"]);
  });

  it("keeps inline tags but removes a trailing tag-only block from excerpts", () => {
    expect(stripTrailingTagLines("A note about #gardening\n\n#plants #spring")).toBe("A note about #gardening");
  });
});
