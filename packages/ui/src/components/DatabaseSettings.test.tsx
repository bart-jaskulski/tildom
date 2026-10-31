import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import DatabaseSettings from "./DatabaseSettings";

describe("DatabaseSettings", () => {
  it("renders storage row and export/import/erase actions", () => {
    const mockClient = {
      exportDatabase: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
      importDatabase: vi.fn().mockResolvedValue(undefined),
      deleteDatabaseFile: vi.fn().mockResolvedValue(undefined),
    };

    render(() => (
      <DatabaseSettings
        client={mockClient}
        filenamePrefix="testapp"
      />
    ));

    expect(screen.getByText("data")).toBeInTheDocument();
    expect(screen.getByText("backup")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "[ export ]" })).toBeInTheDocument();
    expect(screen.getByText("[ import ]")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "[ erase db ]" })).toBeInTheDocument();
  });
});
