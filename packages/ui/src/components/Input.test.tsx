import { render, screen, fireEvent } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import Input from "./Input";

describe("TUI Input Component", () => {
  it("renders correctly with placeholder", () => {
    render(() => <Input placeholder="search" />);
    expect(screen.getByPlaceholderText("search")).toBeInTheDocument();
  });

  it("handles input value changes", () => {
    const handleInput = vi.fn();
    render(() => <Input placeholder="enter text" onInput={handleInput} />);
    
    const input = screen.getByPlaceholderText("enter text");
    fireEvent.input(input, { target: { value: "hello" } });
    
    expect(handleInput).toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe("hello");
  });
});
