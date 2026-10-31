import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // Serial execution to respect local OPFS SQLite database
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 30000,
  use: {
    baseURL: "http://localhost:5180",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "pnpm dev --port 5180",
    url: "http://localhost:5180",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
