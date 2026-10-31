import assert from "node:assert/strict";
import type { Incident } from "../lib/types";
import { emptyNeeds } from "../lib/support";
const base = process.env.GUARDIAN_TEST_URL || "http://127.0.0.1:3000";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function main() {
  const session = await fetch(base + "/api/session"),
    cookie = session.headers.get("set-cookie")!.split(";")[0],
    data = await session.json();
  const token = data.operatorToken;
  if (!token)
    throw new Error(
      "Run tests with OPERATOR_PASSWORD unset in a local test environment.",
    );
  const headers = {
    "Content-Type": "application/json",
    Origin: new URL(base).origin,
    Cookie: cookie,
    "x-operator-token": token,
  };
  const post = async (
    path: string,
    body: unknown,
    custom: Record<string, string> = headers,
  ) => {
    const r = await fetch(base + "/api/" + path, {
      method: "POST",
      headers: custom,
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  };
  const fresh = await post("incidents", { scenario: "NIGHT_WALK" });
  assert.equal(fresh.status, 201);
  const id = fresh.body.id;
  const aiConfigResponse = await fetch(base + "/api/ai/config", {
      headers: { Cookie: cookie },
    }),
    aiConfig = await aiConfigResponse.json();
  assert.equal(aiConfigResponse.status, 200);
  assert.equal("key" in aiConfig, false);
  assert.equal("OPENAI_API_KEY" in aiConfig, false);
  assert.equal(
    (await post(`incidents/${id}/message`, { text: "Xin chào AI" })).status,
    409,
  );
  assert.equal(
    (await post(`incidents/${id}/ai/enable`, { enabled: true, consent: false }))
      .status,
    409,
  );
  assert.equal(
    (
      await post(
        "ai/test",
        {},
        {
          "Content-Type": "application/json",
          Cookie: cookie,
          Origin: new URL(base).origin,
        },
      )
    ).status,
    403,
  );
  assert.equal(
    (await post("incidents", { aiEnabled: true, aiConsent: false })).status,
    400,
  );
  if (!aiConfig.configured)
    assert.equal((await post("ai/test", {})).status, 409);
  assert.equal(
    (
      await post(
        `incidents/${id}/inject`,
        { action: "GPS_STALE" },
        { "Content-Type": "application/json", Cookie: cookie },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await post(
        `incidents/${id}/sos`,
        { text: "SOS" },
        { ...headers, Origin: "https://untrusted.invalid" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await post(`incidents/${id}/location`, {
        lat: 999,
        lng: 0,
        consent: true,
      })
    ).status,
    400,
  );
  const second = await fetch(base + "/api/session"),
    otherCookie = second.headers.get("set-cookie")!.split(";")[0];
  assert.equal(
    (
      await fetch(base + `/api/incidents/${id}`, {
        headers: { Cookie: otherCookie },
      })
    ).status,
    404,
  );
  const controller = new AbortController(),
    stream = await fetch(base + `/api/incidents/${id}/stream`, {
      headers: { Cookie: cookie },
      signal: controller.signal,
    });
  assert.ok(stream.headers.get("content-type")?.includes("text/event-stream"));
  const reader = stream.body!.getReader();
  let streamText = "";
  const monitor = (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        streamText += new TextDecoder().decode(value);
      }
    } catch {
      /* Expected on abort. */
    }
  })();
  const sos = await post(`incidents/${id}/sos`, {
    text: "Guardian, có người đang đi theo tôi. Hãy giúp tôi.",
  });
  assert.equal(sos.status, 202);
  async function snapshot() {
    const r = await fetch(base + `/api/incidents/${id}`, {
      headers: { Cookie: cookie },
    });
    assert.equal(r.status, 200);
    return r.json();
  }
  async function until(predicate: (s: Incident) => boolean) {
    for (let n = 0; n < 120; n++) {
      const s = await snapshot();
      if (predicate(s)) return s;
      await sleep(100);
    }
    throw new Error("Timed out waiting for backend state");
  }
  const researched = await until((s) => s.places.length >= 3 && !s.running);
  assert.equal(researched.status, "CONTACTING");
  assert.equal(
    (await post(`incidents/${id}/calls/start`, { provider: "MOCK" })).status,
    202,
  );
  const routed = await until((s) => s.plans.length === 1 && !s.running);
  assert.deepEqual(
    routed.calls.map((c: { status: string }) => c.status).sort(),
    ["DECLINED", "CONFIRMED", "NO_ANSWER"].sort(),
  );
  const blocked = await post(`incidents/${id}/inject`, {
    action: "ROAD_BLOCKED",
  });
  assert.equal(blocked.status, 202);
  assert.equal(blocked.body.plans.length, 2);
  assert.equal(blocked.body.plans[0].superseded, true);
  const replay = await fetch(base + `/api/incidents/${id}/replay`, {
    headers: { Cookie: cookie },
  });
  assert.ok((await replay.json()).length > 10);
  assert.ok(streamText.includes("SOS_TRIGGERED"));
  assert.ok(streamText.includes("CONFIRMED"));
  const reset = await post(`incidents/${id}/reset`, {});
  assert.equal(reset.status, 201);
  await sleep(100);
  assert.ok(
    streamText.includes(reset.body.id),
    "SSE must follow new incident across tabs",
  );
  controller.abort();
  await monitor;
  const previous = await snapshot();
  assert.equal(previous.status, "USER_CANCELLED");
  assert.equal(
    (await post(`incidents/${id}/route/accept`, {})).status,
    409,
    "Closed incidents cannot resume guiding",
  );
  assert.equal((await post(`incidents/${id}/freeze`, {})).status, 409);
  assert.equal(reset.body.plans.length, 0);
  assert.equal((await fetch(base + "/demo/phone")).status, 200);
  assert.equal((await fetch(base + "/demo/control")).status, 200);
  assert.equal((await fetch(base + "/demo/calls")).status, 200);
  assert.equal((await fetch(base + "/demo/architecture")).status, 200);
  const demo = await post(`incidents/${reset.body.id}/demo/run`, {
    demoCase: "CLARIFY",
    needs: emptyNeeds(),
    text: "Tôi cần một nơi chờ trong demo",
  });
  assert.equal(demo.status, 202);
  const demoId = demo.body.id;
  async function demoState() {
    return (
      await fetch(base + `/api/incidents/${demoId}`, {
        headers: { Cookie: cookie },
      })
    ).json() as Promise<Incident>;
  }
  let demoSnapshot = await demoState();
  for (
    let n = 0;
    n < 150 && (demoSnapshot.running || !demoSnapshot.calls.length);
    n++
  ) {
    await sleep(100);
    demoSnapshot = await demoState();
  }
  const proposal = demoSnapshot.plans.find((p) => !p.superseded)!;
  assert.ok(proposal);
  assert.ok(demoSnapshot.calls.some((c) => (c.questions?.length ?? 0) > 1));
  assert.equal(
    (
      await post(`incidents/${demoId}/route/accept`, {
        planId: "obsolete-plan",
      })
    ).status,
    409,
  );
  const liveStatus = await post(`incidents/${demoId}/tool`, { name: "get_status", args: {} });
  assert.equal(liveStatus.status, 200);
  const coordination = JSON.parse(liveStatus.body.output).coordination;
  assert.equal(coordination.plan.id, proposal.id);
  assert.equal(coordination.guidance, "AWAITING_ACCEPTANCE");
  assert.deepEqual(coordination.plan.route.steps, []);
  assert.equal((await post(`incidents/${demoId}/tool`, { name: "accept_route", args: {} })).status, 400);
  assert.equal((await post(`incidents/${demoId}/tool`, { name: "accept_route", args: { plan_id: "obsolete-plan" } })).status, 409);
  assert.equal(
    (
      await post(`incidents/${demoId}/handoff`, {
        side: "USER",
        planId: proposal.id,
      })
    ).status,
    409,
  );
  assert.equal(
    (await post(`incidents/${demoId}/route/accept`, { planId: proposal.id }))
      .status,
    202,
  );
  const selectedCall = demoSnapshot.calls.find(
    (c) => c.placeId === proposal.selectedPlaceId,
  )!;
  assert.equal(
    (
      await post(`incidents/${demoId}/demo/update`, {
        callId: selectedCall.id,
        generation: selectedCall.generation + 1,
        text: "Đồng ý tiếp nhận",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await post(`incidents/${demoId}/demo/family`, {
        action: "ON_THE_WAY",
        arrivalMinutes: 6,
      })
    ).status,
    202,
  );
  assert.equal(
    (
      await post(`incidents/${demoId}/handoff`, {
        side: "USER",
        planId: proposal.id,
      })
    ).status,
    202,
  );
  assert.notEqual((await demoState()).status, "CLOSED");
  assert.equal(
    (
      await post(
        `incidents/${demoId}/handoff`,
        { side: "PARTNER", planId: proposal.id },
        { ...headers, "x-operator-token": "" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await post(`incidents/${demoId}/handoff`, {
        side: "PARTNER",
        planId: proposal.id,
      })
    ).status,
    202,
  );
  assert.equal((await demoState()).status, "CLOSED");
  const historyResponse = await fetch(base + `/api/incidents/${demoId}/report-history`, { headers: { Cookie: cookie } });
  assert.equal(historyResponse.status, 200);
  const history = await historyResponse.json();
  assert.equal(history.integrity.valid, true);
  assert.ok(history.revisions.length > 1);
  assert.ok(history.revisions.some((r: { snapshot: Incident }) => r.snapshot.routeDecisions?.length));
  assert.equal((await fetch(base + `/api/incidents/${demoId}/report-history`, { headers: { Cookie: otherCookie } })).status, 404);
  const report = await (await fetch(base + `/api/incidents/${demoId}/evidence?format=json`, { headers: { Cookie: cookie } })).json();
  assert.equal(report.schemaVersion, 2);
  assert.ok(report.plans.length && report.routeDecisions.length && report.handoff.completedAt);
  assert.equal((await post(`incidents/${demoId}/transcript/delete`, {})).status, 202);
  const redacted = await (await fetch(base + `/api/incidents/${demoId}/report-history`, { headers: { Cookie: cookie } })).json();
  assert.equal(redacted.revisions.length, 1, "Explicit transcript deletion also removes historical report payloads");
  assert.deepEqual(redacted.revisions[0].snapshot.routeDecisions, []);
  assert.ok(redacted.revisions[0].snapshot.calls.every((c: Incident["calls"][number]) => !c.transcript.length && !c.support));
  assert.equal(redacted.integrity.valid, true);
  const spokenDemo = await post(`incidents/${demoId}/demo/showcase`, { pace: "QUICK", voiceEnabled: true });
  assert.equal(spokenDemo.status, 202);
  const spokenId = spokenDemo.body.id;
  const spokenState = async () => (await (await fetch(base + `/api/incidents/${spokenId}`, { headers: { Cookie: cookie } })).json()) as Incident;
  const opening = await spokenState();
  assert.equal(opening.showcase?.step, 0);
  assert.equal(opening.showcase?.voiceEnabled, true);
  const narrationId = opening.showcase!.narrationId!;
  assert.equal((await post(`incidents/${spokenId}/demo/narration`, { narrationId, playback: "FINISHED" }, { ...headers, "x-operator-token": "" })).status, 403);
  assert.equal((await post(`incidents/${spokenId}/demo/narration`, { narrationId: "00000000-0000-4000-8000-000000000000", playback: "FINISHED" })).body.applied, false);
  assert.equal((await post(`incidents/${spokenId}/freeze`, {})).status, 202);
  assert.equal((await post(`incidents/${spokenId}/demo/narration`, { narrationId, playback: "SKIPPED" })).body.applied, true);
  assert.equal((await spokenState()).showcase?.step, 0, "A skip must not defeat pause");
  assert.equal((await post(`incidents/${spokenId}/demo/pacing`, { pace: "PRESENTATION", voiceEnabled: false })).status, 202);
  assert.equal((await spokenState()).showcase?.pace, "PRESENTATION");
  assert.equal((await post(`incidents/${spokenId}/demo/stop`, {})).status, 202);
  assert.equal((await post(`incidents/${spokenId}/demo/narration`, { narrationId, playback: "FINISHED" })).body.applied, false);
  assert.equal((await spokenState()).showcase?.status, "STOPPED");
  const world = await post("incidents", { placesAdapter: "CITY", routeAdapter: "CITY" });
  assert.equal(world.status, 201);
  const worldId = world.body.id;
  assert.equal(world.body.places.length, 30);
  assert.ok(world.body.places.every((p: Incident["places"][number]) => p.profile?.sourceKind === "SIMULATED"));
  assert.equal((await post(`incidents/${worldId}/world/time`, { time: "25:00" })).status, 400);
  assert.equal((await post(`incidents/${worldId}/world/time`, { time: "23:30" }, { ...headers, "x-operator-token": "" })).status, 403);
  const night = await post(`incidents/${worldId}/world/time`, { time: "23:30" });
  assert.equal(night.status, 202);
  assert.equal(night.body.places.find((p: Incident["places"][number]) => p.id === "c").openingStatus, "CLOSED");
  assert.equal((await post(`incidents/${worldId}/world/time`, { time: "22:15" })).status, 202);
  const extraSlot = await post("network/members", { role: "PARTNER", name: "Vai cà phê đêm QA", slot: "cafe-night" });
  assert.equal(extraSlot.status, 201);
  assert.equal(extraSlot.body.slot, "cafe-night");
  console.log(
    "PASS: HTTP state flow, policy/operator, origin, validation, session isolation, SSE, revision, replay, reset, demo clarification, stale callbacks/acceptance, family and two-sided handoff, 5 pages. No external calls.",
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
