import { render, screen, fireEvent } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import RadioButton from "./RadioButton";

describe("TUI RadioButton Component", () => {
  it("renders correctly with ( ) when unselected", () => {
    render(() => <RadioButton checked={false} onChange={() => {}} label="Select Item" />);
    expect(screen.getByText("( )")).toBeInTheDocument();
    expect(screen.getByText("Select Item")).toBeInTheDocument();
  });

  it("renders correctly with (*) when selected", () => {
    render(() => <RadioButton checked={true} onChange={() => {}} label="Select Item" />);
    expect(screen.getByText("(*)")).toBeInTheDocument();
  });

  it("fires onChange callback on click", () => {
    const handleChange = vi.fn();
    render(() => <RadioButton checked={false} onChange={handleChange} label="Click Option" />);
    
    const input = screen.getByRole("radio");
    fireEvent.click(input);
    
    expect(handleChange).toHaveBeenCalled();
  });
});
