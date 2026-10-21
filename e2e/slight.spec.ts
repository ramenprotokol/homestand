import { expect, test } from "@playwright/test";

// The offline data has two themes whose readings barely differ between towns (src/worker/synthetic.ts, COMPRESSED_ENTITIES), so the "slight lean"
// screens are real here: in Biloxi, Super Mario leans weak with an optional swap and Taylor Swift leans weak with no swap to offer.
test("a slight lean: the chip, the Why note, the optional swap, the left-as-planned block and the memo", async ({ page }) => {
  await page.goto("/#/check/biloxi");
  await expect(page.getByTestId("summary")).toContainText("2 more only lean weak.");
  await expect(page.locator('.fitlist li[data-k="leans-away"]')).toContainText("2 of these only lean that way");
  const mario = page.getByRole("button", { name: /Super Mario/ }).first();
  await expect(mario.locator(".fitword")).toHaveText("Leans weak");
  await mario.click();
  const why = page.getByRole("dialog");
  await expect(why).toContainText("Slight: only");
  await expect(why).toContainText("treat it as a lean, not a verdict");
  await expect(why.locator(".fitchip")).toContainText("Leans weak");
  await page.keyboard.press("Escape");

  await page.getByTestId("to-fix").click();
  await expect(page.getByTestId("fix-status")).toBeVisible();
  // Taylor Swift only leans weak and has nothing to swap to: it is said, not dropped, and it is not "could not fix".
  const block = page.getByTestId("slight-block");
  await expect(block).toContainText("Only a slight lean, left as planned: Taylor Swift Night (");
  await expect(block).toContainText(", 2027) only leans weak (raw gap under 0.01), so no swap is pushed.");
  // The optional swap is last, and carries its badge.
  await page.getByTestId("skip-pack").click();
  for (let i = 0; i < 6 && !(await page.getByTestId("optional-badge").isVisible()); i++) {
    await page.getByTestId("reject").click();
    await page.getByTestId("next-swap").click();
  }
  await expect(page.getByTestId("optional-badge")).toHaveText("Optional (slight lean)");
  await expect(page.getByTestId("swap-line")).toContainText("Super Mario: Leans weak");
  await page.getByTestId("reject").click();

  await page.getByTestId("to-send").click();
  const memo = page.getByTestId("memo");
  await expect(memo).toContainText("Only a slight lean, left as planned: Taylor Swift Night (");
  await expect(memo).toContainText("Rejected");
  await expect(memo).not.toContainText("Still weak");
});

test("when every swap is optional, the lede says so instead of '0 swaps proposed'", async ({ page }) => {
  await page.goto("/#/own");
  await page.getByLabel("2. Your theme nights").fill("date,theme,sponsor,locked,notes\n2027-04-10,Super Mario Day,,no,\n");
  await page.getByLabel("1. Your home city").fill("Tulsa");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: "Tulsa, OK" }).click();
  await page.getByTestId("check-mine").click();
  await expect(page.getByTestId("summary")).toHaveText("This night isn't a weak fit for Tulsa. 1 more only leans weak.");
  await page.getByTestId("to-fix").click();
  await expect(page.getByTestId("fix-status")).toBeVisible();
  await expect(page.locator(".fix-head .lede")).toContainText("No clear weak night needs a swap. 1 optional swap is offered: the planned night only leans weak.");
  await expect(page.locator(".fix-head .lede")).not.toContainText("0 swaps proposed");
});

for (const id of ["biloxi", "albuquerque", "akron", "portland-me", "boise", "raleigh"]) {
  test(`Send accounts for every night: ${id}`, async ({ page }) => {
    await page.goto(`/#/check/${id}`);
    await expect(page.getByTestId("summary")).toBeVisible();
    await page.getByTestId("to-fix").click();
    await expect(page.getByTestId("fix-status")).toBeVisible();
    await page.getByTestId("skip-pack").click({ timeout: 4000 }).catch(() => undefined);
    await page.getByTestId("approve").click();
    await page.getByTestId("to-send").click();
    const caption = await page.locator(".fcap").innerText();
    const total = await page.locator(".grid--final .slot").count();
    const sum = [...caption.matchAll(/(\d+) /g)].reduce((n, m) => n + Number(m[1]), 0);
    expect(sum, `"${caption}" should add up to ${total} nights`).toBe(total);
    // The finished deck says which season it covers, with the year.
    await expect(page.getByTestId("final-span")).toHaveText(/^\d{4}(–\d{2})? (season|summer series) · [A-Z][a-z]{2} \d+ – [A-Z][a-z]{2} \d+$/);
  });
}
