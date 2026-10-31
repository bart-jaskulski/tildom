import { render, screen, fireEvent, cleanup } from "@solidjs/testing-library";
import { describe, it, expect, vi, afterEach } from "vitest";
import { Router, Route } from "@solidjs/router";
import { Search } from "@tildom/ui";
import EntryListItemPreview from "./EntryListItemPreview";
import type { Entry } from "~/lib/entries";

const mockEntry: Entry = {
  id: "entry-1",
  title: "Test Bookmark",
  body: "Test bookmark description #tag1",
  domain: "example.com",
  canonicalUrl: "https://example.com/test",
  sourceUrl: "https://example.com/test",
  commentCount: 2,
  readerTextLength: 1200,
  createdAt: 1000,
  updatedAt: 1000,
  lastOpenedAt: null,
  firstOpenedAt: 1000,
  lastCommentedAt: null,
  tags: ["tag1"],
  excerpt: "Test excerpt",
  excerptStatus: "idle",
  excerptError: null,
};

const renderPreview = (onDelete?: (id: string) => void) => render(() => (
  <Router>
    <Route
      path="/"
      component={() => (
        <Search query="">
          <EntryListItemPreview entry={mockEntry} onDelete={onDelete} />
        </Search>
      )}
    />
  </Router>
));

describe("EntryListItemPreview", () => {
  afterEach(() => {
    cleanup();
  });
  it("renders title, domain, and note count without inline actions row", () => {
    renderPreview();

    expect(screen.getByText("Test Bookmark")).toBeInTheDocument();
    expect(screen.getByText("(example.com)")).toBeInTheDocument();
    expect(screen.getByText("2 notes")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "read" })).not.toBeInTheDocument();

    // Inline edit and actions row should be gone
    expect(screen.queryByRole("link", { name: "edit" })).not.toBeInTheDocument();
  });

  it("renders an actions popover trigger and menu items", () => {
    const onDelete = vi.fn();
    renderPreview(onDelete);

    const trigger = screen.getByRole("button", { name: "Actions for Test Bookmark" });
    expect(trigger).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "[ copy link ]", hidden: true })).toBeInTheDocument();

    const deleteItem = screen.getByRole("button", { name: "[ delete ]", hidden: true });
    expect(deleteItem).toBeInTheDocument();
    fireEvent.click(deleteItem);
    expect(onDelete).toHaveBeenCalledWith("entry-1");
  });
});
