import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Engine, activePlan } from "../lib/engine";
import { Repository } from "../lib/repository";
import {
  coordination,
  enqueueIncident,
  queueCall,
  pump,
  callActive,
  callEvent,
  deadlines,
  cancelCalls,
  assignCalls,
} from "../lib/calls";
import { discover, opening } from "../lib/directory";
import { caseFile } from "../lib/case-file";
import type { Member } from "../lib/types";

test("directory expands radius, checks timezone hours and never treats unlinked/open as consent", async () => {
  const e = new Engine(new Repository(":memory:", ""));
  try {
    const a = await e.account("directory");
    const members = e.demoMembers();
    coordination(a.incident).limits.initialRadius = 100;
    const p = members[0].profile!;
    p.timezone = "Asia/Ho_Chi_Minh";
    p.hours = [{ days: [5], open: 22 * 60, close: 2 * 60 }];
    const friday = Date.parse("2026-10-30T16:00:00Z");
    assert.equal(opening(p, friday), "OPEN");
    assert.equal(opening(p, friday + 2 * 3600000), "OPEN");
    assert.equal(opening(p, friday + 4 * 3600000), "CLOSED");
    p.hours = [{ days: [0, 1, 2, 3, 4, 5, 6], open: 0, close: 0 }];
    members[1].joined = false;
    members[2].onDuty = false;
    const result = discover(a.incident, members);
    assert.equal(
      result.candidates.find((c) => c.memberId === members[1].id)?.group,
      "UNLINKED",
    );
    assert.equal(
      result.candidates.find((c) => c.memberId === members[2].id)?.eligible,
      false,
    );
    assert.ok(result.radii.length > 1);
    p.updatedAt = "2020-01-01T00:00:00Z";
    assert.equal(opening(p), "UNKNOWN");
  } finally {
    await e.repo.close();
  }
});

test("in-app delivery requires recipient consent and presence; concurrency and dedup are bounded", async () => {
  const e = new Engine(new Repository(":memory:", ""));
  try {
    const a = await e.account("calls-live", "LIVE");
    for (let n = 0; n < 5; n++) {
      const { member } = await e.invite(a, "Person " + n, "CONTACT");
      const m = a.members.find((m) => m.id === member.id)!;
      m.joined = true;
      m.callConsentAt = new Date().toISOString();
    }
    await e.location(a.incident, { lat: 10.77, lng: 106.7 });
    await e.sos(a, "Help me");
    assert.equal(coordination(a.incident).calls.length, 5);
    assert.ok(
      coordination(a.incident).calls.every((c) => c.state === "QUEUED"),
    );
    for (const m of a.members) m.lastSeenAt = new Date().toISOString();
    pump(a.incident, a.members);
    assert.equal(coordination(a.incident).calls.filter(callActive).length, 3);
    enqueueIncident(a.incident, a.members);
    assert.equal(coordination(a.incident).calls.length, 5);
    assert.equal(coordination(a.incident).reservedSeconds, 270);
    assert.equal(
      a.incident.replies.some((r) => r.state === "ACCEPTED"),
      false,
    );
  } finally {
    await e.repo.close();
  }
});

test("recipient events are idempotent, ordered, attempt-bound and private", async () => {
  const e = new Engine(new Repository(":memory:", ""));
  try {
    const a = await e.account("event-calls");
    await e.sos(a, "Help me");
    const c = coordination(a.incident).calls[0];
    const evt = {
      callId: c.id,
      eventId: randomUUID(),
      seq: c.seq,
      attempt: c.attempt,
      kind: "answer" as const,
    };
    callEvent(a.incident, c.memberId, evt);
    assert.equal(c.state, "CONVERSING");
    assert.equal(callEvent(a.incident, c.memberId, evt).duplicate, true);
    assert.equal(
      callEvent(a.incident, c.memberId, {
        ...evt,
        eventId: randomUUID(),
        kind: "ringing",
      }).stale,
      true,
    );
    assert.throws(
      () => callEvent(a.incident, "another-person", evt),
      /CALL_NOT_FOUND/,
    );
    assert.equal(
      callEvent(a.incident, c.memberId, {
        ...evt,
        seq: c.seq,
        attempt: 99,
        eventId: randomUUID(),
      }).stale,
      true,
    );
    await e.callMessage(
      a,
      c.memberId,
      c.id,
      "Maybe, let me ask.",
      randomUUID(),
      c.attempt,
    );
    const quoteId = randomUUID();
    await e.callMessage(
      a,
      c.memberId,
      c.id,
      "I accept. You can wait here by the main entrance.",
      quoteId,
      c.attempt,
    );
    assert.equal(c.state, "COMPLETED");
    const r = a.incident.replies.find((r) => r.memberId === c.memberId)!;
    assert.deepEqual(r.evidenceIds, [quoteId]);
    assert.ok(
      caseFile(a.incident).claims.some((claim) => claim.refs.includes(quoteId)),
    );
    const count = c.turns.length;
    assert.equal(
      (
        await e.callMessage(
          a,
          c.memberId,
          c.id,
          "duplicate",
          quoteId,
          c.attempt,
        )
      ).duplicate,
      true,
    );
    assert.equal(c.turns.length, count);
  } finally {
    await e.repo.close();
  }
});

test("parallel demo proposes early; task calls require acceptance and do not complete handoff", async () => {
  const e = new Engine(new Repository(":memory:", ""));
  try {
    const a = await e.account("parallel-demo");
    coordination(a.incident).autoplay = true;
    await e.sos(a, "Someone is following me. Avoid alleys.");
    const at = Date.now();
    for (let n = 1; n <= 3; n++) await e.runCalls(a, at + n * 2000);
    assert.ok(activePlan(a.incident));
    assert.equal(activePlan(a.incident)!.acceptedAt, null);
    assert.ok(
      coordination(a.incident).calls.some((c) => c.state !== "COMPLETED"),
    );
    assert.equal(
      coordination(a.incident).calls.filter((c) => c.purpose === "ASSIGNMENT")
        .length,
      0,
    );
    e.accept(a.incident, activePlan(a.incident)!.id);
    assignCalls(a.incident, e.demoMembers());
    assert.ok(
      coordination(a.incident).calls.some((c) => c.purpose === "ASSIGNMENT"),
    );
    for (let n = 4; n <= 12; n++) await e.runCalls(a, at + n * 2000);
    assert.notEqual(a.incident.status, "COMPLETE");
    assert.ok(
      coordination(a.incident).reservedSeconds <=
        coordination(a.incident).limits.budgetSeconds,
    );
    cancelCalls(a.incident);
    assert.equal(coordination(a.incident).calls.some(callActive), false);
  } finally {
    await e.repo.close();
  }
});

test("restart preserves attempts and events, resumes deadlines without duplicating calls", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "guardian-call-"));
  const file = path.join(dir, "state.sqlite");
  let e = new Engine(new Repository(file, ""));
  try {
    await e.account("persist-calls");
    await e.with("persist-calls", async (a) => {
      await e.sos(a, "Help me");
    });
    const before = (await e.account("persist-calls")).incident;
    const ids = coordination(before).calls.map((c) => c.id);
    await e.repo.close();
    e = new Engine(new Repository(file, ""));
    await e.with("persist-calls", async (a) => {
      await e.tick(a, Date.now() + 92000);
    });
    const restored = (await e.account("persist-calls")).incident;
    assert.deepEqual(
      coordination(restored).calls.map((c) => c.id),
      ids,
    );
    assert.ok(
      coordination(restored).calls.some((c) =>
        c.history.some((h) => h.reason === "BOUNDED_RETRY"),
      ),
    );
    assert.ok((await e.repo.integrity(restored.id)).valid);
  } finally {
    await e.repo.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
