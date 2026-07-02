import { render, screen, fireEvent } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import Textarea from "./Textarea";

describe("TUI Textarea Component", () => {
  it("renders correctly with custom placeholder", () => {
    render(() => <Textarea placeholder="enter notes" />);
    expect(screen.getByPlaceholderText("enter notes")).toBeInTheDocument();
  });

  it("handles text input changes", () => {
    const handleInput = vi.fn();
    render(() => <Textarea placeholder="type description" onInput={handleInput} />);
    
    const textarea = screen.getByPlaceholderText("type description");
    fireEvent.input(textarea, { target: { value: "my multi-line text" } });
    
    expect(handleInput).toHaveBeenCalled();
    expect((textarea as HTMLTextAreaElement).value).toBe("my multi-line text");
  });
});
