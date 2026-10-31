import { test } from "node:test";
import assert from "node:assert/strict";
import { Engine, activePlan, fresh } from "../lib/engine";
import { Repository } from "../lib/repository";
import {
  admission,
  emergency,
  ruleExtract,
  validateExtraction,
} from "../lib/rules";
import { reportHtml } from "../lib/report";
const setup = () => new Engine(new Repository(":memory:", ""));
test("demo runs through real reply, admission, acceptance, revocation and evidence transitions", async () => {
  const e = setup(),
    a = await e.account("one");
  await e.startDemo(a, "en");
  for (let n = 0; n < 9; n++) await e.demoStep(a.incident);
  const i = a.incident;
  assert.equal(i.demo?.status, "DONE");
  assert.equal(i.plans.length, 3);
  assert.equal(i.plans[0].acceptedAt !== null, true);
  assert.ok(i.plans.every((p) => p.invalidatedAt));
  assert.equal(i.status, "SIGNAL_LOST");
  assert.ok(i.sharedAt);
  assert.equal(i.seals.length, 3);
  assert.equal(i.replies.length, 5);
  const alleyOffer=i.plans.at(-1)?.coordination?.find(a=>a.who==='Khách sạn Bến Sông');
  assert.equal(alleyOffer?.role,'UNUSED');
  assert.ok(!alleyOffer?.instruction[1].includes('Backup'));
  await e.repo.close();
});
test("simulation never alerts real joined members", async () => {
  const e = setup(),
    a = await e.account("one");
  await e.invite(a, "Private relative", "CONTACT");
  a.members[0].joined = true;
  await e.startDemo(a, "vi");
  await e.demoStep(a.incident);
  assert.ok(!a.incident.replies.some((r) => r.memberId === a.members[0].id));
  await e.repo.close();
});
test("ambiguity does not confirm; explicit acceptance is enough without entrance", () => {
  assert.equal(
    ruleExtract("Maybe, let me ask the manager.").decision,
    "CLARIFY",
  );
  assert.equal(ruleExtract("Đồng ý.").decision, "ACCEPTED");
  assert.equal(ruleExtract("Đồng ý, bạn có thể vào chờ.").decision, "ACCEPTED");
});
test("source validation blocks model invented quotes and minutes", () => {
  const x = ruleExtract("I accept. You can wait here.");
  assert.throws(
    () => validateExtraction({ ...x, quote: "Staff are ready" }, x.quote),
    /UNSOURCED/,
  );
  assert.equal(
    validateExtraction({ ...x, minutes: 12 }, x.quote).minutes,
    null,
  );
  assert.equal(
    validateExtraction({ ...x, decision: "ACCEPTED" }, "Maybe " + x.quote)
      .decision,
    "CLARIFY",
  );
});
test("revocation and off-duty invalidate accepted guidance, new plan needs acceptance", async () => {
  const e = setup(),
    a = await e.account("one");
  await e.startDemo(a, "en");
  for (let n = 0; n < 5; n++) await e.demoStep(a.incident);
  const old = activePlan(a.incident)!;
  assert.ok(old.acceptedAt);
  await e.demoStep(a.incident);
  assert.ok(old.invalidatedAt);
  assert.equal(activePlan(a.incident)?.acceptedAt, null);
  assert.throws(() => e.accept(a.incident, old.id), /PLAN_CHANGED/);
  await e.repo.close();
});
test("unverified conditions, alleys and stale commitments cannot pass admission", async () => {
  const e = setup(),
    a = await e.account("one");
  await e.startDemo(a, "en");
  for (let n = 0; n < 3; n++) await e.demoStep(a.incident);
  const i = a.incident,
    r = i.replies.find((r) => r.state === "ACCEPTED" && !r.viaAlley)!;
  assert.deepEqual(admission(i, r), []);
  assert.ok(
    admission(i, { ...r, conditions: ["membership"] }).includes(
      "UNVERIFIED_CONDITION",
    ),
  );
  assert.ok(admission(i, { ...r, viaAlley: true }).includes("ALLEY"));
  assert.ok(
    admission(i, { ...r, expiresAt: new Date(0).toISOString() }).includes(
      "EXPIRED",
    ),
  );
  assert.ok(
    admission({ ...i, needs: { ...i.needs, canMove: false } }, r).includes(
      "CANNOT_WALK",
    ),
  );
  await e.repo.close();
});
test("unclear contact transcript preserves sourced ETA", async () => {
  const e = setup(),
    a = await e.account("one");
  await e.startDemo(a, "en");
  await e.demoStep(a.incident);
  await e.reply(
    a.incident,
    "contact-linh",
    "I am on my way, 15 minutes.",
    false,
  );
  await e.reply(a.incident, "contact-linh", "Đã food", false);
  const r = a.incident.replies.find((r) => r.memberId === "contact-linh")!;
  assert.equal(r.state, "ON_THE_WAY");
  assert.equal(r.minutes, 15);
  await e.repo.close();
});
test("handoff requires user and exact partner, accepted current plan", async () => {
  const e = setup(),
    a = await e.account("one");
  await e.startDemo(a, "en");
  for (let n = 0; n < 3; n++) await e.demoStep(a.incident);
  const i = a.incident;
  assert.throws(() => e.handoff(i, "USER"), /NO_ACCEPTED/);
  e.accept(i, activePlan(i)!.id);
  e.handoff(i, "USER");
  assert.notEqual(i.status, "COMPLETE");
  assert.throws(() => e.handoff(i, "PARTNER", "wrong-member"), /FORBIDDEN/);
  const r = i.replies.find((r) => r.id === activePlan(i)!.replyId)!;
  e.handoff(i, "PARTNER", r.memberId);
  assert.equal(i.status, "COMPLETE");
  await e.repo.close();
});
test("live mode requires real current location and never uses simulated route", async () => {
  const e = setup(),
    a = await e.account("one");
  await e.create(a, "LIVE", "en");
  await assert.rejects(e.sos(a, "Help me"), /CURRENT_LOCATION/);
  await e.location(a.incident, { lat: 10.77, lng: 106.7 });
  await e.sos(a, "I feel unsafe.");
  assert.equal(a.incident.replies.length, 0);
  assert.equal(a.incident.status, "NO_SUPPORT");
  assert.equal(a.incident.plans.length, 0);
  assert.equal(a.incident.location?.source, "LIVE");
  await e.repo.close();
});
test("emergency detection handles both languages and avoids hypotheticals/negation", () => {
  for (const s of ["I was stabbed.", "Tôi đang chảy máu", "I cannot breathe"])
    assert.equal(emergency(s)?.risk, 4);
  for (const s of [
    "What if I was stabbed?",
    "Nếu tôi bị đâm thì sao?",
    "I am not bleeding.",
    "Tôi không bị thương.",
  ])
    assert.equal(emergency(s), null);
  assert.equal(emergency("Someone is following me")?.risk, 3);
});
test("durable versions reject stale writes and hash tampering is detected", async () => {
  const e = setup(),
    a = await e.account("one"),
    stale = structuredClone(a);
  a.incident.risk = 3;
  await e.repo.save(a);
  await assert.rejects(e.repo.save(stale), /STATE_CONFLICT/);
  assert.equal((await e.repo.integrity(a.incident.id)).valid, true);
  await e.repo.query(
    "UPDATE guardian_records SET payload=$1 WHERE incident=$2 AND seq=$3",
    ["tampered", a.incident.id, 1],
  );
  assert.equal((await e.repo.integrity(a.incident.id)).valid, false);
  await e.repo.close();
});
test("serialized concurrent mutations preserve both updates", async () => {
  const e = setup();
  await e.account("one");
  await Promise.all([
    e.with("one", (a) => {
      a.incident.risk = 3;
    }),
    e.with("one", (a) => {
      a.incident.needs.maxWalk = 100;
    }),
  ]);
  const a = await e.account("one");
  assert.equal(a.incident.risk, 3);
  assert.equal(a.incident.needs.maxWalk, 100);
  await e.repo.close();
});
test("hashed invite resolves only the correct owner", async () => {
  const e = setup();
  await e.account("one");
  const x = await e.with("one", (a) => e.invite(a, "Linh", "CONTACT"));
  assert.equal(await e.repo.ownerByToken(x.token), "one");
  assert.equal(await e.repo.ownerByToken("not-real"), null);
  assert.ok(!(await e.account("one")).members[0].tokenHash.includes(x.token));
  await e.repo.close();
});
test("check-in timeout and lost location preserve trace and share a sealed record", async () => {
  const e = setup(),
    a = await e.account("one");
  await e.create(a, "LIVE", "en");
  await e.location(a.incident, { lat: 10.77, lng: 106.7 });
  a.incident.trip = {
    label: "Home",
    dueAt: new Date(0).toISOString(),
    checkBy: null,
    lastCheckAt: new Date().toISOString(),
    state: "ACTIVE",
  };
  await e.tick(a);
  assert.equal(a.incident.status, "CHECK_IN");
  await e.tick(a, Date.now() + 31000);
  assert.equal(a.incident.status, "SIGNAL_LOST");
  assert.ok(a.incident.sharedAt);
  assert.ok(a.incident.location);
  await e.repo.close();
});
test("reports escape untrusted statements and support VI/EN without altering evidence", () => {
  const i = fresh();
  i.transcript.push({
    id: "x",
    who: "<script>",
    text: "<img src=x onerror=alert(1)>",
    at: new Date().toISOString(),
  });
  const html = reportHtml(i, { valid: true, count: 1, head: "abc" }, "en");
  assert.ok(html.includes("&lt;img"));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes("Original conversation"));
  assert.ok(
    reportHtml(i, { valid: true, count: 1, head: "abc" }, "vi").includes(
      "Hội thoại gốc",
    ),
  );
});
