import { render, screen, fireEvent } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import Badge from "./Badge";

describe("Badge", () => {
  it("renders bracket variant by default", () => {
    render(() => <Badge>colleague</Badge>);
    const el = screen.getByText(/colleague/);
    expect(el.textContent).toBe("[ colleague ]");
  });

  it("renders tag variant with # prefix", () => {
    render(() => <Badge variant="tag">design</Badge>);
    const el = screen.getByText(/design/);
    expect(el.textContent).toBe("#design");
  });

  it("renders as anchor tag when href is provided", () => {
    render(() => <Badge href="/tags/tech" variant="tag">tech</Badge>);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/tags/tech");
    expect(link.textContent).toBe("#tech");
  });

  it("renders as button and triggers click when onClick is provided", () => {
    const handleClick = vi.fn();
    render(() => <Badge onClick={handleClick} variant="active">dev / showcase</Badge>);
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(btn.textContent).toBe("dev / showcase");
  });
});
