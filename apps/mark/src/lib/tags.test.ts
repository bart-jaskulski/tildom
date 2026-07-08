import { describe, expect, it } from "vitest";
import { normalizeTagList, normalizeTagName, parseTagInput } from "./tags";

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
});

