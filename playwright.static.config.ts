import { defineConfig, devices } from "@playwright/test";

// Smoke suite against the production static export (basePath /my-diet,
// trailingSlash, service worker) — run `npm run build` first.
// The full suite stays on the dev server (playwright.config.ts).
const PORT = Number(process.env.E2E_STATIC_PORT ?? 3100);
const BASE_URL = `http://localhost:${PORT}/my-diet/`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /static-smoke\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI
    ? [["html", { open: "never", outputFolder: "playwright-report-static" }], ["list"]]
    : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "static-chromium",
      use: {
        ...devices["Pixel 7"],
      },
    },
  ],
  webServer: {
    command: `node scripts/serve-out.mjs`,
    url: BASE_URL,
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
