import { expect, test } from "@playwright/test";

test.describe("the wall", () => {
  test("is the default view, and shows artwork from youtube's own cdn", async ({ page }) => {
    await page.goto("/tumelo");
    const art = page.locator("main img").first();
    await expect(art).toBeVisible();
    // next/image rewrites the src, but the upstream url is the one that matters
    const src = await art.getAttribute("src");
    expect(decodeURIComponent(src ?? "")).toContain("i.ytimg.com");
  });

  test("keeps the why visible rather than hiding it behind a hover", async ({ page }) => {
    await page.goto("/tumelo");
    await expect(page.getByText("proof that world-changing things start scrappy and small.")).toBeVisible();
  });

  test("switches between the wall and the list, and keeps the region", async ({ page }) => {
    await page.goto("/tumelo?region=us");
    await page.getByRole("link", { name: "the list", exact: true }).click();
    await expect(page).toHaveURL(/view=list/);
    await expect(page).toHaveURL(/region=us/);
    await expect(page.locator("main img")).toHaveCount(0);

    await page.getByRole("link", { name: "the wall", exact: true }).click();
    await expect(page).toHaveURL(/region=us/);
    await expect(page.locator("main img").first()).toBeVisible();
  });

  test("names a link with no artwork instead of showing an empty box", async ({ page }) => {
    await page.goto("/tumelo");
    // the wikipedia entries have no embeddable video, so they get a spine
    await expect(page.getByText("jiro dreams of sushi").first()).toBeVisible();
  });
});
