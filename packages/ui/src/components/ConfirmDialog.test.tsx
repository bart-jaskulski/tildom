import { render, screen, fireEvent } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import ConfirmDialog from "./ConfirmDialog";

describe("TUI ConfirmDialog Component", () => {
  it("renders with title, message, cancel, and confirm buttons", () => {
    const handleConfirm = vi.fn();
    const handleCancel = vi.fn();

    render(() => (
      <ConfirmDialog
        open={true}
        title="Delete Item?"
        message="This action cannot be undone."
        danger
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    ));

    expect(screen.getByText("Delete Item?")).toBeInTheDocument();
    expect(screen.getByText("This action cannot be undone.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "[ cancel ]" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "[ delete ]" })).toBeInTheDocument();
  });

  it("calls onConfirm and onCancel callbacks", () => {
    const handleConfirm = vi.fn();
    const handleCancel = vi.fn();

    render(() => (
      <ConfirmDialog
        open={true}
        title="Confirm action"
        confirmText="proceed"
        cancelText="abort"
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    ));

    const cancelBtn = screen.getByRole("button", { name: "[ abort ]" });
    fireEvent.click(cancelBtn);
    expect(handleCancel).toHaveBeenCalledTimes(1);

    const confirmBtn = screen.getByRole("button", { name: "[ proceed ]" });
    fireEvent.click(confirmBtn);
    expect(handleConfirm).toHaveBeenCalledTimes(1);
  });
});
