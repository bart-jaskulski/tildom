import { serve } from "@hono/node-server";
import { createSpaApp } from "@tildom/node-server";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { app as api } from "./app.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, "..");
const DIST_DIR = resolve(ROOT_DIR, "dist");
const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);
const app = createSpaApp({ api, distDir: DIST_DIR });

serve({ fetch: app.fetch, port: PORT }, ({ port }) => {
  console.log(`mark.tildom server listening on http://127.0.0.1:${port}`);
});
