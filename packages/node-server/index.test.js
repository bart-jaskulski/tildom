import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import { createSpaApp } from "./index.js";

describe("SPA server", () => {
  let distDir;

  afterEach(async () => {
    if (distDir) {
      await rm(distDir, { recursive: true, force: true });
    }
  });

  const createApp = async () => {
    distDir = await mkdtemp(join(tmpdir(), "tildom-spa-"));
    await mkdir(join(distDir, "assets"));
    await writeFile(join(distDir, "assets", "app.js"), "export {}");
    await writeFile(join(distDir, "index.html"), "<h1>Tildom</h1>");

    const api = new Hono();
    api.get("/api/health", (context) => context.json({ ok: true }));
    return createSpaApp({ api, distDir });
  };

  it("serves immutable assets and revalidated app routes", async () => {
    const app = await createApp();
    const asset = await app.request("/assets/app.js");
    const head = await app.request("/assets/app.js", { method: "HEAD" });
    const route = await app.request("/entries/42");

    expect(asset.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(asset.headers.get("cross-origin-opener-policy")).toBe("same-origin");
    expect(asset.headers.get("cross-origin-embedder-policy")).toBe("require-corp");
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect(route.headers.get("cache-control")).toBe("no-cache");
    expect(await route.text()).toContain("Tildom");
  });

  it("keeps API responses out of caches and SPA fallback", async () => {
    const app = await createApp();
    const responses = await Promise.all([
      app.request("/api"),
      app.request("/api/missing"),
      app.request("/api/health"),
    ]);

    for (const response of responses.slice(0, 2)) {
      expect(response.status).toBe(404);
    }
    for (const response of responses) {
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("cross-origin-opener-policy")).toBe("same-origin");
      expect(response.headers.get("cross-origin-embedder-policy")).toBe("require-corp");
    }
  });
});
