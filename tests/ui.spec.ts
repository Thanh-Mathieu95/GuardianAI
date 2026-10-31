import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
test("command center: map, simulation stages, roles, reference route and mobile record", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.log("BROWSER_ERROR", e.message);
  });
  page.on("response", (r) => {
    if (r.url().includes("/api/action"))
      console.log("API_RESPONSE", r.status(), r.url());
  });
  page.on("requestfailed", (r) =>
    console.log("REQUEST_FAILED", r.url(), r.failure()?.errorText),
  );
  console.log("UI browser fixture ready");
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/demo/command-center?lang=en", {
    waitUntil: "domcontentloaded",
    timeout: 20000,
  });
  console.log("UI document loaded");
  console.log(
    (await page.locator("body").innerText({ timeout: 10000 })).slice(0, 250),
  );
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  await expect(page.locator(".map-canvas canvas")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "You", exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".map-notice")).toHaveCount(0);
  await page.getByRole("button", { name: "Run demo", exact: true }).click();
  for (let n = 0; n < 3; n++) {
    await page.getByRole("button", { name: "Next step", exact: true }).click();
    await expect(page.locator(".stage-track .current span")).toHaveText(
      String(n + 2),
    );
  }
  await expect(page.locator(".coordination-plan")).toBeVisible();
  await expect(page.locator(".assignment.role-primary")).toHaveCount(1);
  await expect(page.locator(".assignment.role-support")).toHaveCount(2);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.locator(".exploration>summary").click();
  await page
    .locator(".place-catalog>details")
    .first()
    .locator("summary")
    .click();
  await page
    .locator(".place-catalog")
    .getByRole("button", { name: "Show reference route" })
    .first()
    .click();
  await expect(page.locator(".reference-label")).toContainText(
    "Reception unconfirmed",
  );
  await page.locator(".exploration>summary").click();
  mkdirSync(".impeccable/review", { recursive: true });
  console.log(
    "Capturing viewport",
    await page.evaluate(() => ({
      width: innerWidth,
      height: document.body.scrollHeight,
      fonts: document.fonts.status,
    })),
  );
  await page.screenshot({
    timeout: 15000,
    animations: "disabled",
    path: ".impeccable/review/desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Phone", exact: true })
    .first()
    .click();
  await expect(page.locator(".companion")).toBeHidden();
  await page
    .getByRole("button", { name: "Phone", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  for (let n = 4; n <= 9; n++) {
    await page.getByRole("button", { name: "Next step", exact: true }).click();
    await expect(page.locator(".stage-track .current span")).toHaveText(
      String(n + 1),
    );
  }
  await expect(page.locator(".director")).toContainText("3 plans");
  await page.setViewportSize({ width: 390, height: 844 });
  console.log(
    "Capturing viewport",
    await page.evaluate(() => ({
      width: innerWidth,
      height: document.body.scrollHeight,
      fonts: document.fonts.status,
    })),
  );
  await page.screenshot({
    timeout: 15000,
    animations: "disabled",
    path: ".impeccable/review/mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator(".workspace-tabs")
    .getByRole("button", { name: "Record", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "This session’s record" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("link", { name: "Open / Print record" })
    .click({ modifiers: ["Control"] });
  expect(errors).toEqual([]);
});
test("phone simulator keeps its own scrolling screen and working app tabs at 390px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo/phone?lang=en", { waitUntil: "domcontentloaded" });
  const phone = page.locator(".phone-shell");
  await expect(
    phone.getByRole("heading", { name: "Guardian AI" }),
  ).toBeVisible();
  await expect(
    phone.getByRole("button", { name: "AI unavailable" }),
  ).toBeVisible();
  await phone.getByRole("button", { name: "VI", exact: true }).click();
  await expect(
    phone.getByText("Cùng bạn trên đường về.", { exact: true }),
  ).toBeVisible();
  await phone.getByRole("button", { name: "EN", exact: true }).click();
  mkdirSync(".impeccable/review", { recursive: true });
  await page.screenshot({
    path: ".impeccable/review/phone.png",
    animations: "disabled",
    timeout: 15000,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await phone
    .locator(".phone-app-nav")
    .getByRole("button", { name: "Your people" })
    .click();
  await expect(
    phone.getByRole("heading", { name: "Your people" }),
  ).toBeVisible();
  await phone.locator(".phone-invites>summary").click();
  await phone.getByLabel("Recipient name", { exact: true }).fill("Demo friend");
  await phone
    .getByRole("button", { name: "Create invitation", exact: true })
    .click();
  await expect(
    phone.getByLabel("Share this link with the recipient"),
  ).toHaveValue(/\/join\//);
  await phone
    .locator(".phone-app-nav")
    .getByRole("button", { name: "Record" })
    .click();
  await expect(
    phone.getByRole("heading", { name: "Your record" }),
  ).toBeVisible();
  await phone
    .locator(".phone-app-nav")
    .getByRole("button", { name: "Companion" })
    .click();
  await expect(
    phone.getByRole("button", { name: "SOS · I need help" }),
  ).toBeVisible();
});
