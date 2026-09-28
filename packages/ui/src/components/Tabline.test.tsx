import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import Tabline, { TabItem } from "./Tabline";

describe("TUI Tabline Component", () => {
  const tabs: TabItem[] = [
    { label: "tasks.db", href: "/", active: true },
    { label: "settings.json", href: "/settings", active: false },
  ];

  it("renders the brand with title and app icon", () => {
    render(() => <Tabline appName="do" tabs={tabs} />);
    expect(screen.getByText("tildom")).toBeInTheDocument();
  });

  it("renders all tabs correctly in legacy fallback", () => {
    render(() => <Tabline appName="do" tabs={tabs} />);
    expect(screen.getByText("[ tasks.db ]")).toBeInTheDocument();
    expect(screen.getByText("[ settings.json ]")).toBeInTheDocument();
  });

  it("renders with decomposed compound syntax", () => {
    render(() => (
      <Tabline>
        <Tabline.Brand app="mark" title="tildom" />
        <Tabline.Nav>
          <Tabline.Tab href="/" active={true}>bookmarks.db</Tabline.Tab>
          <Tabline.Tab href="/settings">settings.json</Tabline.Tab>
        </Tabline.Nav>
        <span data-testid="right-slot">action</span>
      </Tabline>
    ));

    expect(screen.getByText("tildom")).toBeInTheDocument();
    expect(screen.getByText("[ bookmarks.db ]")).toBeInTheDocument();
    expect(screen.getByText("[ settings.json ]")).toBeInTheDocument();
    expect(screen.getByTestId("right-slot")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "[ bookmarks.db ]" })).toHaveAttribute("aria-current", "page");
  });

  it("renders button tabs and brands with onClick handlers", () => {
    let brandClicked = false;
    let tabClicked = false;

    render(() => (
      <Tabline>
        <Tabline.Brand app="hey" onClick={() => { brandClicked = true; }} />
        <Tabline.Nav>
          <Tabline.Tab active={true} onClick={() => { tabClicked = true; }}>chats.db</Tabline.Tab>
        </Tabline.Nav>
      </Tabline>
    ));

    const brandBtn = screen.getByRole("button", { name: "hey home" });
    const tabBtn = screen.getByRole("button", { name: "[ chats.db ]" });
    expect(brandBtn).toBeInTheDocument();
    expect(tabBtn).toBeInTheDocument();
    expect(tabBtn).toHaveAttribute("aria-current", "page");

    brandBtn.click();
    tabBtn.click();
    expect(brandClicked).toBe(true);
    expect(tabClicked).toBe(true);
  });
});
