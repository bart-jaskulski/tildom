import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createSpace: vi.fn(), renameSpace: vi.fn(), setGranularity: vi.fn() }));
vi.mock("~/components/AppNav", () => ({ default: () => <nav /> }));
vi.mock("@solidjs/meta", () => ({ Title: () => null }));
vi.mock("~/lib/sync", () => ({ syncSignals: { isPaired: () => false }, syncNow: vi.fn() }));
vi.mock("~/stores/networkStore", () => ({ isOnline: () => true }));
vi.mock("~/stores/preferencesStore", () => ({
  breakdownGranularity: () => "balanced",
  BREAKDOWN_GRANULARITY_OPTIONS: ["balanced", "detailed"],
  setBreakdownGranularity: mocks.setGranularity,
}));
vi.mock("~/stores/taskStore", () => ({
  createSpace: mocks.createSpace,
  renameSpace: mocks.renameSpace,
  selectedSpaceId: () => "default",
  selectSpace: vi.fn(),
  spaces: () => [{ id: "default", name: "Personal" }],
}));
vi.mock("~/lib/pwaInstall", () => ({ pwaInstall: { available: () => false, needsSafariInstructions: () => false } }));
import SettingsPage from "./settings";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
beforeEach(() => vi.clearAllMocks());

describe("space settings", () => {
  it("creates spaces through a labelled dialog form", async () => {
    render(() => <SettingsPage />);
    fireEvent.click(screen.getByRole("button", { name: /NEW/ }));
    fireEvent.input(screen.getByLabelText("Space name"), { target: { value: "  Work  " } });
    fireEvent.submit(screen.getByLabelText("Space name").closest("form")!);
    await waitFor(() => expect(mocks.createSpace).toHaveBeenCalledWith("Work"));
  });

  it("uses an accessible radio group for breakdown detail", () => {
    render(() => <SettingsPage />);
    fireEvent.click(screen.getByRole("radio", { name: "detailed" }));
    expect(mocks.setGranularity).toHaveBeenCalledWith("detailed");
  });
});
