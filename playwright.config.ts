import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  /* The room is drawn by WebGL, and in CI and in sandboxes that means a
     software rasteriser at a few frames a second — a furnished room with a
     fire, a moon and shadows is seconds per frame there. Every assertion is
     the same as it would be on a GPU; only the patience is longer. */
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: { baseURL, trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run start -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
