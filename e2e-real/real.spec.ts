import { expect, test, type Page, type TestInfo } from "@playwright/test";

async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  await page.screenshot({ path: `test-results/screens-real/${info.project.name}-${name}.png`, fullPage: true });
}
async function noSideScroll(page: Page): Promise<void> {
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(sw).toBeLessThanOrEqual(iw);
}

for (const id of ["biloxi", "albuquerque", "akron", "portland-me"]) {
  test(`real Qloo data: ${id} Check board`, async ({ page }, info) => {
    await page.goto("/#/sample");
    await page.getByTestId(`market-${id}`).click();
    await expect(page.getByTestId("summary")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Synthetic demo data")).toHaveCount(0);
    await noSideScroll(page);
    await shot(page, info, `check-${id}`);
    const summary = await page.getByTestId("summary").innerText();
    console.log(`${id}: ${summary}`);
  });
}

test("real data: full flow on the first sample with swaps", async ({ page }, info) => {
  await page.goto("/#/sample");
  await page.getByTestId("market-albuquerque").click();
  await expect(page.getByTestId("summary")).toBeVisible({ timeout: 60_000 });
  // Why panel on a scored magnet.
  const scored = page.locator("button.tile .badge:has-text('Leans in'), button.tile .badge:has-text('Leans away'), button.tile .badge:has-text('About average')").first();
  await scored.click();
  const why = page.getByRole("dialog");
  await expect(why).toContainText("What Qloo looked at");
  await why.getByRole("button", { name: "Show the numbers" }).click();
  await expect(why.getByText(/Index z/)).toBeVisible();
  await expect(why.getByTestId("why-footer")).toContainText("not an attendance predictor");
  await expect(why.getByTestId("source-line")).toContainText(/Fetched from Qloo|Result recorded/);
  await shot(page, info, "why");
  await why.getByTestId("recheck").click();
  await expect(why.getByTestId("recheck-message")).toContainText(/Checked again/);
  await expect(why.getByTestId("recheck-message")).toBeInViewport();
  await page.screenshot({ path: `test-results/screens-real/${info.project.name}-why-viewport.png` });
  await page.keyboard.press("Escape");
  await page.getByTestId("to-fix").click();
  await expect(page.getByRole("heading", { name: /Fix:/ })).toBeVisible();
  await expect(page.getByTestId("proposal").or(page.getByText("Nothing needs swapping."))).not.toHaveCount(0, { timeout: 30_000 });
  await noSideScroll(page);
  await shot(page, info, "fix");
  const n = await page.getByTestId("proposal").count();
  console.log(`albuquerque proposals: ${n}`);
  if (n > 0) {
    await expect(page.getByTestId("proposal").first().getByTestId("cited")).toContainText("typical");
    await page.getByTestId("proposal").first().getByTestId("approve").click();
    await expect(page.locator(".stamp").first()).toBeVisible();
    await shot(page, info, "approved");
  }
  await page.getByTestId("to-send").click();
  await expect(page.getByTestId("memo")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("memo")).not.toContainText("SYNTHETIC");
  await shot(page, info, "send");
  await page.getByTestId("to-study").click();
  await expect(page.getByText("Make your call first")).toBeVisible();
  await expect(page.getByTestId("verdict")).toHaveCount(0);
  await page.getByTestId("call-not-sure").click();
  await expect(page.getByTestId("verdict")).toContainText("CALL STANDS");
  await expect(page.getByTestId("audit-line")).toContainText("H1 did not pass, so Homestand is a reasoned, cited audit of local taste, not an attendance predictor.");
  await expect(page.getByTestId("h1-text")).toContainText("49.1%");
  await expect(page.getByTestId("h1-text")).toContainText("521 pairs");
  await expect(page.getByTestId("results-pending")).toHaveCount(0);
  await expect(page.getByText("not detected at this sample size").first()).toBeVisible();
  await noSideScroll(page);
  await shot(page, info, "study");
});
