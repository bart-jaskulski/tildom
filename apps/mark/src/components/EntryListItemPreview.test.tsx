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
  it("renders title, domain, note count, and reader link without inline actions row", () => {
    renderPreview();

    expect(screen.getByText("Test Bookmark")).toBeInTheDocument();
    expect(screen.getByText("(example.com)")).toBeInTheDocument();
    expect(screen.getByText("2 notes")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "read" })).toHaveAttribute("href", "/item/entry-1/read");

    // Inline edit and actions row should be gone
    expect(screen.queryByRole("link", { name: "edit" })).not.toBeInTheDocument();
  });

  it("renders a small desktop delete button that calls onDelete", () => {
    const onDelete = vi.fn();
    renderPreview(onDelete);

    const deleteButton = screen.getByRole("button", { name: "Delete entry" });
    expect(deleteButton).toBeInTheDocument();
    fireEvent.click(deleteButton);
    expect(onDelete).toHaveBeenCalledWith("entry-1");
  });

  it("animates on touch move and triggers onDelete when swiped past threshold", () => {
    const onDelete = vi.fn();
    renderPreview(onDelete);

    const article = screen.getByRole("article");

    // Touch down
    fireEvent.pointerDown(article, { pointerType: "touch", clientX: 200, clientY: 100 });

    // Touch move left by 40px
    fireEvent.pointerMove(article, { pointerType: "touch", clientX: 160, clientY: 100 });
    expect(article.style.transform).toBe("translateX(-40px)");

    // Touch move further left past threshold (past -72px, e.g. dx = -80px)
    fireEvent.pointerMove(article, { pointerType: "touch", clientX: 120, clientY: 100 });
    expect(article.style.transform).toBe("translateX(-80px)");

    // Touch release
    fireEvent.pointerUp(article, { pointerType: "touch", clientX: 120, clientY: 100 });

    expect(onDelete).toHaveBeenCalledWith("entry-1");
    expect(article.style.transform).toBe("");
  });

  it("cancels swipe gesture if vertical scroll movement dominates", () => {
    const onDelete = vi.fn();
    renderPreview(onDelete);

    const article = screen.getByRole("article");

    fireEvent.pointerDown(article, { pointerType: "touch", clientX: 200, clientY: 100 });
    // Vertical move is 30px, horizontal is 5px
    fireEvent.pointerMove(article, { pointerType: "touch", clientX: 195, clientY: 130 });

    // Transform should not be set because vertical dominance cancelled the gesture
    expect(article.style.transform).toBe("");

    fireEvent.pointerUp(article, { pointerType: "touch", clientX: 100, clientY: 130 });
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("does not trigger delete if swipe distance is below threshold", () => {
    const onDelete = vi.fn();
    renderPreview(onDelete);

    const article = screen.getByRole("article");

    fireEvent.pointerDown(article, { pointerType: "touch", clientX: 200, clientY: 100 });
    fireEvent.pointerMove(article, { pointerType: "touch", clientX: 160, clientY: 100 });
    expect(article.style.transform).toBe("translateX(-40px)");

    // Released at -40px (threshold is -72px)
    fireEvent.pointerUp(article, { pointerType: "touch", clientX: 160, clientY: 100 });

    expect(onDelete).not.toHaveBeenCalled();
    expect(article.style.transform).toBe("");
  });
});
