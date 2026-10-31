import { createRoot, createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { createListNavigation } from "./listNavigation";

describe("createListNavigation", () => {
  it("navigates forward and backward with clamping", () => {
    createRoot((dispose) => {
      const [items] = createSignal(["alpha", "beta", "gamma"]);
      const onSelect = vi.fn();

      const nav = createListNavigation({
        items,
        onSelect,
      });

      expect(nav.activeIndex()).toBeNull();
      expect(nav.activeItem()).toBeNull();

      nav.moveNext();
      expect(nav.activeIndex()).toBe(0);
      expect(nav.activeItem()).toBe("alpha");
      expect(onSelect).toHaveBeenCalledWith("alpha", 0);

      nav.moveNext();
      expect(nav.activeIndex()).toBe(1);
      expect(nav.activeItem()).toBe("beta");

      nav.moveNext();
      expect(nav.activeIndex()).toBe(2);
      expect(nav.activeItem()).toBe("gamma");

      // Clamps at end
      nav.moveNext();
      expect(nav.activeIndex()).toBe(2);

      // Moves back
      nav.movePrev();
      expect(nav.activeIndex()).toBe(1);
      expect(nav.activeItem()).toBe("beta");

      // Resets
      nav.reset();
      expect(nav.activeIndex()).toBeNull();
      expect(nav.activeItem()).toBeNull();

      dispose();
    });
  });
});
