import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveHttpsConfig, tildomAppConfig } from "./vite.ts";

test("app overrides retain SQLite isolation and sync defaults", () => {
  const config = tildomAppConfig("file:///repo/apps/example/vite.config.ts", {
    server: { port: 5176, https: {} },
    build: { modulePreload: { polyfill: false } },
  });
  assert.deepEqual(config.resolve?.alias, { "~": "/repo/apps/example/src" });
  assert.equal(config.server?.port, 5176);
  assert.deepEqual(config.server?.allowedHosts, ["bjaskulskis-mac-mini.tailbd11bd.ts.net", "mac.tailbd11bd.ts.net"]);
  assert.deepEqual(config.server?.https, {});
  assert.equal(config.server?.headers?.["Cross-Origin-Opener-Policy"], "same-origin");
  assert.equal(config.preview?.headers?.["Cross-Origin-Embedder-Policy"], "require-corp");
  const proxy = config.server?.proxy?.["/sync"];
  assert.ok(proxy && typeof proxy !== "string");
  assert.equal(proxy.rewrite?.("/sync/v1/apps/do"), "/v1/apps/do");
  assert.ok(config.optimizeDeps?.exclude?.includes("@sqlite.org/sqlite-wasm"));
  assert.deepEqual(config.build?.modulePreload, { polyfill: false });
});

test("resolveHttpsConfig returns undefined in test environment by default", () => {
  const https = resolveHttpsConfig(import.meta.url);
  assert.equal(https, undefined);
});

test("resolveHttpsConfig loads certificate when forced and available", () => {
  const https = resolveHttpsConfig(import.meta.url, { force: true });
  assert.ok(https !== undefined);
  assert.ok(Buffer.isBuffer(https.key));
  assert.ok(Buffer.isBuffer(https.cert));
});
