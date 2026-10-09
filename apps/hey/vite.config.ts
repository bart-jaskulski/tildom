import solid from "vite-plugin-solid";
import { defineConfig } from "vite";
import { tildomPwa } from "@tildom/config/pwa";
import { tildomAppConfig } from "@tildom/config/vite";

export default defineConfig(tildomAppConfig(import.meta.url, {
  plugins: [
    solid(),
    tildomPwa({
      name: "hey.tildom",
      short_name: "hey",
      description: "A personal conversation app with durable memory.",
      theme_color: "#d73a49",
    }),
  ],
  server: {
    port: 5175,
  },
}));
