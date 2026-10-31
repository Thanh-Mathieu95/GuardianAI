import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { places, isOpen } from "../lib/city";
test("parallel calls yield a sourced plan and two-sided demo handoff", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/demo/command-center?lang=en");
  await page
    .getByRole("button", { name: "Parallel-call demo", exact: true })
    .click();
  const board = page
    .getByRole("region", { name: "Call coordinator", exact: true })
    .last();
  await expect(board.locator(".call-row")).toHaveCount(5);
  await expect(page.locator(".coordination-plan")).toBeVisible({
    timeout: 25000,
  });
  await expect(board.locator(".call-completed")).toHaveCount(5, {
    timeout: 25000,
  });
  await board.locator(".call-row>summary").first().click();
  await expect(board.locator(".call-conversation").first()).toContainText(
    "I accept",
  );
  mkdirSync(".impeccable/review", { recursive: true });
  await page.screenshot({
    path: ".impeccable/review/desktop.png",
    animations: "disabled",
    fullPage: true,
    timeout: 15000,
  });
  await board.screenshot({
    path: ".impeccable/review/calls.png",
    animations: "disabled",
    timeout: 15000,
  });
  await page
    .locator(".phone-shell")
    .getByRole("button", { name: "Accept this plan", exact: true })
    .click();
  await expect(
    board.getByText("Task notification", { exact: true }).first(),
  ).toBeVisible();
  await page
    .locator(".phone-shell")
    .getByRole("button", { name: "I have met my helper", exact: true })
    .click();
  await page
    .locator(".phone-shell")
    .getByRole("button", {
      name: "Simulate: venue confirms meeting",
      exact: true,
    })
    .click();
  const state = await (await page.request.get("/api/state?scope=demo")).json();
  expect(state.incident.status).toBe("COMPLETE");
  const response = await page.request.get(
    `/api/record/${state.incident.id}?format=json&scope=demo`,
  );
  const record = await response.json();
  expect(
    record.caseFile.claims.some((c: { refs: string[] }) => c.refs.length),
  ).toBe(true);
  expect(record.caseFile.unresolved).not.toContain("HANDOFF_NOT_CONFIRMED");
  const html = await (
    await page.request.get(
      `/api/record/${state.incident.id}?lang=en&scope=demo`,
    )
  ).text();
  expect(html).toContain("Evidence-linked findings");
  expect(html).toContain("Private call records");
});

test("live recipient answers a private in-app call while judge demo stays separate", async ({
  page,
  context,
}) => {
  await context.setGeolocation({ latitude: 10.77, longitude: 106.7 });
  await context.grantPermissions(["geolocation"]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/phone?lang=en");
  await page
    .getByRole("button", { name: "Enable GPS for SOS", exact: true })
    .click();
  await expect(
    page.getByText("GPS updates active", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => {
      const sos = document
        .querySelector(".phone-shell .sos")!
        .getBoundingClientRect();
      const nav = document
        .querySelector(".phone-app-nav")!
        .getBoundingClientRect();
      return sos.top >= 0 && sos.bottom <= nav.top;
    }),
  ).toBe(true);
  mkdirSync(".impeccable/review", { recursive: true });
  await page.screenshot({
    path: ".impeccable/review/live-phone.png",
    animations: "disabled",
    timeout: 15000,
  });
  await page
    .getByRole("button", { name: "Invite real recipients", exact: true })
    .click();
  const live = await (await page.request.get("/api/state")).json();
  const invitation = await (
    await page.request.post("/api/members", {
      headers: { Origin: "http://127.0.0.1:3132" },
      data: { name: "Real recipient", role: "CONTACT" },
    })
  ).json();
  const recipient = await context.newPage();
  await recipient.goto(`/join/${invitation.token}?lang=en`);
  await recipient
    .getByRole("button", { name: "Agree to join", exact: true })
    .click();
  await recipient
    .getByLabel("Allow AI calls in the app while this page is open", {
      exact: true,
    })
    .click();
  await expect(
    recipient.getByLabel("Allow AI calls in the app while this page is open", {
      exact: true,
    }),
  ).toBeChecked();
  await page.goto("/phone?lang=en");
  await page
    .getByRole("button", { name: "Enable GPS for SOS", exact: true })
    .click();
  await expect(
    page.getByText("GPS updates active", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "SOS · I need help", exact: true })
    .click();
  await expect(
    recipient.getByRole("button", { name: "Answer call", exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await recipient
    .getByRole("button", { name: "Answer call", exact: true })
    .click();
  await recipient.screenshot({
    path: ".impeccable/review/recipient.png",
    animations: "disabled",
    fullPage: true,
    timeout: 15000,
  });
  await recipient
    .getByLabel("Reply to AI in this call", { exact: true })
    .fill("I am on my way, arriving in 10 minutes.");
  await recipient
    .getByRole("button", { name: "Send your commitment", exact: true })
    .click();
  await expect(recipient.getByText("ON_THE_WAY", { exact: true })).toHaveCount(
    0,
  );
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/state")).json()).incident
          .replies[0]?.minutes,
    )
    .toBe(10);
  const demo = await (await page.request.get("/api/session?scope=demo")).json();
  expect(demo.id).not.toBe(live.id);
  const after = await (await page.request.get("/api/state")).json();
  expect(after.incident.id).toBe(live.incident.id);
  expect(after.incident.mode).toBe("LIVE");
  await recipient.screenshot({
    path: ".impeccable/review/recipient-completed.png",
    animations: "disabled",
    fullPage: true,
    timeout: 15000,
  });
});
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
test("SOS scan, place profiles, shared opening hours and repeated new sessions", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/demo/command-center?lang=en", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  await expect(page.locator("[data-venue-id]")).toHaveCount(0);
  await page
    .locator(".phone-shell")
    .getByRole("button", { name: "SOS · I need help", exact: true })
    .click();
  await expect(page.locator(".sos-radar")).toBeVisible();
  await expect(page.locator(".map-warning-legend")).toBeVisible();
  await expect(page.locator("[data-venue-id]")).toHaveCount(
    places.filter((p) => isOpen(p, 1335)).length,
  );
  await page.locator('[data-venue-id="venue-cafe"]').click();
  const detail = page.getByRole("region", { name: "Café Đèn Vàng Details" });
  await expect(detail).toBeVisible();
  await expect(detail).toContainText("08:00–02:00");
  await expect(detail).toContainText("Needs confirmation");
  await expect(detail).toContainText("Phone charging");
  await page
    .getByRole("button", { name: "Close details", exact: true })
    .click();
  await page.locator(".exploration>summary").click();
  await page.getByLabel("Scenario time", { exact: true }).fill("03:00");
  await expect(page.locator('[data-venue-id="venue-cafe"]')).toHaveCount(0);
  await expect(page.locator("[data-venue-id]")).toHaveCount(
    places.filter((p) => isOpen(p, 180)).length,
  );
  await page.getByLabel("Scenario time", { exact: true }).fill("22:15");
  await page.locator(".exploration>summary").click();
  await page.locator('[data-venue-id="venue-cafe"]').click();
  await expect(page.locator(".sos-radar")).toHaveCount(0, { timeout: 7000 });
  await page
    .getByRole("button", { name: "Close details", exact: true })
    .click();
  expect(
    await page.evaluate(() => {
      const legend = document
        .querySelector(".map-warning-legend")!
        .getBoundingClientRect();
      const dock = document
        .querySelector(".workspace-footer")!
        .getBoundingClientRect();
      return legend.bottom <= dock.top;
    }),
  ).toBe(true);
  await page.locator(".guardian-map").screenshot({
    path: ".impeccable/review/sos-map.png",
    animations: "disabled",
    timeout: 15000,
  });
  await page.locator('[data-venue-id="venue-cafe"]').click();
  await page.screenshot({
    path: ".impeccable/review/desktop.png",
    fullPage: true,
    animations: "disabled",
    timeout: 15000,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: ".impeccable/review/mobile.png",
    fullPage: true,
    animations: "disabled",
    timeout: 15000,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const old = (await (await page.request.get("/api/state?scope=demo")).json())
    .incident.id;
  await page
    .locator(".phone-language")
    .getByRole("button", { name: "New session", exact: true })
    .click();
  await expect(page.locator("[data-venue-id]")).toHaveCount(0);
  await expect(page.locator(".map-warning-legend")).toHaveCount(0);
  const next = (await (await page.request.get("/api/state?scope=demo")).json())
    .incident;
  expect(next.id).not.toBe(old);
  expect(next.sosAt).toBeNull();
  expect(
    (
      await page.request.get(`/api/record/${old}?format=json&scope=demo`)
    ).status(),
  ).toBe(200);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page
    .locator(".phone-shell")
    .getByRole("button", { name: "SOS · I need help", exact: true })
    .click();
  await expect(page.locator("[data-venue-id]")).toHaveCount(
    places.filter((p) => isOpen(p, 1335)).length,
  );
  await expect(page.locator(".sos-radar")).toHaveCount(0);
  await page
    .locator(".workspace-tabs")
    .getByRole("button", { name: "New session", exact: true })
    .click();
  await expect(page.locator("[data-venue-id]")).toHaveCount(0);
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
