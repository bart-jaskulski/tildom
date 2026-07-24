import { describe, expect, it, vi } from "vitest";
import { createPwaInstall } from "./pwaInstall";

describe("createPwaInstall", () => {
  it("captures and invokes the browser install prompt once", async () => {
    const install = createPwaInstall();
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = new Event("beforeinstallprompt");
    Object.assign(event, { prompt });

    install.initialize();
    window.dispatchEvent(event);

    expect(install.available()).toBe(event);
    await install.prompt();
    expect(prompt).toHaveBeenCalledOnce();
    expect(install.available()).toBeNull();
  });
});
