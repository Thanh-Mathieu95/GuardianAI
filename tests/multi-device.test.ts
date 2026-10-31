import { test } from "node:test";
import assert from "node:assert/strict";
import { rolePath, publicOrigin, verifiedPublicUrl } from "../lib/links";
import { TranscriptQueue } from "../lib/transcript-queue";
import { GuardianEngine } from "../lib/engine";
import { Store } from "../lib/store";
import { AIService } from "../lib/ai";
import { receiverView } from "../lib/receiver";
import type { Incident } from "../lib/types";
import { contactInstructions, contactTools } from "../lib/realtime";

const active = (i: Incident) => i.plans.find(p => !p.superseded);
const pause = (ms = 5) => new Promise<void>(resolve => setTimeout(resolve, ms));
async function until(predicate: () => boolean) { for (let n = 0; n < 200; n++) { if (predicate()) return; await pause(); } throw new Error("Timeout"); }

test("The family voice agent collects capabilities without permission to transfer the call to the user", () => {
  const e = new GuardianEngine(new Store(":memory:"), 5);
  const m = e.network.create("owner", "CONTACT", "Mẹ");
  const i = e.create("owner");
  const names = contactTools.map(tool => tool.name);
  assert.ok(names.includes("report_contact_capability"));
  assert.ok(!names.includes("connect_to_user"), "AI must not terminate its interview by initiating a direct call");
  const instructions = contactInstructions(i, m, e.network.settings("owner"));
  assert.ok(!instructions.includes("gọi connect_to_user"));
  assert.match(instructions, /Không nối máy/);
  e.close(i, true);
});

test("Role-play links remain relative to the current server, never an unrelated tunnel", () => {
  const link = rolePath("member-token");
  assert.equal(new URL(link, "http://127.0.0.1:3108").origin, "http://127.0.0.1:3108");
  assert.equal(new URL(link, "https://example.test").origin, "https://example.test");
  assert.equal(publicOrigin("https://example.test/"), "https://example.test");
  for (const input of ["http://example.test", "https://user:password@example.test", "https://example.test/path"]) assert.equal(publicOrigin(input), null);
});
test("A public invite URL must reach the same running instance", async () => {
  const probe = (instanceId: string) => async () => Response.json({ service: "guardian-ai", instanceId });
  assert.equal(await verifiedPublicUrl("https://wrong.example.test", "local-a", probe("local-b")), null);
  assert.equal(await verifiedPublicUrl("https://right.example.test", "local-a", probe("local-a")), "https://right.example.test");
  assert.equal(await verifiedPublicUrl("https://offline.example.test", "local-a", async () => { throw new Error("offline"); }), null);
});
test("A voice tool waits for delayed original transcription and its completed persistence", async () => {
  const queue = new TranscriptQueue(); queue.expect("audio-1");
  let done = false, release!: () => void;
  const ready = queue.ready().then(value => { done = true; return value; });
  await pause(); assert.equal(done, false);
  const write = queue.append("audio-1", () => new Promise<void>(resolve => { release = resolve; }));
  await pause(); assert.equal(done, false);
  release(); await write; assert.equal(await ready, true);
});
test("Missing or failed transcript blocks consent; duplicate events and independent sessions stay isolated", async () => {
  const a = new TranscriptQueue(), b = new TranscriptQueue();
  a.expect("missing"); assert.equal(await a.ready(10), false); assert.equal(await b.ready(10), true);
  let writes = 0;
  await b.append("same-event", async () => { writes++; });
  await b.append("same-event", async () => { writes++; }); assert.equal(writes, 1);
  const broken = new TranscriptQueue(); broken.expect("failed");
  await assert.rejects(broken.append("failed", async () => { throw new Error("HTTP failure"); }));
  assert.equal(await broken.ready(10), false);
});

test("Transcript writes stay ordered after a storage failure and tools remain blocked", async () => {
  const queue = new TranscriptQueue();
  const firstStarted = Promise.withResolvers<void>();
  const releaseFirst = Promise.withResolvers<void>();
  const events: string[] = [];
  const storageError = new Error("Simulated transcript storage failure");
  queue.expect("first-audio");
  queue.expect("second-audio");

  const firstWrite = queue.append("first-audio", async () => {
    events.push("first started");
    firstStarted.resolve();
    await releaseFirst.promise;
    events.push("first failed");
    throw storageError;
  });
  const rejectedWrite = assert.rejects(firstWrite, (error) => error === storageError);
  const secondWrite = queue.append("second-audio", async () => {
    events.push("second stored");
  });
  const ready = queue.ready();

  try {
    await firstStarted.promise;
    assert.deepEqual(events, ["first started"]);
  } finally {
    releaseFirst.resolve();
  }

  await rejectedWrite;
  await secondWrite;
  assert.deepEqual(events, ["first started", "first failed", "second stored"]);
  assert.equal(await ready, false, "A later successful write cannot erase a failed transcript");
});

test("A transcription failure releases waiting tools without granting consent", { timeout: 1000 }, async () => {
  const queue = new TranscriptQueue();
  queue.expect("untranscribed-audio");
  const ready = queue.ready();

  queue.fail("untranscribed-audio");

  // This must resolve from the failure notification, before the 25-second timeout.
  assert.equal(await ready, false);
  assert.equal(await queue.ready(), false);
});

test("Three web partners speak independently: ambiguous stays pending, natural confirmation is extracted, revocation revises the accepted plan", async () => {
  const histories: { speaker: string; text: string }[][] = [];
  const ai = new AIService(() => ({ provider: "OPENAI", key: "mock", model: "mock-model", baseUrl: "https://mock.invalid", timeoutMs: 1000 }), async (_url, init) => {
    const body = JSON.parse(init!.body as string), input = JSON.parse(body.input);
    let data: unknown;
    if (body.text.format.name === "guardian_support_facts") {
      const history = input.HISTORY as { speaker: string; text: string }[];
      histories.push(history);
      const turn = history.findLastIndex(t => t.speaker !== "Guardian AI"), text = history[turn].text;
      data = { facts: text.includes("Cứ đến sảnh chính") ? [
        { field: "ACCEPTED", quote: "Tôi đồng ý", value: "", turn },
        { field: "WAITING_SPACE", quote: "có ghế ngồi chờ", value: "", turn },
        { field: "ENTRANCE", quote: "Cứ đến sảnh chính", value: "sảnh chính", turn },
        { field: "CONDITION", quote: "Không cần thủ tục", value: "Không cần thủ tục", turn },
      ] : [] };
    } else if (input.ELIGIBLE) data = { selectedPlaceId: input.ELIGIBLE[0].id, assignments: [], summaryForUser: "", reasons: ["Đủ dữ kiện"], evidenceRefs: input.ELIGIBLE[0].evidenceRefs };
    else throw new Error("Unexpected model call");
    return Response.json({ status: "completed", output: [{ content: [{ type: "output_text", text: JSON.stringify(data) }] }] });
  });
  const e = new GuardianEngine(new Store(":memory:"), 5, ai);
  const members = ["A", "B", "C"].map(name => { const m = e.network.create("owner", "PARTNER", name); return e.network.update(m.id, { joined: true }); });
  const i = e.create("owner", { networkOnly: true });
  await e.sos(i, "Tôi cần một nơi chờ"); await until(() => i.calls.length === 3); e.setAI(i, true, true);
  const calls = members.map(m => i.calls.find(c => c.memberId === m.id)!);
  assert.ok(calls.every(c => c.providerMode === "APP"));
  members.forEach((m, n) => e.partnerAnswer(i, m, calls[n].id));
  await Promise.all([
    e.partnerTranscript(i, members[0], calls[0].id, "PARTNER", "Xin lỗi, chúng tôi không thể tiếp nhận.", "a-1"),
    e.partnerTranscript(i, members[1], calls[1].id, "PARTNER", "Chắc được, chỉ nhận ở cửa sau.", "b-1"),
    e.partnerTranscript(i, members[2], calls[2].id, "PARTNER", "Tôi đồng ý. Cứ đến sảnh chính, có ghế ngồi chờ. Không cần thủ tục.", "c-1"),
  ]);
  await until(() => !!active(i));
  assert.equal(calls[0].support?.decision, "DECLINED");
  assert.equal(calls[1].support?.decision, "CLARIFY");
  assert.equal(calls[2].support?.decision, "ACCEPTED");
  assert.equal(active(i)?.selectedPlaceId, calls[2].placeId);
  await e.partnerDecide(i, members[2], calls[2].id, true, "Model note is not evidence", true);
  assert.equal(calls[2].support?.entrance, "sảnh chính", "The tool must preserve validated semantic extraction");
  e.acceptRoute(i); const original = active(i)!;
  await e.partnerTranscript(i, members[1], calls[1].id, "PARTNER", "Đồng ý tiếp nhận, có chỗ chờ. Cửa vào: cửa sau. Điều kiện: không yêu cầu thêm.", "b-2");
  assert.equal(active(i)?.id, original.id, "A later option does not flip accepted guidance");
  await e.partnerTranscript(i, members[2], calls[2].id, "PARTNER", "Rút lại xác nhận, không còn tiếp nhận.", "c-2");
  await until(() => active(i)?.selectedPlaceId === calls[1].placeId);
  assert.equal(original.superseded, true); assert.equal(active(i)?.acceptedAt, undefined);
  const length = calls[2].transcript.length;
  await e.partnerTranscript(i, members[2], calls[2].id, "PARTNER", "Tôi đồng ý", "c-1");
  assert.equal(calls[2].transcript.length, length);
  assert.throws(() => e.partnerCall(i, members[0], calls[2].id), /NOT_FOUND/);
  for (const history of histories) assert.ok(new Set(history.filter(t => t.speaker !== "Guardian AI").map(t => t.speaker)).size <= 1);
  const view = receiverView(e, members[1]).incident;
  assert.ok(view?.kind === "PARTNER" && view.transcript.every(t => ["B", "Guardian AI"].includes(t.speaker)));
  e.close(i, true);
});
