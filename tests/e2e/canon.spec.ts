import { expect, test } from "@playwright/test";

test.describe("a canon", () => {
  test("renders someone's canon without javascript doing the work", async ({ page }) => {
    await page.goto("/tumelo");
    await expect(page.getByRole("heading", { name: "tumelo" })).toBeVisible();
    await expect(page.getByText("making of gta 1, 1996")).toBeVisible();
    await expect(page.getByText("proof that world-changing things start scrappy")).toBeVisible();
  });

  test("404s on a handle nobody has claimed", async ({ page }) => {
    const res = await page.goto("/nobody");
    expect(res?.status()).toBe(404);
    await expect(page.getByText("nobody has claimed that handle yet.")).toBeVisible();
  });

  test("shows different providers per region, with the credit on every item", async ({ page }) => {
    await page.goto("/tumelo?region=us");
    const jiro = page.locator("article").filter({ hasText: "jiro dreams of sushi" });
    await expect(jiro.getByRole("link", { name: "hbo max" })).toBeVisible();

    await page.goto("/tumelo?region=nz");
    const jiroNz = page.locator("article").filter({ hasText: "jiro dreams of sushi" });
    await expect(jiroNz.getByRole("link", { name: "prime video" })).toBeVisible();
    await expect(jiroNz.getByRole("link", { name: "hbo max" })).toHaveCount(0);

    // plan §6: attribution is per item, not once in a footer
    const credits = page.getByText("via JustWatch / TMDB");
    expect(await credits.count()).toBeGreaterThan(5);
  });

  test("never synthesises a provider deep link", async ({ page }) => {
    await page.goto("/tumelo?region=us");
    for (const href of await page.locator("article a[href]").evaluateAll((as) =>
      (as as HTMLAnchorElement[]).map((a) => a.href),
    )) {
      expect(href).not.toContain("netflix.com");
    }
  });
});
