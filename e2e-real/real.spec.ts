import { expect, test, type Page, type TestInfo } from "@playwright/test";

async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  await page.screenshot({ path: `test-results/screens-real/${info.project.name}-${name}.png`, fullPage: true });
}
async function noSideScroll(page: Page): Promise<void> {
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(sw).toBeLessThanOrEqual(iw);
}

test("real data: start page", async ({ page }, info) => {
  await page.goto("/");
  await expect(page.getByTestId("study-teaser")).toContainText("385 real 2025 theme nights");
  await noSideScroll(page);
  await shot(page, info, "start");
});

for (const id of ["biloxi", "albuquerque", "akron", "portland-me"]) {
  test(`real Qloo data: ${id} Check board`, async ({ page }, info) => {
    await page.goto("/#/sample");
    await page.getByTestId(`market-${id}`).click();
    await expect(page.getByTestId("summary")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Synthetic demo data")).toHaveCount(0);
    await noSideScroll(page);
    await shot(page, info, `check-${id}`);
    const summary = await page.getByTestId("summary").innerText();
    await expect(page.getByTestId("check-result")).toHaveText(/^(None of the \d+ nights lean|\d+ of \d+ nights? leans?) away from what .+ likes\.$/);
    await page.getByTestId("to-fix").click();
    await expect(page.getByRole("heading", { name: /Fix:/ })).toBeVisible({ timeout: 30_000 }); // the live agent can take a while to propose
    const skip = page.getByTestId("skip-pack");
    await expect(skip.or(page.getByText("Nothing needs swapping.")).first()).toBeVisible({ timeout: 30_000 });
    await shot(page, info, `fix-pack-${id}`);
    if (await skip.isVisible()) await skip.click();
    const proposals = await page.locator(".slide").count();
    console.log(`${id}: ${summary} | proposals ${proposals}, angles ${await page.getByTestId("angle").count()}`);
    // The demo must show the Fix step working in every sample market.
    expect(proposals, `${id} proposals`).toBeGreaterThanOrEqual(2);
    expect(await page.getByTestId("angle").count(), `${id} locked-night angles`).toBeGreaterThanOrEqual(1);
    await shot(page, info, `fix-${id}`);
  });
}

test("real data: full flow on the first sample with swaps", async ({ page }, info) => {
  await page.goto("/#/sample");
  await page.getByTestId("market-albuquerque").click();
  await expect(page.getByTestId("summary")).toBeVisible({ timeout: 60_000 });
  // Why panel on a scored magnet.
  const scored = page.locator(".card[role=button]").filter({ has: page.locator(".fitword", { hasText: /Leans in|Leans away|About average/ }) }).first();
  await scored.click();
  const why = page.getByRole("dialog");
  await expect(why).toContainText("What Qloo looked at");
  await why.getByRole("button", { name: "Show the numbers" }).click();
  await expect(why.getByText(/Index = z - market average/)).toBeVisible();
  await expect(why).toContainText(/Compared with other ballpark markets, this market scores/);
  await expect(why.getByTestId("why-footer")).toContainText("See how we tested this");
  await expect(why).not.toContainText("coin flip");
  await expect(why.getByTestId("source-line")).toContainText(/Fetched from Qloo|Saved result, pulled from Qloo on/);
  await shot(page, info, "why");
  await why.getByTestId("recheck").click();
  await expect(why.getByTestId("recheck-message")).toContainText(/Checked again/);
  await expect(why.getByTestId("recheck-message")).toBeInViewport();
  await page.screenshot({ path: `test-results/screens-real/${info.project.name}-why-viewport.png` });
  await page.keyboard.press("Escape");
  await page.getByTestId("to-fix").click();
  await expect(page.getByRole("heading", { name: /Fix:/ })).toBeVisible({ timeout: 30_000 }); // the live agent can take a while to propose
  const pack = page.getByRole("button", { name: /Open the pack/ });
  await expect(pack.or(page.getByText("Nothing needs swapping."))).toBeVisible({ timeout: 30_000 });
  await noSideScroll(page);
  await shot(page, info, "fix");
  if (await pack.isVisible()) {
    await pack.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#carousel")).toBeVisible();
    await expect(page.getByTestId("proposal").getByTestId("cited")).toContainText("average");
    await shot(page, info, "carousel");
    await page.getByTestId("approve").click();
    await expect(page.locator(".decision")).toContainText("Approved");
    await expect(page.getByTestId("fix-status")).toContainText("1 approved");
    await shot(page, info, "approved");
  }
  await page.getByTestId("to-send").click();
  await expect(page.getByTestId("memo")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("memo")).not.toContainText("SYNTHETIC");
  await expect(page.getByTestId("memo")).toContainText(/Homestand checked \d+ theme nights for Albuquerque, NM sample club against local taste data from Qloo and suggests (\d+ swaps?|no swaps)\./);
  await expect(page.getByTestId("memo")).not.toContainText("Bundle score");
  await shot(page, info, "send");
  await page.getByTestId("to-study").click();
  await expect(page.getByText("Make your call first")).toBeVisible();
  await expect(page.getByTestId("verdict")).toHaveCount(0);
  await shot(page, info, "study-call");
  await page.getByTestId("call-not-sure").click();
  await expect(page.getByTestId("verdict")).toContainText("CALL STANDS");
  await expect(page.getByTestId("audit-line")).toContainText("It doesn't predict ticket sales. We tested that on 385 real 2025 nights: local taste picked the bigger crowd 49 times in 100, about a coin flip.");
  await expect(page.getByTestId("h1-text")).toContainText("49.1%");
  await expect(page.getByTestId("h1-text")).toContainText("521 pairs");
  await expect(page.getByTestId("results-pending")).toHaveCount(0);
  await expect(page.getByTestId("stamp-plain")).toHaveText("Not enough evidence to overturn: taste didn't predict bigger crowds.");
  await noSideScroll(page);
  await shot(page, info, "study-result");
});

test("real data: the own path finds a city through the local worker (live geocoding)", async ({ page }) => {
  await page.goto("/#/own");
  await page.getByLabel("1. Your ballpark's city").fill("Tulsa");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("button", { name: "Tulsa, OK" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Something upstream failed")).toHaveCount(0);
  await page.getByRole("button", { name: "Tulsa, OK" }).click();
  await page.getByTestId("load-example").click();
  await expect(page.getByLabel("2. Your theme nights")).toHaveValue(/Bluey Day/);
});

test("real data: a non-sample city with the example calendar gets swaps to look at", async ({ page }, info) => {
  await page.goto("/#/own");
  await page.getByLabel("1. Your ballpark's city").fill("Fresno");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: "Fresno, CA" }).click();
  await page.getByTestId("load-example").click();
  await page.getByTestId("check-mine").click();
  await expect(page.getByTestId("summary")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("check-result")).toContainText("Fresno");
  await page.getByTestId("to-fix").click();
  const pack = page.getByRole("button", { name: /Open the pack/ });
  await expect(pack).toBeVisible({ timeout: 40_000 });
  await pack.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("proposal")).toBeVisible();
  await shot(page, info, "own-example-fix");
});
