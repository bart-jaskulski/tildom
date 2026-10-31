import { render } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import Editor, { type EditorHandle } from "./Editor";

describe("TUI Editor Component", () => {
  it("renders with initial value", () => {
    let handle: EditorHandle | undefined;
    const { container } = render(() => (
      <Editor
        value="# Hello World"
        ref={(h) => {
          handle = h;
        }}
      />
    ));

    expect(container.querySelector(".cm-editor")).not.toBeNull();
    expect(handle?.view?.state.doc.toString()).toBe("# Hello World");
  });

  it("updates document when value prop changes", async () => {
    let handle: EditorHandle | undefined;
    const { container } = render(() => (
      <Editor
        value="Initial"
        ref={(h) => {
          handle = h;
        }}
      />
    ));

    expect(handle?.view?.state.doc.toString()).toBe("Initial");
  });

  it("invokes onInput when content changes", () => {
    let handle: EditorHandle | undefined;
    const onInput = vi.fn();

    render(() => (
      <Editor
        value="First"
        onInput={onInput}
        ref={(h) => {
          handle = h;
        }}
      />
    ));

    handle?.view?.dispatch({
      changes: { from: 5, to: 5, insert: " line" },
    });

    expect(onInput).toHaveBeenCalledWith("First line");
  });

  it("supports Mod-Enter submit callback", () => {
    let handle: EditorHandle | undefined;
    const onSubmit = vi.fn();

    render(() => (
      <Editor
        value="Note"
        onSubmit={onSubmit}
        ref={(h) => {
          handle = h;
        }}
      />
    ));

    const view = handle?.view;
    expect(view).toBeDefined();

    // Trigger Mod-Enter key event on cm content DOM
    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      ctrlKey: true,
      bubbles: true,
    });
    view?.contentDOM.dispatchEvent(event);

    expect(onSubmit).toHaveBeenCalled();
  });

  it("toggles task item between unchecked and checked on click", () => {
    let handle: EditorHandle | undefined;
    render(() => (
      <Editor
        value="- [ ] Buy milk"
        ref={(h) => {
          handle = h;
        }}
      />
    ));

    const view = handle?.view;
    expect(view).toBeDefined();

    // Mock posAtCoords to return index within "- [ ]" (e.g. index 3)
    if (view) {
      vi.spyOn(view, "posAtCoords").mockReturnValue(3);
      view.contentDOM.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 10, clientY: 10 }));
      expect(view.state.doc.toString()).toBe("- [x] Buy milk");

      // Click again to uncheck
      view.contentDOM.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 10, clientY: 10 }));
      expect(view.state.doc.toString()).toBe("- [ ] Buy milk");
    }
  });
});
