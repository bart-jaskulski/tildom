import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import SyncSettings from "./SyncSettings";

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,mockqr"),
  },
}));

describe("SyncSettings", () => {
  it("renders unpaired status and create sync vault button", () => {
    const signals = {
      isReady: () => true,
      isPaired: () => false,
    };

    render(() => (
      <SyncSettings
        signals={signals}
        onSyncNow={vi.fn()}
        onCreateVault={vi.fn()}
      />
    ));

    expect(screen.getByText("sync")).toBeInTheDocument();
    expect(screen.getByText("unpaired · local only")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "[ create sync vault ]" })).toBeInTheDocument();
  });

  it("renders paired status and actions when paired", async () => {
    const signals = {
      isReady: () => true,
      isPaired: () => true,
      statusText: () => "synced",
      lastSeenRevision: () => "rev-42",
      hasLocalChanges: () => false,
    };

    render(() => (
      <SyncSettings
        signals={signals}
        onSyncNow={vi.fn()}
        onDisconnect={vi.fn()}
        getPairUrl={() => "https://test.tildom.app/#pair=secret"}
      />
    ));

    expect(screen.getByText("synced · rev rev-42 · clean")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "[ sync now ]" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "[ pair device ]" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "[ disconnect ]" })).toBeInTheDocument();

    // Click pair device to toggle drawer
    fireEvent.click(screen.getByRole("button", { name: "[ pair device ]" }));
    expect(await screen.findByRole("button", { name: "[ copy link ]" })).toBeInTheDocument();
  });
});
