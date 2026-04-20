import { chromium } from "@playwright/test";

const ROUTES = [
  "/",
  "/intake",
  "/today",
  "/meals?d=2026-04-19&i=0",
  "/schedule",
  "/weight",
  "/review",
  "/settings",
];

// Next.js dev server compiles routes lazily on first request. The first compile
// can trigger Fast Refresh's "full reload" path, which races with the test's
// in-flight `goto` and causes "Navigation interrupted" failures (especially on
// WebKit where hydration timing differs). Warm every route once before tests.
export default async function globalSetup() {
  const port = process.env.E2E_PORT ?? "3000";
  const base = `http://localhost:${port}`;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const r of ROUTES) {
    await page.goto(`${base}${r}`, { waitUntil: "load", timeout: 60_000 }).catch(() => {});
  }
  await browser.close();
}
