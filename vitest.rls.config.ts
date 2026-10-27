import { defineConfig } from "vitest/config";

/**
 * The row level security suite: against a real Postgres, not the unit
 * runner's node environment. `npm run test:rls`, with RLS_DATABASE_URL set.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/rls/**/*.test.ts"],
    globalSetup: ["tests/rls/setup.ts"],
    // one database, so one file at a time
    fileParallelism: false,
  },
});
