import { Hono } from "hono";
import { cors } from "hono/cors";
import { doRoutes } from "./do/routes.ts";
import { heyRoutes } from "./hey/routes.ts";
import { markRoutes } from "./mark/routes.ts";

const configuredOrigins = (process.env.API_ALLOWED_ORIGINS
  ?? "https://mark.tildom.app,https://do.tildom.app,https://hey.tildom.app")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigin = (origin: string) =>
  configuredOrigins.includes(origin) || /^https?:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(origin)
    ? origin
    : undefined;

export const app = new Hono();

app.use("/v1/*", cors({
  origin: allowedOrigin,
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type"],
  maxAge: 86400,
}));

app.get("/health", (context) => context.json({ ok: true }));
app.route("/v1/mark", markRoutes);
app.route("/v1/do", doRoutes);
app.route("/v1/hey", heyRoutes);
app.notFound((context) => context.json({ error: "Not found" }, 404));
