import { expect, test, type Page } from "@playwright/test";

// Input, geocoding and error handling. Screenshots for review land in the scratchpad's input/ folder when HOMESTAND_SHOTS is set.
const SHOTS = process.env.HOMESTAND_SHOTS ?? "";
async function shot(page: Page, name: string, full = false): Promise<void> {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: full });
}

async function pickTulsa(page: Page): Promise<void> {
  await page.getByLabel("1. Your home city").fill("Tulsa OK");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: "Tulsa, OK" }).click();
}

const CAL = "date,theme,sponsor,locked,notes\n2027-04-11,Bluey Day,Prairie Bank,no,\n2027-04-18,Fireworks Friday,,no,\n2027-05-02,Dolly Parton Night,,yes,\n";

test("the city search reads 'Tulsa OK', explains Puerto Rico, and stops a 3,000-character paste at 60", async ({ page }) => {
  await page.goto("/#/own");
  await pickTulsa(page);
  await expect(page.getByRole("button", { name: "Tulsa, OK" })).toHaveAttribute("aria-pressed", "true");

  await page.getByLabel("1. Your home city").fill("San Juan, PR");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Puerto Rico" })).toContainText("not covered");

  const city = page.getByLabel("1. Your home city");
  await city.fill("a".repeat(3000));
  expect((await city.inputValue()).length).toBe(60);
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText(/^No city called/)).toBeVisible();
  await expect(page.getByText("Type at least two letters")).toHaveCount(0);
});

test("the editor counts what Check will check: a 'maybe' in locked is not ready, and Check agrees", async ({ page }) => {
  await page.goto("/#/own");
  await page.getByLabel("2. Your theme nights").fill("date,theme,sponsor,locked,notes\n2027-04-11,Bluey Day,,no,\n2027-04-18,Fireworks Friday,,maybe,\n2027-05-02,Dolly Parton Night,,yes,\n");
  await expect(page.getByTestId("rc-count")).toHaveText("2 nights ready. 1 needs a fix (marked below).");
  await expect(page.locator(".rc-inline:not([hidden])")).toHaveText('"maybe" in the locked column is not yes or no.');
  await pickTulsa(page);
  await page.getByTestId("check-mine").click();
  await expect(page.getByTestId("summary")).toBeVisible();
  await expect(page.getByText("1 row was skipped")).toBeVisible();
  expect(await page.locator(".tile").count()).toBe(2);
});

test("a missing header and a theme-only header give one clear message, not a failure on every row", async ({ page }) => {
  await page.goto("/#/own");
  const box = page.getByLabel("2. Your theme nights");
  await box.fill("2027-04-11,Bluey Day,,no,\n2027-04-18,Fireworks Friday,,no,\n");
  await expect(page.getByTestId("rc-count")).toHaveText("0 nights ready.");
  await expect(page.getByTestId("rc-header")).toContainText("header");
  await page.getByTestId("add-header").click();
  await expect(page.getByTestId("rc-count")).toHaveText("2 nights ready.");
  await box.fill("theme\nBluey Day\nElvis Night\n");
  await expect(page.getByTestId("rc-header")).toContainText("no date column");
  await expect(page.locator(".rc-inline:not([hidden])")).toHaveCount(0);
});

test("day-first dates are read day/month with a one-line note, and a repeated date warns without blocking", async ({ page }) => {
  await page.goto("/#/own");
  await page.getByLabel("2. Your theme nights").fill("date,theme,sponsor,locked,notes\n10/4/2027,Bluey Day,,no,\n25/4/2027,Fireworks Friday,,no,\n10/4/2027,Elvis Night,,no,\n");
  await expect(page.getByTestId("rc-note")).toHaveText("Read dates as day/month because of 25/4/2027");
  await expect(page.getByTestId("rc-count")).toHaveText("3 nights ready.");
  const warns = page.locator(".rc-inline.rc-dup:not([hidden])");
  await expect(warns).toHaveCount(2);
  await expect(warns.first()).toHaveText("Two nights on Apr 10, 2027");
  await shot(page, "editor-dayfirst-duplicate", true);
  await page.getByLabel("2. Your theme nights").fill("date,theme,sponsor,locked,notes\n10/4/2027,Bluey Day,,no,\n11/5/2027,Fireworks Friday,,no,\n");
  await expect(page.getByTestId("rc-note")).toHaveText("Read 10/4/2027 as Oct 4, 2027");
  await page.getByLabel("2. Your theme nights").fill("date,theme,sponsor,locked,notes\n1999-04-17,Bluey Day,,no,\n");
  await expect(page.getByTestId("rc-count")).toHaveText("1 night ready.");
});

test("every date hint says the same future example", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-20T12:00:00"));
  await page.goto("/#/own");
  await expect(page.locator(".cols dd").first()).toHaveText("The game date, like 2027-04-02 or 4/2/2027.");
  await page.getByLabel("2. Your theme nights").fill("date,theme,sponsor,locked,notes\nsoon,Bluey Day,,no,\n");
  await expect(page.locator(".rc-inline:not([hidden])")).toHaveText('"soon" is not a date. Use 2027-04-02 or 4/2/2027.');
  await pickTulsa(page);
  await page.getByTestId("check-mine").click();
  await expect(page.getByTestId("rc-count")).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Line 2" })).toHaveText('Line 2: "soon" is not a date. Use 2027-04-02 or 4/2/2027.');
});

for (const width of [360, 390, 430]) {
  test(`on a ${width}px phone the Check button and the nights-ready count stay in view, and the last row is not covered`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/#/own");
    await page.getByTestId("load-example").click();
    const bar = page.getByTestId("actionbar");
    const button = page.getByTestId("check-mine");
    await expect(page.getByTestId("ab-count")).toHaveText("20 nights ready");
    // Before any scrolling the bar is at the bottom of the screen, though the button's place in the page is thousands of pixels down.
    const box = (await bar.boundingBox())!;
    expect(Math.round(box.y + box.height)).toBe(800);
    expect(box.x).toBe(0);
    expect(Math.round(box.width)).toBe(width);
    expect(await button.evaluate((el) => el.getBoundingClientRect().bottom <= window.innerHeight)).toBe(true);
    const sideScroll = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(sideScroll).toBeLessThanOrEqual(0);
    if (width === 390) await shot(page, "sticky-bar-390");
    // At the very bottom the last row ends above the bar.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const lastDelete = (await page.getByRole("button", { name: "Delete row 20" }).boundingBox())!;
    const addRow = (await page.getByTestId("add-row").boundingBox())!;
    const barTop = (await bar.boundingBox())!.y;
    expect(lastDelete.y + lastDelete.height).toBeLessThanOrEqual(barTop);
    expect(addRow.y + addRow.height).toBeLessThanOrEqual(barTop);
    if (width === 390) await shot(page, "sticky-bar-390-bottom");
    // The button works from the bar.
    await page.getByLabel("1. Your home city").scrollIntoViewIfNeeded();
    await pickTulsa(page);
    await button.click();
    await expect(page.getByTestId("summary")).toBeVisible();
  });
}

test("on a wide screen the bar is an ordinary row at the end of the form", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/#/own");
  await page.getByTestId("load-example").click();
  expect(await page.getByTestId("actionbar").evaluate((el) => getComputedStyle(el).position)).toBe("static");
  await expect(page.getByTestId("ab-count")).toBeHidden();
});

test("the new-city limit page is friendly, keeps the calendar, and links to the samples and back to the rows", async ({ page }, info) => {
  await page.route("**/api/analyze", (route) => route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: "quota", message: "You've looked up as many new cities as are allowed today." }) }));
  await page.goto("/#/own");
  await pickTulsa(page);
  await page.getByLabel("2. Your theme nights").fill(CAL);
  await page.getByTestId("check-mine").click();
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toHaveText("You've used today's new cities");
  await expect(page.getByTestId("limit-text")).toContainText(/Each visitor can look up \d+ new cities a day/);
  await expect(page.getByText("That did not work")).toHaveCount(0);
  await expect(page.getByText("The four sample clubs")).toHaveCount(0);
  await expect(page.getByTestId("error-samples")).toHaveText(/Open one of the 6 sample calendars/);
  await expect(page.getByTestId("retry")).toHaveCount(0);
  await shot(page, `limit-page-${info.project.name}`);
  await page.getByTestId("back-to-rows").click();
  await expect(page.getByLabel("2. Your theme nights")).toHaveValue(CAL);
  await expect(page.getByRole("status").filter({ hasText: "Home city: Tulsa, OK." })).toBeVisible();
  await page.goBack();
  await page.getByTestId("error-samples").click();
  await expect(page.getByRole("heading", { name: "Pick a sample club" })).toBeVisible();
});

test("a request that hangs stops after 45 seconds with a clear message, and Retry runs the same check without losing the calendar", async ({ page }, info) => {
  await page.clock.install();
  let hang = true;
  let calls = 0;
  await page.route("**/api/analyze", (route) => {
    calls++;
    if (hang) return; // never answered
    return route.continue();
  });
  await page.goto("/#/own");
  await pickTulsa(page);
  await page.getByLabel("2. Your theme nights").fill(CAL);
  await page.getByTestId("check-mine").click();
  await expect(page.getByText("A few seconds.")).toBeVisible();
  await page.clock.fastForward(30_000);
  await expect(page.getByText("A few seconds.")).toBeVisible(); // not yet
  await page.clock.fastForward(16_000);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This is taking too long");
  await expect(page.getByTestId("error-text")).toContainText("stopped waiting");
  await shot(page, `error-retry-${info.project.name}`);
  expect(calls).toBe(1);
  hang = false;
  await page.getByTestId("retry").click();
  await expect(page.getByTestId("summary")).toBeVisible();
  expect(calls).toBe(2);
  expect(await page.locator(".tile").count()).toBe(3);
  // The same calendar went out both times.
  await page.evaluate(() => { location.hash = "#/own"; });
  await expect(page.getByLabel("2. Your theme nights")).toHaveValue(CAL);
});

test("a server error offers Retry too, and a sample club can retry", async ({ page }) => {
  let fail = true;
  // The saved copy of a sample (public/snapshots, built at deploy time) must not stand in for the server here, whether or not the folder exists.
  await page.route("**/snapshots/*", (route) => route.fulfill({ status: 404, contentType: "text/plain", body: "not found" }));
  await page.route("**/api/analyze", (route) => (fail ? route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "upstream", message: "Something upstream failed. Try again in a moment." }) }) : route.continue()));
  await page.goto("/#/check/biloxi");
  await expect(page.getByTestId("error-text")).toHaveText("Something upstream failed. Try again in a moment.");
  await expect(page.getByTestId("back-to-rows")).toHaveCount(0); // a sample has no rows of the visitor's own
  fail = false;
  await page.getByTestId("retry").click();
  await expect(page.getByTestId("summary")).toBeVisible();
});
