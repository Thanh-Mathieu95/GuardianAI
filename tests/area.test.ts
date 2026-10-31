import { test } from "node:test";
import assert from "node:assert/strict";
import {
  places,
  placeProfile,
  isOpen,
  roadWarnings,
  roadCondition,
} from "../lib/city";
import { Engine, activePlan, fresh } from "../lib/engine";
import { Repository } from "../lib/repository";
import { admission } from "../lib/rules";
import { analyze, recommend, realtimeSecret } from "../lib/ai";
test("area profiles distinguish opening, capability and a commitment", () => {
  const cafe = placeProfile(places[0], 1335),
    closed = placeProfile(places[0], 180);
  assert.equal(cafe.openingStatus, "OPEN");
  assert.equal(closed.openingStatus, "CLOSED");
  assert.ok(cafe.services.length);
  assert.ok(cafe.limitations.some((p) => p[1].includes("does not mean")));
  const atm = placeProfile(places.find((p) => p.kind === 6)!);
  assert.equal(atm.staffed, false);
  assert.equal(atm.waiting, false);
  assert.equal(atm.source, "SIMULATED");
  assert.ok(roadWarnings.some((r) => r.condition === "DARK"));
  assert.ok(roadWarnings.some((r) => r.condition === "INCIDENT"));
  for (const road of roadWarnings)
    assert.equal(road.source, roadCondition(road.id).source);
});
test("closing a confirmed venue invalidates its guidance and alternatives need acceptance", async () => {
  const e = new Engine(new Repository(":memory:", ""));
  try {
    const a = await e.account("hours");
    await e.startDemo(a, "en");
    for (let n = 0; n < 5; n++) await e.demoStep(a.incident);
    const old = activePlan(a.incident)!,
      reply = a.incident.replies.find((r) => r.id === old.replyId)!;
    assert.equal(reply.memberId, "venue-cafe");
    assert.ok(old.acceptedAt);
    a.incident.scenarioMinute = 180;
    assert.equal(isOpen(places[0], 180), false);
    assert.ok(admission(a.incident, reply).includes("VENUE_CLOSED"));
    await e.plan(a.incident);
    assert.ok(old.invalidatedAt);
    assert.notEqual(activePlan(a.incident)?.replyId, reply.id);
    assert.equal(activePlan(a.incident)?.acceptedAt, null);
  } finally {
    await e.repo.close();
  }
});
test("AI receives sourced capabilities and road context only in simulated sessions", async () => {
  const saved = {
      key: process.env.OPENAI_API_KEY,
      enabled: process.env.AI_ENABLED,
      url: process.env.PUBLIC_URL,
    },
    previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "isolated-test-credential";
  process.env.AI_ENABLED = "true";
  delete process.env.PUBLIC_URL;
  const bodies: Record<string, unknown>[] = [];
  const e = new Engine(new Repository(":memory:", ""));
  try {
    const a = await e.account("ai-context");
    await e.startDemo(a, "en");
    for (let n = 0; n < 3; n++) await e.demoStep(a.incident);
    const candidates = a.incident.replies.filter(
      (r) => !admission(a.incident, r).length,
    );
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      const output =
        body.text?.format?.name === "guardian_plan"
          ? { replyId: candidates[0].id, evidenceIds: [candidates[0].id] }
          : {
              reply: "Synthetic test response",
              intent: "CHAT",
              reason: "Test",
            };
      return Response.json(
        body.session
          ? { value: "ephemeral-test-value" }
          : {
              output: [
                {
                  content: [
                    { type: "output_text", text: JSON.stringify(output) },
                  ],
                },
              ],
            },
      );
    };
    await analyze(a.incident, "Which places have a waiting area?");
    const area = JSON.parse(String(bodies.at(-1)!.input)).area;
    assert.equal(area.source, "SIMULATED");
    assert.ok(area.roadWarnings.length);
    assert.ok(
      area.places.every(
        (p: { openingStatus: string; limitations: unknown[] }) =>
          p.openingStatus === "OPEN" && p.limitations.length,
      ),
    );
    await recommend(a.incident, candidates);
    assert.ok(
      JSON.parse(String(bodies.at(-1)!.input)).candidates[0].profile.services
        .length,
    );
    await analyze(fresh("LIVE", "en"), "Where can I wait?");
    assert.equal(JSON.parse(String(bodies.at(-1)!.input)).area, null);
    a.incident.ai.enabled = true;
    a.incident.ai.consentedAt = new Date().toISOString();
    await realtimeSecret(a.incident, "USER");
    assert.ok(JSON.stringify(bodies.at(-1)).includes("SIMULATED AREA DATA"));
  } finally {
    globalThis.fetch = previousFetch;
    if (saved.key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = saved.key;
    if (saved.enabled === undefined) delete process.env.AI_ENABLED;
    else process.env.AI_ENABLED = saved.enabled;
    if (saved.url === undefined) delete process.env.PUBLIC_URL;
    else process.env.PUBLIC_URL = saved.url;
    await e.repo.close();
  }
});
