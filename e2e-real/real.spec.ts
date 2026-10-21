import { expect, test, type Page, type TestInfo } from "@playwright/test";

async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  await page.screenshot({ path: `test-results/screens-real/${info.project.name}-${name}.png`, fullPage: true });
}
// The live site limits each client to 12 checks a minute. The live run (not the local one, which has roomy limits) therefore paces itself.
test.afterEach(async ({ page }, info) => {
  void page;
  if (info.project.name.startsWith("live")) await new Promise((r) => setTimeout(r, 6000));
});

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
    await expect(page.getByTestId("summary")).toHaveText(/^(None of the \d+ nights is|\d+ of \d+ nights? (is|are)) a weak fit for .+\.$/);
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
  const scored = page.locator(".card[role=button]").filter({ has: page.locator(".fitword", { hasText: /Strong fit|Weak fit|Average fit/ }) }).first();
  await scored.click();
  const why = page.getByRole("dialog");
  await expect(why).toContainText("What Qloo looked at");
  await why.getByRole("button", { name: "Show the numbers" }).click();
  await expect(why.getByText(/Raw scores sit near 0.99 everywhere/)).toBeVisible();
  await expect(why).toContainText(/Compared with other towns, this town scores/);
  await expect(why.getByTestId("why-footer")).toContainText("See how we tested this");
  await expect(why).not.toContainText("coin flip");
  await expect(why.getByTestId("source-line")).toContainText(/Checked /);
  await shot(page, info, "why");
  await why.getByTestId("recheck").click();
  await expect(why.getByTestId("recheck-message")).toContainText(/Fresh data at .*: (same result|changed)/);
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
    await expect(page.getByTestId("proposal").getByTestId("swap-line")).toContainText("fit");
    await shot(page, info, "carousel");
    await page.getByTestId("approve").click();
    await expect(page.locator(".decision")).toContainText("Approved");
    await expect(page.getByTestId("fix-status")).toContainText("1 approved");
    await shot(page, info, "approved");
  }
  await page.getByTestId("to-send").click();
  await expect(page.getByTestId("memo")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("memo")).not.toContainText("SYNTHETIC");
  await expect(page.getByTestId("memo")).toContainText(/Homestand checked \d+ theme nights for Albuquerque, NM sample club against local taste data from Qloo\. It suggested (\d+ swaps?; (\d+ are|1 is|none is) in the revised calendar|no swaps)/);
  await expect(page.getByTestId("memo")).not.toContainText("Bundle score");
  await shot(page, info, "send");
  await page.getByTestId("to-study").click();
  await expect(page.getByText("Make your call first")).toBeVisible();
  await expect(page.getByTestId("verdict")).toHaveCount(0);
  await shot(page, info, "study-call");
  await page.getByTestId("call-not-sure").click();
  await expect(page.getByTestId("verdict")).toContainText("NOT PROVEN");
  await expect(page.getByTestId("stamp-plain")).toContainText("Neither local taste (49 times in 100) nor an AI guess (51 in 100, mostly ties) predicted the bigger crowd better than chance in one season.");
  await expect(page.getByTestId("towns-line")).toContainText("same answer at every club it rated");
  await expect(page.getByTestId("towns-line")).toContainText("for 5 of 9 themes");
  await expect(page.getByTestId("h1-text")).toContainText("49.1%");
  await expect(page.getByTestId("h1-text")).toContainText("521 pairs");
  await expect(page.getByTestId("results-pending")).toHaveCount(0);
  await expect(page.getByTestId("stamp-plain")).toHaveText("Neither local taste (49 times in 100) nor an AI guess (51 in 100, mostly ties) predicted the bigger crowd better than chance in one season.");
  await noSideScroll(page);
  await shot(page, info, "study-result");
});

test("real data: the own path finds a city through the local worker (live geocoding)", async ({ page }) => {
  await page.goto("/#/own");
  await page.getByLabel("1. Your home city").fill("Tulsa");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("button", { name: "Tulsa, OK" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Something upstream failed")).toHaveCount(0);
  await page.getByRole("button", { name: "Tulsa, OK" }).click();
  await page.getByTestId("load-example").click();
  await expect(page.getByLabel("2. Your theme nights")).toHaveValue(/Bluey Day/);
});

test("real data: a non-sample city with the example calendar gets swaps to look at", async ({ page }, info) => {
  await page.goto("/#/own");
  await page.getByLabel("1. Your home city").fill("Fresno");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: "Fresno, CA" }).click();
  await page.getByTestId("load-example").click();
  await page.getByTestId("check-mine").click();
  await expect(page.getByTestId("summary")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("summary")).toContainText("Fresno");
  await page.getByTestId("to-fix").click();
  const pack = page.getByRole("button", { name: /Open the pack/ });
  await expect(pack).toBeVisible({ timeout: 40_000 });
  await pack.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("proposal")).toBeVisible();
  await shot(page, info, "own-example-fix");
});

test("real data: Boise with the example calendar gets discovered family-title swaps", async ({ page }, info) => {
  await page.goto("/#/own");
  await page.getByLabel("1. Your home city").fill("Boise");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: "Boise, ID" }).click();
  await page.getByTestId("load-example").click();
  await page.getByTestId("check-mine").click();
  await expect(page.getByTestId("summary")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("to-fix").click();
  const pack = page.getByRole("button", { name: /Open the pack/ });
  await expect(pack).toBeVisible({ timeout: 40_000 });
  await expect(page.getByTestId("ideas")).toContainText("Family movies Boise likes more than most towns");
  await expect(page.getByTestId("ideas")).not.toContainText("under-25");
  await pack.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("proposal")).toBeVisible();
  // Walk the swaps to a discovered one (a big-studio title that stands out here, or the best option for a weak night).
  for (let i = 0; i < 8 && (await page.getByTestId("disc-badge").count()) === 0; i++) {
    await page.locator("#next").focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(600);
  }
  await expect(page.getByTestId("disc-badge")).toHaveText("Local favorite");
  await expect(page.locator(".swap-why")).toContainText(/People in Boise like .+ more than people in most towns do\.|Nothing on our list is a strong fit for this night in Boise, so .+ is offered/);
  await shot(page, info, "boise-discovered");
  await page.getByTestId("advanced").evaluate((el) => { (el as HTMLDetailsElement).open = true; });
  await page.getByTestId("open-trace").click();
  await expect(page.getByRole("dialog")).toContainText(/Asked Qloo about \d+ family-friendly animated movies near Boise|Used the saved family-title scores near Boise/);
});

test("real data: a recognised theme with no Qloo scores is not called unknown", async ({ page }) => {
  await page.goto("/#/own");
  await page.getByLabel("1. Your home city").fill("Fresno");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: "Fresno, CA" }).click();
  await page.getByLabel("2. Your theme nights").fill("date,theme,sponsor,locked,notes\n2027-05-01,PAW Patrol Day,,no,\n2027-05-08,Rubber Duck Regatta,,no,\n2027-05-15,Star Wars Night,,no,\n");
  await page.getByTestId("check-mine").click();
  await expect(page.getByTestId("summary")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: /PAW Patrol Day/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toContainText("PAW Patrol is a theme we know, but we have no data for it yet, so it stays as planned.");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Rubber Duck Regatta/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toContainText(/We have no data for Rubber Duck Regatta, so it stays as planned\./);
  await expect(page.getByRole("dialog")).not.toContainText("We recognise");
});

// Venue mode on real Qloo data: the made-up Raleigh amphitheatre calendar. Cold, it costs one library request, two act-pool requests and one
// taste-graph request per locked headliner; after that it is cached. Screenshots go to VENUE_SHOTS when set.
test("real data: venue sample Check, Why, Fix and Send", async ({ page }, info) => {
  const dir = process.env.VENUE_SHOTS ?? "test-results/screens-real";
  const snap = (name: string): Promise<Buffer> => page.screenshot({ path: `${dir}/${info.project.name}-venue-${name}.png`, fullPage: true });
  await page.goto("/#/sample");
  await page.getByTestId("market-raleigh").click();
  await expect(page.getByTestId("summary")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("Synthetic demo data")).toHaveCount(0);
  await expect(page.getByTestId("venue-note")).toContainText("made-up");
  await expect(page.getByTestId("summary")).toHaveText(/^(None of the 18 dates is|\d+ of 18 dates? (is|are)) a weak fit for Raleigh\.$/);
  await noSideScroll(page);
  await snap("1-check");
  // A flipped card.
  await page.getByRole("button", { name: /Stevie Nicks/ }).click();
  const why = page.getByRole("dialog");
  await expect(why).toContainText("What Qloo looked at");
  await why.getByRole("button", { name: "Show the numbers" }).click();
  await expect(why).toContainText(/Compared with other towns, this city scores/);
  await expect(why).not.toContainText(/ballpark/i);
  await snap("2-why");
  await page.keyboard.press("Escape");
  await page.getByTestId("to-fix").click();
  await expect(page.getByRole("heading", { name: /Fix:/ })).toBeVisible({ timeout: 60_000 });
  const skip = page.getByTestId("skip-pack");
  await expect(skip).toBeVisible({ timeout: 60_000 });
  await snap("3-fix-pack");
  await skip.click();
  await page.waitForTimeout(1500);
  console.log("boxes", JSON.stringify([await page.locator(".acts").boundingBox(), await page.getByTestId("swap-line").boundingBox(), await page.locator(".now-card").boundingBox(), page.viewportSize()]));
  await page.screenshot({ path: `${dir}/${info.project.name}-venue-3b-viewport.png` });
  expect(await page.locator(".slide").count()).toBeGreaterThanOrEqual(1);
  expect(await page.getByTestId("angle").count()).toBe(5);
  await expect(page.getByTestId("angle").first()).toContainText(/\(.+\) → opener idea: .+/);
  // On real data every Raleigh headliner gets a real support-act line, not the generic sponsor angle.
  for (const t of await page.getByTestId("angle").allInnerTexts()) expect(t).toMatch(/\(.+\) → opener idea: (?!a pre-show).+/);
  await expect(page.getByTestId("ideas")).toContainText(/Acts Raleigh likes more than most cities/);
  await expect(page.getByTestId("disc-badge").first()).toBeVisible(); // at least one swap is an act Qloo found
  if ((page.viewportSize()?.width ?? 0) >= 900) {
    const bar = (await page.locator(".acts").boundingBox())!;
    const idx = (await page.getByTestId("swap-line").boundingBox())!;
    expect(bar.y < idx.y + idx.height && idx.y < bar.y + bar.height && bar.x < idx.x + idx.width && idx.x < bar.x + bar.width, "the Approve bar covers the local-pull meter").toBe(false);
  }
  await noSideScroll(page);
  await snap("4-fix");
  await page.getByTestId("approve").click();
  await expect(page.locator(".decision")).toContainText("Approved");
  await page.getByTestId("to-send").click();
  await expect(page.getByTestId("memo")).toContainText("Summer-series rationale: Raleigh, NC sample amphitheatre");
  await noSideScroll(page);
  await snap("5-send");
});

// Fix screens on real data for the club samples that show the joint assignment and the centred discovery (screenshots go to VENUE_SHOTS when set).
for (const id of ["akron", "portland-me"]) {
  test(`real data: ${id} Fix screens`, async ({ page }, info) => {
    const dir = process.env.VENUE_SHOTS ?? "test-results/screens-real";
    await page.goto("/#/sample");
    await page.getByTestId(`market-${id}`).click();
    await expect(page.getByTestId("summary")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("to-fix").click();
    await expect(page.getByRole("heading", { name: /Fix:/ })).toBeVisible({ timeout: 60_000 });
    const skip = page.getByTestId("skip-pack");
    await expect(skip).toBeVisible({ timeout: 60_000 });
    await skip.click();
    await page.waitForTimeout(1500);
    // No family-title chip is a niche title, and there are at most three.
    const chips = await page.getByTestId("ideas").locator(".idea").allInnerTexts();
    expect(chips.length).toBeLessThanOrEqual(3);
    for (const c of chips) expect(c).not.toMatch(/Nimona|^Leo$|Wish Dragon/);
    await page.screenshot({ path: `${dir}/${info.project.name}-${id}-fix.png`, fullPage: true });
  });
}
