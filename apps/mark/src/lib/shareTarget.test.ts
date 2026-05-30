import { describe, expect, it } from "vitest";
import { buildSharedEntryBody, readShareTargetPayload } from "./shareTarget";

describe("shareTarget", () => {
  it("prefers shared urls for new entries", () => {
    const payload = readShareTargetPayload({
      title: "Example title",
      text: "Some surrounding context",
      url: " https://example.com/story ",
    });

    expect(buildSharedEntryBody(payload)).toBe("https://example.com/story");
  });

  it("falls back to a note when only text metadata is shared", () => {
    const payload = readShareTargetPayload({
      title: "Example title",
      text: "A clipped quote",
    });

    expect(buildSharedEntryBody(payload)).toBe("Example title\n\nA clipped quote");
  });

  it("returns null when the share target payload is empty", () => {
    const payload = readShareTargetPayload({
      title: "   ",
      text: "",
      url: null,
    });

    expect(buildSharedEntryBody(payload)).toBeNull();
  });
});
