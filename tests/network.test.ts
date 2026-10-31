import { test } from "node:test";
import assert from "node:assert/strict";
import { GuardianEngine } from "../lib/engine";
import { Store } from "../lib/store";
import { policyGate } from "../lib/policy";
import { receiverView } from "../lib/receiver";
import type { Incident } from "../lib/types";
const setup = () => new GuardianEngine(new Store(":memory:"), 5);
async function until(cond: () => boolean, ms = 3000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("timeout waiting for condition");
    await new Promise((r) => setTimeout(r, 5));
  }
}
function join(e: GuardianEngine, owner: string, role: "CONTACT" | "PARTNER", name: string) {
  const m = e.network.create(owner, role, name);
  return e.network.update(m.id, { joined: true });
}
const active = (i: Incident) => i.plans.find((p) => !p.superseded);
test("APP calls require a registered on-duty partner", () => {
  assert.equal(
    policyGate({ kind: "CALL", mode: "TEST_LIVE", provider: "APP", consent: true, eligible: true }, []).allowed,
    true,
  );
  assert.equal(
    policyGate({ kind: "CALL", mode: "SIMULATION", provider: "APP", consent: true, eligible: false }, []).allowed,
    false,
  );
});
test("SOS rings the partner app; only the partner's confirmation creates the plan", async () => {
  const e = setup(),
    hotel = join(e, "u", "PARTNER", "Khách sạn Hoa Sen"),
    i = e.create("u");
  await e.sos(i, "Có người theo tôi, giúp tôi");
  const lane = () => i.calls.find((c) => c.memberId === hotel.id);
  await until(() => lane()?.status === "RINGING");
  assert.equal(i.places[0].id, "partner-" + hotel.id);
  assert.equal(receiverView(e, hotel).incident?.kind, "PARTNER");
  // Partner sees distance but not the exact location before confirming.
  const before = receiverView(e, hotel).incident;
  assert.ok(before?.kind === "PARTNER" && before.location === null);
  e.partnerAnswer(i, hotel, lane()!.id);
  // Mock lanes alongside a partner never confirm on their own.
  await until(() => i.calls.filter((c) => c.providerMode === "MOCK").every((c) => ["DECLINED", "NO_ANSWER"].includes(c.status)));
  assert.equal(active(i), undefined);
  await e.partnerDecide(i, hotel, lane()!.id, true, "Đồng ý tiếp nhận, có chỗ chờ. Cửa vào: cửa chính. Điều kiện: không yêu cầu thêm.");
  await until(() => !!active(i));
  assert.equal(active(i)!.selectedPlaceId, "partner-" + hotel.id);
  const after = receiverView(e, hotel).incident;
  assert.ok(after?.kind === "PARTNER" && after.location && after.selectedHere);
});
test("Partner revoking after confirmation invalidates the plan", async () => {
  const e = setup(),
    hotel = join(e, "u", "PARTNER", "KS"),
    i = e.create("u");
  await e.sos(i, "Giúp tôi");
  await until(() => i.calls.some((c) => c.memberId === hotel.id));
  const c = i.calls.find((c) => c.memberId === hotel.id)!;
  await e.partnerDecide(i, hotel, c.id, true, "Đồng ý tiếp nhận, có chỗ chờ. Cửa vào: cửa chính. Điều kiện: không yêu cầu thêm.");
  await until(() => !!active(i));
  await e.partnerDecide(i, hotel, c.id, false, "Hết người trực");
  assert.equal(active(i), undefined);
  assert.ok(i.events.some((v) => v.type === "SUPPORT_REVOKED"));
});
test("Contacts are alerted in-app at SOS and can report on the way", async () => {
  const e = setup(),
    mom = join(e, "u", "CONTACT", "Mẹ"),
    pending = e.network.create("u", "CONTACT", "Chưa mở link"),
    i = e.create("u");
  await e.sos(i, "Giúp tôi");
  assert.deepEqual(i.contacts.map((c) => c.name), ["Mẹ"]);
  assert.equal(receiverView(e, pending).incident, null);
  e.contactAction(i, mom, "ON_THE_WAY");
  assert.equal(i.contacts[0].status, "ON_THE_WAY");
  assert.ok(i.events.some((v) => v.type === "CONTACT_ON_THE_WAY"));
  // Contacts never see the user's own words in their feed.
  const view = receiverView(e, mom).incident;
  assert.ok(view?.kind === "CONTACT" && !view.events.some((v) => v.summary.includes("Giúp tôi")));
});
test("Too many SOS in an hour: contacts still alerted, partners are not dispatched", async () => {
  const e = setup();
  join(e, "u", "PARTNER", "KS");
  join(e, "u", "CONTACT", "Mẹ");
  for (let n = 0; n < 3; n++) e.network.recordSos("u");
  const i = e.create("u");
  await e.sos(i, "Giúp tôi");
  assert.ok(i.events.some((v) => v.type === "PARTNER_DISPATCH_LIMITED"));
  assert.equal(i.places.some((p) => p.id.startsWith("partner-")), false);
  assert.equal(i.contacts.length, 1);
});
test("False alarm reports lower reputation and stop partner dispatch", async () => {
  const e = setup(),
    hotel = join(e, "u", "PARTNER", "KS");
  for (let n = 0; n < 2; n++) {
    const i = e.create("u");
    await e.sos(i, "Giúp tôi");
    await until(() => i.calls.some((c) => c.memberId === hotel.id));
    const c = i.calls.find((c) => c.memberId === hotel.id)!;
    e.close(i, true);
    e.reportFalseAlarm(i, hotel, c.id);
    assert.throws(() => e.reportFalseAlarm(i, hotel, c.id));
  }
  assert.equal(e.network.settings("u").reputation, -2);
  const i = e.create("u");
  await e.sos(i, "Giúp tôi");
  assert.equal(i.places.some((p) => p.id.startsWith("partner-")), false);
});
test("Safe walk: missed check-in triggers SOS automatically", async () => {
  const e = setup(),
    i = e.create("u");
  e.startTrip(i, { label: "Nhà", lat: i.location.lat + 0.004, lng: i.location.lng }, 15);
  e.inject(i, "TRIP_STOPPED");
  assert.equal(i.trip!.status, "CHECKING");
  i.trip!.checkinDueAt = new Date(Date.now() - 1).toISOString();
  e.tickTrip(i);
  assert.equal(i.trip!.status, "ESCALATED");
  await until(() => i.places.length > 0);
  assert.ok(i.events.some((v) => v.type === "CHECKIN_MISSED"));
});
test("Safe walk: proximity requires explicit user arrival confirmation", () => {
  const e = setup(),
    i = e.create("u"),
    dest = { label: "Nhà", lat: i.location.lat + 0.004, lng: i.location.lng };
  e.startTrip(i, dest, 15);
  e.checkin(i, "Test");
  e.checkinOk(i);
  assert.equal(i.trip!.status, "ACTIVE");
  const prev = { ...i.location };
  i.location = { ...i.location, lat: dest.lat, lng: dest.lng, kind: "LIVE" };
  e.onLocation(i, prev);
  assert.equal(i.trip!.status, "ACTIVE");
  assert.ok(i.events.some(e => e.type === "TRIP_NEAR_DESTINATION"));
  e.endTrip(i, true);
  assert.equal(i.trip!.status, "ARRIVED");
});
test("Voice agent can read the map: nearby places with distance and compass direction", async () => {
  const { locationSummary, direction } = await import("../lib/realtime");
  const e = setup(),
    i = e.create("u");
  assert.equal(direction(i.location, { lat: i.location.lat + 0.01, lng: i.location.lng }), "bắc");
  assert.equal(direction(i.location, { lat: i.location.lat, lng: i.location.lng + 0.01 }), "đông");
  await e.sos(i, "Giúp tôi");
  const s = locationSummary(i, i.places);
  assert.equal(s.location.source, "vị trí mô phỏng (demo)");
  assert.ok(s.nearby.length >= 3 && s.nearby[0].distanceMeters <= s.nearby[1].distanceMeters);
  assert.ok(s.nearby.every((p) => p.distanceMeters > 0 && p.direction));
});
test("Sharing with contacts rings them without starting SOS", () => {
  const e = setup(),
    mom = join(e, "u", "CONTACT", "Mẹ"),
    i = e.create("u");
  e.alertContacts(i, i.generation);
  assert.equal(i.contacts[0].status, "RINGING");
  assert.equal(i.metrics.sosAt, undefined);
  const v = receiverView(e, mom).incident;
  assert.ok(v?.kind === "CONTACT" && v.sharing && !v.sos);
});
