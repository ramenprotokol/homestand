import { expect, test } from "@playwright/test";

// When the live server does not answer, a sample still opens from the copy saved at deploy time, with a small banner. The saved file is
// built here from the real local Worker's own answers, then the API is cut off.
test("a sample opens from the saved copy when the server is down, and says so", async ({ page }) => {
  const got: { analyze?: unknown; propose?: unknown } = {};
  let down = false;
  await page.route("**/api/**", async (route) => {
    if (down) return route.abort("failed");
    const res = await route.fetch();
    const kind = new URL(route.request().url()).pathname.endsWith("/propose") ? "propose" : "analyze";
    if (route.request().method() === "POST") {
      const text = await res.text();
      got[kind] = JSON.parse(text);
    }
    return route.fulfill({ response: res });
  });
  await page.goto("/#/check/biloxi");
  await expect(page.getByTestId("summary")).toBeVisible();
  await expect(page.getByTestId("saved-copy")).toHaveCount(0);
  await page.getByTestId("to-fix").click();
  await expect(page.getByTestId("fix-status")).toBeVisible();
  expect(got.analyze && got.propose).toBeTruthy();

  down = true;
  await page.route("**/snapshots/biloxi.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ v: 1, analyze: got.analyze, propose: got.propose }) }));
  await page.goto("about:blank");
  await page.goto("/#/check/biloxi");
  await expect(page.getByTestId("summary")).toBeVisible();
  await expect(page.getByTestId("saved-copy")).toHaveText("Showing a saved copy. The live server isn't answering right now.");
  await page.getByTestId("to-fix").click();
  await expect(page.getByTestId("fix-status")).toBeVisible();
  await expect(page.getByTestId("saved-copy")).toBeVisible();
  await expect(page.getByText("Check your connection")).toHaveCount(0);
});

test("a new city with the server down gets a message that does not blame the visitor", async ({ page }) => {
  await page.goto("/#/own");
  await page.getByLabel("1. Your home city").fill("Tulsa");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: "Tulsa, OK" }).click();
  await page.getByTestId("load-example").click();
  await page.route("**/api/analyze", (route) => route.abort("failed"));
  await page.getByTestId("check-mine").click();
  await expect(page.getByRole("alert")).toContainText("The Homestand server isn't answering right now");
  await expect(page.getByText("Check your connection")).toHaveCount(0);
});
