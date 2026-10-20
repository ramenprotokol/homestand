import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("bad routes say so, and Fix or Send with no club go to the picker", async ({ page }) => {
  await page.goto("/#/nope");
  await expect(page.getByRole("heading", { name: "That page doesn't exist" })).toBeVisible();
  await page.getByTestId("go-home").click();
  await expect(page.getByTestId("try-sample")).toBeVisible();
  await page.goto("/#/send");
  await expect(page.getByRole("heading", { name: "Pick a sample club" })).toBeVisible();
  await expect(page.getByTestId("pick-note")).toHaveText("Pick a club first.");
  await expect(page.getByTestId("pick-first")).toHaveText("Pick a club to start");
});

test("Use your own checks the rows on the same screen and edits them in a table", async ({ page }) => {
  await page.goto("/#/own");
  await page.getByLabel("2. Your theme nights").fill("date,theme,sponsor,locked,notes\n2026-04-11,Bluey Day,Prairie Bank,no,\nsoon,Star Wars Night,,no,\n2026-04-18,Fireworks Friday,,no,\n");
  await expect(page.getByTestId("rowcheck")).toContainText("2 nights ready. 1 needs a fix:");
  await expect(page.getByTestId("rowcheck")).toContainText("Line 3");
  expect(await page.locator(".rows-ed tbody tr").count()).toBe(2);
  await page.getByTestId("add-row").click();
  await expect(page.getByTestId("rowcheck")).toContainText("3 nights ready.");
  await page.getByRole("button", { name: /Delete row/ }).first().click();
  await expect(page.getByTestId("rowcheck")).toContainText("2 nights ready.");
  await page.getByLabel("1. Your home city").fill("Tusla");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText(/No city called "Tusla"\. Check the spelling, for example "Tulsa, OK"\./)).toBeVisible();
});

test("a pick stays as one line with a way back, the CSV has a fit column, and the memo lists what was left", async ({ page }) => {
  await page.goto("/#/check/biloxi");
  await expect(page.getByTestId("summary")).toBeVisible();
  const ask = page.getByRole("group", { name: /Dinosaurs/ });
  await expect(ask).toContainText(/Jun 5: score it as Marvel or Dinosaur\?/);
  await ask.getByRole("button", { name: "Dinosaur" }).click();
  await expect(page.getByTestId("picked-line")).toContainText(/Jun 5 scored as Dinosaur: (strong|average|weak) fit\./);
  await page.getByTestId("picked-line").getByRole("button", { name: "Change" }).click();
  await expect(page.getByRole("group", { name: /Dinosaurs/ })).toBeVisible();
  await page.getByRole("group", { name: /Dinosaurs/ }).getByRole("button", { name: "Marvel" }).click();
  await page.getByTestId("to-fix").click();
  await page.getByTestId("skip-pack").waitFor();
  await page.getByTestId("skip-pack").click();
  await page.getByTestId("reject").click();
  await page.getByTestId("advanced").evaluate((el) => { (el as HTMLDetailsElement).open = true; });
  await page.getByTestId("open-trace").click();
  await expect(page.getByRole("dialog")).toContainText("You rejected");
  await expect(page.getByRole("dialog")).toContainText(/\d+ names matched automatically/);
  await page.keyboard.press("Escape");
  await page.getByTestId("to-send").click();
  await expect(page.getByTestId("memo")).toContainText("Rejected");
  await expect(page.getByTestId("memo")).toContainText("Still weak, no swap");
  const [csv] = await Promise.all([page.waitForEvent("download"), page.getByTestId("dl-csv").click()]);
  const text = await readFile((await csv.path())!, "utf8");
  expect(text.split("\r\n")[0]).toBe("date,theme,sponsor,locked,notes,fit");
  expect(text).toMatch(/,(Strong fit|Average fit|Weak fit|No data|Proven promo \(not graded\))\r\n/);
});

test("a venue run says offers, opener ideas and acts, never themes or holds", async ({ page }) => {
  await page.goto("/#/check/raleigh");
  await expect(page.getByTestId("summary")).toBeVisible();
  await page.getByTestId("to-fix").click();
  await page.getByTestId("angle").first().waitFor();
  const text = await page.locator("main").innerText();
  expect(text).toMatch(/offer/i);
  expect(text).not.toMatch(/\bhold\b|leans away|library|ballpark/i);
  await expect(page.locator(".pk-t2")).toHaveText("Summer offers");
});
