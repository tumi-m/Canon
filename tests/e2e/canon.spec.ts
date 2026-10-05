import { expect, test } from "@playwright/test";

test.describe("a canon", () => {
  test("renders someone's canon without javascript doing the work", async ({ page }) => {
    await page.goto("/tumelo");
    await expect(page.getByRole("heading", { name: "tumelo" })).toBeVisible();
    // the heading, not any text: a tile whose artwork fails to load sets the
    // title large in the frame as well, so the words can appear twice
    await expect(page.getByRole("heading", { name: "making of gta 1, 1996" })).toBeVisible();
    await expect(page.getByText("proof that world-changing things start scrappy")).toBeVisible();
  });

  test("404s on a handle nobody has claimed", async ({ page }) => {
    const res = await page.goto("/nobody");
    expect(res?.status()).toBe(404);
    await expect(page.getByText("nobody has claimed that handle yet.")).toBeVisible();
  });

  test("shows different providers per region, with the credit on every item", async ({ page }) => {
    await page.goto("/tumelo?region=us");
    await expect(page.getByText("hbo max").first()).toBeVisible();

    await page.goto("/tumelo?region=nz&view=list");
    await expect(page.getByText("prime video").first()).toBeVisible();
    await expect(page.getByText("hbo max")).toHaveCount(0);

    // plan §6: attribution is per item, not once in a footer
    const credits = page.getByText("via JustWatch / TMDB");
    expect(await credits.count()).toBeGreaterThan(5);
  });

  test("never synthesises a provider deep link", async ({ page }) => {
    await page.goto("/tumelo?region=us&view=list");
    for (const href of await page.locator("main a[href]").evaluateAll((as) =>
      (as as HTMLAnchorElement[]).map((a) => a.href),
    )) {
      expect(href).not.toContain("netflix.com");
    }
  });

  test("unfurls as a card with whose canon it is when the link is sent", async ({ page, request }) => {
    await page.goto("/tumelo");
    const image = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(image).toContain("/tumelo/opengraph-image");
    const res = await request.get(new URL(image!).pathname);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
  });

  test("says which view and which region are chosen, not only by colour", async ({ page }) => {
    await page.goto("/tumelo?region=jp&view=list");
    await expect(page.getByRole("link", { name: "the list", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("link", { name: "japan", exact: true })).toHaveAttribute("aria-current", "true");
  });
});
