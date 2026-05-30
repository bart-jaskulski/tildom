import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProductionAssetHandler } from "./production";

describe("production asset handler", () => {
  let fixtureDir: string | null = null;

  const setupHandler = async () => {
    fixtureDir = await mkdtemp(join(tmpdir(), "hn-links-production-handler-"));
    await mkdir(join(fixtureDir, "assets"), { recursive: true });
    await writeFile(join(fixtureDir, "assets", "app.js"), "console.log('asset');", "utf8");
    await writeFile(join(fixtureDir, "index.html"), "<!doctype html><html><body>App shell</body></html>", "utf8");

    return createProductionAssetHandler({
      distDir: fixtureDir,
      indexHtmlPath: join(fixtureDir, "index.html"),
    });
  };

  afterEach(async () => {
    if (fixtureDir) {
      await rm(fixtureDir, { recursive: true, force: true });
      fixtureDir = null;
    }
  });

  it("serves static assets with expected content type and isolation headers", async () => {
    const handler = await setupHandler();
    const response = await handler("/assets/app.js");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(response.headers.get("cross-origin-opener-policy")).toBe("same-origin");
    expect(response.headers.get("cross-origin-embedder-policy")).toBe("require-corp");
    expect(await response.text()).toBe("console.log('asset');");
  });

  it("falls back to index html for app routes", async () => {
    const handler = await setupHandler();
    const response = await handler("/entries/42");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("cross-origin-opener-policy")).toBe("same-origin");
    expect(response.headers.get("cross-origin-embedder-policy")).toBe("require-corp");
    expect(await response.text()).toContain("App shell");
  });
});
