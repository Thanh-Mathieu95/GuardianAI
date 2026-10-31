import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Engine, activePlan } from "../lib/engine";
import { Repository, digest } from "../lib/repository";
import { routeDistance } from "../lib/rules";

test("expired commitment is invalidated at the monitor timestamp", async () => {
  const e = new Engine(new Repository(":memory:", "")),
    a = await e.account("expiry");
  await e.startDemo(a, "vi");
  for (let n = 0; n < 3; n++) await e.demoStep(a.incident);
  const plan = activePlan(a.incident)!;
  a.incident.demo = null;
  await e.tick(a, Date.now() + 16 * 60000);
  assert.ok(plan.invalidatedAt);
  assert.equal(activePlan(a.incident), undefined);
  await e.repo.close();
});
test("no-answer is distinct from refusal and later replies are still accepted", async () => {
  const e = new Engine(new Repository(":memory:", "")),
    a = await e.account("timeout");
  await e.sos(a, "Help me");
  await e.tick(a, Date.now() + 46000);
  assert.ok(a.incident.replies.every((r) => r.state === "NO_ANSWER"));
  await e.reply(a.incident, "venue-cafe", "Đồng ý, bạn có thể vào chờ.", false);
  assert.ok(activePlan(a.incident));
  await e.repo.close();
});
test("a blocked live route cannot be revived by another response", async () => {
  const e = new Engine(new Repository(":memory:", "")),
    a = await e.account("blocked");
  await e.startDemo(a, "en");
  for (let n = 0; n < 3; n++) await e.demoStep(a.incident);
  a.incident.mode = "LIVE";
  a.incident.location!.source = "LIVE";
  a.incident.replies.forEach((r) => (r.simulated = false));
  await e.block(a.incident);
  await e.reply(
    a.incident,
    "venue-shop",
    "I accept. You can wait here.",
    false,
  );
  assert.equal(activePlan(a.incident), undefined);
  await e.repo.close();
});
test("off-route measurement uses the segment midpoint", () => {
  const route = [
    { lat: 10, lng: 106 },
    { lat: 10, lng: 106.01 },
  ];
  assert.ok(routeDistance({ lat: 10, lng: 106.005 }, route) < 1);
  assert.ok(routeDistance({ lat: 10.001, lng: 106.005 }, route) > 100);
});
test("audio and metadata commit together, persist across restart, and hash raw bytes", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "guardian-qa-"));
  const filename = path.join(dir, "store.sqlite");
  let repo = new Repository(filename, "");
  try {
    const e = new Engine(repo),
      a = await e.account("audio");
    const bytes = Buffer.from([0, 1, 2, 255]);
    repo.stageAudio(a, {
      id: "fixture",
      seq: 0,
      mime: "audio/webm",
      payload: bytes.toString("base64"),
      hash: digest(bytes),
    });
    a.incident.recordings.push({
      id: "fixture",
      chunks: 1,
      bytes: 4,
      mime: "audio/webm",
      hash: digest(bytes),
    });
    await repo.save(a);
    const stale = structuredClone(a);
    await repo.save(a);
    repo.stageAudio(stale, {
      id: "rollback",
      seq: 0,
      mime: "audio/webm",
      payload: "AA==",
      hash: digest(Buffer.from([0])),
    });
    await assert.rejects(repo.save(stale), /STATE_CONFLICT/);
    assert.equal(
      (
        await repo.query("SELECT id FROM guardian_audio WHERE id=$1", [
          "rollback",
        ])
      ).length,
      0,
    );
    await repo.close();
    repo = new Repository(filename, "");
    assert.equal(
      (await repo.load("audio"))?.incident.recordings[0].hash,
      digest(bytes),
    );
    assert.notEqual(digest(bytes), digest(bytes.toString("base64")));
    assert.equal((await repo.integrity(a.incident.id)).valid, true);
  } finally {
    await repo.close();
    if (
      path.dirname(dir) !== tmpdir() ||
      !path.basename(dir).startsWith("guardian-qa-")
    )
      throw new Error("UNSAFE_TEST_CLEANUP");
    await rm(dir, { recursive: true, force: true });
  }
});
