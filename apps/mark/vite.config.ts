import tailwindcss from "@tailwindcss/vite";
import solid from "vite-plugin-solid";
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { tildomPwa } from "@tildom/config/pwa";

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
      tildomPwa({
        name: "mark.tildom",
        short_name: "mark",
        description: "A local-first bookmark and note manager.",
        theme_color: "#d73a49",
        share_target: {
          action: "/share-target",
          method: "GET",
          params: { title: "title", text: "text", url: "url" },
        },
      }),
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
      ...(https ? { https } : {}),
    },
    preview: {
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      },
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
