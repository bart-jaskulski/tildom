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

  it("does not trigger callbacks when typing in a contenteditable element", () => {
    const callback = vi.fn();
    const Harness = () => {
      createVimNavigation([{ lhs: "h", callback }]);
      return <div data-testid="editor" contentEditable={true} />;
    };

    const { getByTestId } = render(() => <Harness />);
    const editor = getByTestId("editor");
    editor.focus();

    fireEvent.keyDown(editor, { key: "h" });
    expect(callback).not.toHaveBeenCalled();
  });

  it("blurs contenteditable element on Escape", () => {
    const callback = vi.fn();
    const Harness = () => {
      createVimNavigation([{ lhs: "Escape", callback }]);
      return <div data-testid="editor" contentEditable={true} />;
    };

    const { getByTestId } = render(() => <Harness />);
    const editor = getByTestId("editor");
    editor.focus();
    expect(document.activeElement).toBe(editor);

    fireEvent.keyDown(editor, { key: "Escape" });
    expect(document.activeElement).not.toBe(editor);
    expect(callback).not.toHaveBeenCalled();
  });

  it("does not trigger callbacks when modifier keys are pressed", () => {
    const callback = vi.fn();
    const Harness = () => {
      createVimNavigation([{ lhs: "h", callback }]);
      return null;
    };

    render(() => <Harness />);
    fireEvent.keyDown(window, { key: "h", metaKey: true });
    fireEvent.keyDown(window, { key: "h", ctrlKey: true });
    fireEvent.keyDown(window, { key: "h", altKey: true });

    expect(callback).not.toHaveBeenCalled();
  });
});
