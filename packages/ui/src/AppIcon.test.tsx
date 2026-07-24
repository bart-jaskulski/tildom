import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { AppIcon, type AppIconName } from "./AppIcon";

describe("AppIcon", () => {
  it("renders a distinct glyph for every app", () => {
    const apps: AppIconName[] = ["home", "mark", "do", "kin", "hey"];
    const glyphs = apps.map((app) => {
      const { container, unmount } = render(() => <AppIcon app={app} />);
      const glyph = container.querySelector("svg")?.innerHTML;
      unmount();
      return glyph;
    });

    expect(glyphs.every(Boolean)).toBe(true);
    expect(new Set(glyphs).size).toBe(apps.length);
  });
});
