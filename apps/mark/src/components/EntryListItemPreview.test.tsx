import { render, screen, fireEvent, cleanup } from "@solidjs/testing-library";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { Router, Route } from "@solidjs/router";
import { Search } from "@tildom/ui";
import EntryListItemPreview from "./EntryListItemPreview";
import type { Entry } from "~/lib/entries";

const mockNavigate = vi.fn();
vi.mock("@solidjs/router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@solidjs/router")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

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

const renderPreview = (options?: { onDelete?: (id: string) => void; loading?: boolean }) => render(() => (
  <Router>
    <Route
      path="/"
      component={() => (
        <Search query="">
          <EntryListItemPreview entry={mockEntry} onDelete={options?.onDelete} loading={options?.loading} />
        </Search>
      )}
    />
  </Router>
));

describe("EntryListItemPreview", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

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
    renderPreview({ onDelete });

    const trigger = screen.getByRole("button", { name: "Actions for Test Bookmark" });
    expect(trigger).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "[ copy link ]", hidden: true })).toBeInTheDocument();

    const deleteItem = screen.getByRole("button", { name: "[ delete ]", hidden: true });
    expect(deleteItem).toBeInTheDocument();
    fireEvent.click(deleteItem);
    expect(onDelete).toHaveBeenCalledWith("entry-1");
  });

  it("navigates to item when clicking tile or preview text", () => {
    const { container } = renderPreview();

    const preview = screen.getByText("Test excerpt");
    fireEvent.click(preview);
    expect(mockNavigate).toHaveBeenCalledWith("/item/entry-1");

    mockNavigate.mockClear();

    const row = container.querySelector("[data-entry-row]")!;
    fireEvent.click(row);
    expect(mockNavigate).toHaveBeenCalledWith("/item/entry-1");
  });

  it("does not navigate to item when clicking buttons, tags, or links", () => {
    renderPreview();

    const tag = screen.getByRole("link", { name: "#tag1" });
    fireEvent.click(tag);
    expect(mockNavigate).not.toHaveBeenCalled();

    const menuTrigger = screen.getByRole("button", { name: "Actions for Test Bookmark" });
    fireEvent.click(menuTrigger);
    expect(mockNavigate).not.toHaveBeenCalled();

    const domainLink = screen.getByRole("link", { name: "(example.com)" });
    fireEvent.click(domainLink);
    expect(mockNavigate).not.toHaveBeenCalled();

    const externalLink = screen.getByRole("link", { name: "[]" });
    fireEvent.click(externalLink);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("does not navigate to item when loading", () => {
    const { container } = renderPreview({ loading: true });

    const row = container.querySelector("[data-entry-row]")!;
    fireEvent.click(row);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("does not navigate to item when text is selected", () => {
    const { container } = renderPreview();
    const row = container.querySelector("[data-entry-row]")!;

    const getSelectionSpy = vi.spyOn(window, "getSelection").mockReturnValue({
      toString: () => "selected text",
    } as Selection);

    fireEvent.click(row);
    expect(mockNavigate).not.toHaveBeenCalled();

    getSelectionSpy.mockRestore();
  });

  it("opens in new window when meta or ctrl key is pressed", () => {
    const { container } = renderPreview();
    const row = container.querySelector("[data-entry-row]")!;

    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    fireEvent.click(row, { metaKey: true });
    expect(openSpy).toHaveBeenCalledWith("/item/entry-1", "_blank");
    expect(mockNavigate).not.toHaveBeenCalled();

    openSpy.mockClear();

    fireEvent.click(row, { ctrlKey: true });
    expect(openSpy).toHaveBeenCalledWith("/item/entry-1", "_blank");
    expect(mockNavigate).not.toHaveBeenCalled();

    openSpy.mockRestore();
  });
});
