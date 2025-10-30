import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for E2E tests
 * Run with: npx playwright test
 */
export default defineConfig({
  testDir: "./__tests__/e2e",
  globalSetup: "./global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",

  timeout: 60 * 1000,

  use: {
    baseURL: process.env.APP_URL ?? 'http://localhost:3000',
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    ignoreHTTPSErrors: true, // Allow self-signed certificates
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Run dev server before tests (disabled - use existing server)
  webServer: process.env.CI ? {
    command: "npm run dev",
    url: "https://localhost:3000",
    reuseExistingServer: false,
    timeout: 120 * 1000,
    ignoreHTTPSErrors: true,
  } : undefined,
});
