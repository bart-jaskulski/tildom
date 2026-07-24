import solid from "vite-plugin-solid";
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import { tildomPwa } from "@tildom/config/pwa";

export default defineConfig({
  plugins: [
    solid(),
    tildomPwa({
      name: "hey.tildom",
      short_name: "hey",
      description: "A personal conversation app with durable memory.",
      theme_color: "#d73a49",
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
});
