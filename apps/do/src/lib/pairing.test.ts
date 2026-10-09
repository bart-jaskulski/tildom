import { describe, expect, it } from "vitest";
import { buildPairingUrl, parsePairingSecret } from "@tildom/sync-client";

describe("shared pairing format", () => {
  it("round-trips new links and refuses legacy vault links", () => {
    const secret = "A".repeat(43);
    const link = new URL(buildPairingUrl("https://do.tildom.test", secret));
    expect(link.pathname).toBe("/pair");
    expect(parsePairingSecret(link.hash)).toBe(secret);
    expect(parsePairingSecret(`#vault=${secret}`)).toBeNull();
    expect(parsePairingSecret("#sync=v1.invalid")).toBeNull();
  });
});
