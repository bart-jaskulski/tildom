import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import QRDisplay from "./QRDisplay";

// Mock qrcode to avoid canvas/DOM issues in jsdom
vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,mockqr"),
  },
}));

describe("QRDisplay", () => {
  it("renders QR image when value is provided", async () => {
    render(() => <QRDisplay value="https://mark.tildom.app/#pair=test" />);
    const img = await screen.findByRole("img", { name: "QR code" });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "data:image/png;base64,mockqr");
  });
});
