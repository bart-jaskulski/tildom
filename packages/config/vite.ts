import { fileURLToPath } from "node:url";
import { mergeConfig, type UserConfig } from "vite";

const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export const tildomAppConfig = <T extends UserConfig>(configUrl: string, overrides: T): UserConfig =>
  mergeConfig({
    resolve: {
      alias: { "~": fileURLToPath(new URL("./src", configUrl)) },
    },
    server: {
      headers: isolationHeaders,
      proxy: {
        "/sync": {
          target: process.env.SYNC_PROXY_TARGET ?? "http://127.0.0.1:8787",
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/sync/, ""),
        },
      },
    },
    preview: { headers: isolationHeaders },
    optimizeDeps: { exclude: ["@sqlite.org/sqlite-wasm"] },
    assetsInclude: ["**/*.wasm"],
  }, overrides as UserConfig);
