import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Engine, activePlan } from "../lib/engine";
import { Repository } from "../lib/repository";
import { coordination, callEvent } from "../lib/calls";
import { places } from "../lib/city";

test("TEAM SOS never inserts Minh/Linh and late consent queues the invited Dung", async () => {
  const e = new Engine(new Repository(":memory:", ""));
  try {
    await e.account("team-late", "TEAM");
    await e.with("team-late", async (a) => {
      await e.sos(a, "Help me");
    });
    let a = await e.account("team-late");
    assert.equal(a.incident.location?.source, "SIMULATED");
    assert.deepEqual(a.incident.replies, []);
    assert.deepEqual(coordination(a.incident).calls, []);
    const invite = await e.with(a.id, (current) =>
      e.invite(current, "Dung", "CONTACT"),
    );
    await e.with(a.id, (current) => {
      const m = current.members[0];
      m.joined = true;
      m.lastSeenAt = new Date().toISOString();
    });
    assert.equal(
      coordination((await e.account(a.id)).incident).calls.length,
      0,
    );
    await e.with(a.id, (current) => {
      current.members[0].callConsentAt = new Date().toISOString();
    });
    a = await e.account(a.id);
    assert.equal(coordination(a.incident).calls.length, 1);
    assert.equal(coordination(a.incident).calls[0].memberId, invite.member.id);
    assert.equal(coordination(a.incident).calls[0].state, "CALLING");
    await e.with(a.id, (current) => {
      current.members[0].lastSeenAt = new Date().toISOString();
    });
    a = await e.account(a.id);
    assert.equal(coordination(a.incident).calls.length, 1);
    assert.ok(a.incident.events.every((event) => event.source === "REHEARSAL"));
    assert.equal(a.incident.replies[0].quote, "");
  } finally {
    await e.repo.close();
  }
});

test("recovering legacy demo invitations atomically preserves their original links and consent", async () => {
  const e = new Engine(new Repository(":memory:", ""));
  try {
    await e.account("old-demo", "DEMO");
    const invited = await e.with("old-demo", (a) =>
      e.invite(a, "Dung", "CONTACT"),
    );
    await e.with("old-demo", (a) => {
      a.members[0].joined = true;
      a.members[0].callConsentAt = new Date().toISOString();
    });
    await e.account("new-room", "TEAM");
    assert.equal(
      await e.repo.recoverTeamInvitations("old-demo", "new-room"),
      1,
    );
    assert.equal((await e.member(invited.token)).a.id, "new-room");
    assert.equal((await e.account("old-demo")).members.length, 0);
    const target = await e.account("new-room");
    assert.equal(target.members[0].id, invited.member.id);
    assert.ok(target.members[0].callConsentAt);
    assert.equal(
      await e.repo.recoverTeamInvitations("old-demo", "new-room"),
      0,
    );
    await e.account("real-walk", "LIVE");
    await assert.rejects(
      e.repo.recoverTeamInvitations("new-room", "real-walk"),
      /INVALID_RECOVERY_SCOPE/,
    );
  } finally {
    await e.repo.close();
  }
});

test("a real roleplayer's own offer creates only a simulated route and still needs acceptance", async () => {
  const e = new Engine(new Repository(":memory:", ""));
  try {
    await e.account("team-offer", "TEAM");
    await e.with("team-offer", async (a) => {
      await e.invite(a, "Venue teammate", "PARTNER");
      Object.assign(a.members[0], {
        joined: true,
        callConsentAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        onDuty: true,
        location: places[0].point,
        profile: {
          ...e.demoProfile(places[0].id)!,
          hours: [{ days: [0, 1, 2, 3, 4, 5, 6], open: 0, close: 0 }],
        },
      });
      await e.sos(a, "Help me");
    });
    let a = await e.account("team-offer");
    const c = coordination(a.incident).calls[0];
    await e.with(a.id, async (current) => {
      callEvent(current.incident, c.memberId, {
        callId: c.id,
        eventId: randomUUID(),
        attempt: c.attempt,
        seq: c.seq,
        kind: "answer",
      });
      await e.callMessage(
        current,
        c.memberId,
        c.id,
        "I accept. You can wait here by the main entrance.",
        randomUUID(),
        c.attempt,
      );
    });
    a = await e.account(a.id);
    assert.ok(activePlan(a.incident));
    assert.equal(activePlan(a.incident)!.route.source, "SIMULATED");
    assert.equal(activePlan(a.incident)!.acceptedAt, null);
    assert.equal(a.incident.status, "REVIEW");
    assert.ok(
      coordination(a.incident).calls[0].turns.some(
        (turn) => turn.source === "RECIPIENT",
      ),
    );
  } finally {
    await e.repo.close();
  }
});
