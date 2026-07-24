import { serve } from "@hono/node-server";
import { createSpaApp } from "@tildom/node-server";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { app as api } from "./app.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const app = createSpaApp({ api, distDir: resolve(root, "dist") });
const port = Number.parseInt(process.env.PORT ?? "3000", 10);

serve({ fetch: app.fetch, port }, ({ port: listeningPort }) => {
  console.log(`hey.tildom server listening on http://127.0.0.1:${listeningPort}`);
});
