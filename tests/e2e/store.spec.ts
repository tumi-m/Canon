import { expect, test } from "@playwright/test";

const openStore = async (page: import("@playwright/test").Page) => {
  await page.goto("/tumelo");
  await page.getByRole("button", { name: "walk into the store" }).click();
  await expect(page.getByText(/AISLE 1/)).toBeVisible();
};

test.describe("the store", () => {
  test("opens, shelves the canon, and walks", async ({ page }) => {
    await openStore(page);
    await expect(page.locator("[class*=case]").first()).toBeVisible();

    const depth = () =>
      page.evaluate(() => {
        const w = document.querySelector("[class*=world]") as HTMLElement;
        return parseFloat(w.style.getPropertyValue("--cz"));
      });

    // poll rather than wait a fixed slice: headless software rendering runs at
    // a few fps under parallel workers, so any timeout is either flaky or slow
    const before = await depth();
    await page.keyboard.down("w");
    await expect.poll(depth, { timeout: 10_000 }).toBeLessThan(before);
    await page.keyboard.up("w");
  });

  test("keeps keyboard focus inside the store, and gives it back on leaving", async ({ page }) => {
    await openStore(page);
    // the canon behind the aisle is switched off while you are inside
    await expect(page.locator("main")).toHaveAttribute("inert", "");

    // and tab never lands on anything outside the store
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      const where = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return "body";
        return el.closest("[data-canon-store]") ? "store" : `ESCAPED: ${el.tagName}`;
      });
      expect(where).not.toContain("ESCAPED");
    }

    await page.getByRole("button", { name: "leave the store" }).click();
    await expect(page.getByRole("button", { name: "walk into the store" })).toBeFocused();
  });

  test("has a list escape hatch", async ({ page }) => {
    await openStore(page);
    await page.getByRole("button", { name: "list instead" }).click();
    await expect(page.getByText(/AISLE 1/)).toHaveCount(0);
    await expect(page.getByText("same canon, plain list.")).toBeVisible();
    await expect(page.getByText("making of gta 1, 1996")).toBeVisible();
  });

  test("opens a case and shows its why and where to watch", async ({ page }) => {
    await openStore(page);
    await page.locator("button[class*=case]").first().click();
    const card = page.getByRole("dialog");
    await expect(card).toBeVisible();
    await expect(card.getByText(/via JustWatch/)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(card).toHaveCount(0);
  });
});
