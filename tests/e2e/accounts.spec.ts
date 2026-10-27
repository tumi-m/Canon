import { expect, test } from "@playwright/test";

/**
 * A copy of canon with no Supabase behind it — what a deploy is until its
 * keys are set. Nothing may pretend: no sign-in link anywhere, and the
 * account pages say plainly that accounts are not switched on.
 */
test.describe("with accounts not switched on", () => {
  test("no page offers a sign-in that leads nowhere", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: /sign in|your account|start your canon/ })).toHaveCount(0);
    await page.goto("/tumelo");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: /sign in|your account/ })).toHaveCount(0);
  });

  test("the sign-in page says so, rather than showing buttons that cannot work", async ({ page }) => {
    await page.goto("/signin");
    await expect(page.getByRole("heading", { name: "not switched on yet" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Continue with/ })).toHaveCount(0);
  });

  test("the account pages, and the way back from a provider, all lead to that page", async ({ page }) => {
    for (const path of ["/account", "/welcome", "/auth/callback?code=anything"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/signin$/);
      await expect(page.getByRole("heading", { name: "not switched on yet" })).toBeVisible();
    }
  });

  test("a handle nobody has is still not found", async ({ page }) => {
    const response = await page.goto("/not-a-real-canon");
    expect(response?.status()).toBe(404);
  });
});
