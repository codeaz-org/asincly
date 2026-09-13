import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    // Set PW_CHANNEL=chrome to use an installed Chrome instead of the bundled Chromium.
    channel: process.env.PW_CHANNEL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // Check-in is designed mobile-first; run its flow at phone width too.
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /check-in-flow\.spec\.ts/ },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
