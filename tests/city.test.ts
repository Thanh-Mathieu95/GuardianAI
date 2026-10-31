import { test } from "node:test";
import assert from "node:assert/strict";
import { GuardianEngine } from "../lib/engine";
import { Store } from "../lib/store";
import { cityAnchor, cityRoute, locate, toLL, cityStart, cityHome, edges, safetyReport } from "../lib/city";
import type { Incident } from "../lib/types";
const A = cityAnchor;
const setup = () => {
  const e = new GuardianEngine(new Store(":memory:"), 5);
  e.defaults = { placesAdapter: "CITY", routeAdapter: "CITY" };
  return e;
};
const active = (i: Incident) => i.plans.find((p) => !p.superseded);
async function until(cond: () => boolean, ms = 3000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("timeout");
    await new Promise((r) => setTimeout(r, 5));
  }
}
test("City routing on real streets skips the risky shortcut and explains why", () => {
  const r = cityRoute(A, toLL(A, cityStart), toLL(A, cityHome), "Nhà");
  assert.match(r.steps[0], /^Đi theo Trần Bạch Đằng/);
  assert.ok(r.steps.some((s) => /^Rẽ (trái|phải) vào/.test(s)));
  assert.equal(r.steps.at(-1), "Đến Nhà");
  // Đường D6 is shorter but dark, empty and has an incident history.
  const d6 = new Set(edges.filter((e) => e.name === "Đường D6").map((e) => e.id));
  assert.ok(r.edges!.every((id) => !d6.has(id)));
  assert.ok(r.advisories!.some((a) => /Không đi lối tắt qua Đường D6.*giật đồ/.test(a)));
  assert.match(locate(A, toLL(A, cityStart)).text, /Trần Bạch Đằng/);
  const d = safetyReport(A, toLL(A, cityStart), "D6");
  assert.ok(d.incidents.length >= 3 && /mô phỏng/i.test(d.dataNote));
});
test("City SOS: plan has maneuvers; walking emits next-step updates and arrival", async () => {
  const e = setup(),
    i = e.create("u");
  await e.sos(i, "Giúp tôi");
  assert.equal(i.places.length, 30);
  await e.startCalls(i, "MOCK");
  const plan = active(i)!;
  assert.equal(plan.selectedPlaceId, "b");
  assert.ok(plan.route.maneuvers!.length >= 2);
  assert.equal(Boolean(i.nav), false);
  e.acceptRoute(i);
  assert.ok(i.events.some((v) => v.type === "NAV_STEP"));
  for (let n = 0; n < 40 && !i.nav?.arrived; n++) e.simMove(i, "step");
  assert.ok(i.events.some((v) => v.type === "NAV_ARRIVED"));
});
test("City: wrong turn is detected and the plan is rerouted from the new position", async () => {
  const e = setup(),
    i = e.create("u");
  await e.sos(i, "Giúp tôi");
  await e.startCalls(i, "MOCK");
  const before = active(i)!.revision;
  e.acceptRoute(i);
  e.simMove(i, "step");
  e.simMove(i, "deviate");
  assert.ok(i.events.some((v) => v.type === "NAV_OFF_ROUTE"));
  await until(() => (active(i)?.revision ?? 0) > before);
  assert.equal(Boolean(i.nav), false);
  e.acceptRoute(i);
  assert.ok(i.nav && !i.nav.offRoute);
});
test("City: a blocked street is avoided by the new plan", async () => {
  const e = setup(),
    i = e.create("u");
  await e.sos(i, "Giúp tôi");
  await e.startCalls(i, "MOCK");
  await e.inject(i, "ROAD_BLOCKED");
  const blocked = i.blockedEdges![0];
  assert.ok(active(i)!.route.edges!.every((id) => id !== blocked));
  assert.ok(i.plans.find((p) => p.superseded)!.route.blockedAt);
});
test("City: free directions without SOS, and safe walk home gets a route", () => {
  const e = setup(),
    i = e.create("u");
  const r = e.directions(i, "Công an phường An Khánh");
  assert.equal(r.target, "Công an phường An Khánh");
  assert.equal(i.metrics.sosAt, undefined);
  e.startTrip(i, { label: "Nhà", lat: 0, lng: 0 }, 15);
  assert.equal(i.freeRoute!.target, "Nhà");
  assert.throws(() => e.directions(i, "Sao Hỏa"), /Không tìm thấy nơi này/);
});
test("Operator can answer for a simulated store; a partner can play a map store", async () => {
  const e = setup(),
    i = e.create("u");
  await e.sos(i, "Giúp tôi");
  const pool = e.startCalls(i, "MOCK");
  await e.decidePlace(i, "a", true);
  await pool;
  assert.equal(i.places.find(p => p.id === "a")!.supportStatus, "CONFIRMED");
  assert.ok(active(i)?.evidenceRefs.length);
  await assert.rejects(e.decidePlace(i, "police", true), /không nhận cuộc gọi/);
  await e.decidePlace(i, "a", false);
  assert.notEqual(active(i)?.selectedPlaceId, "a");
  const hotel = e.network.create("v", "PARTNER", "Khách sạn Bình Minh", "Lễ tân", "b");
  e.network.update(hotel.id, { joined: true });
  const j = e.create("v");
  await e.sos(j, "Giúp tôi");
  assert.ok(j.places.some((p) => p.id === "partner-" + hotel.id));
  assert.equal(j.places.some((p) => p.id === "b"), false);
  assert.equal(e.network.list("v")[0].slot, "b");
});
