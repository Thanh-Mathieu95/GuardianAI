import { test } from "node:test";
import assert from "node:assert/strict";
import { GuardianEngine } from "../lib/engine";
import { Store } from "../lib/store";
import { policyGate } from "../lib/policy";
import type { Incident, Scenario } from "../lib/types";
const setup = () => new GuardianEngine(new Store(":memory:"), 5);
async function ready(e: GuardianEngine, scenario: Scenario = "NIGHT_WALK") {
  const i = e.create("test-owner", { scenario });
  await e.sos(i, "Guardian, có người đi theo tôi. Hãy giúp tôi.");
  return i;
}
const active = (i: Incident) => i.plans.find((p) => !p.superseded);
test("Do not invalidate a confirmed plan by accidentally restarting its call pool", async () => {
  const e = setup(),
    i = await ready(e);
  await e.startCalls(i, "MOCK");
  await assert.rejects(e.startCalls(i, "MOCK"), /kế hoạch/);
  assert.equal(
    i.places.find((p) => p.id === active(i)?.selectedPlaceId)?.supportStatus,
    "CONFIRMED",
  );
});
test("Concurrent replanning requests are queued and retain an active route", async () => {
  const e = setup(),
    i = await ready(e);
  await e.startCalls(i, "MOCK");
  await Promise.all([
    e.replan(i, "LOCATION_UPDATED"),
    e.replan(i, "LOCATION_UPDATED"),
  ]);
  assert.ok(active(i));
  assert.equal(i.plans.filter((p) => !p.superseded).length, 1);
  assert.equal(e.pendingReplans.size, 0);
});
test("T01–T04: SOS → real state transitions → sourced fixture candidates", async () => {
  const e = setup(),
    i = await ready(e);
  assert.equal(i.status, "CONTACTING");
  assert.equal(i.places.length, 3);
  assert.equal(i.transcript[0].source, "TEXT");
  assert.equal(i.location.kind, "MOCK");
  assert.ok(i.events.find((v) => v.type === "SOS_TRIGGERED"));
  assert.ok(i.events.find((v) => v.type === "RISK_ASSESSED"));
  for (const p of i.places) {
    assert.ok(p.source && p.capturedAt);
    assert.equal(p.verification, "PUBLIC_INFO_ONLY");
    assert.equal(p.supportStatus, "UNKNOWN");
  }
  assert.ok(i.metrics.candidatesMs !== undefined);
});
test("Ambiguous speech requires confirmation; explicit SOS does not", async () => {
  const e = setup(),
    i = e.create("a");
  await e.sos(i, "Tôi đang đi dạo", "MIC", false);
  assert.equal(i.status, "AWAITING_CONFIRMATION");
  assert.equal(i.places.length, 0);
  await e.sos(i, "Tôi cần hỗ trợ", "TEXT", true);
  assert.equal(i.places.length, 3);
});
test("T05/T12: PolicyGate rejects unallowlisted, unconsented, emergency, rate-limited and wrong-mode real calls", () => {
  const proposal = {
    kind: "CALL" as const,
    mode: "TEST_LIVE" as const,
    provider: "REAL_TEST" as const,
    number: "+84900000000",
    consent: true,
    eligible: true,
  };
  assert.equal(policyGate(proposal, []).allowed, false);
  assert.equal(
    policyGate({ ...proposal, consent: false }, [proposal.number]).allowed,
    false,
  );
  assert.equal(
    policyGate({ ...proposal, number: "113" }, ["113"]).allowed,
    false,
  );
  assert.equal(
    policyGate({ ...proposal, number: "+84113" }, ["+84113"]).allowed,
    false,
  );
  assert.equal(policyGate(proposal, [proposal.number], 3).allowed, false);
  assert.equal(
    policyGate({ ...proposal, mode: "SIMULATION" }, [proposal.number]).allowed,
    false,
  );
  assert.equal(policyGate(proposal, [proposal.number]).allowed, true);
});
test("T06–T08: concurrent independent calls select only confirmed recipient with evidence", async () => {
  const e = setup(),
    i = await ready(e);
  const task = e.startCalls(i, "MOCK");
  assert.equal(i.calls.filter((c) => c.status === "RINGING").length, 3);
  await task;
  assert.deepEqual(
    i.calls.map((c) => c.status),
    ["DECLINED", "CONFIRMED", "NO_ANSWER"],
  );
  assert.equal(i.metrics.maxConcurrentCalls, 3);
  assert.equal(i.calls[2].transcript.length, 0);
  assert.equal(active(i)?.selectedPlaceId, "b");
  assert.ok(active(i)?.evidenceRefs.includes(i.calls[1].id));
  assert.equal(active(i)?.route.durationSeconds, undefined);
  assert.equal(active(i)?.route.sourceKind, "SIMULATED");
});
test("T09: blocked road revises route geometry and preserves superseded plan", async () => {
  const e = setup(),
    i = await ready(e);
  await e.startCalls(i, "MOCK");
  const points = structuredClone(active(i)!.route.points);
  await e.inject(i, "ROAD_BLOCKED");
  assert.equal(active(i)?.revision, 2);
  assert.equal(i.plans[0].superseded, true);
  assert.equal(i.plans[0].route.blocked, true);
  assert.notDeepEqual(active(i)?.route.points, points);
  assert.ok(i.events.some((v) => v.type === "PLAN_REVISED"));
});
test("T10: all unavailable never fabricate confirmed recipient or route", async () => {
  const e = setup(),
    i = await ready(e, "ALL_UNAVAILABLE");
  await e.startCalls(i, "MOCK");
  assert.equal(i.status, "NO_RESPONDERS");
  assert.equal(i.plans.length, 0);
  assert.ok(i.places.every((p) => p.supportStatus !== "CONFIRMED"));
});
test("T11: stale GPS invalidates guidance and retains observed timestamp", async () => {
  const e = setup(),
    i = await ready(e);
  await e.startCalls(i, "MOCK");
  const observed = i.location.observedAt;
  await e.inject(i, "GPS_STALE");
  assert.equal(i.location.observedAt, observed);
  assert.equal(i.location.stale, true);
  assert.equal(i.status, "LOCATION_UNAVAILABLE");
  assert.equal(active(i), undefined);
  await e.replan(i, "LOCATION_UPDATED");
  assert.equal(active(i), undefined);
  i.location.stale = false;
  await e.replan(i, "LOCATION_UPDATED");
  assert.equal(active(i)?.revision, 2);
});
test("Revoking selected support removes plan; new confirmation creates evidence-based revision", async () => {
  const e = setup(),
    i = await ready(e);
  await e.startCalls(i, "MOCK");
  await e.inject(i, "STORE_DECLINES");
  assert.equal(i.status, "NO_RESPONDERS");
  assert.equal(active(i), undefined);
  await e.inject(i, "HOTEL_ACCEPTS");
  assert.equal(active(i)?.revision, 2);
  assert.equal(
    i.places.find((p) => p.id === "b")?.verification,
    "SUPPORT_CONFIRMED",
  );
});
test("T12: escalation is a labeled local summary and creates no call", async () => {
  const e = setup(),
    i = await ready(e);
  await e.inject(i, "ESCALATE");
  assert.ok(i.escalation?.includes("113 SIMULATED"));
  assert.equal(i.calls.length, 0);
});
test("T13: replay rehydrates persisted states without executing tasks", async () => {
  const e = setup(),
    i = await ready(e);
  await e.startCalls(i, "MOCK");
  await e.inject(i, "ROAD_BLOCKED");
  const history = e.store.replay(i.id);
  assert.equal(history[0].status, "ACTIVE_TRIP");
  assert.ok(history.some((s) => s.status === "SOS_RECEIVED"));
  assert.equal(history.at(-1)?.plans.length, 2);
  const restored = e.store.load(i.id)!;
  assert.equal(restored.plans.length, 2);
});
test("T14: reset/cancel prevents late asynchronous callbacks and isolates owners", async () => {
  const e = setup(),
    i = await ready(e),
    other = e.create("other-owner");
  const task = e.startCalls(i, "MOCK");
  e.close(i, true);
  const fresh = e.create("test-owner");
  await task;
  assert.equal(i.status, "USER_CANCELLED");
  assert.equal(i.plans.length, 0);
  assert.equal(fresh.calls.length, 0);
  assert.equal(other.status, "ACTIVE_TRIP");
  assert.throws(() => e.get(other.id, "test-owner"), /NOT_FOUND/);
});
test("Freeze pauses task mutations until resumed", async () => {
  const e = setup(),
    i = await ready(e);
  i.frozen = true;
  const task = e.startCalls(i, "MOCK");
  await new Promise((r) => setTimeout(r, 70));
  assert.equal(
    i.calls.every((c) => c.status === "RINGING"),
    true,
  );
  const t = i.logicalMs;
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(i.logicalMs, t);
  i.frozen = false;
  await task;
  assert.ok(active(i));
});
test("TEST_LIVE denies simulation injection and mock call adapter", async () => {
  const e = setup(),
    i = e.create("test-owner", { mode: "TEST_LIVE" });
  await assert.rejects(e.sos(i, "SOS"), /Live location is required/);
  assert.equal(i.calls.length, 0);
  assert.equal(i.plans.length, 0);
  i.location = { ...i.location, kind: "LIVE", stale: false, observedAt: new Date().toISOString() };
  await e.sos(i, "SOS");
  await assert.rejects(e.inject(i, "ESCALATE"), /SIMULATION/);
  await assert.rejects(e.startCalls(i, "MOCK"), /SIMULATION/);
});
test("Missing live keys produce truthful failure, not silently fabricated live data", async () => {
  const previous = process.env.GOOGLE_MAPS_API_KEY;
  delete process.env.GOOGLE_MAPS_API_KEY;
  try {
    const e = setup(),
      i = e.create("owner", { placesAdapter: "GOOGLE" });
    await e.sos(i, "SOS");
    assert.equal(i.status, "NO_RESPONDERS");
    assert.equal(i.places.length, 0);
    assert.ok(i.events.some((v) => v.type === "SEARCH_FAILED"));
  } finally {
    if (previous) process.env.GOOGLE_MAPS_API_KEY = previous;
  }
});
