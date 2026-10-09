import solid from "vite-plugin-solid";
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { tildomPwa } from "@tildom/config/pwa";
import { tildomAppConfig } from "@tildom/config/vite";

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
      ...(https ? { https } : {}),
    },
    build: {
      modulePreload: {
        polyfill: false,
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
    },
  });
});
