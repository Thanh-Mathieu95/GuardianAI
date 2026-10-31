import { test } from "node:test";
import assert from "node:assert/strict";
import { GuardianEngine } from "../lib/engine";
import { Store } from "../lib/store";
import { AIService } from "../lib/ai";
import { cityAnchor, cityPlaces } from "../lib/city";
import { assessPlace, researchCandidates, venueHours } from "../lib/place-context";
import type { Call, Incident } from "../lib/types";

const setup = () => {
  const e = new GuardianEngine(new Store(":memory:"), 1, new AIService(() => null));
  const i = e.create("venue", { simulatorOnly: true, placesAdapter: "CITY", routeAdapter: "CITY" });
  return { e, i };
};
const full = "Đồng ý tiếp nhận, có chỗ chờ. Cửa vào: cửa chính. Điều kiện: không yêu cầu thêm. Tương tác kín đáo: có. Cần di chuyển: có. Qua ngõ: không.";
const active = (i: Incident) => i.plans.find(p => !p.superseded);
test("Dense catalogue has 30 distinct on-map venues with goods, services, hours and simulated provenance", () => {
  const places = cityPlaces(cityAnchor, new Date().toISOString(), [], "2026-10-28T22:15:00+07:00");
  assert.equal(places.length, 30);
  assert.equal(new Set(places.map(p => p.id)).size, 30);
  assert.ok(places.every(p => p.profile?.sourceKind === "SIMULATED" && Number.isFinite(p.lat) && Number.isFinite(p.lng)));
  assert.ok(new Set(places.map(p => p.profile?.kind)).size >= 10);
  assert.ok(places.some(p => p.openingStatus === "CLOSED"));
  assert.ok(places.find(p => p.id === "atm-sala")!.profile!.services.length === 0);
});
test("Opening hours handle local timezone, overnight shifts, closing boundary and 24 hours", () => {
  const { e, i } = setup();
  const cafe = i.places.find(p => p.id === "cafe-night")!.profile!;
  assert.equal(venueHours(cafe, "2026-10-28T01:30:00+07:00").status, "OPEN");
  assert.equal(venueHours(cafe, "2026-10-28T02:00:00+07:00").status, "CLOSED");
  assert.equal(venueHours(cafe, "2026-10-28T12:00:00+07:00").status, "CLOSED");
  assert.equal(venueHours(i.places.find(p => p.id === "b")!.profile!, "2026-10-28T03:00:00+07:00").status, "OPEN");
  e.store.db.close();
});
test("Research uses function, hours, user needs and proximity; an ATM or closed cafe is not a staffed refuge", () => {
  const { e, i } = setup();
  i.transcript.push({ speaker: "Bạn", text: "Em khát, cần nước uống và có người đi theo", time: i.createdAt, source: "TEXT" });
  const chosen = researchCandidates(i, i.places);
  assert.equal(chosen.length, 3);
  assert.ok(chosen.every(p => p.profile!.services.includes("WATER")));
  assert.ok(chosen.every(p => !assessPlace(i, p).blockers.length));
  assert.equal(chosen.some(p => ["atm-sala", "coffee-leaf", "police"].includes(p.id)), false);
  const police = assessPlace(i, i.places.find(p => p.id === "police")!);
  assert.ok(police.score > assessPlace(i, i.places.find(p => p.id === "atm-sala")!).score);
  assert.ok(police.reasons.some(r => r.includes("trực ban cần xác minh")));
  assert.deepEqual(researchCandidates(i, i.places, 0), []);
  e.store.db.close();
});
test("Medical emergency distinguishes hospital emergency service from a shop selling medicine", () => {
  const { e, i } = setup();
  i.emergency = { kind: "MEDICAL", label: "Cần y tế", medical: true, at: i.createdAt, text: "Tôi bị thương" };
  assert.ok(assessPlace(i, i.places.find(p => p.id === "c")!).blockers.some(r => r.includes("Không có chức năng cấp cứu")));
  assert.ok(!assessPlace(i, i.places.find(p => p.id === "hospital-demo")!).blockers.length);
  assert.equal(researchCandidates(i, i.places).length, 0, "A public emergency service must not become a mock enrolled partner");
  e.store.db.close();
});
test("Changing scenario hours invalidates a confirmed pharmacy plan and prevents new approval", async () => {
  const { e, i } = setup();
  await e.sos(i, "Tôi cần một nơi chờ");
  const call: Call = { id: "pharmacy-call", placeId: "c", status: "CONNECTED", providerMode: "MOCK", generation: 0, startedAt: i.createdAt, transcript: [] };
  i.calls.push(call);
  await e.partnerReply(i, call, full, "Nhà thuốc mô phỏng");
  const original = active(i)!; assert.ok(original); e.acceptRoute(i, original.id);
  await e.setScenarioClock(i, "23:30");
  assert.equal(original.superseded, true);
  assert.equal(active(i), undefined);
  assert.ok(e.admissionChecks(i, "c").some(r => r.includes("Đã đóng cửa")));
  assert.throws(() => e.acceptRoute(i, original.id));
  await e.setScenarioClock(i, "22:55");
  assert.ok(e.admissionChecks(i, "c").some(r => r.includes("phút đóng cửa")));
  e.close(i, true); e.store.db.close();
});
test("A newly dark forward segment changes actual route geometry and requires approval again", async () => {
  const { e, i } = setup();
  await e.sos(i, "Tôi cần hỗ trợ"); await e.startCalls(i, "MOCK");
  const original = active(i)!; e.acceptRoute(i, original.id);
  await e.reportDarkRoad(i);
  const next = active(i)!; assert.ok(next);
  assert.ok(i.roadObservations?.length);
  assert.ok(next.route.edges!.every(edge => !i.roadObservations!.some(r => r.edgeId === edge)));
  assert.notDeepEqual(next.route.points, original.route.points);
  assert.equal(original.superseded, true); assert.equal(next.acceptedAt, undefined);
  assert.ok(next.route.advisories?.some(r => r.includes("báo thiếu sáng")));
  assert.ok(next.route.safety && next.route.safety.weightedCost >= next.route.distanceMeters! - 1);
  e.close(i, true); e.store.db.close();
});
