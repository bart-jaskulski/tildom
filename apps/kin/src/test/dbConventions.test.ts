import { describe, expect, it, vi, beforeEach } from "vitest";

const { markSyncDirtyMock, getSubscriber, setSubscriber } = vi.hoisted(() => {
  let cb: ((event: { source: "local" | "import" }) => void) | null = null;
  return {
    markSyncDirtyMock: vi.fn(),
    getSubscriber: () => cb,
    setSubscriber: (val: any) => { cb = val; },
  };
});

vi.mock("~/lib/syncState", () => ({
  markSyncDirty: markSyncDirtyMock,
}));

vi.mock("@tildom/browser-db", () => ({
  BrowserDbClient: class {
    init = vi.fn();
    sql = vi.fn();
    exec = vi.fn();
    query = vi.fn();
    subscribe = vi.fn((cb: any) => {
      setSubscriber(cb);
      return () => { setSubscriber(null); };
    });
    exportDatabase = vi.fn();
    importDatabase = vi.fn();
    close = vi.fn();
  },
}));

import "../lib/db";

describe("Kin db subscription: local vs import sync dirtying", () => {
  beforeEach(() => {
    markSyncDirtyMock.mockReset();
  });

  it("registers a change subscription upon module load", () => {
    expect(getSubscriber()).toBeTypeOf("function");
  });

  it("marks sync dirty when change source is local", () => {
    getSubscriber()?.({ source: "local" });
    expect(markSyncDirtyMock).toHaveBeenCalledTimes(1);
  });

  it("does not mark sync dirty when change source is import", () => {
    getSubscriber()?.({ source: "import" });
    expect(markSyncDirtyMock).not.toHaveBeenCalled();
  });
});
