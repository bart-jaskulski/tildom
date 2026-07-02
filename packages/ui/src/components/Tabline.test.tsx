import { render, screen, fireEvent } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import Tabline, { TabItem } from "./Tabline";

describe("TUI Tabline Component", () => {
  const tabs: TabItem[] = [
    { label: "tasks.db", href: "/", active: true },
    { label: "settings.json", href: "/settings", active: false },
  ];

  it("renders the brand with app name and standard suffix", () => {
    render(() => <Tabline appName="do" tabs={tabs} />);
    expect(screen.getByText("~")).toBeInTheDocument();
    expect(screen.getByText("do.tildom")).toBeInTheDocument();
  });

  it("renders all tabs correctly", () => {
    render(() => <Tabline appName="do" tabs={tabs} />);
    expect(screen.getByText("[ tasks.db ]")).toBeInTheDocument();
    expect(screen.getByText("[ settings.json ]")).toBeInTheDocument();
  });

  it("handles search inputs and clear calls", () => {
    const handleInput = vi.fn();
    const handleClear = vi.fn();

    render(() => (
      <Tabline
        appName="do"
        tabs={tabs}
        search={{
          value: "test-query",
          onInput: handleInput,
          onClear: handleClear,
        }}
      />
    ));

    const input = screen.getByRole("searchbox");
    expect(input).toHaveValue("test-query");

    fireEvent.input(input, { target: { value: "hello" } });
    expect(handleInput).toHaveBeenCalled();

    const clearButton = screen.getByRole("button", { name: "Clear search" });
    fireEvent.click(clearButton);
    expect(handleClear).toHaveBeenCalled();
  });
});
