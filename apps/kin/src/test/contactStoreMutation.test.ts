import { beforeEach, describe, expect, it, vi } from "vitest";

const { sqlMock, subscribeMock, getSubscriber } = vi.hoisted(() => {
  let cb: (() => void) | null = null;
  return {
    sqlMock: vi.fn(),
    subscribeMock: vi.fn((fn: () => void) => {
      cb = fn;
      return () => { cb = null; };
    }),
    getSubscriber: () => cb,
  };
});

vi.mock("~/lib/db", () => ({
  db: {
    init: vi.fn(),
    sql: sqlMock,
    subscribe: subscribeMock,
  },
}));

import {
  contacts,
  createContact,
  updateContact,
  deleteContact,
} from "../stores/contactStore";

describe("contactStore mutations and subscription flow", () => {
  beforeEach(() => {
    sqlMock.mockReset().mockResolvedValue([]);
    vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000001");
  });

  it("subscribes to db changes upon initialization", () => {
    expect(getSubscriber()).toBeTypeOf("function");
  });

  it("creates a contact using db.sql tagged template", async () => {
    const id = await createContact("Ada Lovelace", "Colleague", "London");
    expect(id).toBe("00000000-0000-4000-8000-000000000001");
    expect(sqlMock).toHaveBeenCalledTimes(1);

    const [strings, ...values] = sqlMock.mock.calls[0];
    const sqlText = strings.join("?");
    expect(sqlText).toContain("INSERT INTO contacts");
    expect(values).toContain("Ada Lovelace");
    expect(values).toContain("Colleague");
    expect(values).toContain("London");
  });

  it("updates a contact using db.sql tagged template", async () => {
    await updateContact("00000000-0000-4000-8000-000000000001", {
      name: "Ada King",
      relationship: "Friend",
      location: "UK",
      birthday: "1815-12-10",
      phone: "",
      email: "ada@example.com",
    });

    expect(sqlMock).toHaveBeenCalledTimes(1);
    const [strings, ...values] = sqlMock.mock.calls[0];
    const sqlText = strings.join("?");
    expect(sqlText).toContain("UPDATE contacts");
    expect(values).toContain("Ada King");
    expect(values).toContain("00000000-0000-4000-8000-000000000001");
  });

  it("deletes a contact using db.sql tagged template", async () => {
    await deleteContact("00000000-0000-4000-8000-000000000001");

    expect(sqlMock).toHaveBeenCalledTimes(1);
    const [strings, ...values] = sqlMock.mock.calls[0];
    const sqlText = strings.join("?");
    expect(sqlText).toContain("DELETE FROM contacts WHERE id =");
    expect(values).toContain("00000000-0000-4000-8000-000000000001");
  });

  it("refreshes store contacts when subscription callback is triggered", async () => {
    sqlMock.mockResolvedValueOnce([
      { id: "c1", name: "Alice", relationship: "", location: "", birthday: "", phone: "", email: "", created_at: 1, updated_at: 1 },
    ]);

    // Simulate database worker change notification
    getSubscriber()?.();

    // Allow promise tick to resolve
    await Promise.resolve();
    await Promise.resolve();

    expect(sqlMock).toHaveBeenCalledWith(
      expect.arrayContaining([expect.stringContaining("SELECT * FROM contacts")]),
    );
    expect(contacts()).toEqual([
      expect.objectContaining({ id: "c1", name: "Alice" }),
    ]);
  });
});
