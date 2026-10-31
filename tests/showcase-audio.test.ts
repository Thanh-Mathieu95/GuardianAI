import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { GuardianEngine } from "../lib/engine";
import { Store } from "../lib/store";
import { AIService } from "../lib/ai";
import { acknowledgeShowcase, waitForShowcaseStep } from "../lib/showcase";
import { playShowcaseNarration } from "../lib/showcase-audio";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
function setup() {
  const engine = new GuardianEngine(new Store(":memory:"), 1, new AIService(() => null));
  const incident = engine.create("audio-test", { simulatorOnly: true });
  incident.showcase = { status: "RUNNING", step: 0, title: "Test", narration: "Test", narrationId: randomUUID(), playback: "PENDING", pace: "PRESENTATION", voiceEnabled: true, startedAt: new Date().toISOString() };
  return { engine, incident };
}

test("Presentation waits for actual narration completion after minimum reading time", async () => {
  const { engine, incident } = setup();
  let finished = false;
  const job = waitForShowcaseStep(engine, incident, incident.generation).then(r => { finished = true; return r; });
  await sleep(55);
  assert.equal(finished, false, "A fixed short timer must not cut off speech");
  assert.equal(acknowledgeShowcase(incident, randomUUID(), "FINISHED"), false);
  assert.equal(finished, false);
  acknowledgeShowcase(incident, incident.showcase!.narrationId!, "FINISHED");
  assert.equal(await job, true);
  engine.close(incident, true); engine.store.db.close();
});

test("Silent presentation retains reading time; quick mode is explicitly shorter", async () => {
  const run = async (pace: "PRESENTATION" | "BALANCED" | "QUICK") => {
    const { engine, incident } = setup();
    incident.showcase!.voiceEnabled = false; incident.showcase!.pace = pace;
    let ticks = 0;
    engine.delay = async (_i, _g, multiplier = 1) => { ticks += multiplier; return true; };
    assert.equal(await waitForShowcaseStep(engine, incident, incident.generation), true);
    engine.close(incident, true); engine.store.db.close();
    return ticks;
  };
  assert.equal(await run("PRESENTATION"), 36);
  assert.equal(await run("BALANCED"), 16);
  assert.equal(await run("QUICK"), 8);
});

test("Missing browser audio times out visibly; skip and replay cannot affect another narration", async () => {
  const { engine, incident } = setup();
  engine.delay = async () => true;
  assert.equal(await waitForShowcaseStep(engine, incident, incident.generation), true);
  assert.equal(incident.showcase!.playback, "TIMED_OUT");
  assert.ok(incident.events.some(e => e.type === "SHOWCASE_AUDIO_TIMEOUT"));
  const old = incident.showcase!.narrationId!;
  incident.showcase!.narrationId = randomUUID(); incident.showcase!.playback = "PENDING";
  assert.equal(acknowledgeShowcase(incident, old, "SKIPPED"), false);
  const current = incident.showcase!.narrationId!;
  acknowledgeShowcase(incident, current, "FINISHED");
  acknowledgeShowcase(incident, current, "REPLAY");
  assert.equal(incident.showcase!.playback, "PENDING");
  acknowledgeShowcase(incident, current, "SKIPPED");
  acknowledgeShowcase(incident, current, "FINISHED");
  assert.equal(incident.showcase!.playback, "SKIPPED");
  engine.close(incident, true);
  assert.equal(acknowledgeShowcase(incident, current, "FINISHED"), false);
  engine.store.db.close();
});

function audio() {
  let utterance: SpeechSynthesisUtterance | undefined;
  let starts = 0, finishes = 0, failures = 0;
  const stop = playShowcaseNarration({ synthesis: { cancel() {}, speak(u) { utterance = u; } },
    createUtterance: () => ({} as SpeechSynthesisUtterance), text: "Mình đang tìm phương án khác.",
    onStart: () => starts++, onFinished: () => finishes++, onUnavailable: () => failures++,
    startTimeoutMs: 20, finishTimeoutMs: 25,
  });
  return { stop, get utterance() { return utterance!; }, get counts() { return { starts, finishes, failures }; } };
}
test("Narrator reports completion only on audio end and ignores duplicate callbacks", () => {
  const a = audio();
  a.utterance.onstart?.call(a.utterance, {} as SpeechSynthesisEvent);
  assert.deepEqual(a.counts, { starts: 1, finishes: 0, failures: 0 });
  a.utterance.onend?.call(a.utterance, {} as SpeechSynthesisEvent);
  a.utterance.onerror?.call(a.utterance, {} as SpeechSynthesisErrorEvent);
  assert.deepEqual(a.counts, { starts: 1, finishes: 1, failures: 0 });
  a.stop();
});
test("Pausing or changing steps cancels old speech without acknowledging it", () => {
  const a = audio(); a.stop();
  a.utterance.onend?.call(a.utterance, {} as SpeechSynthesisEvent);
  a.utterance.onerror?.call(a.utterance, {} as SpeechSynthesisErrorEvent);
  assert.deepEqual(a.counts, { starts: 0, finishes: 0, failures: 0 });
});
test("Blocked or stalled speech falls back to captions without deadlocking the demo", async () => {
  const blocked = audio(); await sleep(35);
  assert.equal(blocked.counts.failures, 1); assert.equal(blocked.counts.finishes, 0); blocked.stop();
  const stalled = audio(); stalled.utterance.onstart?.call(stalled.utterance, {} as SpeechSynthesisEvent);
  await sleep(40);
  assert.equal(stalled.counts.failures, 1); assert.equal(stalled.counts.finishes, 0); stalled.stop();
});
