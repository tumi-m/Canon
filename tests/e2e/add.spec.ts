import { expect, test, type Page } from "@playwright/test";

const fill = async (page: Page, title: string) => {
  const form = page.getByRole("dialog", { name: "add something to the shelves" });
  await form.getByLabel("the link").fill("https://www.youtube.com/watch?v=THjekE5p2aw");
  await form.getByLabel("what it is called").fill(title);
  // "w", "a", "s" and "d" are walking keys in the room: typing them must stay typing
  await form.getByLabel(/why it is here/).fill("was swept away, and stayed there all week.");
  return form;
};

test.describe("adding to a canon", () => {
  test("adds a link from the page, as a draft that stays on this device", async ({ page }) => {
    await page.goto("/tumelo");
    await page.getByRole("button", { name: "+ add a link" }).click();
    const form = await fill(page, "a new favourite");
    await expect(form.getByText("a youtube video")).toBeVisible();
    await form.getByRole("button", { name: "put it on the shelf" }).click();
    await expect(form).toHaveCount(0);

    const drafts = page.getByRole("region", { name: /on this device/ });
    await expect(drafts.getByRole("link", { name: "a new favourite" })).toBeVisible();
    await expect(drafts.getByText("draft", { exact: true })).toBeVisible();

    // it is still there after a reload — and only in this browser
    await page.reload();
    await expect(drafts.getByRole("link", { name: "a new favourite" })).toBeVisible();

    await drafts.getByRole("button", { name: "remove a new favourite" }).click();
    await expect(drafts.getByRole("link", { name: "a new favourite" })).toHaveCount(0);
  });

  test("refuses a link that is not a web link, and says why", async ({ page }) => {
    await page.goto("/tumelo");
    await page.getByRole("button", { name: "+ add a link" }).click();
    const form = page.getByRole("dialog", { name: "add something to the shelves" });
    await form.getByLabel("the link").fill("javascript:alert(1)");
    await form.getByRole("button", { name: "put it on the shelf" }).click();
    await expect(form.getByRole("alert").first()).toBeVisible();
    await expect(form.getByLabel("the link")).toHaveAttribute("aria-invalid", "true");
    await page.keyboard.press("Escape");
    await expect(form).toHaveCount(0);
  });

  test("adds from the noticeboard in the room, and it stays in the room", async ({ page }) => {
    await page.goto("/tumelo");
    await page.getByRole("button", { name: "step into the room" }).click();
    await expect(page.locator("[data-canon-room] [role=status]")).toHaveCount(0, { timeout: 30_000 });

    await page
      .getByRole("navigation", { name: "places in the room" })
      .getByRole("button", { name: /the noticeboard/ })
      .click();
    await expect(page.locator("[class*=aimLabel]")).toContainText("the noticeboard", { timeout: 20_000 });
    await page.keyboard.press("e");

    const form = await fill(page, "pinned from the room");
    await form.getByRole("button", { name: "put it on the shelf" }).click();
    await expect(form).toHaveCount(0);
    // still in the room, not thrown out to the page
    await expect(page.getByRole("button", { name: "let yourself out" })).toBeVisible();

    await page.getByRole("button", { name: "let yourself out" }).click();
    await expect(
      page.getByRole("region", { name: /on this device/ }).getByRole("link", { name: "pinned from the room" }),
    ).toBeVisible();
  });
});
