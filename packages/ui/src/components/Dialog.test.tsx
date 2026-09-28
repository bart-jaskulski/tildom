import { render, screen, fireEvent } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import Dialog from "./Dialog";

describe("TUI Dialog Component", () => {
  it("renders with native dialog element and title", () => {
    render(() => (
      <Dialog open={true} title="Test Dialog">
        <p>Dialog content</p>
      </Dialog>
    ));

    const dialog = screen.getByRole("dialog", { hidden: true });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("Test Dialog")).toBeInTheDocument();
    expect(screen.getByText("Dialog content")).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", () => {
    const handleClose = vi.fn();
    render(() => (
      <Dialog open={true} title="Closable Dialog" onClose={handleClose}>
        <p>Content</p>
      </Dialog>
    ));

    const closeBtn = screen.getByRole("button", { name: "Close dialog" });
    fireEvent.click(closeBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when backdrop is clicked", () => {
    const handleClose = vi.fn();
    render(() => (
      <Dialog open={true} title="Backdrop Dialog" onClose={handleClose}>
        <p>Inside Content</p>
      </Dialog>
    ));

    const dialog = screen.getByRole("dialog", { hidden: true });
    // Clicking on dialog itself simulates backdrop click
    fireEvent.click(dialog);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
