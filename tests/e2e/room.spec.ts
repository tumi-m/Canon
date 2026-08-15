import { expect, test } from "@playwright/test";

const openRoom = async (page: import("@playwright/test").Page) => {
  await page.goto("/tumelo");
  await page.getByRole("button", { name: "step into the room" }).click();
  await expect(page.getByRole("button", { name: "let yourself out" })).toBeVisible();
};

test.describe("the room", () => {
  test("opens, shelves the canon, and walks", async ({ page }) => {
    await openRoom(page);
    await expect(page.locator("[class*=sleeve]").first()).toBeVisible();

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

  test("keeps keyboard focus inside the room, and gives it back on leaving", async ({ page }) => {
    await openRoom(page);
    // the canon behind the room is switched off while you are inside
    await expect(page.locator("main")).toHaveAttribute("inert", "");

    // and tab never lands on anything outside the room
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      const where = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return "body";
        return el.closest("[data-canon-room]") ? "room" : `ESCAPED: ${el.tagName}`;
      });
      expect(where).not.toContain("ESCAPED");
    }

    await page.getByRole("button", { name: "let yourself out" }).click();
    await expect(page.getByRole("button", { name: "step into the room" })).toBeFocused();
  });

  test("has a list escape hatch", async ({ page }) => {
    await openRoom(page);
    await page.getByRole("button", { name: "read it as a list" }).click();
    await expect(page.locator("[data-canon-room]")).toHaveCount(0);
    await expect(page.getByText("same shelves, read as a list.")).toBeVisible();
    await expect(page.getByText("making of gta 1, 1996").first()).toBeVisible();
  });

  test("opens a case and shows its why and where to watch", async ({ page }) => {
    await openRoom(page);
    await page.locator("button[class*=sleeve]").first().click();
    const card = page.getByRole("dialog");
    await expect(card).toBeVisible();
    await expect(card.getByText(/via JustWatch/)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(card).toHaveCount(0);
  });
});

test.describe("watching and leaving", () => {
  test("the screen fills the view, and esc unwinds one layer at a time", async ({ page }) => {
    await page.goto("/tumelo");
    await page.getByRole("button", { name: "step into the room" }).click();
    await expect(page.getByRole("button", { name: "let yourself out" })).toBeVisible();

    await page.getByRole("button", { name: "watch", exact: false }).first().click();
    const theatre = page.getByRole("dialog", { name: /watching/ });
    await expect(theatre).toBeVisible();
    const frame = theatre.locator("iframe");
    await expect(frame).toBeVisible();
    const box = await frame.boundingBox();
    const view = page.viewportSize()!;
    // "much bigger" is the requirement: the screen has to dominate the viewport
    expect(box!.width).toBeGreaterThan(view.width * 0.6);

    await page.keyboard.press("Escape");
    await expect(theatre).toHaveCount(0);
    await expect(page.getByRole("button", { name: "let yourself out" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator("[data-canon-room]")).toHaveCount(0);
  });

  test("you can change building without leaving", async ({ page }) => {
    await page.goto("/tumelo");
    await page.getByRole("button", { name: "step into the room" }).click();
    const room = page.locator("[class*=room]").first();
    await expect(room).toHaveAttribute("data-venue", "den");

    await page.getByLabel("where you keep it").selectOption("vault");
    await expect(page.locator("[data-venue=vault]")).toHaveCount(1);
    // the shelves are renamed in the vocabulary of the building
    await expect(page.getByText("sealed").first()).toBeVisible();
  });

  test("leaving is always one obvious control away", async ({ page }) => {
    await page.goto("/tumelo");
    await page.getByRole("button", { name: "step into the room" }).click();
    const exit = page.getByRole("button", { name: "let yourself out" });
    await expect(exit).toBeFocused();
    await expect(exit).toContainText("ESC");
    await exit.click();
    await expect(page.locator("[data-canon-room]")).toHaveCount(0);
  });
});
