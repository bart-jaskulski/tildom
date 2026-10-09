import solid from "vite-plugin-solid";
import { defineConfig } from "vite";
import { tildomPwa } from "@tildom/config/pwa";
import { tildomAppConfig } from "@tildom/config/vite";

export default defineConfig(() => {
  return tildomAppConfig(import.meta.url, {
    plugins: [
      solid(),
      tildomPwa({
        name: "kin.tildom",
        short_name: "kin",
        description: "A local-first personal relationship manager.",
        theme_color: "#d73a49",
      }),
    ],
    server: {
      port: 5174,
    },
    test: {
      environment: "jsdom",
    },
  });
});
