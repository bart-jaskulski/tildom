import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    conditions: ["development", "browser"],
  },
  test: {
    environment: "jsdom",
    globals: true,
  },
});
