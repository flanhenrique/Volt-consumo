import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "line",
  use: {
    baseURL: process.env.VOLT_BASE_URL || "http://127.0.0.1:4173",
    serviceWorkers: "block",
    trace: "retain-on-failure"
  },
  webServer: process.env.VOLT_BASE_URL ? undefined : {
    command: "python -m http.server 4173 --bind 127.0.0.1",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true
  },
  projects: [
    { name: "chromium-desktop", testIgnore: /sw\.spec\.mjs/, use: { ...devices["Desktop Chrome"] } },
    { name: "webkit-desktop", testIgnore: /sw\.spec\.mjs/, use: { ...devices["Desktop Safari"] } },
    { name: "chromium-mobile", testIgnore: /sw\.spec\.mjs/, use: { ...devices["Pixel 7"] } },
    { name: "chromium-service-worker", testMatch: /sw\.spec\.mjs/, use: { ...devices["Desktop Chrome"], serviceWorkers: "allow" } }
  ]
});
