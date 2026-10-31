import { test } from "node:test";
import assert from "node:assert/strict";
import { Engine } from "../lib/engine";
import { Repository } from "../lib/repository";

test("autonomous SOS needs consent and fresh GPS, and only alerts opted-in real recipients", async () => {
  const e = new Engine(new Repository(":memory:", ""));
  try {
    const a = await e.account("live-auto", "LIVE");
    const i = a.incident;
    assert.equal(i.mode, "LIVE");
    assert.equal(i.location, null);
    await assert.rejects(e.autoSos(a, "Help me"), /AI_CONSENT_REQUIRED/);
    i.ai.enabled = true;
    i.ai.consentedAt = new Date().toISOString();
    const blocked = await e.autoSos(a, "Help me");
    assert.equal(blocked.autoSos, false);
    assert.equal(i.sosAt, null);
    assert.equal(i.replies.length, 0);
    const joined = await e.invite(a, "Real contact", "CONTACT");
    a.members.find((m) => m.id === joined.member.id)!.joined = true;
    await e.invite(a, "Not joined", "CONTACT");
    const offDuty = await e.invite(a, "Off-duty partner", "PARTNER");
    a.members.find((m) => m.id === offDuty.member.id)!.joined = true;
    await e.location(i, { lat: 10.77, lng: 106.7 });
    const result = await e.autoSos(a, "Someone is following me.");
    assert.equal(result.autoSos, true);
    assert.ok(i.sosAt);
    assert.equal(i.demo, null);
    assert.equal(i.replies.length, 1);
    assert.equal(i.replies[0].memberId, joined.member.id);
    assert.equal(i.replies[0].state, "RINGING");
    assert.equal(i.plans.length, 0, "no invented acceptance");
    await e.autoSos(a, "Please help");
    assert.equal(i.replies.length, 1, "repeated tool call is idempotent");
    await e.reply(i, joined.member.id, "I am on my way, in 10 minutes.", false);
    assert.equal(i.replies[0].state, "ON_THE_WAY");
    assert.equal(i.replies[0].minutes, 10);
    await e.create(a, "DEMO", "en");
    a.incident.ai.enabled = true;
    a.incident.ai.consentedAt = new Date().toISOString();
    await assert.rejects(e.autoSos(a, "Help me"), /LIVE_ONLY/);
  } finally {
    await e.repo.close();
  }
});

test("urgent text still produces SOS intent when the AI provider fails", async () => {
  const e = new Engine(new Repository(":memory:", ""));
  const previous = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("provider offline");
  };
  try {
    const a = await e.account("live-failure", "LIVE");
    a.incident.ai.enabled = true;
    a.incident.ai.consentedAt = new Date().toISOString();
    assert.equal(
      (await e.chat(a.incident, "Someone is following me.")).intent,
      "SOS",
    );
  } finally {
    globalThis.fetch = previous;
    await e.repo.close();
  }
});
