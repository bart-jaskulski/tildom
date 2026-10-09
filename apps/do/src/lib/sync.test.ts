import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  initializeSync: vi.fn().mockResolvedValue(undefined),
  createSyncClient: vi.fn(),
  exportDatabase: vi.fn(),
  importDatabase: vi.fn(),
  initializeTaskStore: vi.fn(),
  markSyncDirty: vi.fn(),
  subscribe: vi.fn(),
  databaseConstructor: vi.fn(),
}));

vi.mock("@tildom/sync-client", () => ({
  createSyncState: () => ({ markSyncDirty: mocks.markSyncDirty }),
  createSyncClient: mocks.createSyncClient.mockReturnValue({
    signals: {}, initializeSync: mocks.initializeSync,
  }),
}));
vi.mock("@tildom/browser-db", () => ({
  BrowserDbClient: class {
    constructor(...args: unknown[]) { mocks.databaseConstructor(...args); }
    subscribe = mocks.subscribe;
    exportDatabase = mocks.exportDatabase;
    importDatabase = mocks.importDatabase;
  },
}));
vi.mock("~/stores/taskStore", () => ({ initializeTaskStore: mocks.initializeTaskStore }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("Do shared sync integration", () => {
  it("keeps the existing database and refreshes task state after imports", async () => {
    await import("./sync");
    const options = mocks.createSyncClient.mock.calls[0][0];
    expect(options.appId).toBe("do");
    expect(mocks.databaseConstructor).toHaveBeenCalledWith("microstep.sqlite3", expect.any(Object));
    expect(options.exportDatabase).toBe(mocks.exportDatabase);
    expect(options.importDatabase).toBe(mocks.importDatabase);
    await options.afterImport();
    expect(mocks.initializeTaskStore).toHaveBeenCalledOnce();
  });

  it("marks local writes dirty but does not re-upload remote imports", async () => {
    await import("./sync");
    const listener = mocks.subscribe.mock.calls[0][0];
    listener({ source: "import" });
    expect(mocks.markSyncDirty).not.toHaveBeenCalled();
    listener({ source: "local" });
    expect(mocks.markSyncDirty).toHaveBeenCalledOnce();
  });

  it("initializes listeners once when both app and pairing page mount", async () => {
    const { initializeSync } = await import("./sync");
    await Promise.all([initializeSync(), initializeSync()]);
    expect(mocks.initializeSync).toHaveBeenCalledOnce();
  });
});
