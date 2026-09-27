import { expect, test, type Page } from "@playwright/test";

const openRoom = async (page: Page) => {
  await page.goto("/tumelo");
  await page.getByRole("button", { name: "step into the room" }).click();
  await expect(page.getByRole("button", { name: "let yourself out" })).toBeVisible();
  // the scene is a canvas now; wait for it to have a drawing buffer
  // software gl under parallel workers takes seconds to paint the materials
  await expect(page.locator("[data-canon-room] [role=status]")).toHaveCount(0, { timeout: 30_000 });
  await expect
    .poll(() => page.evaluate(() => (document.querySelector("canvas")?.width ?? 0) > 0))
    .toBe(true);
};

/** Walk up to the shelf you come in facing, and read what is in front of you. */
const walkUntilAimed = async (page: Page) => {
  await page.keyboard.down("w");
  await expect
    .poll(() => page.locator("[class*=aimLabel]").count(), { timeout: 20_000 })
    .toBeGreaterThan(0);
  await page.keyboard.up("w");
};

test.describe("the room", () => {
  test("draws a webgl scene rather than a pile of dom", async ({ page }) => {
    await openRoom(page);
    expect(
      await page.evaluate(() => {
        const canvas = document.querySelector("canvas");
        return !!(canvas?.getContext("webgl2") || canvas?.getContext("webgl"));
      }),
    ).toBe(true);
    // the old renderer built a div per sleeve; the new one builds none
    expect(await page.locator("[data-canon-room] [class*=sleeve]").count()).toBe(0);
  });

  test("walks, and the reticle finds what you walk up to", async ({ page }) => {
    await openRoom(page);
    await expect(page.locator("[class*=aimLabel]")).toHaveCount(0);
    await walkUntilAimed(page);
    await expect(page.locator("[class*=aimLabel]")).toBeVisible();
  });

  test("can be looked around with the keyboard alone", async ({ page }) => {
    // there is no pointer on a keyboard, and a reticle you cannot aim is a
    // room you cannot use: the arrows have to turn your head
    await openRoom(page);
    await walkUntilAimed(page);
    const facing = await page.locator("[class*=aimLabel]").innerText();

    await page.keyboard.down("ArrowRight");
    await expect
      .poll(async () => {
        const label = page.locator("[class*=aimLabel]");
        return (await label.count()) === 0 ? "" : await label.innerText();
      })
      .not.toBe(facing);
    await page.keyboard.up("ArrowRight");
  });

  test("takes something off the shelf and shows its why", async ({ page }) => {
    await openRoom(page);
    await walkUntilAimed(page);
    await page.keyboard.press("e");
    const card = page.getByRole("dialog");
    await expect(card).toBeVisible();
    await expect(card.getByText(/via JustWatch/)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(card).toHaveCount(0);
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
});

test.describe("watching and leaving", () => {
  test("the screen fills the view, and esc unwinds one layer at a time", async ({ page }) => {
    await openRoom(page);
    await page.getByRole("button", { name: "watch", exact: false }).first().click();
    const theatre = page.getByRole("dialog", { name: /watching/ });
    await expect(theatre).toBeVisible();
    const frame = theatre.locator("iframe");
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
    await openRoom(page);
    await expect(page.locator("[data-venue=den]")).toHaveCount(1);
    await page.getByLabel("where you keep it").selectOption("vault");
    await expect(page.locator("[data-venue=vault]")).toHaveCount(1);
    // the shelves are renamed in the vocabulary of the building
    await expect(page.getByText("sealed").first()).toBeVisible();
  });

  test("coming back from the big screen leaves you where you were", async ({ page }) => {
    // it used to tear the whole room down and rebuild it at the door
    await openRoom(page);
    await walkUntilAimed(page);
    const facing = await page.locator("[class*=aimLabel]").innerText();

    await page.keyboard.press("t");
    await expect(page.getByRole("dialog", { name: /watching/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: /watching/ })).toHaveCount(0);

    await page.waitForTimeout(1500);
    expect(await page.locator("[class*=aimLabel]").innerText()).toBe(facing);
  });

  test("a focused button answers to enter", async ({ page }) => {
    // enter used to be swallowed as "take it off the shelf" wherever focus was
    await openRoom(page);
    await expect(page.getByRole("button", { name: "let yourself out" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-canon-room]")).toHaveCount(0);
  });

  test("leaving is always one obvious control away", async ({ page }) => {
    await openRoom(page);
    const exit = page.getByRole("button", { name: "let yourself out" });
    await expect(exit).toBeFocused();
    await expect(exit).toContainText("ESC");
    await exit.click();
    await expect(page.locator("[data-canon-room]")).toHaveCount(0);
  });
});
