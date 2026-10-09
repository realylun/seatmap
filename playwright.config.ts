import { defineConfig } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  // specs share seeded events and the same cheapest seats, so run them one at a time
  fullyParallel: false,
  workers: 1,
  use: { baseURL },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "pnpm dev", url: baseURL, reuseExistingServer: true },
});
