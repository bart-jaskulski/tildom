import { serve } from "@hono/node-server";
import { app } from "./app.ts";

const PORT = Number.parseInt(process.env.PORT ?? "8787", 10);

serve({ fetch: app.fetch, port: PORT }, ({ port }) => {
  console.log(`sync.tildom service listening on http://127.0.0.1:${port}`);
});
