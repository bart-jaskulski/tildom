import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { createSyncApp } from "../src/app.ts";

const createApp = async (appIds = ["mark"]) =>
  createSyncApp({
    storageRoot: await mkdtemp(join(tmpdir(), "tildom-sync-")),
    appIds,
    maxBytes: 1024,
    hostedOrigins: ["https://mark.tildom.app"],
    devOrigins: ["http://localhost:5173"],
  });

const url = "http://sync.test/v1/apps/mark/vaults/vault_1/snapshots";
const auth = { authorization: "Bearer token_1" };

test("creates, lists, downloads, and prunes snapshots", async () => {
  const app = await createApp();

  const first = await app.request(url, {
    method: "POST",
    headers: { ...auth, "if-none-match": "*" },
    body: new Uint8Array([1]),
  });
  expect(first.status).toBe(201);
  const firstRevision = first.headers.get("x-tildom-revision");
  expect(firstRevision).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);

  const stale = await app.request(url, {
    method: "POST",
    headers: { ...auth, "if-match": "stale" },
    body: new Uint8Array([2]),
  });
  expect(stale.status).toBe(409);

  let latest = firstRevision;
  for (const value of [2, 3, 4]) {
    const upload = await app.request(url, {
      method: "POST",
      headers: { ...auth, "if-match": latest ?? "" },
      body: new Uint8Array([value]),
    });
    expect(upload.status).toBe(201);
    latest = upload.headers.get("x-tildom-revision");
  }

  const list = await app.request(url, { headers: auth });
  expect(await list.json()).toEqual({
    revisions: expect.arrayContaining([latest]),
  });
  expect(((await (await app.request(url, { headers: auth })).json()) as { revisions: string[] }).revisions).toHaveLength(3);

  const download = await app.request(`${url}/latest`, { headers: auth });
  expect(download.status).toBe(200);
  expect(download.headers.get("x-tildom-revision")).toBe(latest);
  expect([...new Uint8Array(await download.arrayBuffer())]).toEqual([4]);
});

test("hides vaults without the derived bearer token", async () => {
  const app = await createApp();
  await app.request(url, {
    method: "POST",
    headers: { ...auth, "if-none-match": "*" },
    body: new Uint8Array([1]),
  });

  const response = await app.request(url, {
    headers: { authorization: "Bearer wrong" },
  });

  expect(response.status).toBe(404);
});

test("accepts kin vaults when configured", async () => {
  const sync = await createApp(["mark", "kin"]);
  const response = await sync.request("http://sync.test/v1/apps/kin/vaults/vault_1/snapshots", {
    method: "POST",
    headers: {
      Authorization: "Bearer secret-token",
      "Content-Type": "application/octet-stream",
      "If-None-Match": "*",
    },
    body: new Uint8Array([1]),
  });
  expect(response.status).toBe(201);
});
