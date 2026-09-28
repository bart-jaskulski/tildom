import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import EmptyState from "./EmptyState";

describe("EmptyState", () => {
  it("renders status message and role", () => {
    render(() => <EmptyState message="No local matches." />);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("No local matches.");
  });

  it("renders optional hint and action", () => {
    render(() => (
      <EmptyState
        message="No bookmarks yet"
        hint="Paste a URL or import your browser bookmarks to get started."
        action={<button type="button">Add Bookmark</button>}
      />
    ));
    expect(screen.getByText("No bookmarks yet")).toBeDefined();
    expect(screen.getByText(/Paste a URL/)).toBeDefined();
    expect(screen.getByRole("button", { name: "Add Bookmark" })).toBeDefined();
  });
});
