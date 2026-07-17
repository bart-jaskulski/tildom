import { describe, it, expect } from "vitest";
import { contactSlugs, parseTags, slugifyContactName, INVERSE_ROLES, ROLE_LABELS, type Contact } from "../stores/contactStore";

const contact = (id: string, name: string, created_at: number): Contact => ({
  id, name, relationship: "", created_at, updated_at: created_at, location: "", birthday: "", phone: "", email: "",
});

describe("Contact routes", () => {
  it("creates readable slugs from names", () => {
    expect(slugifyContactName("  Ann Lévigne  ")).toBe("ann-levigne");
  });

  it("adds stable numeric suffixes when names collide", () => {
    const slugs = contactSlugs([
      contact("third", "John", 3),
      contact("first", "John", 1),
      contact("second", "John", 2),
    ]);

    expect([...slugs.values()]).toEqual(["john", "john-2", "john-3"]);
  });
});

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
