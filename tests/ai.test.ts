import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AIService,
  aiContext,
  resolveAIConfig,
  safeAIReply,
  type AIConfig,
  type AIAnalysis,
} from "../lib/ai";
import { GuardianEngine } from "../lib/engine";
import { Store } from "../lib/store";

const analysis: AIAnalysis = {
  intent: "CHAT",
  confidence: 0.91,
  riskLevel: 2,
  reasons: ["Người dùng nói đang lo lắng."],
  unknowns: ["Chưa xác minh thực địa."],
  reply: "Tôi đang lắng nghe. Bạn muốn tôi giúp tìm điểm hỗ trợ không?",
};
const config = (provider: AIConfig["provider"] = "OPENAI"): AIConfig => ({
  provider,
  model: "test-model",
  key: "SECRET_TEST_KEY_NOT_REAL",
  baseUrl: "https://api.openai.com",
  timeoutMs: 1000,
});
function response(provider: AIConfig["provider"], output: unknown) {
  const text = JSON.stringify(output);
  return Response.json(
    {
      status: "completed",
      output: [{ type: "message", content: [{ type: "output_text", text }] }],
    },
    { headers: { "x-request-id": "provider-test-id" } },
  );
}
function service(
  output: unknown = analysis,
  provider: AIConfig["provider"] = "OPENAI",
) {
  return new AIService(
    () => config(provider),
    async () => response(provider, output),
  );
}
function engine(ai = service()) {
  return new GuardianEngine(new Store(":memory:"), 2, ai);
}

test("OpenAI-only config requires its key and never auto-selects Ollama or another provider", () => {
  assert.equal(resolveAIConfig({}), null);
  assert.equal(
    resolveAIConfig({ AI_PROVIDER: "OFF", OPENAI_API_KEY: "secret" }),
    null,
  );
  assert.throws(
    () => resolveAIConfig({ AI_PROVIDER: "OPENAI" }),
    /OPENAI_API_KEY/,
  );
  assert.throws(
    () => resolveAIConfig({ AI_PROVIDER: "OLLAMA" }),
    /chỉ dùng OpenAI/,
  );
  assert.throws(
    () => resolveAIConfig({ AI_PROVIDER: "GEMINI", GEMINI_API_KEY: "secret" }),
    /chỉ dùng OpenAI/,
  );
  assert.equal(
    resolveAIConfig({ OLLAMA_MODEL: "test", GEMINI_API_KEY: "secret" }),
    null,
  );
  assert.equal(
    resolveAIConfig({ OPENAI_API_KEY: "secret" })?.provider,
    "OPENAI",
  );
});
for (const provider of ["OPENAI"] as const)
  test(`${provider}: real API request contract + strict parsed response through mock HTTP transport`, async () => {
    let payload: Record<string, unknown> = {},
      headers: Record<string, string> = {},
      url = "";
    const ai = new AIService(
      () => config(provider),
      async (input, init) => {
        url = String(input);
        payload = JSON.parse(init!.body as string);
        headers = init!.headers as Record<string, string>;
        return response(provider, analysis);
      },
    );
    const e = engine(ai),
      i = e.create("owner");
    const result = await ai.analyze(i, "Tôi đang lo lắng.");
    assert.equal(result.data.intent, "CHAT");
    assert.equal(result.requestId, "provider-test-id");
    assert.equal(result.provider, provider);
    assert.ok(
      !JSON.stringify(payload).includes(config(provider).key),
      "Key must be in transport auth only",
    );
    if (provider === "OPENAI") {
      assert.ok(url.endsWith("/v1/responses"));
      assert.equal(headers.Authorization, "Bearer " + config(provider).key);
      assert.equal(payload.store, false);
      assert.equal(
        (payload.text as { format: { strict: boolean } }).format.strict,
        true,
      );
    }
  });
test("Cloud context excludes precise GPS, phone numbers, session owner and recipient transcripts", () => {
  const e = engine(),
    i = e.create("private-owner");
  i.location.lat = 12.345678901;
  i.location.lng = 109.987654321;
  i.places = [
    {
      id: "x",
      lat: 12.345678901,
      lng: 109.987654321,
      name: "Fixture X",
      category: "test",
      address: "Private address",
      publicPhone: "+84988888888",
      source: "fixture",
      capturedAt: new Date().toISOString(),
      openingStatus: "UNKNOWN",
      supportStatus: "UNKNOWN",
      contactEligibility: "NOT_ALLOWED",
      verification: "PUBLIC_INFO_ONLY",
      evidenceRefs: [],
    },
  ];
  const data = JSON.stringify(aiContext(i));
  for (const secret of [
    "12.345678901",
    "109.987654321",
    "+84988888888",
    "private-owner",
    "Private address",
  ])
    assert.ok(!data.includes(secret));
});
test("AI rejects schema injection and invalid risk values", async () => {
  const e = engine(),
    i = e.create("a");
  await assert.rejects(
    service({ ...analysis, riskLevel: 99 }).analyze(i, "test"),
    /schema/,
  );
  await assert.rejects(
    service({ ...analysis, tool: "call_113" }).analyze(i, "test"),
    /schema/,
  );
});
test("Provider errors and transport exceptions are redacted; no key echo", async () => {
  const e = engine(),
    i = e.create("a");
  const ai = new AIService(
    () => config(),
    async () => new Response("secret " + config().key, { status: 401 }),
  );
  await assert.rejects(
    ai.analyze(i, "test"),
    (err) =>
      err instanceof Error &&
      err.message.includes("HTTP 401") &&
      !err.message.includes(config().key),
  );
  const broken = new AIService(
    () => config(),
    async () => {
      throw new Error("url contains " + config().key);
    },
  );
  await assert.rejects(
    broken.analyze(i, "test"),
    (err) => err instanceof Error && !err.message.includes(config().key),
  );
});
test("AI cannot claim police arrival or calls performed", () => {
  assert.ok(!safeAIReply("Cảnh sát đang đến giúp bạn.").includes("đang đến"));
  assert.ok(!safeAIReply("Tôi đã gọi cho người thân.").includes("Tôi đã gọi"));
});
test("AI consent is required; ordinary conversation uses the model and logs real call metadata", async () => {
  const e = engine(),
    i = e.create("a");
  await assert.rejects(e.conversation(i, "Xin chào"), /Bật AI/);
  assert.throws(() => e.setAI(i, true, false), /đồng ý/);
  e.setAI(i, true, true);
  await e.conversation(i, "Xin chào");
  assert.equal(i.ai.status, "LIVE");
  assert.equal(i.ai.assessment?.intent, "CHAT");
  assert.equal(i.places.length, 0);
  assert.ok(i.transcript.some((t) => t.source === "AI"));
  assert.equal(i.ai.runs[0].requestId, "provider-test-id");
  assert.ok(
    i.events.some(
      (ev) => ev.type === "AI_COMPLETED" && ev.sourceKind === "LIVE",
    ),
  );
});
test("Semantic model SOS triggers pipeline without relying on original SOS regex; risk assessment from model", async () => {
  const e = engine(
      service({
        ...analysis,
        intent: "SOS",
        riskLevel: 4,
        reply: "Tôi đã nghe bạn. Tôi sẽ tìm các điểm có thể hỗ trợ.",
      }),
    ),
    i = e.create("a");
  e.setAI(i, true, true);
  await e.conversation(i, "Mình cần một người hỗ trợ ở gần đây.");
  assert.equal(i.status, "CONTACTING");
  assert.equal(i.riskLevel, 4);
  assert.equal(i.places.length, 3);
  assert.equal(i.transcript.filter((t) => t.speaker === "Bạn").length, 1);
});
test("Model cancellation is a proposal; only explicit confirmation closes incident", async () => {
  const e = engine(
      service({
        ...analysis,
        intent: "CANCEL",
        reply: "Bạn muốn dừng yêu cầu phải không?",
      }),
    ),
    i = e.create("a");
  e.setAI(i, true, true);
  await e.conversation(i, "Hủy yêu cầu này.");
  assert.equal(i.status, "ACTIVE_TRIP");
  assert.equal(i.ai.pendingAction?.intent, "CANCEL");
  await e.confirmAIAction(i, false);
  assert.equal(i.status, "ACTIVE_TRIP");
  await e.conversation(i, "Hủy đi.");
  await e.confirmAIAction(i, true);
  assert.equal(i.status, "USER_CANCELLED");
});
test("Low-confidence model SOS requires user confirmation", async () => {
  const e = engine(service({ ...analysis, intent: "SOS", confidence: 0.4 })),
    i = e.create("a");
  e.setAI(i, true, true);
  await e.conversation(i, "Không biết có cần giúp không.");
  assert.equal(i.places.length, 0);
  assert.equal(i.ai.pendingAction?.intent, "SOS");
});
test("AI planner cannot select unconfirmed places or fabricate evidence refs", async () => {
  const e = engine(),
    i = e.create("a");
  await e.sos(i, "SOS");
  await e.startCalls(i, "MOCK");
  await assert.rejects(
    service({
      selectedPlaceId: "a", assignments: [], summaryForUser: "",
      reasons: ["closer"],
      evidenceRefs: ["fixture:v1:a"],
    }).plan(i, "TEST"),
    /chặn/,
  );
  await assert.rejects(
    service({
      selectedPlaceId: "b", assignments: [], summaryForUser: "",
      reasons: ["confirmed"],
      evidenceRefs: ["made-up-ref"],
    }).plan(i, "TEST"),
    /chặn/,
  );
  const accepted = await service({
    selectedPlaceId: "b", assignments: [], summaryForUser: "",
    reasons: ["Có xác nhận tiếp nhận."],
    evidenceRefs: i.places[1].evidenceRefs,
  }).plan(i, "TEST");
  assert.equal(accepted.data.selectedPlaceId, "b");
});
test("SOS continues with visibly labeled fallback if model is unavailable", async () => {
  const ai = new AIService(
      () => config(),
      async () => new Response("down", { status: 503 }),
    ),
    e = engine(ai),
    i = e.create("a");
  e.setAI(i, true, true);
  await e.sos(i, "SOS");
  assert.equal(i.status, "CONTACTING");
  assert.equal(i.ai.status, "FALLBACK");
  assert.ok(i.ai.error?.includes("503"));
  assert.ok(i.events.some((ev) => ev.type === "AI_FALLBACK"));
  assert.equal(i.ai.runs[0].status, "FAILED");
});
test("OpenAI-powered full flow uses validated AI assessment and planning for both route revisions", async () => {
  const ai = new AIService(
    () => config(),
    async (_url, init) => {
      const payload = JSON.parse(init!.body as string),
        input = JSON.parse(payload.input);
      return response(
        "OPENAI",
        input.ELIGIBLE
          ? {
              selectedPlaceId: input.ELIGIBLE[0].id, assignments: [], summaryForUser: "",
              reasons: ["Điểm này đã có bằng chứng tiếp nhận."],
              evidenceRefs: input.ELIGIBLE[0].evidenceRefs,
            }
          : { ...analysis, intent: "SOS", riskLevel: 3 },
      );
    },
  );
  const e = engine(ai),
    i = e.create("a");
  e.setAI(i, true, true);
  await e.sos(i, "Tôi cần hỗ trợ.");
  await e.startCalls(i, "MOCK");
  assert.equal(i.plans[0].selectedPlaceId, "b");
  assert.ok(i.plans[0].reasons.some((r) => r.includes("cửa vào:")));
  await e.inject(i, "ROAD_BLOCKED");
  assert.equal(i.plans.at(-1)?.revision, 2);
  assert.equal(
    i.ai.runs.filter((r) => r.task === "PLAN" && r.status === "SUCCEEDED")
      .length,
    2,
  );
  assert.ok(i.events.every((ev) => ev.type !== "AI_FAILED"));
});
test("Closing incident aborts pending inference; stale model response cannot revive it", async () => {
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const ai = new AIService(
      () => config(),
      async () => {
        await gate;
        return response("OPENAI", { ...analysis, intent: "SOS" });
      },
    ),
    e = engine(ai),
    i = e.create("a");
  e.setAI(i, true, true);
  const task = e.conversation(i, "Help");
  assert.equal(i.ai.busy, true);
  e.close(i, true);
  const events = i.events.length;
  release();
  await task;
  assert.equal(i.status, "USER_CANCELLED");
  assert.equal(i.places.length, 0);
  assert.equal(i.events.length, events);
  assert.equal(i.ai.busy, false);
});
