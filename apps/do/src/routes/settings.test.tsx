import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createWorkspace: vi.fn(), renameWorkspace: vi.fn(), setGranularity: vi.fn() }));
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
  createWorkspace: mocks.createWorkspace,
  renameWorkspace: mocks.renameWorkspace,
  selectedWorkspaceId: () => "default",
  selectWorkspace: vi.fn(),
  workspaces: () => [{ id: "default", name: "Personal" }],
}));
vi.mock("~/lib/pwaInstall", () => ({ pwaInstall: { available: () => false, needsSafariInstructions: () => false } }));
import SettingsPage from "./settings";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
beforeEach(() => vi.clearAllMocks());

describe("workspace settings", () => {
  it("creates workspaces through a labelled dialog form", async () => {
    render(() => <SettingsPage />);
    fireEvent.click(screen.getByRole("button", { name: /NEW/ }));
    fireEvent.input(screen.getByLabelText("Workspace name"), { target: { value: "  Work  " } });
    fireEvent.submit(screen.getByLabelText("Workspace name").closest("form")!);
    await waitFor(() => expect(mocks.createWorkspace).toHaveBeenCalledWith("Work"));
  });

  it("uses an accessible radio group for breakdown detail", () => {
    render(() => <SettingsPage />);
    fireEvent.click(screen.getByRole("radio", { name: "detailed" }));
    expect(mocks.setGranularity).toHaveBeenCalledWith("detailed");
  });
});
