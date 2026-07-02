import { render, screen, fireEvent } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import Button from "./Button";

describe("TUI Button Component", () => {
  it("renders correctly with default children and brackets", () => {
    render(() => <Button>Click Me</Button>);
    expect(screen.getByRole("button", { name: "[ Click Me ]" })).toBeInTheDocument();
  });

  it("fires onClick callback on click", () => {
    const handleClick = vi.fn();
    render(() => <Button onClick={handleClick}>Submit</Button>);
    
    const button = screen.getByRole("button");
    fireEvent.click(button);
    
    expect(handleClick).toHaveBeenCalled();
  });

  it("respects disabled state", () => {
    const handleClick = vi.fn();
    render(() => <Button onClick={handleClick} disabled>Disabled</Button>);
    
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    
    fireEvent.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });
});
