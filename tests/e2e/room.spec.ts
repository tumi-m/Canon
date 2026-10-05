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

  test("the capsule opens in the room instead of throwing you out", async ({ page }) => {
    await openRoom(page);
    // walked to from the list: steering at it was the only way, and a slow
    // frame could turn you straight past it
    await page
      .getByRole("navigation", { name: "places in the room" })
      .getByRole("button", { name: /the capsule/ })
      .click();
    await expect(page.locator("[class*=aimLabel]")).toContainText("the capsule", { timeout: 20_000 });
    await page.keyboard.press("e");
    const card = page.getByRole("dialog", { name: "the capsule" });
    await expect(card).toBeVisible();
    await expect(page.locator("[data-canon-room]")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(card).toHaveCount(0);
    await expect(page.locator("[data-canon-room]")).toHaveCount(1);
  });

  test("hangs the piece that changed you most over the fireplace, with its why", async ({ page }) => {
    await openRoom(page);
    await page.keyboard.press("5");
    await expect(page.locator("[class*=now]")).toHaveText("the fireplace", { timeout: 20_000 });
    // the first of the changed-me tier, framed over the mantel
    await expect(page.locator("[class*=aimLabel]")).toContainText("making of gta 1, 1996");
    await page.keyboard.press("e");
    await expect(page.getByRole("dialog").getByText("proof that world-changing things start scrappy and small.").first()).toBeVisible();
  });

  test("walks you to the set, and it says what it is for", async ({ page }) => {
    await openRoom(page);
    await page.keyboard.press("6");
    await expect(page.locator("[class*=aimLabel]")).toContainText("the television", { timeout: 20_000 });
    await expect(page.locator("[class*=now]")).toHaveText("the set");
  });

  test("walks you to a shelf you pick from the list, or by its number", async ({ page }) => {
    await openRoom(page);
    const badge = page.locator("[class*=now]");
    const shelves = page.getByRole("navigation", { name: "places in the room" });

    await shelves.getByRole("button", { name: /the good shelf/ }).click();
    // you arrive facing it: the reticle is on one of its cases, and the badge says where you are
    await expect(badge).toHaveText("the good shelf", { timeout: 20_000 });
    await expect(page.locator("[class*=aimLabel]")).toBeVisible();

    await page.keyboard.press("1");
    await expect(badge).toHaveText("the ones that changed me", { timeout: 20_000 });
    await expect(shelves.getByRole("button", { name: /the ones that changed me/ })).toHaveAttribute(
      "aria-current",
      "location",
    );
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
    // and it is the list you land on, not whichever view was behind the room
    await expect(page).toHaveURL(/view=list/);
    await expect(page.getByRole("region", { name: /the ones that changed me/ })).toBeVisible();
  });

  test("the room's code is not downloaded until someone asks for it", async ({ page }) => {
    // three.js used to ride in the first load of every canon page
    const scripts: Promise<string>[] = [];
    page.on("response", (res) => {
      if (res.url().endsWith(".js")) scripts.push(res.text().catch(() => ""));
    });
    const hasRenderer = async () =>
      (await Promise.all(scripts)).some((body) => body.includes("WebGLRenderer"));

    await page.goto("/tumelo");
    await page.waitForLoadState("networkidle");
    expect(await hasRenderer()).toBe(false);

    await page.getByRole("button", { name: "step into the room" }).click();
    await expect(page.getByRole("button", { name: "let yourself out" })).toBeVisible();
    expect(await hasRenderer()).toBe(true);
  });
});

test.describe("the mouse", () => {
  test("clicking in the room never takes the cursor away", async ({ page }) => {
    // the first click anywhere used to capture the pointer: the cursor vanished
    await openRoom(page);
    const view = page.viewportSize()!;
    await page.mouse.click(view.width / 2, view.height / 3);
    expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
  });

  test("points at something, says what it is, and a click takes it", async ({ page }) => {
    await openRoom(page);
    await page.keyboard.press("1");
    await expect(page.locator("[class*=now]")).toHaveText("the ones that changed me", { timeout: 20_000 });
    const view = page.viewportSize()!;
    await page.mouse.move(view.width / 2, view.height / 2);
    await expect(page.locator("[class*=aimLabel]")).toContainText("CLICK · TAKE IT OFF THE SHELF");
    await page.mouse.click(view.width / 2, view.height / 2);
    await expect(page.getByRole("dialog").getByText(/via JustWatch/)).toBeVisible();
  });

  test("a drag turns your head, and takes nothing", async ({ page }) => {
    await openRoom(page);
    await page.keyboard.press("1");
    await expect(page.locator("[class*=now]")).toHaveText("the ones that changed me", { timeout: 20_000 });
    const view = page.viewportSize()!;
    await page.mouse.move(view.width / 2, view.height / 2);
    await page.mouse.down();
    await page.mouse.move(view.width / 2 + 160, view.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
  });
});

test.describe("watching and leaving", () => {
  test("the screen fills the view, and esc unwinds one layer at a time", async ({ page }) => {
    await openRoom(page);
    await page.getByRole("button", { name: "watch", exact: false }).first().click();
    const theatre = page.getByRole("dialog", { name: /watching/ });
    await expect(theatre).toBeVisible();
    const frame = theatre.locator("iframe");
    const view = page.viewportSize()!;
    // "much bigger" is the requirement: the screen has to dominate the viewport.
    // polled, because it switches on like a tube — a line first, then the picture
    await expect
      .poll(async () => (await frame.boundingBox())?.width ?? 0)
      .toBeGreaterThan(view.width * 0.6);

    await page.keyboard.press("Escape");
    await expect(theatre).toHaveCount(0);
    await expect(page.getByRole("button", { name: "let yourself out" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator("[data-canon-room]")).toHaveCount(0);
  });

  test("the big screen keeps the keyboard with it", async ({ page }) => {
    // it opened with focus left behind it, and tab walked the hud underneath
    await openRoom(page);
    await page.keyboard.press("t");
    const theatre = page.getByRole("dialog", { name: /watching/ });
    await expect(theatre.getByRole("button", { name: "back to the room" })).toBeFocused();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      const inside = await page.evaluate(() => {
        const el = document.activeElement;
        return !el || el === document.body || !!el.closest("[role=dialog]") || el.tagName === "IFRAME";
      });
      expect(inside).toBe(true);
    }
  });

  test("you can change building without leaving", async ({ page }) => {
    await openRoom(page);
    await expect(page.locator("[data-venue=den]")).toHaveCount(1);
    await page.getByLabel("where you keep it").selectOption("vault");
    await expect(page.locator("[data-venue=vault]")).toHaveCount(1);
    // the shelves are renamed in the vocabulary of the building
    await expect(page.getByText("sealed").first()).toBeVisible();
  });

  test("the start menu on the big screen tunes to any channel", async ({ page }) => {
    await openRoom(page);
    await page.keyboard.press("t");
    const set = page.getByRole("dialog", { name: /watching/ });
    await set.getByRole("button", { name: "start" }).click();
    await set.getByRole("navigation", { name: "channels" }).getByRole("button", { name: /CH 03/ }).click();
    await expect(set.getByRole("region", { name: "the player" })).toContainText("CH 03");
    // and the window's close button is a way back to the room
    await set.getByRole("button", { name: "close the player" }).click();
    await expect(set).toHaveCount(0);
    await expect(page.getByRole("button", { name: "let yourself out" })).toBeVisible();
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

test.describe("ray tracing", () => {
  test("stand still and the room develops; a step hands it back", async ({ page }) => {
    /* The path tracer's shader is one of the largest a browser compiles, and a
       software rasteriser compiles it on the main thread in tens of seconds.
       The assertions are the same as on a graphics card; the patience is not. */
    test.setTimeout(240_000);
    await openRoom(page);
    const toggle = page.getByRole("button", { name: /ray tracing/ });
    // a software rasteriser starts with it off: the tracer is seconds a frame there
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.press("p");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");

    const print = page.locator("[class*=print]").first();
    await expect(print).toContainText("developing", { timeout: 120_000 });
    // the first step puts the raster frame back, and the print away
    await page.keyboard.down("w");
    await expect(page.locator("[class*=print]")).toHaveCount(0, { timeout: 120_000 });
    await page.keyboard.up("w");

    // and switched off, standing still is only standing still
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await page.waitForTimeout(3000);
    await expect(page.locator("[class*=print]")).toHaveCount(0);
  });
});

test.describe("with less motion asked for", () => {
  test.use({ reducedMotion: "reduce" });

  test("picking a place still takes you there", async ({ page }) => {
    // with reduced motion there is no walk: a separate path puts you there on
    // the next frame, and a separate path is one that can quietly break
    await openRoom(page);
    await page.keyboard.press("3");
    await expect(page.locator("[class*=now]")).toHaveText("the good shelf", { timeout: 20_000 });
  });
});

test.describe("on a touch screen", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the controls keep clear of the stick", async ({ page }) => {
    // the stick used to sit on top of the four step buttons
    await openRoom(page);
    const stick = await page.locator("[class*=stick]").boundingBox();
    expect(stick).not.toBeNull();
    const controls = page.locator("[class*=hudBot] button, [class*=hudBot] select");
    const count = await controls.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const box = await controls.nth(i).boundingBox();
      if (!box) continue;
      const overlaps =
        box.x < stick!.x + stick!.width &&
        box.x + box.width > stick!.x &&
        box.y < stick!.y + stick!.height &&
        box.y + box.height > stick!.y;
      expect(overlaps, `control ${i} sits under the stick`).toBe(false);
    }
  });
});
