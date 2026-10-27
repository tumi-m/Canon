import { expect, test, type Page } from "@playwright/test";

/**
 * The app built with accounts switched on, against a Supabase address that
 * has nothing behind it (see playwright.config.ts). Google and Apple are
 * not reachable from a test, and should not be: what this code owns is
 * starting the right provider's sign-in with a safe way back, the pages
 * that need a session refusing anyone without one, and failures that say
 * what went wrong.
 */

const SUPABASE = "http://127.0.0.1:54321";

/** the page's own message — next.js keeps a route announcer with the same role */
const problem = (page: Page) => page.locator("main [role=alert]");

/** Catch the hand-off to Supabase's authorize endpoint instead of following it. */
async function authorizeRequest(page: Page, button: string) {
  let seen: URL | null = null;
  await page.route(`${SUPABASE}/**`, async (route) => {
    seen = new URL(route.request().url());
    await route.fulfill({ status: 200, contentType: "text/plain", body: "the provider's sign-in page" });
  });
  await page.getByRole("button", { name: button }).click();
  await expect.poll(() => seen?.pathname ?? null).toBe("/auth/v1/authorize");
  return seen!;
}

test.describe("with accounts switched on", () => {
  test("the front and every canon offer a way in", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "sign in" })).toBeVisible();
    await expect(page.getByRole("link", { name: /start your canon/ })).toHaveAttribute("href", "/signin");
    await page.goto("/tumelo");
    await expect(page.getByRole("link", { name: "sign in" })).toBeVisible();
  });

  test("offers Google, Apple and an email link", async ({ page }) => {
    await page.goto("/signin");
    await expect(page.getByRole("heading", { name: "sign in" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with Apple" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /email me a link/ })).toBeVisible();
  });

  for (const [button, provider] of [
    ["Continue with Google", "google"],
    ["Continue with Apple", "apple"],
  ] as const) {
    test(`${button} starts ${provider}'s sign-in, and comes back to this site`, async ({ page }) => {
      await page.goto("/signin?next=%2Ftumelo");
      const authorize = await authorizeRequest(page, button);
      expect(authorize.searchParams.get("provider")).toBe(provider);
      // PKCE: the code that comes back is useless without the verifier this browser holds
      expect(authorize.searchParams.get("code_challenge")).toBeTruthy();
      expect(authorize.searchParams.get("code_challenge_method")?.toLowerCase()).toBe("s256");
      const back = new URL(authorize.searchParams.get("redirect_to")!);
      expect(back.origin).toBe("http://127.0.0.1:3001");
      expect(back.pathname).toBe("/auth/callback");
      expect(back.searchParams.get("next")).toBe("/tumelo");
    });
  }

  test("never carries somebody off-site after signing in", async ({ page }) => {
    await page.goto("/signin?next=%2F%2Fevil.example%2Faccount");
    await expect(page.locator('input[name="next"]').first()).toHaveValue("/account");
    const authorize = await authorizeRequest(page, "Continue with Google");
    expect(new URL(authorize.searchParams.get("redirect_to")!).searchParams.get("next")).toBe("/account");
  });

  test("an email that cannot be sent says so", async ({ page }) => {
    await page.goto("/signin");
    await page.getByRole("textbox", { name: /email me a link/ }).fill("someone@example.com");
    await page.getByRole("button", { name: "send the link" }).click();
    await expect(problem(page)).toContainText("couldn't be sent");
    // and the address never went into the url
    expect(page.url()).not.toContain("someone");
  });

  test("the account pages send anyone without a session to sign in, and back again", async ({ page }) => {
    await page.goto("/account");
    await expect(page).toHaveURL(/\/signin\?next=(%2F|\/)account$/);
    await expect(page.locator('input[name="next"]').first()).toHaveValue("/account");
    await page.goto("/welcome");
    await expect(page).toHaveURL(/\/signin\?next=(%2F|\/)welcome$/);
  });

  test("a link that has expired, or a sign-in that was cancelled, is said plainly", async ({ page }) => {
    await page.goto("/auth/callback?code=not-a-real-code&next=%2Ftumelo");
    await expect(page).toHaveURL(/\/signin\?error=link/);
    await expect(problem(page)).toContainText("expired or was already used");
    await page.goto("/auth/callback?error=access_denied");
    await expect(problem(page)).toContainText("cancelled");
  });
});
