import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import SystemSettings from "./SystemSettings";

describe("SystemSettings", () => {
  it("renders vim key checkbox and handles changes", () => {
    const onVimChange = vi.fn();
    render(() => (
      <SystemSettings
        vimKeys={true}
        onVimKeysChange={onVimChange}
      />
    ));

    expect(screen.getByText("system")).toBeInTheDocument();
    expect(screen.getByText("navigation")).toBeInTheDocument();
    const checkbox = screen.getByRole("checkbox", { name: "vim keys" });
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);
    expect(onVimChange).toHaveBeenCalledWith(false);
  });

  it("renders install button when PWA is available", () => {
    const prompt = vi.fn();
    const pwaInstall = {
      available: () => true,
      needsSafariInstructions: () => false,
      prompt,
    };

    render(() => (
      <SystemSettings
        pwaInstall={pwaInstall}
        appName="mark"
      />
    ));

    const btn = screen.getByRole("button", { name: "[ install mark ]" });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(prompt).toHaveBeenCalled();
  });
});
