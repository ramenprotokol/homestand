import { expect, test, type Page, type Request } from "@playwright/test";

// Any sport: the made-up Boise basketball sample and "Use your own" with hockey, on the local Worker (synthetic Qloo answers, nothing real).
async function noSideScroll(page: Page): Promise<void> {
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(sw, "no horizontal scroll").toBeLessThanOrEqual(iw);
}

/** The JSON body of the next POST to /api/<route>. */
const bodyOf = async (req: Request): Promise<Record<string, unknown>> => JSON.parse(req.postData() ?? "{}") as Record<string, unknown>;
const analyzeCall = (page: Page): Promise<Request> => page.waitForRequest((r) => r.url().endsWith("/api/analyze") && r.method() === "POST");

test("home page says it is for baseball, basketball, hockey and soccer", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("hero-sports")).toContainText("minor league teams: baseball, basketball, hockey and soccer.");
  // The original intro is untouched.
  await expect(page.getByTestId("hero-intro")).toContainText("Planning next season's theme nights? Homestand rates each one against what people in your town like");
  await noSideScroll(page);
});

test("the sample picker offers one made-up basketball team beside the four baseball clubs", async ({ page }) => {
  await page.goto("/#/sample");
  for (const id of ["biloxi", "albuquerque", "akron", "portland-me"]) await expect(page.getByTestId(`market-${id}`)).toContainText("Sample club");
  const card = page.getByTestId("market-boise");
  await expect(card).toContainText("Sample team");
  await expect(card).toContainText("Boise, ID");
  await expect(card).toContainText("22 nights");
  await expect(card).toContainText("made-up basketball team");
  await expect(card).toContainText("not a real team");
  await expect(card).toContainText("Open this team");
  await noSideScroll(page);
});

test("basketball sample: Check, Fix and Send, in basketball words, and a reload keeps it", async ({ page }) => {
  await page.goto("/#/sample");
  await page.getByTestId("market-boise").click();
  await expect(page.getByRole("heading", { name: /Check: Boise, ID sample team/ })).toBeVisible();
  await expect(page).toHaveURL(/#\/check\/boise$/);
  await expect(page.getByTestId("summary")).toBeVisible();
  await expect(page.getByTestId("sport-note")).toContainText("This basketball calendar is one we wrote for a sample team");
  await expect(page.getByTestId("sport-note")).toContainText("not any real team's schedule");
  await expect(page.locator(".nav .club")).toContainText("Boise, ID");
  await expect(page.locator(".nav .club")).toHaveAttribute("aria-label", "Boise, ID. Change team");
  // The Study is baseball: the link says so.
  await expect(page.getByRole("link", { name: "We tested this on baseball, not basketball." })).toBeVisible();
  // A proven promo of this sport says what proven promos are.
  await page.getByRole("button", { name: /T-Shirt/ }).first().click();
  await expect(page.getByRole("dialog")).toContainText("Proven promos (T-shirt nights, towel giveaways, heritage nights) aren't graded");
  await page.keyboard.press("Escape");
  const text = await page.locator("main, #app, body").first().innerText();
  expect(text).not.toMatch(/ballpark|first pitch|Minor League Baseball/i);
  await noSideScroll(page);

  // Fix
  await page.getByTestId("to-fix").click();
  await expect(page.getByRole("heading", { name: /Fix:/ })).toBeVisible();
  const pack = page.getByRole("button", { name: /Open the pack/ });
  await expect(pack).toBeVisible();
  await pack.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#carousel")).toBeVisible();
  await expect(page.getByTestId("proposal")).toHaveCount(1);
  await page.getByTestId("approve").click();
  await expect(page.getByTestId("fix-status")).toContainText("1 approved");
  if ((await page.getByTestId("angle").count()) > 0) {
    const angles = await page.getByTestId("angle").allInnerTexts();
    expect(angles.join(" ")).toContain("ceremonial tip-off");
    expect(angles.join(" ")).not.toMatch(/first pitch|walk-up/);
  }
  await noSideScroll(page);

  // A reload on Fix keeps the team, its sport and the approval.
  await page.reload();
  await expect(page.getByRole("heading", { name: /Fix:/ })).toBeVisible();
  await expect(page.locator(".nav .club")).toContainText("Boise, ID");
  await expect(page.getByTestId("fix-status")).toContainText("1 approved");

  // Send
  await page.getByTestId("to-send").click();
  await expect(page.getByRole("heading", { name: /Send:/ })).toBeVisible();
  const memo = page.getByTestId("memo");
  await expect(memo).toContainText("Theme-night rationale: Boise, ID sample team");
  await expect(memo).toContainText(/Homestand checked 22 theme nights for Boise, ID sample team against local taste data from Qloo\./);
  await expect(memo).toContainText("made-up calendar for a sample basketball team");
  await expect(memo).toContainText("(T-shirt nights, towel giveaways, heritage nights and similar)");
  await expect(memo).not.toContainText(/ballpark|baseball|first pitch/i);
  await expect(page.getByTestId("to-study")).toContainText("tested Minor League baseball only");
  const [csv] = await Promise.all([page.waitForEvent("download"), page.getByTestId("dl-csv").click()]);
  expect(csv.suggestedFilename()).toBe("boise-season.csv");
  const [ics] = await Promise.all([page.waitForEvent("download"), page.getByTestId("dl-ics").click()]);
  expect(ics.suggestedFilename()).toBe("boise-season.ics");
  await noSideScroll(page);
});

test("a baseball sample after the basketball sample reads as baseball again", async ({ page }) => {
  await page.goto("/#/check/boise");
  await expect(page.getByTestId("summary")).toBeVisible();
  await page.goto("/#/sample");
  await page.getByTestId("market-akron").click();
  await expect(page.getByRole("heading", { name: /Check: Akron, OH sample club/ })).toBeVisible();
  await expect(page.getByTestId("sport-note")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "See how we tested it" })).toBeVisible();
  await page.getByRole("button", { name: /Fireworks/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Proven promos (fireworks, giveaways, heritage nights) aren't graded");
});

test("Use your own: pick hockey, the words follow, and the Worker is told", async ({ page }) => {
  await page.goto("/#/own");
  // Baseball is the default.
  await expect(page.getByTestId("sport-baseball")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("sport-hint")).toContainText("Baseball seasons usually run April to September. Next, the city your ballpark is in.");
  await expect(page.locator(".cols dd").first()).toHaveText("The game date, like 2026-04-10 or 4/10/2026.");
  for (const s of ["baseball", "basketball", "hockey", "soccer"]) await expect(page.getByTestId(`sport-${s}`)).toBeVisible();
  await expect(page.getByTestId("sport-nfl")).toHaveCount(0);

  await page.getByTestId("sport-hockey").click();
  await expect(page.getByTestId("sport-hockey")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("sport-baseball")).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("sport-hint")).toContainText("Hockey seasons usually run October to April. Next, the city your arena is in.");
  await expect(page.locator(".cols dd").first()).toHaveText("The game date, like 2027-10-15 or 10/15/2027.");
  await expect(page.getByLabel("2. Your theme nights")).toHaveAttribute("placeholder", /Teddy Bear Toss/);
  // The choice survives a reload of this page.
  await page.reload();
  await expect(page.getByTestId("sport-hockey")).toHaveAttribute("aria-checked", "true");

  await page.getByTestId("load-example").click();
  await expect(page.getByLabel("2. Your theme nights")).toHaveValue(/Teddy Bear Toss/);
  await expect(page.getByLabel("2. Your theme nights")).not.toHaveValue(/Fireworks/);
  await page.getByLabel("1. Your home city").fill("Tulsa");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: "Tulsa, OK" }).click();
  await noSideScroll(page);
  const call = analyzeCall(page);
  await page.getByTestId("check-mine").click();
  expect((await bodyOf(await call)).sport).toBe("hockey");
  await expect(page.getByTestId("summary")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Check: Tulsa, OK/ })).toBeVisible();
  await expect(page.locator(".nav .club")).toHaveAttribute("aria-label", "Tulsa, OK. Change team");
  await page.getByRole("button", { name: /Teddy Bear Toss/ }).first().click();
  await expect(page.getByRole("dialog")).toContainText("Proven promos (teddy bear toss, jersey giveaways, heritage nights) aren't graded");
  await page.keyboard.press("Escape");

  // A reload on Check keeps the sport: the re-check goes out as hockey again.
  const again = analyzeCall(page);
  await page.reload();
  expect((await bodyOf(await again)).sport).toBe("hockey");
  await expect(page.getByTestId("summary")).toBeVisible();
  await expect(page.getByRole("button", { name: /Teddy Bear Toss/ }).first()).toBeVisible();
  await noSideScroll(page);
});

test("Use your own with baseball sends exactly what it always sent", async ({ page }) => {
  await page.goto("/#/own");
  await page.getByTestId("load-example").click();
  await page.getByLabel("1. Your home city").fill("Tulsa");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: "Tulsa, OK" }).click();
  const call = analyzeCall(page);
  await page.getByTestId("check-mine").click();
  const body = await bodyOf(await call);
  expect(Object.keys(body).sort()).toEqual(["market", "rows"]);
  await expect(page.getByTestId("summary")).toBeVisible();
  await expect(page.locator(".nav .club")).toHaveAttribute("aria-label", "Tulsa, OK. Change club");
});

test("The Study says it is baseball only", async ({ page }) => {
  await page.goto("/#/study");
  await expect(page.getByTestId("study-baseball-only")).toContainText("The Study is baseball only. It uses real 2025 Minor League Baseball data. We have not tested basketball, hockey or soccer.");
  await noSideScroll(page);
});
