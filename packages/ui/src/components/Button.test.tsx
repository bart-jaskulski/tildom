import { render, screen, fireEvent } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import Button from "./Button";

describe("TUI Button Component", () => {
  it("renders correctly with default children", () => {
    render(() => <Button>Click Me</Button>);
    expect(screen.getByRole("button", { name: "Click Me" })).toBeInTheDocument();
  });

  it("renders with brackets when bracket prop is true", () => {
    render(() => <Button bracket>Click Me</Button>);
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

  it("supports danger variant and text variant", () => {
    const { unmount } = render(() => <Button danger>Delete</Button>);
    const deleteBtn = screen.getByRole("button", { name: "Delete" });
    expect(deleteBtn.className).toContain("danger");
    unmount();

    render(() => <Button variant="text" inline>Help</Button>);
    const textBtn = screen.getByRole("button", { name: "Help" });
    expect(textBtn.className).toContain("text");
    expect(textBtn.className).toContain("inline");
  });

  it("renders as anchor link when href is passed", () => {
    render(() => <Button href="/home">Home</Button>);
    const link = screen.getByRole("link", { name: "Home" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/home");
  });
});
