import solid from "vite-plugin-solid";
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(() => {
  return {
    plugins: [solid()],
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
    test: {
      environment: "jsdom",
    },
  };
});
