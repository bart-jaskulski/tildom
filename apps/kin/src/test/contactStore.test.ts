import { describe, it, expect } from "vitest";
import { parseTags, INVERSE_ROLES, ROLE_LABELS } from "../stores/contactStore";

describe("Hashtag Parsing Pipeline", () => {
  it("should extract multiple hashtags and format as space-padded strings", () => {
    const text = "Logging a meeting with #Alice and #Bob to discuss #cooking!";
    const result = parseTags(text);
    expect(result).toBe(" alice bob cooking ");
  });

  it("should deduplicate hashtags and convert them to lowercase", () => {
    const text = "Working on #ProjectA and #projecta, with #ProjectB #ProjectA";
    const result = parseTags(text);
    expect(result).toBe(" projecta projectb ");
  });

  it("should return an empty string if no hashtags are found", () => {
    const text = "Just a standard timeline log entry without tags.";
    const result = parseTags(text);
    expect(result).toBe("");
  });

  it("should handle special tag characters (hyphens and underscores)", () => {
    const text = "Logging #local-first and #tildom_family tags.";
    const result = parseTags(text);
    expect(result).toBe(" local-first tildom_family ");
  });
});

describe("Symmetrical Relationship Translation Layer", () => {
  it("should map asymmetric roles correctly", () => {
    expect(INVERSE_ROLES["parent"]).toBe("child");
    expect(INVERSE_ROLES["child"]).toBe("parent");
    expect(INVERSE_ROLES["mentor"]).toBe("mentee");
    expect(INVERSE_ROLES["mentee"]).toBe("mentor");
  });

  it("should resolve reciprocal roles like spouse or friend as-is", () => {
    expect(INVERSE_ROLES["spouse"]).toBe("spouse");
    expect(INVERSE_ROLES["friend"]).toBe("friend");
    expect(INVERSE_ROLES["sibling"]).toBe("sibling");
    expect(INVERSE_ROLES["partner"]).toBe("partner");
    expect(INVERSE_ROLES["colleague"]).toBe("colleague");
  });

  it("should map role labels correctly for UI headers", () => {
    expect(ROLE_LABELS["parent"]).toBe("Parent");
    expect(ROLE_LABELS["child"]).toBe("Child");
    expect(ROLE_LABELS["mentor"]).toBe("Mentor");
    expect(ROLE_LABELS["spouse"]).toBe("Spouse");
  });
});
