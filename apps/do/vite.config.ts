import tailwindcss from "@tailwindcss/vite";
import { getRequestListener } from "@hono/node-server";
import solid from "vite-plugin-solid";
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import { app, isApiRequestPath } from "./server/app.ts";

const handleApiRequest = getRequestListener(app.fetch);

export default defineConfig(() => {
  return {
    plugins: [
      solid(),
      tailwindcss(),
      {
        name: "server-api",
        configureServer(server) {
          server.middlewares.use((request, response, next) => {
            if (!isApiRequestPath(request.url ?? "/")) {
              next();
              return;
            }

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
    },
    optimizeDeps: {
      exclude: ["@sqlite.org/sqlite-wasm"],
    },
    assetsInclude: ["**/*.wasm"],
    test: {
      environment: "jsdom",
    },
  };
});
