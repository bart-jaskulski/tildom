import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Search } from "./index";

describe("Search Compound Component Suite", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("throws error when Search.Highlight is used outside Search provider", () => {
    expect(() => {
      render(() => <Search.Highlight>hello</Search.Highlight>);
    }).toThrow("<Search.Input> and <Search.Highlight> must be used within a <Search> component.");
  });

  it("throws error when Search.Input is used outside Search provider", () => {
    expect(() => {
      render(() => <Search.Input />);
    }).toThrow("<Search.Input> and <Search.Highlight> must be used within a <Search> component.");
  });

  it("highlights terms using query from Search context without query prop", () => {
    const { container } = render(() => (
      <Search query="quick fox">
        <Search.Highlight>The quick brown fox jumps</Search.Highlight>
      </Search>
    ));

    const marks = container.querySelectorAll("mark");
    expect(marks.length).toBe(2);
    expect(marks[0].textContent).toBe("quick");
    expect(marks[1].textContent).toBe("fox");
  });

  it("reacts when query accessor updates", () => {
    const [query, setQuery] = createSignal("quick");
    const { container } = render(() => (
      <Search query={query}>
        <Search.Highlight>The quick brown fox jumps</Search.Highlight>
      </Search>
    ));

    let marks = container.querySelectorAll("mark");
    expect(marks.length).toBe(1);
    expect(marks[0].textContent).toBe("quick");

    setQuery("brown fox");
    marks = container.querySelectorAll("mark");
    expect(marks.length).toBe(2);
    expect(marks[0].textContent).toBe("brown");
    expect(marks[1].textContent).toBe("fox");
  });

  it("debounces user input in Search.Input and calls onSearch", () => {
    const onSearch = vi.fn();
    render(() => (
      <Search query="" onSearch={onSearch}>
        <Search.Input placeholder="Search..." />
      </Search>
    ));

    const input = screen.getByPlaceholderText("Search...");
    fireEvent.input(input, { target: { value: "test query" } });

    expect(onSearch).not.toHaveBeenCalled();

    vi.advanceTimersByTime(349);
    expect(onSearch).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("test query");
  });

  it("immediately flushes search on Enter keydown", () => {
    const onSearch = vi.fn();
    render(() => (
      <Search query="" onSearch={onSearch}>
        <Search.Input placeholder="Search..." />
      </Search>
    ));

    const input = screen.getByPlaceholderText("Search...");
    fireEvent.input(input, { target: { value: "instant query" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("instant query");
  });
});
