import { test } from "node:test";
import assert from "node:assert/strict";
import { GuardianEngine } from "../lib/engine";
import { Store } from "../lib/store";
import { AIService } from "../lib/ai";
import { companionUpdate, coordinationSummary } from "../lib/coordination";
import { LiveUpdates } from "../lib/live-updates";
import { statusSummary, userInstructions } from "../lib/realtime";
import type { Incident } from "../lib/types";

const setup = () => {
  const e = new GuardianEngine(new Store(":memory:"), 5, new AIService(() => null));
  e.defaults = { placesAdapter: "CITY", routeAdapter: "CITY" };
  return e;
};
const active = (i: Incident) => i.plans.find(p => !p.superseded);
const complete = "Đồng ý tiếp nhận, có chỗ chờ. Cửa vào: cửa chính. Điều kiện: không yêu cầu thêm.";
async function until(predicate: () => boolean) {
  for (let n = 0; n < 400; n++) {
    if (predicate()) return;
    await new Promise(r => setTimeout(r, 5));
  }
  throw new Error("Timed out waiting for coordination");
}

test("Web partner replies reach the companion with conditions/evidence and revise the same city route shown on the map", async () => {
  const e = setup();
  const partners = ["A", "B"].map(name => {
    const m = e.network.create("owner", "PARTNER", name);
    return e.network.update(m.id, { joined: true });
  });
  const family = e.network.create("owner", "CONTACT", "Mẹ");
  e.network.update(family.id, { joined: true });
  const i = e.create("owner", { networkOnly: true });
  await e.sos(i, "Tôi cần một nơi chờ");
  await until(() => i.calls.length === 2);
  const [a, b] = partners.map(m => i.calls.find(c => c.memberId === m.id)!);
  partners.forEach((m, n) => e.partnerAnswer(i, m, [a, b][n].id));
  let delivery = companionUpdate(i);
  await e.partnerTranscript(i, partners[0], a.id, "PARTNER", "Chắc được, chỉ ở cửa sau.", "a-vague");
  const vague = companionUpdate(i, delivery.cursor);
  assert.match(vague.text!, /CLARIFY/);
  assert.ok(coordinationSummary(i).branches[0].questions.length);
  assert.equal(coordinationSummary(i).plan, null);
  assert.equal(e.activeRoute(i), undefined);
  delivery = vague;

  await e.partnerTranscript(i, partners[1], b.id, "PARTNER", complete, "b-confirmed");
  await until(() => !!active(i));
  const proposal = active(i)!;
  const proposed = coordinationSummary(i);
  assert.equal(proposed.plan?.destination, "B");
  assert.equal(proposed.guidance, "AWAITING_ACCEPTANCE");
  assert.deepEqual(proposed.plan?.route.steps, []);
  assert.equal(proposed.plan?.route.durationSeconds, null, "City simulation must not invent trusted ETA");
  assert.equal(proposed.plan?.route.id, proposal.route.id);
  assert.ok(proposed.branches.find(c => c.place === "B")?.support?.evidenceRefs.length);
  assert.match(companionUpdate(i, delivery.cursor).text!, /cửa chính/);
  e.acceptRoute(i, proposal.id);
  delivery = companionUpdate(i, delivery.cursor);
  assert.equal(coordinationSummary(i).guidance, "ACTIVE");
  assert.equal(coordinationSummary(i).navigation?.target, "B");
  assert.deepEqual(coordinationSummary(i).plan?.route.steps, proposal.route.steps);

  await e.partnerTranscript(i, partners[0], a.id, "PARTNER", complete, "a-confirmed");
  assert.equal(active(i)?.id, proposal.id, "A new offer must not flip an accepted valid destination");
  assert.match(companionUpdate(i, delivery.cursor).text!, /PLAN_REEVALUATED/);
  delivery = companionUpdate(i, delivery.cursor);
  await e.partnerTranscript(i, partners[1], b.id, "PARTNER", "Rút lại xác nhận, không còn tiếp nhận.", "b-revoked");
  await until(() => active(i)?.selectedPlaceId === a.placeId);
  const changed = coordinationSummary(i), update = companionUpdate(i, delivery.cursor);
  assert.equal(changed.plan?.destination, "A");
  assert.notEqual(changed.plan?.route.id, proposal.route.id);
  assert.notDeepEqual(active(i)!.route.points, proposal.route.points, "Different partner means different route geometry");
  assert.equal(changed.guidance, "AWAITING_ACCEPTANCE");
  assert.equal(changed.navigation, null);
  assert.equal(update.interrupt, true);
  assert.match(update.text!, /PLAN_INVALIDATED/);
  assert.throws(() => e.acceptRoute(i, proposal.id), /Phương án đã thay đổi/);
  assert.equal(active(i)?.acceptedAt, undefined);
  assert.equal(e.activeRoute(i), undefined, "invalidated plan guidance never continues");
  // The user may still ask for a place themselves; accepting the coordinated plan replaces that route.
  e.directions(i, "Nhà");
  assert.equal(e.activeRoute(i)?.target, "Nhà");
  e.acceptRoute(i, changed.plan!.id);
  assert.equal(e.activeRoute(i)?.route.id, changed.plan!.route.id);
  assert.equal(i.freeRoute, undefined);
  assert.equal(coordinationSummary(i).navigation?.target, "A");

  delivery = companionUpdate(i, update.cursor);
  e.contactAction(i, family, "KEEP_CONTACT");
  e.contactAction(i, family, "ON_THE_WAY", 7);
  assert.deepEqual(coordinationSummary(i).contacts[0], { name: "Mẹ", status: "ON_THE_WAY", arrivalMinutes: 7 });
  assert.match(companionUpdate(i, delivery.cursor).text!, /arrivalMinutes\":7/);
  e.contactAction(i, family, "CANNOT_HELP");
  assert.equal(coordinationSummary(i).contacts[0].arrivalMinutes, null);
  e.close(i, true);
});

test("A late-starting companion gets current structured facts, not private transcripts, and duplicate events stay quiet", () => {
  const e = setup(), i = e.create("private-owner");
  i.transcript.push({speaker: "Bạn", text: "PRIVATE USER WORDS", source: "MIC", time: i.createdAt});
  i.calls.push({id: "call", placeId: "unknown", providerMode: "APP", generation: 0, startedAt: i.createdAt, status: "CONNECTED", transcript: [{speaker: "Đối tác", text: "PRIVATE PARTNER WORDS", source: "APP", time: i.createdAt}]});
  const first = companionUpdate(i);
  assert.ok(first.text);
  for (const secret of ["private-owner", "PRIVATE USER WORDS", "PRIVATE PARTNER WORDS", String(i.location.lat), String(i.location.lng)]) assert.ok(!first.text!.includes(secret));
  assert.equal(companionUpdate(i, first.cursor).text, null);
  e.event(i, "Voice", "TRANSCRIPT_RECEIVED", "MORE PRIVATE WORDS");
  assert.equal(companionUpdate(i, first.cursor).text, null);
  assert.deepEqual(statusSummary(i).coordination, coordinationSummary(i));
  assert.match(userInstructions(i, e.network.settings(i.owner), "COMPANION"), /ĐIỀU PHỐI REALTIME/);
  const fresh = e.create("different-owner");
  const next = companionUpdate(fresh, first.cursor);
  assert.ok(next.text);
  assert.equal(next.interrupt, false);
  assert.ok(!next.text!.includes('"callId":"call"'));
  e.close(i, true); e.close(fresh, true);
});

test("Queued coordination replaces obsolete plans while retaining other notices", () => {
  const queue = new LiveUpdates();
  queue.add("old plan B", "coordination");
  queue.add("mic notification");
  queue.add("new plan A, must accept again", "coordination");
  const text = queue.drain();
  assert.ok(!text.includes("old plan B"));
  assert.match(text, /new plan A/); assert.match(text, /mic notification/);
  assert.equal(queue.size, 0);
});

test("SOS suppresses a pre-existing free route; no eligible partner cannot revive it", async () => {
  const e = setup(), i = e.create("owner");
  const target = "Công an phường An Khánh";
  e.directions(i, target);
  assert.ok(i.freeRoute);
  assert.equal(coordinationSummary(i).guidance, "FREE_WALK");
  assert.equal(coordinationSummary(i).freeWalk?.target, target);
  assert.equal(coordinationSummary(i).navigation?.target, target);
  await e.sos(i, "Tôi cần hỗ trợ");
  assert.equal(i.freeRoute, undefined);
  assert.equal(coordinationSummary(i).freeWalk, null);
  assert.equal(i.nav, undefined);
  assert.equal(e.activeRoute(i), undefined);
  assert.equal(coordinationSummary(i).plan, null);
  e.close(i, true);
});
