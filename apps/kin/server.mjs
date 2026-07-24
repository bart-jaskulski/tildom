import { serve } from "@hono/node-server";
import { createSpaApp } from "@tildom/node-server";
import { fileURLToPath } from "node:url";

const distDir = fileURLToPath(new URL("./dist", import.meta.url));
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const app = createSpaApp({ distDir });

serve({ fetch: app.fetch, port }, ({ port }) => {
  console.log(`kin.tildom server listening on http://127.0.0.1:${port}`);
});
