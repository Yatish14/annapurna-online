import { defineConfig, devices } from "@playwright/test";

/**
 * Automated browser tests (npm run test:e2e). Playwright starts its own copy of the site on port 3100 with:
 * - a fresh test database (PGlite in .data/pglite-test, made by scripts/test-setup.mjs), never your Docker data
 * - the fake AI models (ASSISTANT_FAKE=1), so tests are free, instant and give the same answers every time
 * - its own build folder (.next-test), so it can run while `npm run dev` is running too
 * Values set here win over .env.local (Next.js never replaces a variable that's already set).
 */
const PORT = 3100;

export default defineConfig({
  testDir: "./tests",
  // One test at a time: they share one server and one database
  workers: 1,
  fullyParallel: false,
  // Compiling a page the first time takes a while in dev mode
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure", // a step-by-step recording when a test fails: npx playwright show-trace …
  },
  // `channel: "chrome"`: drives the Google Chrome installed on this computer, not Playwright's own download.
  // A Windows Application Control policy here blocks Playwright's browsers (found 12 Nov 2026), but allows Chrome.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: "chrome" } }],
  webServer: {
    command: `node scripts/test-setup.mjs && npx next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false, // always a fresh database and the fake models
    timeout: 180_000,
    env: {
      DATABASE_URL: "pglite:./.data/pglite-test",
      ASSISTANT_FAKE: "1",
      NEXT_DIST_DIR: ".next-test",
      SESSION_SECRET: "tests-only-session-secret-0123456789abcdef",
    },
  },
});
