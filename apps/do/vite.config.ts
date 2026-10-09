import tailwindcss from "@tailwindcss/vite";
import solid from "vite-plugin-solid";
import { defineConfig } from "vite";
import { tildomPwa } from "@tildom/config/pwa";
import { tildomAppConfig } from "@tildom/config/vite";

export default defineConfig(() => {
  return tildomAppConfig(import.meta.url, {
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
    server: { port: 5176 },
    test: {
      environment: "jsdom",
    },
  });
});
