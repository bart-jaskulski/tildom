import tailwindcss from "@tailwindcss/vite";
import solid from "vite-plugin-solid";
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import { tildomPwa } from "@tildom/config/pwa";

export default defineConfig(() => {
  return {
    plugins: [
      solid(),
      tailwindcss(),
      tildomPwa({
        name: "do.tildom",
        short_name: "do",
        description: "A local-first task manager.",
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
    assetsInclude: ["**/*.wasm"],
    test: {
      environment: "jsdom",
    },
  };
});
