import { serve } from "@hono/node-server";
import { app } from "./app.ts";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);

serve({ fetch: app.fetch, port }, ({ port: listeningPort }) => {
  console.log(`api.tildom server listening on http://127.0.0.1:${listeningPort}`);
});
