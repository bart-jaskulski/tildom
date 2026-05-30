import tailwindcss from "@tailwindcss/vite";
import solid from "vite-plugin-solid";
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { handleApiRequest, isApiRequestPath } from "./server/app.ts";
import { getRequestOrigin, handleNodeRequestWithFetch } from "./server/node-http.ts";

const readLocalHttpsConfig = () => {
  const keyPath = fileURLToPath(new URL("./localhost-key.pem", import.meta.url));
  const certPath = fileURLToPath(new URL("./localhost.pem", import.meta.url));

  if (!existsSync(keyPath) || !existsSync(certPath)) {
    return undefined;
  }

  return {
    key: readFileSync(keyPath),
    cert: readFileSync(certPath),
  };
};

export default defineConfig(({ mode }) => {
  const https = mode === "test" ? undefined : readLocalHttpsConfig();

  return {
    plugins: [
      solid(),
      tailwindcss(),
      {
        name: "server-api",
        configureServer(server) {
          server.middlewares.use((request, response, next) => {
            const origin = getRequestOrigin(request, "127.0.0.1:5173");
            const url = new URL(request.url ?? "/", origin);

            if (!isApiRequestPath(url.pathname)) {
              next();
              return;
            }

            void handleNodeRequestWithFetch(request, response, origin, handleApiRequest).catch((error) => {
              next(error as Error);
            });
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
      ...(https ? { https } : {}),
    },
    optimizeDeps: {
      exclude: ["@sqlite.org/sqlite-wasm"],
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
    },
  };
});
