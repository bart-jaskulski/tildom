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

  it("confirms database erasure with ConfirmDialog", async () => {
    const mockClient = {
      exportDatabase: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
      importDatabase: vi.fn().mockResolvedValue(undefined),
      deleteDatabaseFile: vi.fn().mockResolvedValue(undefined),
    };
    const onReset = vi.fn();

    render(() => (
      <DatabaseSettings
        client={mockClient}
        filenamePrefix="testapp"
        onReset={onReset}
      />
    ));

    fireEvent.click(screen.getByRole("button", { name: "[ erase db ]" }));
    expect(screen.getByText("Destroy database?")).toBeInTheDocument();
    expect(screen.getByText("Destroy this device's local database and disconnect sync? This cannot be undone.")).toBeInTheDocument();

    // Cancel first
    fireEvent.click(screen.getByRole("button", { name: "[ cancel ]" }));
    expect(screen.queryByText("Destroy database?")).not.toBeInTheDocument();
    expect(mockClient.deleteDatabaseFile).not.toHaveBeenCalled();

    // Open again and confirm
    fireEvent.click(screen.getByRole("button", { name: "[ erase db ]" }));
    fireEvent.click(screen.getByRole("button", { name: "[ erase ]" }));

    expect(mockClient.deleteDatabaseFile).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(onReset).toHaveBeenCalledTimes(1));
  });

  it("confirms database import with ConfirmDialog", async () => {
    const mockClient = {
      exportDatabase: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
      importDatabase: vi.fn().mockResolvedValue(undefined),
      deleteDatabaseFile: vi.fn().mockResolvedValue(undefined),
    };
    const onImport = vi.fn();

    const { container } = render(() => (
      <DatabaseSettings
        client={mockClient}
        filenamePrefix="testapp"
        onImport={onImport}
      />
    ));

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["dummy db content"], "backup.sqlite3", { type: "application/vnd.sqlite3" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText("Import database backup?")).toBeInTheDocument();
    expect(screen.getByText("Import this database backup? It will replace the current local database.")).toBeInTheDocument();

    // Cancel first
    fireEvent.click(screen.getByRole("button", { name: "[ cancel ]" }));
    expect(screen.queryByText("Import database backup?")).not.toBeInTheDocument();
    expect(mockClient.importDatabase).not.toHaveBeenCalled();

    // Select file again and confirm
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "[ import ]" }));

    await vi.waitFor(() => expect(mockClient.importDatabase).toHaveBeenCalledTimes(1));
    expect(onImport).toHaveBeenCalledTimes(1);
  });
});
