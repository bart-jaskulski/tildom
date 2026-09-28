import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import Popover from "./Popover";

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
});
