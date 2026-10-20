import { expect, test, type Page, type TestInfo } from "@playwright/test";

// Venue mode: the made-up Raleigh amphitheatre calendar, on the local Worker (synthetic Qloo answers). Nothing here is real data.
async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  await page.screenshot({ path: `test-results/screens/${info.project.name}-venue-${name}.png`, fullPage: true });
}

async function noSideScroll(page: Page): Promise<void> {
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(sw, "no horizontal scroll").toBeLessThanOrEqual(iw);
}

/** Baseball words that must never show on a venue page. (The Study link may say "baseball": it did cover baseball.) */
const CLUB_WORDS = /\bballpark\b|\bseasons?\b|theme[- ]nights?|\bsample club\b|\bminor league\b(?! baseball)|\bpromotions? director\b/i;
async function noClubWords(page: Page): Promise<void> {
  const text = await page.locator("main, #app, body").first().innerText();
  expect(text).not.toMatch(CLUB_WORDS);
}

test("home page and picker offer the venue sample, and say it is made up", async ({ page }, info) => {
  await page.goto("/");
  await noSideScroll(page);
  await page.getByTestId("try-sample").click();
  await expect(page.getByRole("heading", { name: "Pick a sample club" })).toBeVisible();
  const card = page.getByTestId("market-raleigh");
  await expect(card).toContainText("Sample venue");
  await expect(card).toContainText("Raleigh, NC");
  await expect(card).toContainText("made-up summer concert calendar");
  await expect(card).toContainText("not a real venue");
  await noSideScroll(page);
  await shot(page, info, "01-pick");
  // The four club cards are unchanged.
  for (const id of ["biloxi", "albuquerque", "akron", "portland-me"]) await expect(page.getByTestId(`market-${id}`)).toContainText("Sample club");
});

test("venue sample: Check, Why, Fix, Send", async ({ page }, info) => {
  // A cold start on the deep link opens the sample.
  await page.goto("/#/check/raleigh");
  await expect(page.getByTestId("summary")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Check: Raleigh, NC sample amphitheatre/ })).toBeVisible();
  await expect(page.getByTestId("venue-note")).toContainText("made-up");
  await expect(page.getByTestId("venue-note")).toContainText("not any real venue");
  const tiles = page.locator(".card.tile");
  expect(await tiles.count()).toBe(18);
  const awayCards = await page.locator('.card.tile[data-fit="leans-away"]').count();
  await expect(page.getByTestId("summary")).toHaveText(awayCards === 0 ? /^None of the 18 dates is a weak fit for Raleigh\.$/ : new RegExp(`^${awayCards} of 18 dates? (is|are) a weak fit for Raleigh\\.$`));
  // Four signed headliners are locked; two classic dates; nothing on this calendar needs a pick.
  await expect(page.locator(".locks")).toContainText("5 locked dates stay exactly as planned");
  await expect(page.locator(".fitword:has-text('Proven promo')")).toHaveCount(2);
  await expect(page.locator(".fitword:has-text('Classic')")).toHaveCount(0);
  await expect(page.locator(".ask")).toHaveCount(0);
  await expect(page.locator(".card-name, .nm-b").filter({ hasText: "THEME NIGHT" })).toHaveCount(0);
  await noClubWords(page);
  await noSideScroll(page);
  await shot(page, info, "02-check");

  // Why panel on an act: the card flips, and the words are venue words.
  await page.getByRole("button", { name: /Stevie Nicks/ }).click();
  const why = page.getByRole("dialog");
  await expect(why).toBeVisible();
  await expect(why).toContainText("What Qloo looked at");
  await expect(why).toContainText(/Stevie Nicks/);
  await why.getByRole("button", { name: "Show the numbers" }).click();
  await expect(why).toContainText(/Typical city \(mean of \d+\)/);
  await expect(why).toContainText("near this city");
  await expect(why).not.toContainText(/ballpark/i);
  await shot(page, info, "03-why");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Fireworks & Symphony/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Proven promos (fireworks, symphony nights, local showcases) aren't graded");
  await page.keyboard.press("Escape");

  // Fix
  await page.getByTestId("to-fix").click();
  await expect(page.getByRole("heading", { name: /Fix:/ })).toBeVisible();
  await expect(page.getByText(/who to send an offer to/).first()).toBeVisible();
  await page.getByTestId("advanced").locator("summary").click();
  await expect(page.getByText("Let an act repeat in the summer series")).toBeVisible();
  await expect(page.getByText("Off by default: each theme is used once, so two weak dates never get the same replacement.")).toBeVisible();
  const pack = page.getByRole("button", { name: /Open the pack/ });
  const none = page.getByText("Nothing needs swapping.");
  await expect(pack.or(none)).toBeVisible();
  await expect(page.getByTestId("ideas")).toBeVisible(); // acts that stand out near Raleigh, or the honest "none" note
  await expect(page.getByTestId("ideas")).toContainText(/Acts Raleigh likes more than most cities|None of the \d+ acts/);
  // Every locked headliner gets a support-act idea from the taste graph.
  await expect(page.getByTestId("angle")).toHaveCount(5);
  await expect(page.getByTestId("angle").first()).toContainText(/(Support act idea: fans of .+ near Raleigh also like .+, so an act like .+ could fit the opening slot|Fans of .+ near Raleigh also like .+, so a pre-show playlist or promo tie-in)/);
  await expect(page.getByRole("heading", { name: "Locked headliners: keep them, add a support act" })).toBeVisible();
  await noClubWords(page);
  await noSideScroll(page);
  await shot(page, info, "04-fix");
  if (await pack.isVisible()) {
    await pack.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#carousel")).toBeVisible();
    await expect(page.getByTestId("proposal")).toHaveCount(1);
    await expect(page.getByTestId("now-card")).toContainText("Send an offer to");
    await expect(page.getByTestId("proposal")).not.toContainText(/ballpark/i);
    if ((page.viewportSize()?.width ?? 0) >= 900) {
      await expect(page.getByTestId("approve")).toBeInViewport({ ratio: 1 });
      await page.waitForTimeout(1200); // the page scrolls the actions into view; measure once it has settled
      const bar = (await page.locator(".acts").boundingBox())!;
      const idx = (await page.locator(".idx").boundingBox())!;
      expect(bar.y < idx.y + idx.height && idx.y < bar.y + bar.height && bar.x < idx.x + idx.width && idx.x < bar.x + bar.width, "the Approve bar covers the fit meter").toBe(false);
    }
    await noSideScroll(page);
    await shot(page, info, "05-carousel");
    await page.getByTestId("approve").click();
    await expect(page.locator(".decision")).toContainText("Approved");
    await expect(page.getByTestId("fix-status")).toContainText("1 approved");
  }

  // Send
  await page.getByTestId("to-send").click();
  await expect(page.getByRole("heading", { name: /Send:/ })).toBeVisible();
  await expect(page.getByTestId("memo")).toContainText("Summer-series rationale: Raleigh, NC sample amphitheatre");
  await expect(page.getByTestId("memo")).toContainText("Homestand checked 18 dates for Raleigh, NC sample amphitheatre");
  await expect(page.getByTestId("memo")).toContainText("made-up calendar for a sample amphitheatre");
  await expect(page.getByTestId("memo")).toContainText("Locked headliners: support-act ideas");
  await expect(page.getByTestId("memo")).not.toContainText(/ballpark|theme nights|season/i);
  await expect(page.getByTestId("to-study")).toContainText("tested Minor League baseball only");
  await noClubWords(page);
  const [csv] = await Promise.all([page.waitForEvent("download"), page.getByTestId("dl-csv").click()]);
  expect(csv.suggestedFilename()).toBe("raleigh-summer-series.csv");
  const [ics] = await Promise.all([page.waitForEvent("download"), page.getByTestId("dl-ics").click()]);
  expect(ics.suggestedFilename()).toBe("raleigh-summer-series.ics");
  await noSideScroll(page);
  await shot(page, info, "06-send");
});

test("a club sample after a venue sample reads as a club again", async ({ page }) => {
  await page.goto("/#/check/raleigh");
  await expect(page.getByTestId("summary")).toBeVisible();
  await page.goto("/#/sample");
  await page.getByTestId("market-akron").click();
  await expect(page.getByRole("heading", { name: /Check: Akron, OH sample club/ })).toBeVisible();
  await expect(page.getByTestId("venue-note")).toHaveCount(0);
  await expect(page.getByTestId("summary")).toHaveText(/weak fit for Akron\.$/);
  await expect(page.locator(".fitword:has-text('Proven promo')").first()).toBeVisible();
  await expect(page.locator(".locks")).toContainText(/locked nights? stay/);
});
