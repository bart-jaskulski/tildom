import { render, screen, fireEvent } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import Popover, { PopoverItem } from "./Popover";

describe("TUI Popover Component", () => {
  it("renders with popover attribute and content", () => {
    render(() => (
      <Popover id="demo-popover" popoverType="auto">
        <p>Popover content</p>
      </Popover>
    ));

    const popover = document.getElementById("demo-popover");
    expect(popover).toBeInTheDocument();
    expect(popover).toHaveAttribute("popover", "auto");
    expect(screen.getByText("Popover content")).toBeInTheDocument();
  });

  it("applies anchor positioning styles when provided", () => {
    render(() => (
      <Popover
        id="anchored-popover"
        anchorName="--menu-anchor"
        positionArea="bottom span-right"
      >
        <span>Anchored Menu</span>
      </Popover>
    ));

    const popover = document.getElementById("anchored-popover");
    expect(popover).toBeInTheDocument();
    expect(popover?.style.getPropertyValue("position-anchor")).toBe("--menu-anchor");
    expect(popover?.style.getPropertyValue("position-area")).toBe("bottom span-right");
  });

  it("renders PopoverItem with inherited popovertarget and hide action", () => {
    const handleClick = vi.fn();
    render(() => (
      <Popover id="menu-popover">
        <PopoverItem onClick={handleClick}>[ Edit ]</PopoverItem>
        <PopoverItem danger>[ Delete ]</PopoverItem>
      </Popover>
    ));

    const editBtn = screen.getByRole("button", { name: "[ Edit ]", hidden: true });
    expect(editBtn).toHaveAttribute("popovertarget", "menu-popover");
    expect(editBtn).toHaveAttribute("popovertargetaction", "hide");

    fireEvent.click(editBtn);
    expect(handleClick).toHaveBeenCalledTimes(1);

    const deleteBtn = screen.getByRole("button", { name: "[ Delete ]", hidden: true });
    expect(deleteBtn.className).toContain("danger");
    expect(deleteBtn).toHaveAttribute("popovertarget", "menu-popover");
  });
});
