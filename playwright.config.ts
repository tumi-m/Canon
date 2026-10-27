import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const baseURL = `http://127.0.0.1:${PORT}`;

/* The same app built a second time with accounts switched on, against a
   Supabase address with nothing behind it. Enough to prove each way in
   starts the right provider's sign-in with the right way back — the part
   this code owns — and that a sign-in that cannot complete says so. */
const ACCOUNTS_PORT = 3001;
const accountsURL = `http://127.0.0.1:${ACCOUNTS_PORT}`;
const ACCOUNTS_ENV =
  "NEXT_DIST_DIR=.next-accounts NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=e2e-anon-key";
/* that build points next-env.d.ts at its own directory; it goes back, so a
   test run leaves the working tree as it found it */
const RESTORE_ENV_TYPES = `node -e "const fs=require('fs'),f='next-env.d.ts';fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace('.next-accounts/','.next/'))"`;

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
  projects: [
    { name: "chromium", testIgnore: /accounts\.on\.spec/, use: { ...devices["Desktop Chrome"] } },
    { name: "accounts", testMatch: /accounts\.on\.spec/, use: { ...devices["Desktop Chrome"], baseURL: accountsURL } },
  ],
  webServer: [
    {
      command: `npm run start -- --port ${PORT}`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `${ACCOUNTS_ENV} npm run build && ${RESTORE_ENV_TYPES} && ${ACCOUNTS_ENV} npm run start -- --port ${ACCOUNTS_PORT}`,
      url: accountsURL,
      reuseExistingServer: !process.env.CI,
      timeout: 600_000,
    },
  ],
});
