import { test } from "node:test";
import assert from "node:assert/strict";
import { GuardianEngine } from "../lib/engine";
import { Store } from "../lib/store";
import { AIService } from "../lib/ai";
import { offerFrom } from "../lib/support";
import type { Call, Incident } from "../lib/types";

const complete = "Đồng ý tiếp nhận, có chỗ chờ. Cửa vào: cửa chính. Điều kiện: không yêu cầu thêm. Tương tác kín đáo: có. Cần di chuyển: có. Qua ngõ: không. Tôi sẽ cho bảo vệ ra cửa đón bạn.";
const active = (i: Incident) => i.plans.find(p => !p.superseded);
const settle = async (e: GuardianEngine, i: Incident) => {
  for (let n = 0; n < 500 && (e.routing.has(i.id) || i.ai.busy); n++) await new Promise(r => setTimeout(r, 2));
};
function setup(ai: AIService) {
  const e = new GuardianEngine(new Store(":memory:"), 1, ai);
  const partner = e.network.update(e.network.create("owner", "PARTNER", "Lễ tân B").id, { joined: true });
  const family = e.network.update(e.network.create("owner", "CONTACT", "Chị Linh").id, { joined: true });
  return { e, partner, family };
}
async function partnerAccepts(e: GuardianEngine, i: Incident, memberId: string, name: string) {
  const c: Call = { id: "lane-b", placeId: "b", status: "CONNECTED", generation: 0, providerMode: "APP", memberId, startedAt: new Date().toISOString(), transcript: [] };
  i.calls.push(c);
  await e.partnerReply(i, c, complete, name);
  await settle(e, i);
  return c;
}

test("Noise after a pickup commitment does not reset it; sending someone counts as on the way", async () => {
  const { e, family } = setup(new AIService(() => null));
  const i = e.create("owner"); await e.sos(i, "Tôi cần giúp");
  await e.contactTranscript(i, family, "PARTNER", "Bảo Lan đứng yên tôi sẽ đến đón.", "1");
  await e.contactTranscript(i, family, "PARTNER", "Đã hút", "2");
  await e.contactTranscript(i, family, "PARTNER", "Đúng đúng đúng.", "3");
  assert.equal(i.contacts[0].status, "ON_THE_WAY");
  assert.equal(i.events.filter(ev => ev.type === "CONTACT_CAPABILITY_UPDATED").length, 0);
  const j = e.create("owner"); await e.sos(j, "Tôi cần giúp");
  await e.contactTranscript(j, family, "PARTNER", "Tôi đang cử anh tôi ở gần đấy tới đón", "1");
  assert.equal(j.contacts[0].status, "ON_THE_WAY");
  await settle(e, i); await settle(e, j);
  e.close(i, true); e.close(j, true); e.store.db.close();
});

test("Arrival time reaches the companion even when GPT drops the number or updates are coalesced", async () => {
  const ai = new AIService(() => ({ provider: "OPENAI", model: "mock", key: "k", baseUrl: "https://mock.invalid", timeoutMs: 1000 }), async (_url, init) => {
    const body = JSON.parse(init!.body as string);
    if (body.text.format.name !== "guardian_family_response") throw new Error("not mocked");
    const data = { action: "ON_THE_WAY", arrivalMinutes: null, conditions: [], messageForUser: "Lan đứng yên đấy", offer: null, quote: "ba mươi phút" };
    return Response.json({ status: "completed", output: [{ content: [{ type: "output_text", text: JSON.stringify(data) }] }] });
  });
  const { e, family } = setup(ai);
  const i = e.create("owner"); await e.sos(i, "Tôi cần giúp"); e.setAI(i, true, true);
  await e.contactTranscript(i, family, "PARTNER", "Lan đứng yên đấy, ba mươi phút", "1");
  assert.equal(i.contacts[0].arrivalMinutes, 30);
  const { coordinationSummary } = await import("../lib/coordination");
  assert.match(coordinationSummary(i).family[0], /Chị Linh: đang tới, tự báo khoảng 30 phút nữa tới; dặn: “Lan đứng yên đấy”/);
  await settle(e, i); e.close(i, true); e.store.db.close();
});

test("Offer reader keeps what a helper proposes and ignores refusals and form answers", () => {
  const t = (text: string) => [{ speaker: "B", text, time: "", source: "APP" as const }];
  assert.equal(offerFrom("x", t(complete))?.text, "Tôi sẽ cho bảo vệ ra cửa đón bạn");
  assert.equal(offerFrom("x", t("Xin lỗi, chúng tôi không thể tiếp nhận.")), undefined);
});

test("Family proposal joins the plan as a coordinated role without forcing re-acceptance", async () => {
  const { e, partner, family } = setup(new AIService(() => null));
  const i = e.create("owner", { simulatorOnly: true }); await e.sos(i, "Tôi cần giúp");
  const c = await partnerAccepts(e, i, partner.id, partner.name);
  const plan = active(i)!;
  assert.equal(plan.coordination?.assignments.find(a => a.ref === "call:" + c.id)?.role, "PRIMARY");
  assert.match(plan.coordination!.summary, /bảo vệ ra cửa đón/);
  await e.contactTranscript(i, family, "PARTNER", "Để chị chạy xe qua đó đón em, mười phút", "f1");
  await settle(e, i);
  assert.equal(active(i)?.id, plan.id);
  const role = active(i)!.coordination!.assignments.find(a => a.ref === "contact:" + family.id);
  assert.equal(role?.role, "SUPPORT");
  assert.match(role!.instruction, /10 phút/);
  assert.ok(i.events.some(ev => ev.type === "COORDINATION_UPDATED" && ev.summary.includes("Chị Linh")));
  e.close(i, true); e.store.db.close();
});

test("GPT combines everyone's proposals; a role for a non-existent or wrong offer is blocked", async () => {
  let wrong = false;
  const ai = new AIService(() => ({ provider: "OPENAI", model: "mock", key: "k", baseUrl: "https://mock.invalid", timeoutMs: 1000 }), async (_url, init) => {
    const body = JSON.parse(init!.body as string), input = JSON.parse(body.input), name = body.text.format.name;
    let data: unknown;
    if (name === "guardian_support_facts") data = { facts: [] };
    else if (name === "guardian_family_response")
      data = wrong
        ? { action: "ON_THE_WAY", arrivalMinutes: null, conditions: [], messageForUser: null, offer: "đang đi xe máy tới đón", quote: "đang đi" }
        : { action: "ON_THE_WAY", arrivalMinutes: 10, conditions: [], messageForUser: null, offer: "chạy xe máy tới đón", quote: "chị chạy xe máy tới đón" };
    else if (name === "guardian_plan") {
      const place = input.ELIGIBLE.find((p: { id: string }) => p.id === "b");
      const offers = input.OFFERS as { ref: string; kind: string }[];
      data = { selectedPlaceId: place.id, reasons: ["Có người ra đón"], evidenceRefs: place.evidenceRefs,
        summaryForUser: "Đi tới điểm B, bảo vệ ra cửa đón; chị Linh chạy xe tới đó đón bạn.",
        assignments: offers.map(o => ({ ref: o.ref, role: o.kind === "PARTNER" || wrong ? "PRIMARY" : "SUPPORT", instruction: o.kind === "PARTNER" ? "Bảo vệ ra cửa chính đón" : "Chạy xe tới điểm B đón", reason: "Kết hợp được" })) };
    } else throw new Error("not mocked");
    return Response.json({ status: "completed", output: [{ content: [{ type: "output_text", text: JSON.stringify(data) }] }] });
  });
  const { e, partner, family } = setup(ai);
  const i = e.create("owner", { simulatorOnly: true }); await e.sos(i, "Tôi cần giúp"); e.setAI(i, true, true);
  await partnerAccepts(e, i, partner.id, partner.name);
  const plan = active(i)!;
  assert.equal(plan.coordination?.mode, "AI_LIVE");
  await e.contactTranscript(i, family, "PARTNER", "Ừ chị chạy xe máy tới đón liền", "f1");
  await settle(e, i);
  const updated = active(i)!;
  assert.equal(updated.id, plan.id);
  assert.equal(updated.coordination?.mode, "AI_LIVE");
  assert.match(updated.coordination!.summary, /chị Linh chạy xe/);
  assert.equal(updated.coordination!.assignments.find(a => a.ref === "contact:" + family.id)?.role, "SUPPORT");
  wrong = true;
  await e.contactTranscript(i, family, "PARTNER", "Chị chạy xe máy tới đón, đang đi", "f2");
  await settle(e, i);
  assert.equal(active(i)!.coordination?.mode, "RULES_FALLBACK", "Family must never become the PRIMARY destination");
  e.close(i, true); e.store.db.close();
});
