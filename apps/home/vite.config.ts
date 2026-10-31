import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { tildomAppConfig } from "@tildom/config/vite";

export default defineConfig(tildomAppConfig(import.meta.url, {
  plugins: [solid()],
  server: {
    port: 5170,
  },
}));
