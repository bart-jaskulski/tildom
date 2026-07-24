import solid from "vite-plugin-solid";
import { getRequestListener } from "@hono/node-server";
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import { app, isApiRequestPath } from "./server/app";

const handleApiRequest = getRequestListener(app.fetch);

export default defineConfig({
  plugins: [
    solid(),
    {
      name: "server-api",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (!isApiRequestPath(request.url ?? "/")) return next();
          void handleApiRequest(request, response);
        });
      },
    },
  ],
  resolve: {
    alias: {
      "~": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
    proxy: {
      "/sync": {
        target: process.env.SYNC_PROXY_TARGET ?? "http://127.0.0.1:8787",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/sync/, ""),
      },
    },
  },
  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm"],
  },
});
