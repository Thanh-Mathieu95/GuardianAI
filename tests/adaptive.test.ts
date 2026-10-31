import { test } from "node:test";
import assert from "node:assert/strict";
import { GuardianEngine } from "../lib/engine";
import { Store } from "../lib/store";
import { AIService } from "../lib/ai";
import { checkSupport, emptyNeeds, extractSupport, statedNeeds } from "../lib/support";
import { interpretFamily } from "../lib/family";
import { runShowcase } from "../lib/showcase";
import { companionUpdate, offersOf } from "../lib/coordination";
import type { Call, Incident, Transcript } from "../lib/types";

const complete = "Đồng ý tiếp nhận, có chỗ chờ. Cửa vào: cửa chính. Điều kiện: không yêu cầu thêm. Tương tác kín đáo: có. Cần di chuyển: có. Qua ngõ: không.";
const engine = () => new GuardianEngine(new Store(":memory:"), 1, new AIService(() => null));
const active = (i: Incident) => i.plans.find(p => !p.superseded);
const transcript = (text: string): Transcript => ({ speaker: "Đối tác", text, time: new Date().toISOString(), source: "APP" });
const call = (...texts: string[]): Call => ({ id: "audit", placeId: "b", status: "CONNECTED", generation: 0, providerMode: "MOCK", startedAt: new Date().toISOString(), transcript: texts.map(transcript) });

test("Unverified membership condition blocks admission; later unavailable response cannot reuse old consent", () => {
  const r = extractSupport(call(complete.replace("không yêu cầu thêm", "cần xuất trình thẻ thành viên")));
  assert.ok(checkSupport(r, emptyNeeds()).some(c => c.includes("chưa được xác minh")));
  const changed = extractSupport(call(complete, "Bảo vệ chưa quay lại, tạm thời chưa nhận được."));
  assert.equal(changed.decision, "DECLINED");
  assert.ok(checkSupport(changed, emptyNeeds()).length);
});

test("Natural first-person walking limits and alley refusal reach the backend needs", () => {
  const n = statedNeeds("Chân em đau, em chỉ đi nổi 100 mét, đừng dẫn em qua hẻm.");
  assert.equal(n.maxWalkMeters, 100);
  assert.ok(n.refusals.some(r => r.includes("hẻm")));
});

test("On-duty status is rechecked by planning, approval, handoff and network invalidation", async () => {
  const e = engine();
  const original = e.network.create("owner", "PARTNER", "Lễ tân");
  const m = e.network.update(original.id, { joined: true });
  const i = e.create("owner", { simulatorOnly: true });
  await e.sos(i, "Tôi cần giúp");
  const c = call(complete); c.providerMode = "APP"; c.memberId = m.id; i.calls.push(c);
  await e.partnerReply(i, c, complete, m.name);
  const proposed = active(i)!; assert.ok(proposed);
  e.network.update(m.id, { onDuty: false });
  assert.throws(() => e.acceptRoute(i, proposed.id), /không còn hợp lệ/);
  await e.replan(i, "NETWORK_CHANGED");
  assert.equal(active(i), undefined);
  assert.equal(proposed.superseded, true);
  assert.throws(() => e.confirmHandoff(i, "PARTNER", proposed.id));
  await e.networkChanged(i.owner);
  assert.equal(c.support?.decision, "REVOKED");
  e.close(i, true); e.store.db.close();
});

test("Family tool cannot invent pickup or ETA; original statement and revocation are preserved", async () => {
  const e = engine();
  const original = e.network.create("owner", "CONTACT", "Chị Linh");
  const m = e.network.update(original.id, { joined: true });
  const i = e.create("owner"); await e.sos(i, "Tôi cần giúp");
  await e.contactTranscript(i, m, "PARTNER", "Chị giữ liên lạc được.", "turn-1");
  assert.throws(() => e.verifiedContactAction(i, m, "ON_THE_WAY", 3), /Chưa có lời xác nhận/);
  await e.contactTranscript(i, m, "PARTNER", "Chị đang đến đón em, khoảng 7 phút nữa.", "turn-2");
  assert.throws(() => e.verifiedContactAction(i, m, "ON_THE_WAY", 2), /Chưa có lời xác nhận/);
  e.verifiedContactAction(i, m, "ON_THE_WAY", 7);
  assert.equal(i.contacts[0].arrivalMinutes, 7);
  assert.ok(i.contacts[0].response?.evidenceRefs.length);
  const size = i.contacts[0].transcript!.length;
  await e.contactTranscript(i, m, "PARTNER", "Chị đang đến đón em, khoảng 7 phút nữa.", "turn-2");
  assert.equal(i.contacts[0].transcript!.length, size);
  await e.contactTranscript(i, m, "PARTNER", "Chị không thể đến đón được nữa.", "turn-3");
  assert.equal(i.contacts[0].status, "CANNOT_HELP");
  assert.equal(i.contacts[0].arrivalMinutes, undefined);
  assert.equal(interpretFamily([transcript("Chị sẽ đến đón nhưng phải chờ xe.")], m.id).action, null);
  await e.replan(i, "FAMILY_UPDATED");
  for (let n = 0; n < 100 && e.routing.has(i.id); n++) await new Promise(r => setTimeout(r, 2));
  assert.equal(e.routing.has(i.id), false);
  e.close(i, true); e.store.db.close();
});

test("Natural family phrasing is understood offline", () => {
  const read = (t: string) => { const r = interpretFamily([transcript(t)], "m"); return [r.action, r.arrivalMinutes]; };
  assert.deepEqual(read("Ừ để chị qua liền, tầm mười phút nữa"), ["ON_THE_WAY", 10]);
  assert.deepEqual(read("Anh tới liền, 5 phút"), ["ON_THE_WAY", 5]);
  assert.deepEqual(read("Mẹ đang trên đường rồi"), ["ON_THE_WAY", null]);
  assert.deepEqual(read("Chị không qua được, đang ở xa"), ["CANNOT_HELP", null]);
  assert.equal(interpretFamily([transcript("Bảo nó đứng yên trong quán, chị tới ngay")], "m").message, "Bảo nó đứng yên trong quán");
});

test("Family message reaches the companion at once and does not erase an earlier commitment", async () => {
  const e = engine();
  const m = e.network.update(e.network.create("owner", "CONTACT", "Mẹ").id, { joined: true });
  const i = e.create("owner"); await e.sos(i, "Tôi cần giúp");
  const cursor = companionUpdate(i).cursor;
  await e.contactTranscript(i, m, "PARTNER", "Bảo nó đứng yên trong quán, mẹ tới ngay, mười phút", "t1");
  assert.equal(i.contacts[0].status, "ON_THE_WAY");
  assert.equal(i.contacts[0].arrivalMinutes, 10);
  const update = companionUpdate(i, cursor);
  assert.match(update.text ?? "", /CONTACT_MESSAGE/);
  assert.match(update.text ?? "", /đứng yên trong quán/);
  await e.contactTranscript(i, m, "PARTNER", "Dặn nó đừng tắt máy nhé", "t2");
  assert.equal(i.contacts[0].status, "ON_THE_WAY");
  e.verifiedContactAction(i, m, "ON_THE_WAY", 10);
  e.close(i, true); e.store.db.close();
});

test("GPT family analysis is used only when its quote is in the family's own words", async () => {
  let reply: unknown;
  const ai = new AIService(() => ({ provider: "OPENAI", model: "test", key: "k", baseUrl: "https://api.openai.com", timeoutMs: 1000 }),
    async () => Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(reply) }] }] }));
  const e = new GuardianEngine(new Store(":memory:"), 1, ai);
  const m = e.network.update(e.network.create("owner", "CONTACT", "Chị Linh").id, { joined: true });
  const i = e.create("owner"); await e.sos(i, "Tôi cần giúp"); e.setAI(i, true, true);
  reply = { action: "ON_THE_WAY", arrivalMinutes: 12, conditions: [], messageForUser: "Chị Linh dặn chờ ở cửa", offer: null, quote: "chị bay qua liền" };
  await e.contactTranscript(i, m, "PARTNER", "Ờ chờ chút, để chị coi", "a");
  assert.notEqual(i.contacts[0].status, "ON_THE_WAY");
  assert.ok(i.events.some(ev => ev.type === "FAMILY_AI_FALLBACK"));
  reply = { action: "ON_THE_WAY", arrivalMinutes: 15, conditions: [], messageForUser: "Chờ chị ở cửa quán", offer: null, quote: "Chị phi qua em liền" };
  await e.contactTranscript(i, m, "PARTNER", "Chị phi qua em liền, chừng mười lăm phút. Em chờ ở cửa quán nha", "b");
  assert.equal(i.contacts[0].status, "ON_THE_WAY");
  assert.equal(i.contacts[0].arrivalMinutes, 15);
  assert.ok(i.events.some(ev => ev.type === "CONTACT_MESSAGE" && ev.summary.includes("Chờ chị ở cửa quán")));
  for (let n = 0; n < 500 && (e.routing.has(i.id) || i.ai.busy); n++) await new Promise(r => setTimeout(r, 2));
  e.close(i, true); e.store.db.close();
});

test("One-click showcase runs production decisions, changes destination and geometry, then completes two-sided handoff", async () => {
  const e = engine();
  const real = e.network.create("owner", "CONTACT", "Real member must not ring"); e.network.update(real.id, { joined: true });
  const i = e.create("owner", { simulatorOnly: true, demoCase: "SHOWCASE", placesAdapter: "CITY", routeAdapter: "CITY", needs: { ...emptyNeeds(), communication: "DISCREET", canMove: true, maxWalkMeters: 2000, refusals: ["Không qua ngõ"] } });
  await runShowcase(e, i);
  assert.equal(i.showcase?.status, "COMPLETED", i.showcase?.error);
  assert.equal(i.location.stale, true, "phone went silent; incident stays open while people search");
  assert.ok(i.emergency?.medical, "attack with bleeding is detected instantly");
  assert.ok((i.statements?.length ?? 0) >= 3);
  assert.ok(i.evidenceShare && i.evidenceShare.to.length === 2 && i.seals?.some(s => s.hash === i.evidenceShare!.hash));
  assert.ok(i.events.filter(e => e.type === "SHOWCASE_STEP").every(e => e.summary.length < 260), "narration stays short");
  assert.equal(i.metrics.maxConcurrentCalls, 3);
  assert.ok(i.calls.some(c => (c.questions?.length ?? 0) >= 2));
  assert.ok(new Set(i.plans.map(p => p.selectedPlaceId)).size >= 2);
  assert.ok(new Set(i.plans.map(p => JSON.stringify(p.route.points))).size >= 3);
  assert.ok(offersOf(i).length >= 4, "partners and relatives each contribute an idea");
  assert.ok(i.events.some(e => e.type === "COORDINATION_UPDATED"));
  assert.ok(i.events.some(e => e.type === "CONTACT_MESSAGE"), "family advice is relayed to the companion");
  assert.ok(i.events.some(e => e.type === "NAV_DIRECTIONS" && e.summary.includes("Công an")), "police directions are drawn and weighed");
  assert.ok(i.events.some(e => e.type === "ROAD_DARK"));
  assert.equal(i.contacts.some(c => c.memberId === real.id), false);
  assert.ok(i.events.filter(e => e.type === "DEMO_USER_APPROVAL").every(e => e.sourceKind === "SIMULATED"));
  assert.ok(e.store.reportIntegrity(i.id).valid);
  e.close(i, true); e.store.db.close();
});

test("Cancelling a showcase prevents later stage changes or a new plan", async () => {
  const e = engine();
  const i = e.create("owner", { simulatorOnly: true, demoCase: "SHOWCASE" });
  const job = runShowcase(e, i);
  e.close(i, true);
  const count = i.events.length;
  await job;
  assert.equal(i.showcase?.status, "STOPPED");
  assert.equal(i.events.length, count);
  assert.equal(active(i), undefined);
  e.store.db.close();
});
