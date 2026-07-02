import { render, screen, fireEvent } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import Checkbox from "./Checkbox";

describe("TUI Checkbox Component", () => {
  it("renders correctly with [ ] when unchecked", () => {
    render(() => <Checkbox checked={false} onChange={() => {}} label="Test Label" />);
    expect(screen.getByText("[ ]")).toBeInTheDocument();
    expect(screen.getByText("Test Label")).toBeInTheDocument();
  });

  it("renders correctly with [x] when checked", () => {
    render(() => <Checkbox checked={true} onChange={() => {}} />);
    expect(screen.getByText("[x]")).toBeInTheDocument();
  });

  it("fires onChange callback with updated status when clicked", () => {
    const handleChange = vi.fn();
    render(() => <Checkbox checked={false} onChange={handleChange} label="Toggle Me" />);
    
    const input = screen.getByRole("checkbox");
    fireEvent.click(input);
    
    expect(handleChange).toHaveBeenCalledWith(true);
  });
});
