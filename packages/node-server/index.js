import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";

const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

const isApiPath = (pathname) => pathname === "/api" || pathname.startsWith("/api/");

const cacheControl = (pathname) => {
  if (isApiPath(pathname)) {
    return "no-store";
  }

  return pathname.startsWith("/assets/")
    ? "public, max-age=31536000, immutable"
    : "no-cache";
};

export const createSpaApp = ({ api, distDir }) => {
  const app = new Hono();

  app.use(
    "*",
    secureHeaders({
      crossOriginEmbedderPolicy: "require-corp",
      crossOriginOpenerPolicy: "same-origin",
      strictTransportSecurity: false,
    }),
  );
  app.use("*", async (context, next) => {
    await next();
    context.header("Cache-Control", cacheControl(context.req.path));
  });

  if (api) {
    app.route("/", api);
  }
  app.all("/api", (context) => context.notFound());
  app.all("/api/*", (context) => context.notFound());
  app.get("*", serveStatic({ root: distDir }));
  app.get("*", serveStatic({ root: distDir, path: "index.html" }));

  app.onError((error, context) => {
    console.error(error);
    return context.text("Internal Server Error", 500, {
      ...isolationHeaders,
      "Cache-Control": "no-store",
    });
  });

  return app;
};
