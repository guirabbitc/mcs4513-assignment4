import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.js",
  outputDir: "./test-results/playwright",      // screenshots and traces of failed tests land here
  reporter: [["list"], ["html", { outputFolder: "test-results/playwright-report", open: "never" }]],
  timeout: 30_000,
  expect: { timeout: 5_000 },                   // web assertions retry up to 5 s; no fixed sleeps
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    contextOptions: { reducedMotion: "reduce" },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node src/server.js",
    url: "http://localhost:5173/api/health",
    env: { NODE_ENV: "test", PORT: "5173" },
    reuseExistingServer: false,
  },
});
