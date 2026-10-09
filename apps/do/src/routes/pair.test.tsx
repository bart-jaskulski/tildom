import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { beforeAll, describe, expect, it, vi } from "vitest";

const joinSyncVault = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("~/components/AppNav", () => ({ default: () => <nav /> }));
vi.mock("@solidjs/meta", () => ({ Title: () => null }));
vi.mock("~/components/DevicePairing", () => ({ QRDisplay: () => null }));
vi.mock("~/lib/sync", () => ({
  createSyncVault: vi.fn(), disconnectSync: vi.fn(), initializeSync: vi.fn().mockResolvedValue(undefined),
  joinSyncVault,
  syncSignals: { isPaired: () => false, status: () => "unpaired" },
}));
vi.mock("~/lib/syncState", () => ({ syncState: { getSyncConfig: vi.fn().mockResolvedValue(undefined) } }));
import PairPage from "./pair";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});

describe("pairing confirmation", () => {
  it("does not replace local data until the shared confirmation is accepted", async () => {
    const secret = "A".repeat(43);
    history.replaceState(null, "", `/pair#sync=v1.${secret}`);
    render(() => <PairPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Join paired device" }));
    expect(joinSyncVault).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Join paired device?" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "[ join ]" }));
    await waitFor(() => expect(joinSyncVault).toHaveBeenCalledWith(secret));
    expect(location.hash).toBe("");
  });
});
