import { fireEvent, render } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { createVimNavigation } from "./keyboard";

describe("createVimNavigation", () => {
  it("passes the resolved alias to its callback", () => {
    const callback = vi.fn();
    const Harness = () => {
      createVimNavigation([{ lhs: ["1", "7"], callback }]);
      return null;
    };

    render(() => <Harness />);
    fireEvent.keyDown(window, { key: "7" });

    expect(callback).toHaveBeenCalledWith({ lhs: "7" });
  });

  it("resolves multi-key mappings", () => {
    const callback = vi.fn();
    const Harness = () => {
      createVimNavigation([{ lhs: "gt", callback }]);
      return null;
    };

    render(() => <Harness />);
    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "t" });

    expect(callback).toHaveBeenCalledWith({ lhs: "gt" });
  });
});
