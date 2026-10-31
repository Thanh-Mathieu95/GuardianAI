import { test } from "node:test";
import assert from "node:assert/strict";
import { GuardianEngine } from "../lib/engine";
import { Store } from "../lib/store";
import { AIService, type AIConfig } from "../lib/ai";
import {
  checkSupport,
  emptyNeeds,
  extractSupport,
  groundedSupport,
  needsSchema,
  partnerProfile,
  scriptedReply,
  supportSchema,
  statedNeeds,
  type DemoCase,
} from "../lib/support";
import type { Call, Incident } from "../lib/types";

const complete =
  "Đồng ý tiếp nhận, có chỗ chờ và nhân viên đón. Cửa vào: cửa chính. Điều kiện: không yêu cầu thêm. Tương tác kín đáo: có. Cần di chuyển: có. Qua ngõ: không.";
const config: AIConfig = {
  provider: "OPENAI",
  key: "mock-only",
  model: "mock-model",
  baseUrl: "https://mock.invalid",
  timeoutMs: 1000,
};
const response = (data: unknown) =>
  new Response(
    JSON.stringify({
      status: "completed",
      output: [
        { content: [{ type: "output_text", text: JSON.stringify(data) }] },
      ],
    }),
    { headers: { "x-request-id": "mock-request" } },
  );
const active = (i: Incident) => i.plans.find((p) => !p.superseded);
const setup = () => new GuardianEngine(new Store(":memory:"), 2);
async function ready(e: GuardianEngine, demoCase: DemoCase = "BASIC") {
  const i = e.create("owner", { demoCase, simulatorOnly: true });
  await e.sos(i, "Tôi cần một nơi chờ");
  return i;
}
const call = (...texts: string[]): Call => ({
  id: "call-1",
  placeId: "b",
  providerMode: "MOCK",
  status: "CONNECTED",
  generation: 0,
  startedAt: new Date().toISOString(),
  transcript: texts.map((text) => ({
    speaker: "Đối tác",
    text,
    time: new Date().toISOString(),
    source: "MOCK",
  })),
});

test("Schema validates bounds and keeps unprovided needs unknown", () => {
  assert.deepEqual(needsSchema.parse(emptyNeeds()), emptyNeeds());
  assert.equal(
    needsSchema.safeParse({ ...emptyNeeds(), maxWalkMeters: -1 }).success,
    false,
  );
  assert.equal(
    supportSchema.safeParse({ decision: "CONFIRMED" }).success,
    false,
  );
  assert.equal(extractSupport(call("Chắc được")).decision, "CLARIFY");
  assert.ok(checkSupport(extractSupport(call("Chắc được")), emptyNeeds()).length);
  // A clear consent alone is enough; entrance and conditions are optional extras.
  assert.deepEqual(
    checkSupport(extractSupport(call("Đồng ý tiếp nhận")), emptyNeeds()),
    [],
  );
});
test("User needs normalize only explicit first-person statements, never hypothetical or third-party claims", () => {
  assert.deepEqual(statedNeeds("Có người đi theo tôi"), emptyNeeds());
  assert.deepEqual(statedNeeds("Nếu tôi không thể nói thì sao?"), emptyNeeds());
  assert.deepEqual(statedNeeds("Người thân không thể nói"), emptyNeeds());
  assert.equal(statedNeeds("Tôi không cần kín đáo").communication, null);
  const n = statedNeeds(
    "Tôi cần kín đáo. Tôi không thể tiếp tục di chuyển. Tôi đi bộ tối đa 200 m. Tôi không đi vào ngõ. Tôi không về thẳng nhà.",
  );
  assert.equal(n.communication, "DISCREET");
  assert.equal(n.canMove, false);
  assert.equal(n.maxWalkMeters, 200);
  assert.equal(n.refusals.length, 2);
});
test("Actual response content changes eligibility, not model confidence", () => {
  assert.equal(
    checkSupport(extractSupport(call(complete)), emptyNeeds()).length,
    0,
  );
  assert.ok(
    checkSupport(
      extractSupport(call("Xin lỗi, chúng tôi không thể tiếp nhận.")),
      emptyNeeds(),
    ).length,
  );
  assert.ok(
    checkSupport(
      extractSupport(call("Chắc được, chỉ nhận ở cửa sau")),
      emptyNeeds(),
    ).length,
  );
  const c = call(complete);
  c.transcript[0].speaker = "Guardian AI";
  assert.equal(extractSupport(c).decision, "UNKNOWN");
});
test("Semantic extraction requires exact partner quotes, rejects invented values and old evidence", () => {
  assert.throws(
    () =>
      groundedSupport(call("Chắc được"), {
        facts: [{ field: "ACCEPTED", value: "", quote: "Đồng ý", turn: 0 }],
      }),
    /Bằng chứng/,
  );
  const r = groundedSupport(call("Chắc được"), {
    facts: [{ field: "ACCEPTED", value: "", quote: "Chắc được", turn: 0 }],
  });
  assert.equal(r.decision, "CLARIFY");
  assert.throws(
    () =>
      groundedSupport(call(complete), {
        facts: [
          {
            field: "ENTRANCE",
            value: "cổng khác",
            quote: "cửa chính",
            turn: 0,
          },
        ],
      }),
    /không có/,
  );
  const revoked = groundedSupport(call(complete, "Rút lại xác nhận"), {
    facts: [
      { field: "ACCEPTED", value: "", quote: "Đồng ý tiếp nhận", turn: 0 },
    ],
  });
  assert.equal(revoked.decision, "REVOKED");
});
test("Admission checks movement, discretion, unknown routes, walking bounds and deadline", () => {
  const r = extractSupport(call(complete));
  assert.ok(checkSupport(r, { ...emptyNeeds(), canMove: false }).length);
  const unknown = { ...r, discreet: null, viaAlley: null };
  assert.ok(
    checkSupport(unknown, {
      ...emptyNeeds(),
      communication: "DISCREET",
      refusals: ["Không vào ngõ"],
    }).length >= 2,
  );
  const route = {
    id: "r",
    source: "test",
    sourceKind: "SIMULATED" as const,
    capturedAt: new Date().toISOString(),
    points: [],
    steps: [],
    superseded: false,
    blocked: false,
  };
  assert.ok(
    checkSupport(r, { ...emptyNeeds(), maxWalkMeters: 100 }, route).length,
  );
  assert.ok(
    checkSupport(
      r,
      { ...emptyNeeds(), maxWalkMeters: 100 },
      { ...route, distanceMeters: 200 },
    ).length,
  );
  const expiring = {
    ...r,
    validUntil: new Date(Date.now() + 300000).toISOString(),
  };
  assert.ok(
    checkSupport(expiring, emptyNeeds(), {
      ...route,
      durationSeconds: 60,
    }).some((x) => x.includes("ETA")),
  );
  assert.equal(
    checkSupport(expiring, emptyNeeds(), {
      ...route,
      sourceKind: "LIVE",
      durationSeconds: 60,
    }).length,
    0,
  );
  assert.ok(
    checkSupport(
      { ...r, validUntil: new Date(0).toISOString() },
      emptyNeeds(),
    ).some((x) => x.includes("hết")),
  );
});
test("1: independent branches decline, confirm and time out; provisional plan precedes completion", async () => {
  const e = setup(),
    i = await ready(e);
  await e.startCalls(i, "MOCK");
  assert.deepEqual(
    i.calls.map((c) => c.status),
    ["DECLINED", "CONFIRMED", "NO_ANSWER"],
  );
  assert.equal(i.calls[2].transcript.length, 0);
  assert.ok(
    i.events.findIndex((e) => e.type === "ROUTE_SELECTED") <
      i.events.findLastIndex((e) => e.type === "CALL_COMPLETED"),
  );
  assert.equal(active(i)?.selectedPlaceId, "b");
});
test("2: vague answers trigger follow-up before confirmation", async () => {
  const e = setup(),
    i = await ready(e, "CLARIFY");
  await e.startCalls(i, "MOCK");
  assert.ok(
    i.calls
      .filter((c) => c.status === "CONFIRMED")
      .every((c) => c.questions!.length === 2),
  );
  assert.ok(
    i.events.some(
      (e) => e.type === "SUPPORT_EXTRACTED" && e.summary.includes("CLARIFY"),
    ),
  );
});
test("3: closer partner fails user constraint; another is selected", async () => {
  const e = setup(),
    i = await ready(e, "CONSTRAINT");
  i.needs = {
    ...emptyNeeds(),
    communication: "DISCREET",
    refusals: ["Không đi vào ngõ"],
  };
  await e.startCalls(i, "MOCK");
  assert.equal(active(i)?.selectedPlaceId, "b");
  assert.ok(
    active(i)
      ?.comparisons?.find((c) => c.placeId === "a")
      ?.reasons.some((x) => x.includes("kín đáo") || x.includes("ngõ")),
  );
});
test("4: two acceptances with different conditions; short window cannot use invented ETA", async () => {
  const e = setup(),
    i = await ready(e, "TWO_OPTIONS");
  await e.startCalls(i, "MOCK");
  assert.equal(i.calls.filter((c) => c.status === "CONFIRMED").length, 2);
  assert.equal(active(i)?.selectedPlaceId, "b");
  assert.ok(
    active(i)
      ?.comparisons?.find((c) => c.placeId === "a")
      ?.reasons.some((x) => x.includes("ETA")),
  );
});
test("5: changed entrance invalidates accepted plan and needs new acceptance; revocation stops it", async () => {
  const e = setup(),
    i = await ready(e, "CHANGE");
  await e.startCalls(i, "MOCK");
  const before = active(i)!;
  e.acceptRoute(i);
  const c = i.calls.filter((c) => c.placeId === before.selectedPlaceId).at(-1)!;
  await e.partnerReply(i, c, complete, "Đối tác mô phỏng");
  assert.equal(active(i)?.id, before.id, "Repeating the same facts must preserve accepted guidance");
  assert.ok(active(i)?.acceptedAt);
  await e.partnerReply(
    i,
    c,
    complete.replace("cửa chính", "cửa sau"),
    "Đối tác mô phỏng",
  );
  assert.equal(before.superseded, true);
  assert.equal(active(i)?.acceptedAt, undefined);
  assert.ok(i.message.includes("cần chấp nhận lại"));
  assert.throws(() => e.confirmHandoff(i, "USER", before.id));
  await e.partnerReply(i, c, "Rút lại xác nhận", "Đối tác mô phỏng");
  assert.notEqual(active(i)?.selectedPlaceId, c.placeId);
  await assert.rejects(
    e.partnerReply(i, c, complete, "Đối tác mô phỏng"),
    /hết hiệu lực/,
  );
});
test("6: all ineligible means no admission plan", async () => {
  const e = setup(),
    i = await ready(e, "NONE");
  await e.startCalls(i, "MOCK");
  assert.equal(i.plans.length, 0);
  assert.equal(i.status, "NO_RESPONDERS");
});
test("7: hanging model transport is bounded; fallback labelled and other branches finish", async () => {
  const ai = new AIService(
    () => config,
    async () => new Promise<Response>(() => {}),
  );
  const e = new GuardianEngine(new Store(":memory:"), 2, ai),
    i = await ready(e);
  e.dialogueTimeoutMs = 25;
  e.setAI(i, true, true);
  // Planning uses its separate mock method so the test isolates branch transport timeouts.
  ai.plan = async (i) => ({
    data: {
      selectedPlaceId: "b", assignments: [], summaryForUser: "",
      reasons: ["test"],
      evidenceRefs: i.places.find((p) => p.id === "b")!.evidenceRefs,
    },
    provider: "OPENAI",
    model: "mock",
    latencyMs: 0,
  });
  await e.startCalls(i, "MOCK");
  assert.equal(i.running, false);
  assert.ok(active(i));
  assert.equal(i.calls[1].dialogueMode, "SCRIPTED_FALLBACK");
  assert.ok(i.events.some((e) => e.type === "DIALOGUE_FALLBACK"));
});
test("8: cancel/reset discards late model callbacks and isolates the next incident", async () => {
  let release: (r: Response) => void = () => {};
  const ai = new AIService(
    () => config,
    async () =>
      new Promise<Response>((r) => {
        release = r;
      }),
  );
  const e = new GuardianEngine(new Store(":memory:"), 2, ai),
    i = await ready(e);
  e.setAI(i, true, true);
  const job = e.startCalls(i, "MOCK");
  await new Promise((r) => setTimeout(r, 20));
  e.close(i, true);
  const fresh = e.create("owner");
  const events = i.events.length;
  release(response({ text: complete }));
  await job;
  assert.equal(i.events.length, events);
  assert.equal(active(i), undefined);
  assert.equal(fresh.calls.length, 0);
});
test("9: contact capabilities update with self-reported arrival only; no transcript copied", async () => {
  const e = setup(),
    m0 = e.network.create("owner", "CONTACT", "Mẹ"),
    m = e.network.update(m0.id, { joined: true });
  const i = await ready(e);
  e.contactAction(i, m, "KEEP_CONTACT");
  assert.equal(i.contacts[0].arrivalMinutes, undefined);
  e.contactAction(i, m, "ON_THE_WAY", 7);
  assert.equal(i.contacts[0].arrivalMinutes, 7);
  e.contactAction(i, m, "CANNOT_HELP");
  assert.equal(i.contacts[0].status, "CANNOT_HELP");
  assert.equal(i.contacts[0].arrivalMinutes, undefined);
});
test("10: two-sided handoff needs accepted active plan; proximity alone never closes", async () => {
  const e = setup(),
    i = await ready(e, "HANDOFF");
  await e.startCalls(i, "MOCK");
  const p = active(i)!;
  assert.throws(() => e.confirmHandoff(i, "USER", p.id));
  e.acceptRoute(i);
  e.confirmHandoff(i, "USER", p.id);
  assert.notEqual(i.status, "CLOSED");
  assert.throws(() => e.close(i), /hai chiều/);
  e.confirmHandoff(i, "PARTNER", p.id);
  assert.equal(i.status, "CLOSED");
  assert.ok(i.handoff?.completedAt);
});
test("Web and simulation share admission checks; ambiguous tool note cannot manufacture consent", async () => {
  const e = setup(),
    m0 = e.network.create("owner", "PARTNER", "Web"),
    m = e.network.update(m0.id, { joined: true });
  const i = await ready(e);
  const c = call();
  c.providerMode = "APP";
  c.memberId = m.id;
  c.placeId = i.places[0].id;
  i.calls.push(c);
  await e.partnerReply(i, c, "Chắc được", m.name);
  assert.equal(c.support?.decision, "CLARIFY");
  assert.equal(active(i), undefined);
  await e.partnerDecide(i, m, c.id, true, complete, true);
  assert.equal(active(i), undefined);
  await e.partnerReply(i, c, complete, m.name);
  assert.ok(active(i));
});
test("AI contact, simulator and planner receive isolated contexts via mock HTTP transport", async () => {
  const seen: { name: string; input: any }[] = [];
  const ai = new AIService(
    () => config,
    async (_url, init) => {
      const body = JSON.parse(init!.body as string),
        input = JSON.parse(body.input),
        name = body.text.format.name;
      seen.push({ name, input });
      if (name === "guardian_support_facts") return response({ facts: [] });
      if (name === "guardian_plan")
        return response({
          selectedPlaceId: input.ELIGIBLE[0].id, assignments: [], summaryForUser: "",
          reasons: ["đủ điều kiện"],
          evidenceRefs: input.ELIGIBLE[0].evidenceRefs,
        });
      if (input.PROFILE)
        return response({
          text: scriptedReply(
            input.PROFILE,
            input.HISTORY.filter((t: any) => t.speaker !== "Guardian AI")
              .length,
          ),
        });
      return response({
        text: "Xin xác nhận rõ cửa vào, điều kiện và loại hỗ trợ?",
      });
    },
  );
  const e = new GuardianEngine(new Store(":memory:"), 2, ai),
    i = await ready(e, "CLARIFY");
  e.setAI(i, true, true);
  await e.startCalls(i, "MOCK");
  assert.ok(active(i));
  assert.ok(i.calls.some((c) => c.dialogueMode === "AI_LIVE"));
  assert.ok(
    seen
      .filter((x) => x.name === "guardian_dialogue" && !x.input.PROFILE)
      .every((x) => !JSON.stringify(x.input).includes('"support":"ACCEPT"')),
  );
  assert.ok(
    seen
      .filter((x) => x.input.PROFILE)
      .every(
        (x) => Object.keys(x.input).sort().join(",") === "HISTORY,PROFILE",
      ),
  );
  const plan = seen.find((x) => x.name === "guardian_plan")!.input;
  assert.ok(plan.ELIGIBLE.every((p: any) => p.support && p.routing));
  assert.ok(!JSON.stringify(plan).includes("PROFILE"));
  assert.ok((i.dialogueRequests ?? 0) <= 30);
});
test("Expiry invalidates guidance and stable accepted destinations do not oscillate", async () => {
  const e = setup(),
    i = await ready(e, "CHANGE");
  await e.startCalls(i, "MOCK");
  e.acceptRoute(i);
  const before = active(i)!;
  await e.replan(i, "CONTACT_CONFIRMED");
  assert.equal(active(i)?.id, before.id);
  const c = i.calls.find((c) => c.placeId === before.selectedPlaceId)!;
  c.support!.validUntil = new Date(0).toISOString();
  e.tickSignal(i);
  await e.replan(i, "SUPPORT_EXPIRED");
  assert.equal(before.superseded, true);
  assert.equal(c.support!.decision, "EXPIRED");
});
test("Planner transport that ignores abort cannot block the contact pool indefinitely", async () => {
  const ai = new AIService(() => config, async () => new Promise<Response>(() => {}));
  const e = new GuardianEngine(new Store(":memory:"), 2, ai), i = await ready(e, "MODEL_FAILURE");
  e.modelTaskTimeoutMs = 20; e.setAI(i, true, true);
  await e.startCalls(i, "MOCK");
  assert.equal(i.running, false); assert.ok(active(i));
  assert.ok(i.events.some(e => e.type === "AI_FALLBACK"));
});
