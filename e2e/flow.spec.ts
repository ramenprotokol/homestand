import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createServer, request as httpRequest } from "node:http";

const BASE = "http://127.0.0.1:5199";

// Screenshots for each step land in test-results/screens/ (gitignored): <project>-<step>.png
async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  await page.screenshot({ path: `test-results/screens/${info.project.name}-${name}.png`, fullPage: true });
}

async function noSideScroll(page: Page): Promise<void> {
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(sw, "no horizontal scroll").toBeLessThanOrEqual(iw);
}

/** cos of a card's flip: 1 when the front faces us, -1 when the back does. */
const flipAngle = (page: Page, sel: string): Promise<number> => page.locator(sel).evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m11);

const overlap = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test("sample club: Check, Why, Fix, Send, The Study", async ({ page }, info) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your market, not the national chart." })).toBeVisible();
  await expect(page.getByTestId("study-link")).toBeVisible();
  await expect(page.getByTestId("study-teaser")).toContainText("385 real 2025 theme nights");
  await expect(page.getByTestId("study-teaser")).not.toContainText("coin flip");
  // The hero says what the app is, and what it is not, in plain words on readable panels.
  await expect(page.getByTestId("hero-intro")).toContainText("Planning next season's theme nights? Homestand checks each one against what fans in your town like");
  await expect(page.getByTestId("hero-intro")).toContainText("Every swap comes with a cited reason you can show a sponsor.");
  // The hero leads with what the tool is for. The coin-flip result lives on the Study page only.
  await expect(page.getByTestId("hero-honest")).toContainText("It reads what your town likes. It doesn't forecast ticket sales, and we tested that: see The Study.");
  await expect(page.getByTestId("hero-honest")).not.toContainText(/coin flip|49|385/);
  await expect(page.locator("#hero")).not.toContainText("coin flip");
  for (const id of ["hero-intro", "hero-honest"]) expect(await page.getByTestId(id).evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(14);
  // Programmatic focus on the heading shows no ring.
  expect(await page.locator("h1").evaluate((el) => (el === document.activeElement ? getComputedStyle(el).outlineStyle : "none"))).toBe("none");
  await noSideScroll(page);
  await shot(page, info, "01-start");

  await page.getByTestId("try-sample").click();
  await expect(page.getByRole("heading", { name: "Pick a sample club" })).toBeVisible();
  await expect(page.getByText("Open this club").first()).toBeVisible();
  await expect(page.getByTestId("use-own-schedule")).toBeVisible();
  await shot(page, info, "02-pick");
  await page.getByTestId("market-akron").click();

  // ---- Check
  await expect(page.getByTestId("summary")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Check: Akron, OH sample club/ })).toBeVisible();
  await expect(page.getByText("Synthetic demo data").first()).toBeVisible();
  await expect(page.getByText("Step 1 of 3 · Check")).toBeVisible();
  await expect(page.locator(".rings")).toHaveCount(0); // no stray ring glyph beside the board
  // The result line comes from the cards themselves.
  const awayCards = await page.locator('.card.tile[data-fit="leans-away"]').count();
  await expect(page.getByTestId("check-result")).toHaveText(awayCards === 0 ? /^None of the 24 nights lean away from what Akron likes\.$/ : new RegExp(`^${awayCards} of 24 nights? leans? away from what Akron likes\\.$`));
  // Sponsor and locks are in words under the cards.
  expect(await page.locator(".slot-note").count()).toBeGreaterThan(5);
  expect(await page.locator('.slot-note[data-locked="1"]').count()).toBe(await page.locator(".grids .card .lk").count());
  await noSideScroll(page);
  const tiles = page.locator(".card.tile");
  expect(await tiles.count()).toBe(24);
  // Every card carries its fit in words, not just a colour.
  for (const word of ["Classic night", "Not scored"]) await expect(page.locator(`.fitword:has-text("${word}")`).first()).toBeVisible();
  expect(await page.locator(".fitword:has-text('Leans in'), .fitword:has-text('Leans away'), .fitword:has-text('About average')").count()).toBeGreaterThan(5);
  await expect(page.locator(".card .lk").first()).toBeVisible();
  // The ambiguous night asks, and does not guess.
  const ask = page.getByRole("group", { name: /Elvis and the Beatles Night/ });
  await expect(ask).toBeVisible();
  // The question is above the colour key, so it shows without scrolling past the legend.
  expect((await ask.boundingBox())!.y).toBeLessThan((await page.locator(".legend").boundingBox())!.y);
  await shot(page, info, "03-check");
  await ask.getByRole("button", { name: "Elvis" }).click();
  await expect(page.getByRole("group", { name: /Elvis and the Beatles Night/ })).toHaveCount(0);

  // ---- Why panel
  await page.getByRole("button", { name: /Bluey Day/ }).click();
  const why = page.getByRole("dialog");
  await expect(why).toBeVisible();
  await expect(why).toContainText(/Against its own average/);
  await expect(why).toContainText("What Qloo looked at");
  await expect(why.locator(".face.back .bk-idx")).toContainText(/Local pull\s*(well )?(below|above|about) this town's usual/);
  await expect(why.getByTestId("bk-vs")).toContainText(/here: (well )?(below|above|about typical for) (most )?ballpark markets/);
  // Each piece once: the card back holds the glance, the side panel the detail.
  await expect(why.getByTestId("why-pull")).toHaveCount(0);
  expect(await why.getByText("What Qloo looked at").count()).toBe(1);
  expect(await why.getByText(/Local pull/).count()).toBe(1);
    // Plain words, not 0.99: the card back carries no raw taste number.
  await expect(why.locator(".face.back")).not.toContainText(/\d\.\d\d/);
  await expect(why.locator(".bk-idx")).toContainText("Local pull");
  await expect(why).not.toContainText(/affinity|\bindex\b/i);
  await expect(why.getByText("Local pull = z")).toHaveCount(0);
  await expect(why.getByText(/standard step/)).toHaveCount(0);
  await why.getByRole("button", { name: "Show the numbers" }).click();
  await expect(why.getByText(/Local pull = z - market average/)).toBeVisible();
  await why.getByTestId("recheck").click();
  // One live re-check per theme and market per day: the first run asks Qloo, a repeat returns the saved answer.
  await expect(why.getByTestId("recheck-message")).toContainText(/Checked again|Checked with Qloo within the last day: same answer/);
  await expect(why.getByTestId("source-line")).toContainText(/Re-checked live at|Saved result, pulled from Qloo|Synthetic test data/);
  await expect(why.getByTestId("recheck-message")).toBeInViewport();
  await shot(page, info, "04-why");
  await page.keyboard.press("Escape");
  await expect(why).toHaveCount(0);

  // A classic night says why it is not scored.
  await page.getByRole("button", { name: /Fireworks/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Classic promos aren't a pop-culture taste, so Qloo doesn't score them. They stay as planned.");
  await page.keyboard.press("Escape");

  // ---- Fix: a sealed pack, torn open, then the swap carousel
  await page.getByTestId("to-fix").click();
  await expect(page.getByRole("heading", { name: /Fix:/ })).toBeVisible();
  await expect(page.getByText("Step 2 of 3 · Fix")).toBeVisible();
  await expect(page.getByText("How Homestand decided")).toBeVisible();
  // The repeat switch sits under "Advanced", closed until asked for.
  await expect(page.getByText("Off by default: each theme is used once")).toBeHidden();
  await page.getByTestId("advanced").locator("summary").click();
  await expect(page.getByText("Off by default: each theme is used once")).toBeVisible();
  await expect(page.locator("#carousel")).toHaveCount(0);
  const pack = page.getByRole("button", { name: /Open the pack/ });
  await expect(pack).toBeVisible();
  await noSideScroll(page);
  await shot(page, info, "05-fix-pack");
  // The pack floats, so a keyboard press is the steady way to open it.
  await pack.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#carousel")).toBeVisible();
  await expect(pack).toHaveCount(0);
  const card = page.getByTestId("proposal");
  await expect(card).toHaveCount(1);
  await expect(page.locator(".pinbar")).toContainText("Date and sponsor stay");
  // Approve and Reject are on screen right after the reveal, without scrolling.
  await expect(page.getByTestId("approve")).toBeInViewport({ ratio: 1 });
  await expect(page.getByTestId("reject")).toBeInViewport({ ratio: 1 });
  // The new night and its reason show before anything is approved: no black flash box, no hidden meter.
  await expect(page.getByTestId("now-card")).toContainText("Would be");
  await expect(page.getByTestId("now-card").locator(".card")).toHaveCount(1);
  if ((page.viewportSize()?.width ?? 0) >= 900) {
    await expect(page.getByTestId("now-card")).toBeInViewport({ ratio: 1 });
    await expect(page.locator(".swap-why")).toBeInViewport({ ratio: 1 });
    await expect(page.locator(".idx")).toBeInViewport({ ratio: 1 });
    const bar = (await page.locator(".acts").boundingBox())!;
    const idx = (await page.locator(".idx").boundingBox())!;
    expect(overlap(bar, idx), "the Approve bar covers the local-pull meter").toBe(false);
  }
  await noSideScroll(page);
  // The cited comparison replaces the repeated sentence; the why is not said twice.
  await expect(card.getByTestId("cited")).toContainText(/(above|below|in line with) this market's average\./);
  await expect(card).not.toContainText("leans toward");
  await expect(page.locator(".idx")).toContainText(/now (well )?(below|above|about usual) \u2192 proposed (well )?(below|above|about usual)/);
  await expect(page.locator(".idx")).not.toContainText(/\d\.\d/);
  await expect(card).not.toContainText(/\d\.\d/); // no raw index in the swap text
  if ((await page.getByTestId("angle").count()) > 0) {
    const angle = await page.getByTestId("angle").first().innerText();
    expect(angle).toMatch(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun) [A-Z][a-z]{2} \d{1,2}\b/);
    expect(angle).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  }
  await shot(page, info, "06-carousel");
  await page.getByTestId("open-trace").click();
  const trace = page.getByRole("dialog");
  await expect(trace).toContainText(/Asked Qloo|Used the recorded scores/);
  await expect(trace).toContainText("constraint");
  await expect(trace).toContainText("model");
  await expect(trace).toContainText(/Re-checking|checked with Qloo within the last day/);
  await expect(trace).not.toContainText("No usable reply");
  await shot(page, info, "07-trace");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Switch to an alternate before approving: the swap line follows it, the date stays.
  const alt = page.getByTestId("alt").filter({ hasNot: page.locator("[disabled]") }).first();
  if ((await alt.count()) > 0) {
    const before = await page.getByTestId("swap-line").innerText();
    const altName = (await alt.innerText()).trim();
    await alt.click();
    await expect(page.getByTestId("swap-line")).toContainText(altName);
    expect(await page.getByTestId("swap-line").innerText()).not.toBe(before);
  }
  // Approving flips the card into the new theme; the date and sponsor stay pinned; the tally follows.
  const pinned = await page.locator(".pinbar").innerText();
  const inBefore = Number(await page.locator('.tally.mini [data-k="leans-in"] b').innerText());
  const toName = (await page.getByTestId("swap-line").innerText()).split("\n").pop()!.trim();
  await page.getByTestId("approve").click();
  await expect(page.locator(".decision")).toContainText("Approved");
  await expect(page.getByTestId("fix-status")).toContainText("1 approved");
  // Approving only adds the last line to the decision panel; the lookups and rule checks are not shown twice.
  await expect(page.locator("#steps .st .k", { hasText: "Taste lookup" })).toHaveCount(2);
  await expect(page.locator("#steps .st .k", { hasText: "Rules" })).toHaveCount(1);
  await expect(page.locator("#steps .st .k", { hasText: "Approved" })).toHaveCount(1);
  await expect(page.locator('.tally.mini [data-k="leans-in"] b')).toHaveText(String(inBefore + 1));
  await expect(page.locator(".slide.cur .face.alt")).toContainText(toName.split(" ")[0]!);
  await expect.poll(() => flipAngle(page, ".slide.cur .flipper")).toBeLessThan(-0.99);
  expect(await page.locator(".pinbar").innerText()).toBe(pinned);
  await shot(page, info, "08-approved");
  // Next swap, then reject it.
  await page.getByTestId("next-swap").click();
  await expect(page.locator(".slide.cur")).toHaveAttribute("data-j", "1");
  await page.getByTestId("reject").click();
  await expect(page.locator(".decision")).toContainText("Rejected");
  await expect(page.getByTestId("fix-status")).toContainText("1 rejected");
  // The carousel moves with its buttons and with a swipe.
  await page.getByRole("button", { name: "Previous swap" }).click();
  await expect(page.locator(".slide.cur")).toHaveAttribute("data-j", "0");
  // Centre it, clear of the fixed header above and the sticky Approve bar below.
  await page.locator("#slides").evaluate((el) => el.scrollIntoView({ block: "center" }));
  const box = (await page.locator("#slides").boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator(".slide.cur")).toHaveAttribute("data-j", "1");
  await noSideScroll(page);

  // ---- Send
  await page.getByTestId("to-send").click();
  await expect(page.getByRole("heading", { name: /Send:/ })).toBeVisible();
  await expect(page.getByTestId("memo")).toContainText("Theme-night rationale: Akron, OH sample club");
  await expect(page.getByTestId("memo")).toContainText("SYNTHETIC DEMO DATA");
  // The opener is fixed wording built from counts; nothing is written by a model, and there is no bundle score column.
  await expect(page.getByTestId("memo")).toContainText(/Homestand checked 24 theme nights for Akron, OH sample club against local taste data from Qloo\. It suggested \d+ swaps?; 1 is in the revised calendar\. Each approved swap keeps its original date and sponsor\./);
  await expect(page.getByTestId("memo")).not.toContainText(/coin flip/);
  await expect(page.getByTestId("memo")).not.toContainText(/Bundle score|preference for certain/);
  expect(await page.locator(".memo-scroll").evaluate((el) => getComputedStyle(el).overflowX)).toBe("auto");
  await expect(page.getByTestId("send-summary")).toContainText("1 swap approved");
  await expect(page.locator(".tile--swapped .stamp")).toHaveCount(1);
  await expect(page.locator(".tile--swapped .stamp")).toHaveText("SWAPPED");
  // The stamp never covers the pennant with the date.
  const sb = (await page.locator(".tile--swapped .stamp").boundingBox())!;
  const pb = (await page.locator(".tile--swapped .penn").boundingBox())!;
  expect(overlap(sb, pb), "stamp overlaps the date pennant").toBe(false);
  // Locked nights are never swapped.
  await expect(page.locator(".tile--swapped .lk")).toHaveCount(0);
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
  await expect(page.getByTestId("audit-line")).toContainText("It doesn't predict ticket sales");
  await expect(page.getByTestId("stamp-plain")).toHaveText("Not enough evidence to overturn: taste didn't predict bigger crowds.");
  // The user's own call is answered once, in one line.
  await expect(page.getByTestId("you-said")).toHaveText("You said Yes. The data didn't show it at this sample size.");
  expect(await page.getByText(/You said Yes/).count()).toBe(1);
  await expect(page.getByTestId("plain-result")).toBeVisible();
  await expect(page.locator(".dnote")).toContainText("385 theme nights at 120 clubs. The 89 clubs that ran two or more different themes made 521 same-ballpark pairs");
  // The stamp does not touch the line under it.
  const stampBox = (await page.locator(".stampv").boundingBox())!;
  expect(overlap(stampBox, (await page.getByTestId("stamp-plain").boundingBox())!), "stamp overlaps its plain line").toBe(false);
  await expect(page.getByTestId("results-pending")).toHaveCount(0);
  await expect(page.getByTestId("h1-text")).toContainText("range we are confident in: 43.2% to 54.9%");
  await expect(page.getByText("Pre-registration and Amendments 1 to 5")).toBeVisible();
  await noSideScroll(page);
  await shot(page, info, "10-study-result");
});

test("own club: city search, pasted calendar with a bad row", async ({ page }, info) => {
  await page.goto("/#/own");
  await page.getByLabel("1. Your ballpark's city").fill("Tulsa");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: "Tulsa, OK" }).click();
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

test("own club: Load an example fills the rows and explains the columns", async ({ page }) => {
  await page.goto("/#/own");
  await expect(page.getByText("Themes we don't recognise are left alone.")).toBeVisible();
  await expect(page.locator(".cols dt")).toHaveText(["date", "theme", "sponsor", "locked", "notes"]);
  await page.getByTestId("load-example").click();
  await expect(page.getByLabel("2. Your theme nights")).toHaveValue(/Bluey Day,Sunrise Dental Group,no,Day game/);
  await page.getByLabel("1. Your ballpark's city").fill("Tulsa");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: "Tulsa, OK" }).click();
  await page.getByTestId("check-mine").click();
  await expect(page.getByTestId("summary")).toBeVisible();
  expect(await page.locator(".tile").count()).toBe(20);
});

test("own club: the example is a full season and the headings read naturally", async ({ page }) => {
  await page.goto("/#/own");
  await page.getByTestId("load-example").click();
  const rows = (await page.getByLabel("2. Your theme nights").inputValue()).trim().split("\n");
  expect(rows.length - 1).toBeGreaterThanOrEqual(15);
  await page.getByLabel("1. Your ballpark's city").fill("Fresno");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: "Fresno, CA" }).click();
  await page.getByTestId("check-mine").click();
  await expect(page.getByTestId("summary")).toBeVisible();
  expect(await page.locator(".tile").count()).toBeGreaterThanOrEqual(15);
  await expect(page.getByRole("heading", { name: /^Check: Fresno, CA$/ })).toBeVisible();
  await expect(page.locator(".nav .club")).toHaveText("Fresno, CA");
});

test("Discovered by Qloo: the ideas panel, a discovered swap through approve, Send, CSV, ICS and the memo", async ({ page }) => {
  // Turn the first proposal into one Qloo found, as the Worker does for a family night the library cannot fix.
  await page.route("**/api/propose", async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    const p = body.proposals[0];
    Object.assign(p, {
      toThemeId: "qloo:SYN-D-movie-0", to: { label: "found", z: null, score: null }, alternates: [],
      discovered: { name: "Moonpie Pirates (made up)", entityId: "SYN-D-movie-0", type: "movie", affinity: 0.95 },
      why: "Qloo ranks Moonpie Pirates (made up) among the top family movies for fans near Akron.", whySource: "template",
    });
    await route.fulfill({ response: res, json: body });
  });
  await page.goto("/#/check/akron");
  await expect(page.getByTestId("summary")).toBeVisible();
  await page.getByTestId("to-fix").click();
  // The ideas panel: up to six titles, the under-25 line, and where they come from.
  const ideas = page.getByTestId("ideas");
  await expect(ideas).toContainText("Family titles that stand out near Akron");
  expect(await ideas.locator(".idea").count()).toBeLessThanOrEqual(3);
  expect(await ideas.locator(".idea").count()).toBeGreaterThanOrEqual(1);
  await expect(page.getByTestId("ideas")).not.toContainText("under-25");
  await expect(page.getByTestId("ideas-note")).toContainText(/Qloo had local data for \d+ of our \d+ family titles near Akron/);
  await expect(ideas).toContainText("come from Qloo's taste data for this area");
  await page.getByRole("button", { name: /Open the pack/ }).focus();
  await page.keyboard.press("Enter");
  const now = page.getByTestId("now-card");
  await expect(page.getByTestId("disc-badge")).toHaveText("Discovered by Qloo");
  await expect(page.getByTestId("swap-line")).toContainText("Moonpie Pirates (made up)");
  await expect(page.getByTestId("cited")).toContainText("Found by Qloo");
  await expect(now.locator(".fitword")).toHaveText("Found by Qloo");
  await expect(page.locator(".swap-why")).toHaveText("Qloo ranks Moonpie Pirates (made up) among the top family movies for fans near Akron.");
  await expect(page.locator("#steps")).toContainText("Discovered by Qloo");
  await expect(page.locator(".idx")).toContainText("found by Qloo");
  await page.getByTestId("approve").click();
  await expect(page.locator(".decision")).toContainText("Approved: Moonpie Pirates (made up) now holds");
  await expect(page.locator('.tally.mini [data-k="found"] b')).toHaveText("1");
  await page.getByTestId("to-send").click();
  await expect(page.getByTestId("send-summary")).toContainText("1 swap approved");
  const memo = page.getByTestId("memo");
  await expect(memo).toContainText(/Moonpie Pirates \(made up\) (Day|Night|Friday|Giveaway|Showdown) \(Discovered by Qloo\)/);
  await expect(memo).toContainText(/found by Qloo/i);
  await expect(memo).toContainText("Family titles that stand out near Akron");
  await expect(memo).toContainText("come from Qloo's taste data for this area");
  const [csv] = await Promise.all([page.waitForEvent("download"), page.getByTestId("dl-csv").click()]);
  const csvText = await readFile((await csv.path())!, "utf8");
  expect(csvText).toContain("Moonpie Pirates (made up)");
  expect(csvText).toContain("discovered by Qloo");
  const [ics] = await Promise.all([page.waitForEvent("download"), page.getByTestId("dl-ics").click()]);
  expect(await readFile((await ics.path())!, "utf8")).toContain("Moonpie Pirates (made up)");
  await expect(page.locator(".tile--swapped").first()).toBeVisible();
});

test("repeat switch: says plainly when allowing repeats changes nothing", async ({ page }) => {
  const proposals: string[][] = [];
  page.on("response", async (r) => {
    if (r.url().endsWith("/api/propose")) proposals.push(((await r.json()) as { proposals: Array<{ toThemeId: string }> }).proposals.map((p) => p.toThemeId));
  });
  await page.goto("/#/check/akron");
  await expect(page.getByTestId("summary")).toBeVisible();
  await page.getByTestId("to-fix").click();
  await expect(page.getByTestId("skip-pack")).toBeVisible();
  await page.getByTestId("advanced").locator("summary").click();
  await page.getByTestId("allow-dupes").check();
  await expect.poll(() => proposals.length, { timeout: 10_000 }).toBe(2);
  await expect(page.getByTestId("skip-pack")).toBeVisible();
  // The screen never goes quiet: a note when nothing changed, nothing extra when the swaps did change.
  if (JSON.stringify(proposals[0]) === JSON.stringify(proposals[1])) await expect(page.getByTestId("dupes-note")).toHaveText("No change: no other theme qualifies for these nights.");
  else await expect(page.getByTestId("dupes-note")).toHaveCount(0);
});

test("Could not fix is one grouped block, not a card for each night", async ({ page }) => {
  await page.route("**/api/propose", async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    body.unfixed = [4, 6, 8].map((index) => ({ index, date: body.proposals[0].date, reason: "No family theme leans in here that fits this date." }));
    await route.fulfill({ response: res, json: body });
  });
  await page.goto("/#/check/akron");
  await expect(page.getByTestId("summary")).toBeVisible();
  await page.getByTestId("to-fix").click();
  const block = page.getByTestId("unfixed-block");
  await expect(block).toContainText("Could not fix: 3 nights");
  await expect(block).toContainText("A kids' night stays a kids' night");
  await expect(block).toContainText("Next step");
  await expect(block.locator(".nofix-list li")).toHaveCount(3);
  await expect(page.locator(".stamp", { hasText: "COULD NOT" })).toHaveCount(0);
  await expect(block.locator(".card")).toHaveCount(0);
});

test("the Study keeps its short version back until the stamp lands", async ({ page }) => {
  await page.goto("/#/study");
  await page.getByTestId("call-yes").click();
  const lead = page.getByTestId("plain-result");
  await page.waitForTimeout(700);
  expect(await lead.evaluate((el) => getComputedStyle(el).opacity)).toBe("0");
  expect(await page.getByTestId("verdict").evaluate((el) => getComputedStyle(el).opacity)).toBe("0");
  await expect.poll(() => lead.evaluate((el) => getComputedStyle(el).opacity), { timeout: 8000 }).toBe("1");
  await expect(page.getByTestId("verdict")).toBeVisible();
});

test("the step log shows the discovery calls to Qloo", async ({ page }) => {
  await page.goto("/#/check/akron");
  await expect(page.getByTestId("summary")).toBeVisible();
  await page.getByTestId("to-fix").click();
  await expect(page.getByTestId("ideas")).toBeVisible();
  await page.getByTestId("open-trace").click();
  const log = page.getByRole("dialog");
  // The first Akron run in this server asks Qloo; later ones show the recorded answers. Either way the three calls are named.
  await expect(log).toContainText(/Asked Qloo about \d+ family-friendly animated movies near Akron|Used the recorded family-title scores near Akron/);
  await expect(log).not.toContainText("under-25");
});

test("the production CSP and security headers break nothing on any screen", async ({ page }) => {
  // The headers from public/_headers, sent by a small proxy in front of the preview server, with the API origin swapped for the
  // local Worker. (Rewriting the document inside the browser makes Chrome treat it as a public page and block the local API.)
  const headersFile = await readFile("public/_headers", "utf8");
  const policy: Record<string, string> = {};
  for (const m of headersFile.matchAll(/^ {2}([A-Za-z-]+): (.+)$/gm)) policy[m[1]!.toLowerCase()] = m[2]!.replace("https://homestand-api.ramenprotokol.workers.dev", "http://127.0.0.1:8788");
  expect(Object.keys(policy)).toEqual(expect.arrayContaining(["content-security-policy", "x-frame-options", "x-content-type-options", "referrer-policy", "permissions-policy", "cross-origin-opener-policy"]));
  const proxy = createServer((req, res) => {
    const up = httpRequest({ host: "127.0.0.1", port: 5173, path: req.url, method: req.method, headers: req.headers }, (r) => {
      res.writeHead(r.statusCode ?? 502, { ...r.headers, ...policy });
      r.pipe(res);
    });
    req.pipe(up);
  });
  await new Promise<void>((resolve) => proxy.listen(5199, "127.0.0.1", resolve));
  try {
    await cspTour(page);
  } finally {
    proxy.close();
  }
});

async function cspTour(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
    window.print = () => undefined;
  });
  const messages: string[] = [];
  page.on("console", (m) => {
    if (/content security policy|refused to/i.test(m.text())) messages.push(m.text());
  });
  page.on("pageerror", (e) => messages.push(`pageerror: ${e.message}`));
  const first = await page.goto(`${BASE}/`);
  expect(first!.headers()["content-security-policy"]).toContain("default-src 'none'");
  expect(first!.headers()["x-frame-options"]).toBe("DENY");
  await expect(page.locator("#hero")).toBeVisible();
  await page.goto(`${BASE}/#/check/akron`);
  await expect(page.getByTestId("summary")).toBeVisible();
  await page.locator(".card[role=button]").first().focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByTestId("to-fix").click();
  await page.getByTestId("skip-pack").click();
  await expect(page.locator("#carousel")).toBeVisible();
  await page.getByTestId("approve").click();
  await expect(page.locator(".decision")).toContainText("Approved");
  await page.getByTestId("open-trace").click();
  await page.keyboard.press("Escape");
  await page.getByTestId("to-send").click();
  await expect(page.getByTestId("memo")).toBeVisible();
  const [csvDownload] = await Promise.all([page.waitForEvent("download"), page.getByTestId("dl-csv").click()]);
  expect(await csvDownload.path()).toBeTruthy();
  const [memoDownload] = await Promise.all([page.waitForEvent("download"), page.getByTestId("dl-memo").click()]);
  expect(await memoDownload.path()).toBeTruthy();
  await page.getByTestId("print-memo").click();
  await page.getByTestId("to-study").click();
  await page.getByTestId("call-yes").click();
  await expect(page.getByTestId("verdict")).toBeVisible();
  await page.goto(`${BASE}/#/own`);
  await page.getByTestId("load-example").click();
  await page.getByLabel("1. Your ballpark's city").fill("Tulsa");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("button", { name: "Tulsa, OK" })).toBeVisible();
  await page.waitForTimeout(300);
  const violations = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
  expect(violations).toEqual([]);
  expect(messages).toEqual([]);
  // The policy really is on: a page-level probe that it forbids is reported.
  await page.evaluate(() => {
    const img = document.createElement("img");
    img.src = "https://example.com/probe.png";
    document.body.append(img);
  });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __csp: string[] }).__csp.length)).toBeGreaterThan(0);
}

test("deep links: a sample club opens cold, and a cold step with no club goes to the picker", async ({ page }) => {
  await page.goto("/#/check/biloxi");
  await expect(page.getByRole("heading", { name: /Check: Biloxi, MS sample club/ })).toBeVisible();
  await expect(page.getByTestId("check-result")).toBeVisible();
  await page.goto("/#/check/nowhere");
  await expect(page.getByRole("heading", { name: "Pick a sample club" })).toBeVisible();
  for (const hash of ["check", "fix", "send"]) {
    await page.evaluate(() => sessionStorage.clear());
    await page.goto(`/#/${hash}`);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Pick a sample club" })).toBeVisible();
  }
});

test("reload on Check keeps the chosen club", async ({ page }) => {
  await page.goto("/#/sample");
  await page.getByTestId("market-akron").click();
  await expect(page.getByTestId("summary")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("summary")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Check: Akron, OH sample club/ })).toBeVisible();
  // Storage that throws must not break the app.
  await page.addInitScript(() => Object.defineProperty(window, "sessionStorage", { get() { throw new Error("blocked"); } }));
  await page.goto("/#/sample");
  await page.reload();
  await page.getByTestId("market-akron").click();
  await expect(page.getByTestId("summary")).toBeVisible();
});

test("step bar and header never cover content, and tap targets are 44px", async ({ page }) => {
  await page.goto("/#/sample");
  await page.getByTestId("market-akron").click();
  await expect(page.getByTestId("summary")).toBeVisible();
  const nav = (await page.locator("#nav").boundingBox())!;
  const h1 = (await page.locator("main h1").first().boundingBox())!;
  expect(h1.y, "heading starts below the header").toBeGreaterThanOrEqual(nav.y + nav.height - 1);
  for (const a of await page.locator(".nav a.step").all()) {
    const b = (await a.boundingBox())!;
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.width).toBeGreaterThanOrEqual(44);
    expect(await a.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(page.viewportSize()!.width <= 760 ? 14 : 13);
  }
});

test("keyboard: the Why panel opens from a magnet, traps focus, and closes with Escape", async ({ page }) => {
  await page.goto("/#/sample");
  await page.getByTestId("market-portland-me").click();
  await expect(page.getByTestId("summary")).toBeVisible();
  const tile = page.locator(".card[role=button]").first();
  await tile.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "Close" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("the Why flips the card in 3D to its cardboard back and gives focus back on close", async ({ page }) => {
  await page.goto("/#/sample");
  await page.getByTestId("market-portland-me").click();
  await expect(page.getByTestId("summary")).toBeVisible();
  const card = page.getByRole("button", { name: /Bluey Day|Star Wars Night|Elvis Night/ }).first();
  const label = await card.getAttribute("aria-label");
  await card.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".face.back")).toHaveCount(1);
  await expect(dialog.locator(".bk-top")).toContainText(/Portland nights/);
  await expect.poll(() => flipAngle(page, ".lb .flipper"), { timeout: 5000 }).toBeLessThan(-0.99);
  await expect(dialog.locator(".bk-why b")).toContainText(/Why it (fits|misses) Portland|How Portland reads it/);
  await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: label! })).toBeFocused();
});

test("reduced motion: flips are instant, the pack opens straight away and nothing is left hidden", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your market, not the national chart." })).toBeVisible();
  await expect(page.locator("#fx")).toHaveCount(1);
  await expect(page.locator("#hero")).toBeVisible();
  await page.goto("/#/sample");
  await page.getByTestId("market-akron").click();
  await expect(page.getByTestId("summary")).toBeVisible();
  await page.getByRole("button", { name: /Bluey Day|Star Wars Night|Elvis Night/ }).first().click();
  // No waiting: the back is showing as soon as the dialog is.
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await flipAngle(page, ".lb .flipper")).toBeLessThan(-0.99);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByTestId("to-fix").click();
  await expect(page.getByRole("heading", { name: /Fix:/ })).toBeVisible();
  // The pack opens by itself and the carousel is there.
  await expect(page.locator("#carousel")).toBeVisible();
  await expect(page.getByRole("button", { name: /Open the pack/ })).toHaveCount(0);
  await page.getByTestId("approve").click();
  await expect(page.locator(".decision")).toContainText("Approved");
  expect(await flipAngle(page, ".slide.cur .flipper")).toBeLessThan(-0.99);
  await expect(page.getByTestId("fix-status")).toContainText("1 approved");
  await page.getByTestId("to-send").click();
  await expect(page.getByTestId("send-summary")).toContainText("1 swap approved");
  await page.getByTestId("to-study").click();
  await page.getByTestId("call-no").click();
  await expect(page.getByTestId("verdict")).toBeVisible();
  await expect(page.locator(".needle b")).toContainText("49.1%");
});

test("no console errors on any route", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto("/");
  await page.waitForTimeout(600);
  await page.goto("/#/sample");
  await page.getByTestId("market-biloxi").click();
  await expect(page.getByTestId("summary")).toBeVisible();
  await page.getByTestId("to-fix").click();
  await expect(page.getByRole("heading", { name: /Fix:/ })).toBeVisible();
  await page.getByTestId("skip-pack").click();
  await expect(page.locator("#carousel")).toBeVisible();
  await page.getByTestId("to-send").click();
  await expect(page.getByTestId("send-summary")).toBeVisible();
  await page.getByTestId("to-study").click();
  await page.getByTestId("call-yes").click();
  await page.goto("/#/own");
  await page.waitForTimeout(300);
  expect(problems).toEqual([]);
});

test("moving between routes leaves no extra animation loops running", async ({ page }) => {
  // Count requestAnimationFrame callbacks that stay scheduled once the hero is gone.
  await page.addInitScript(() => {
    const w = window as unknown as { __live: Set<number> };
    w.__live = new Set();
    const raf = window.requestAnimationFrame.bind(window);
    const caf = window.cancelAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => {
      const id = raf((t) => {
        w.__live.delete(id);
        cb(t);
      });
      w.__live.add(id);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      w.__live.delete(id);
      caf(id);
    };
  });
  await page.goto("/");
  await page.waitForTimeout(800);
  for (let i = 0; i < 3; i++) {
    await page.goto("/#/sample");
    await page.goto("/#/");
    await page.waitForTimeout(200);
  }
  await page.goto("/#/sample");
  await page.waitForTimeout(1200);
  const live = await page.evaluate(() => (window as unknown as { __live: Set<number> }).__live.size);
  // GSAP's ticker keeps one; the hero loops must all have stopped.
  expect(live).toBeLessThanOrEqual(2);
});
