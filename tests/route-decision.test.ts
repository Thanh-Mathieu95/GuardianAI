import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync, unlinkSync } from "node:fs";
import { GuardianEngine } from "../lib/engine";
import { Store } from "../lib/store";
import { AIService } from "../lib/ai";
import { RouteAgent } from "../lib/route-agent";
import { cityAnchor, cityPlaces } from "../lib/city";
import { dossier, dossierHtml } from "../lib/evidence";
import { coordinationSummary } from "../lib/coordination";
import type { Incident, RouteOption } from "../lib/types";

const config = () => ({
  provider: "OPENAI" as const,
  key: "mock-only",
  model: "mock-model",
  baseUrl: "https://mock.invalid",
  timeoutMs: 1000,
});
const response = (data: unknown) =>
  Response.json({
    status: "completed",
    output: [
      { content: [{ type: "output_text", text: JSON.stringify(data) }] },
    ],
  });
const active = (i: Incident) => i.plans.find((p) => !p.superseded);
async function until(fn: () => boolean) {
  for (let n = 0; n < 400; n++) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("timeout");
}
async function prepared(ai = new AIService(() => null)) {
  const e = new GuardianEngine(new Store(":memory:"), 5, ai);
  e.defaults = { placesAdapter: "CITY", routeAdapter: "CITY" };
  const m = e.network.create("owner", "PARTNER", "Điểm A");
  e.network.update(m.id, { joined: true });
  const i = e.create("owner", { networkOnly: true });
  await e.sos(i, "Tôi cần một chỗ chờ");
  await until(() => i.calls.length === 1);
  e.partnerAnswer(i, m, i.calls[0].id);
  return { e, i, m, c: i.calls[0] };
}
const complete =
  "Đồng ý tiếp nhận, có chỗ chờ. Cửa vào: cửa chính. Điều kiện: không yêu cầu thêm.";

test("Route worker produces distinct street-graph alternatives without fabricating live ETA", async () => {
  const e = new GuardianEngine(
    new Store(":memory:"),
    5,
    new AIService(() => null),
  );
  e.defaults = { placesAdapter: "CITY", routeAdapter: "CITY" };
  const i = e.create("owner"),
    p = cityPlaces(cityAnchor, new Date().toISOString())[1];
  const routes = await new RouteAgent().options(i, p, 1);
  assert.ok(routes.length >= 2 && routes.length <= 3);
  assert.equal(
    new Set(routes.map((r) => JSON.stringify(r.points))).size,
    routes.length,
  );
  assert.ok(
    routes.every(
      (r) => r.sourceKind === "SIMULATED" && r.edges?.length && r.steps.length,
    ),
  );
  i.routeAdapter = "FIXTURE";
  const worker = new RouteAgent(),
    other = cityPlaces(cityAnchor, new Date().toISOString())[0];
  const [one, two] = await Promise.all([
    worker.options(i, p, 1),
    worker.options(i, other, 1),
  ]);
  assert.notEqual(
    one[0].id,
    two[0].id,
    "Evidence IDs distinguish destinations even with a single-option adapter",
  );
  e.close(i, true);
});

test("GPT route classification validates allowed route IDs, every assessment and each evidence reference", async () => {
  const { e, i, c } = await prepared();
  const routes = await e.routeWorker.options(i, i.places[0], 1);
  const options: RouteOption[] = routes.map((route) => ({
    placeId: c.placeId,
    route,
    eligible: true,
    checks: [],
    evidenceRefs: [route.id],
  }));
  let mode = "valid",
    captured: any;
  const ai = new AIService(config, async (_url, init) => {
    captured = JSON.parse(String(init!.body));
    return response({
      selectedRouteId: mode === "foreign" ? "invented" : options[1].route.id,
      reasons: ["So sánh dữ liệu tuyến"],
      evidenceRefs: [options[1].route.id],
      assessments: options.map((o, n) => ({
        routeId: mode === "duplicate" ? options[0].route.id : o.route.id,
        reasons: ["Đạt kiểm tra"],
        evidenceRefs: [mode === "evidence" && n === 0 ? "foreign" : o.route.id],
      })),
    });
  });
  const result = await ai.decideRoute(i, options, "TEST");
  assert.equal(result.data.selectedRouteId, options[1].route.id);
  assert.equal(captured.store, false);
  assert.equal(captured.text.format.name, "guardian_route_decision");
  assert.ok(
    JSON.parse(captured.input).OPTIONS.every(
      (o: any) => o.durationSeconds === null,
    ),
  );
  for (const invalid of ["foreign", "duplicate", "evidence"]) {
    mode = invalid;
    await assert.rejects(ai.decideRoute(i, options, "TEST"));
  }
  e.close(i, true);
});

test("Live route decision with mock transport chooses an alternative and reaches the plan, companion and evidence", async () => {
  const ai = new AIService(config, async (_url, init) => {
    const body = JSON.parse(String(init!.body)),
      input = JSON.parse(body.input);
    if (body.text.format.name === "guardian_support_facts")
      return response({ facts: [] });
    if (body.text.format.name === "guardian_plan")
      return response({
        selectedPlaceId: input.ELIGIBLE[0].id, assignments: [], summaryForUser: "",
        reasons: ["Đúng loại hỗ trợ"],
        evidenceRefs: input.ELIGIBLE[0].evidenceRefs,
      });
    assert.equal(body.text.format.name, "guardian_route_decision");
    return response({
      selectedRouteId: input.OPTIONS[1].routeId,
      reasons: ["Chọn phương án thứ hai theo dữ liệu"],
      evidenceRefs: input.OPTIONS[1].evidenceRefs,
      assessments: input.OPTIONS.map((o: any) => ({
        routeId: o.routeId,
        reasons: ["Đã so sánh với dữ kiện"],
        evidenceRefs: o.evidenceRefs,
      })),
    });
  });
  const { e, i, m, c } = await prepared(ai);
  e.setAI(i, true, true);
  await e.partnerTranscript(i, m, c.id, "PARTNER", complete, "reply");
  const plan = active(i)!,
    d = i.routeDecisions!.find((d) => d.id === plan.routeDecisionId)!;
  assert.equal(d.mode, "AI_LIVE");
  assert.equal(plan.route.id, d.selectedRouteId);
  assert.match(plan.route.id, /-alt-/);
  assert.ok(d.runId && d.placeDecision?.runId);
  assert.equal(coordinationSummary(i).plan?.routeDecision?.mode, "AI_LIVE");
  assert.ok(dossier(i).routeDecisions.some((record) => record.id === d.id));
  assert.match(
    dossierHtml(i, e.store.reportIntegrity(i.id)),
    /Quyết định điểm đến và tuyến/,
  );
  assert.ok(
    e.store
      .reportHistory(i.id)
      .some((r) => r.snapshot.routeDecisions?.some((x) => x.id === d.id)),
  );
  assert.equal(e.store.reportIntegrity(i.id).valid, true);
  e.close(i, true);
});

test("Offline selection and route monitor remain bounded and cannot silently replace an accepted plan", async () => {
  const { e, i, m, c } = await prepared();
  await e.partnerTranscript(i, m, c.id, "PARTNER", complete, "reply");
  const before = active(i)!;
  e.acceptRoute(i, before.id);
  assert.equal(
    i.routeDecisions!.find((d) => d.id === before.routeDecisionId)?.mode,
    "RULES_FALLBACK",
  );
  assert.equal(e.routeWorker.monitor(i), null);
  assert.equal(e.routeWorker.monitor(i), null);
  i.blockedEdges = [before.route.edges![1]];
  e.tickRouteAgent(i);
  await until(() => !!active(i) && active(i)!.id !== before.id);
  assert.equal(before.superseded, true);
  assert.equal(active(i)?.acceptedAt, undefined);
  assert.ok(!active(i)!.route.edges!.includes(i.blockedEdges[0]));
  e.close(i, true);
  assert.equal(e.routeWorker.monitor(i), null);
});

test("Reports retain old incidents, append non-event updates, survive reopen, and expose content tampering", () => {
  const file = join(tmpdir(), `guardian-report-${randomUUID()}.sqlite`);
  let store = new Store(file);
  try {
    const e = new GuardianEngine(store, 5, new AIService(() => null)),
      i = e.create("owner");
    i.updatedAt = "2020-01-01T00:00:00.000Z";
    store.save(i);
    const before = store.reportHistory(i.id).length;
    store.save(i);
    assert.equal(
      store.reportHistory(i.id).length,
      before,
      "Identical saves do not duplicate revisions",
    );
    i.transcript.push({
      speaker: "Bạn",
      text: "Original",
      time: i.updatedAt,
      source: "MIC",
    });
    store.save(i);
    assert.equal(
      store.reportHistory(i.id).length,
      before + 1,
      "Transcript-only writes are captured",
    );
    assert.ok(
      !JSON.stringify(store.reportHistory(i.id)).includes('"owner":"owner"'),
    );
    store.db.close();
    store = new Store(file);
    assert.ok(
      store.load(i.id),
      "Opening the app does not purge evidence after 24h",
    );
    assert.equal(store.reportIntegrity(i.id).valid, true);
    store.db
      .prepare(
        "UPDATE report_revisions SET payload=? WHERE incident_id=? AND seq=1",
      )
      .run("{}", i.id);
    assert.equal(store.reportIntegrity(i.id).valid, false);
    store.deleteReportHistory(i.id);
    assert.deepEqual(store.reportHistory(i.id), []);
  } finally {
    store.db.close();
    for (const suffix of ["", "-wal", "-shm"])
      if (existsSync(file + suffix)) unlinkSync(file + suffix);
  }
});

test("Cancelling during GPT route choice rejects the late result and starts no further extraction", async () => {
  let release!: () => void,
    callsAfterCancel = 0,
    cancelled = false;
  const ai = new AIService(config, async (_url, init) => {
    if (cancelled) callsAfterCancel++;
    const body = JSON.parse(String(init!.body)),
      input = JSON.parse(body.input);
    if (body.text.format.name === "guardian_plan")
      return response({
        selectedPlaceId: input.ELIGIBLE[0].id, assignments: [], summaryForUser: "",
        reasons: ["Đủ dữ kiện"],
        evidenceRefs: input.ELIGIBLE[0].evidenceRefs,
      });
    assert.equal(body.text.format.name, "guardian_route_decision");
    await new Promise<void>((r) => {
      release = r;
    });
    return response({
      selectedRouteId: input.OPTIONS[0].routeId,
      reasons: ["Kết quả muộn"],
      evidenceRefs: input.OPTIONS[0].evidenceRefs,
      assessments: input.OPTIONS.map((o: any) => ({
        routeId: o.routeId,
        reasons: ["Có dữ liệu"],
        evidenceRefs: o.evidenceRefs,
      })),
    });
  });
  const { e, i, m, c } = await prepared(ai);
  e.setAI(i, true, true);
  const work = e.partnerTranscript(i, m, c.id, "PARTNER", complete, "reply");
  await until(() => !!release);
  cancelled = true;
  e.close(i, true);
  release();
  await work;
  assert.equal(i.status, "USER_CANCELLED");
  assert.equal(active(i), undefined);
  assert.equal(
    i.routeDecisions?.some((d) => d.mode === "AI_LIVE"),
    undefined,
  );
  assert.equal(callsAfterCancel, 0);
});
