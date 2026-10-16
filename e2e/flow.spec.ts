import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { readFile } from "node:fs/promises";

// Screenshots for each step land in test-results/screens/ (gitignored): <project>-<step>.png
async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  await page.screenshot({ path: `test-results/screens/${info.project.name}-${name}.png`, fullPage: true });
}

async function noSideScroll(page: Page): Promise<void> {
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(sw, "no horizontal scroll").toBeLessThanOrEqual(iw);
}

const overlap = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test("sample club: Check, Why, Fix, Send, The Study", async ({ page }, info) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your market, not the national chart." })).toBeVisible();
  await expect(page.getByTestId("study-link")).toBeVisible();
  await expect(page.getByTestId("study-teaser")).toContainText("385 real 2025 theme nights");
  await expect(page.getByTestId("study-teaser")).toContainText("not detected at this sample size");
  // Programmatic focus on the heading shows no ring.
  expect(await page.locator("h1").evaluate((el) => (el === document.activeElement ? getComputedStyle(el).outlineStyle : "none"))).toBe("none");
  await noSideScroll(page);
  await shot(page, info, "01-start");

  await page.getByTestId("try-sample").click();
  await expect(page.getByRole("heading", { name: "Pick a sample club" })).toBeVisible();
  await shot(page, info, "02-pick");
  await page.getByTestId("market-akron").click();

  // ---- Check
  await expect(page.getByTestId("summary")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Check: Akron, OH sample club/ })).toBeVisible();
  await expect(page.getByText("Synthetic demo data").first()).toBeVisible();
  await noSideScroll(page);
  const tiles = page.locator(".tile");
  expect(await tiles.count()).toBe(24);
  // Every scored magnet carries a word, not just a colour.
  for (const word of ["Classic night", "Not scored"]) await expect(page.locator(`.badge:has-text("${word}")`).first()).toBeVisible();
  expect(await page.locator(".badge:has-text('Leans in'), .badge:has-text('Leans away'), .badge:has-text('About average')").count()).toBeGreaterThan(5);
  await expect(page.locator(".tile-lock").first()).toBeVisible();
  // The ambiguous night asks, and does not guess.
  const ask = page.getByRole("group", { name: /Elvis and the Beatles Night/ });
  await expect(ask).toBeVisible();
  await shot(page, info, "03-check");
  await ask.getByRole("button", { name: "Elvis" }).click();
  await expect(page.getByRole("group", { name: /Elvis and the Beatles Night/ })).toHaveCount(0);

  // ---- Why panel
  await page.locator(".tile", { hasText: "Bluey Day" }).click();
  const why = page.getByRole("dialog");
  await expect(why).toBeVisible();
  await expect(why).toContainText(/Against its own average/);
  await expect(why).toContainText("What Qloo looked at");
  await expect(why.getByText("Index = z")).toHaveCount(0);
  await why.getByRole("button", { name: "Show the numbers" }).click();
  await expect(why.getByText(/Index = z - market average/)).toBeVisible();
  await why.getByTestId("recheck").click();
  await expect(why.getByTestId("recheck-message")).toContainText(/Checked again/);
  await expect(why.getByTestId("source-line")).toContainText("Re-checked live at");
  await expect(why.getByTestId("recheck-message")).toBeInViewport();
  await shot(page, info, "04-why");
  await page.keyboard.press("Escape");
  await expect(why).toHaveCount(0);

  // A classic night says why it is not scored.
  await page.locator(".tile", { hasText: "Fireworks" }).click();
  await expect(page.getByRole("dialog")).toContainText("Classic promos aren't a pop-culture taste, so Qloo doesn't score them. They stay as planned.");
  await page.keyboard.press("Escape");

  // ---- Fix
  await page.getByTestId("to-fix").click();
  await expect(page.getByRole("heading", { name: /Fix:/ })).toBeVisible();
  const cards = page.getByTestId("proposal");
  expect(await cards.count()).toBeGreaterThan(0);
  await noSideScroll(page);
  await noSideScroll(page);
  // The cited comparison replaces the repeated sentence; the why is not said twice.
  await expect(cards.first().getByTestId("cited")).toContainText(/(above|below|in line with) this market's average \([+-]\d\.\d\)/);
  await expect(cards.first()).not.toContainText("leans toward");
  if ((await page.getByTestId("angle").count()) > 0) {
    const angle = await page.getByTestId("angle").first().innerText();
    expect(angle).toMatch(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun) [A-Z][a-z]{2} \d{1,2}\b/);
    expect(angle).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  }
  await shot(page, info, "05-fix");
  await page.getByTestId("open-trace").click();
  const trace = page.getByRole("dialog");
  await expect(trace).toContainText("Asked Qloo");
  await expect(trace).toContainText("constraint");
  await expect(trace).toContainText("model");
  await expect(trace).toContainText("Re-checking");
  await shot(page, info, "06-trace");
  await page.keyboard.press("Escape");

  const first = cards.first();
  await expect(first.locator(".stamp")).toHaveCount(0);
  // Switch to an alternate before approving: the swap line follows it, the date stays.
  const alt = first.getByTestId("alt").filter({ hasNot: page.locator("[disabled]") }).first();
  if ((await alt.count()) > 0) {
    const before = await first.getByTestId("swap-line").innerText();
    const altName = (await alt.innerText()).trim();
    await alt.click();
    await expect(page.getByTestId("proposal").first().getByTestId("swap-line")).toContainText(altName);
    expect(await page.getByTestId("proposal").first().getByTestId("swap-line").innerText()).not.toBe(before);
  }
  await first.getByTestId("approve").click();
  const approved = page.getByTestId("proposal").first();
  const stamp = approved.locator(".stamp");
  await expect(stamp).toBeVisible();
  await expect(stamp).toHaveText("SWAPPED");
  // The stamp never covers the weekday or date.
  const sb = (await stamp.boundingBox())!;
  for (const sel of [".tile-head", ".tile-wd", ".tile-date"]) {
    const bb = (await approved.locator(sel).boundingBox())!;
    expect(overlap(sb, bb), `stamp overlaps ${sel}`).toBe(false);
  }
  await shot(page, info, "07-approved");
  await page.getByTestId("proposal").nth(1).getByTestId("reject").click();

  // Locked nights are never swapped.
  for (const t of await page.locator(".tile--swapped").all()) await expect(t.locator(".tile-lock")).toHaveCount(0);

  // ---- Send
  await page.getByTestId("to-send").click();
  await expect(page.getByRole("heading", { name: /Send:/ })).toBeVisible();
  await expect(page.getByTestId("memo")).toContainText("Theme-night rationale: Akron, OH sample club");
  await expect(page.getByTestId("memo")).toContainText("SYNTHETIC DEMO DATA");
  await expect(page.locator(".tile--swapped .stamp")).toHaveCount(1);
  await noSideScroll(page);
  await shot(page, info, "08-send");

  const [csv] = await Promise.all([page.waitForEvent("download"), page.getByTestId("dl-csv").click()]);
  const csvText = await readFile((await csv.path())!, "utf8");
  expect(csvText.startsWith("date,theme,sponsor,locked,notes")).toBe(true);
  expect(csvText).toContain("Swapped from");
  expect(csvText.trim().split("\r\n")).toHaveLength(25);
  const [ics] = await Promise.all([page.waitForEvent("download"), page.getByTestId("dl-ics").click()]);
  const icsText = await readFile((await ics.path())!, "utf8");
  expect(icsText).toContain("BEGIN:VCALENDAR");
  expect(icsText.match(/BEGIN:VEVENT/g)).toHaveLength(24);
  const [memo] = await Promise.all([page.waitForEvent("download"), page.getByTestId("dl-memo").click()]);
  expect(await readFile((await memo.path())!, "utf8")).toContain("<!doctype html>");

  // ---- The Study
  await page.getByTestId("to-study").click();
  await expect(page.getByText("Make your call first")).toBeVisible();
  await expect(page.getByTestId("verdict")).toHaveCount(0);
  await shot(page, info, "09-study-call");
  await page.getByTestId("call-yes").click();
  await expect(page.getByTestId("verdict")).toContainText("CALL STANDS");
  await expect(page.getByTestId("audit-line")).toContainText("not an attendance predictor");
  await expect(page.getByTestId("results-pending")).toHaveCount(0);
  await expect(page.getByTestId("h1-text")).toContainText("95% interval");
  await expect(page.getByText("Pre-registration and Amendments 1 to 4")).toBeVisible();
  await noSideScroll(page);
  await shot(page, info, "10-study-result");
});

test("own club: city search, pasted calendar with a bad row", async ({ page }, info) => {
  await page.goto("/#/own");
  await page.getByLabel("1. Your ballpark's city").fill("Tulsa");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: "Tulsa, Oklahoma, US" }).click();
  await page.getByLabel("2. Your theme nights").fill("date,theme,sponsor,locked,notes\n2026-04-11,Bluey Day,Prairie Bank,no,\nsoon,Star Wars Night,,no,\n2026-04-18,Fireworks Friday,,no,\n2026-05-02,Dolly Parton Night,,yes,\n");
  await noSideScroll(page);
  await shot(page, info, "11-own");
  await page.getByTestId("check-mine").click();
  await expect(page.getByTestId("summary")).toBeVisible();
  await expect(page.getByText("1 row was skipped")).toBeVisible();
  await expect(page.getByText(/Line 3/)).toBeVisible();
  expect(await page.locator(".tile").count()).toBe(3);
  await noSideScroll(page);
  await shot(page, info, "12-own-check");
});

test("keyboard: the Why panel opens from a magnet, traps focus, and closes with Escape", async ({ page }) => {
  await page.goto("/#/sample");
  await page.getByTestId("market-portland-me").click();
  await expect(page.getByTestId("summary")).toBeVisible();
  const tile = page.locator("button.tile").first();
  await tile.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "Close" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
