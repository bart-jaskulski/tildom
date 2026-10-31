import solid from "vite-plugin-solid";
import { defineConfig } from "vite";
import { tildomPwa } from "@tildom/config/pwa";
import { tildomAppConfig } from "@tildom/config/vite";

export default defineConfig(() => {
  return tildomAppConfig(import.meta.url, {
    plugins: [
      solid(),
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
    server: {
      port: 5173,
    },
    build: {
      modulePreload: {
        polyfill: false,
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
    },
  });
});
