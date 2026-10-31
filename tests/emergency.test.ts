import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyEmergency } from "../lib/emergency";
import { GuardianEngine } from "../lib/engine";
import { Store } from "../lib/store";
import { dossierHtml } from "../lib/evidence";

test("Emergency rules catch real danger, with or without diacritics, and skip talk about danger", () => {
  for (const [text, kind] of [
    ["Cứu tôi với tôi bị đâm", "STABBED"],
    ["toi bi dam roi", "STABBED"],
    ["Nó cầm dao đứng trước mặt em", "WEAPON"],
    ["Có người kéo em lên xe", "ABDUCTION"],
    ["Tôi đang chảy máu nhiều lắm", "BLEEDING"],
    ["Tôi bị tấn công ở đường D6", "ASSAULT"],
    ["Tôi vừa bị giật điện thoại", "ROBBERY"],
  ] as const)
    assert.equal(classifyEmergency(text)?.kind, kind, text);
  for (const text of [
    "Nếu bị đâm thì phải làm sao?",
    "Tôi không bị thương, chỉ hơi sợ",
    "Hôm nay xem phim có cảnh bị bắn",
    "Đường này có an toàn không?",
    "Dạo này trời tối sớm",
  ])
    assert.equal(classifyEmergency(text), null, text);
  assert.equal(classifyEmergency("bị đâm")?.medical, true);
});

test("Saying 'bị đâm' starts a level-4 SOS at once, prepares 113/115 and seals the evidence", async () => {
  const e = new GuardianEngine(new Store(":memory:"), 5);
  e.defaults = { placesAdapter: "CITY", routeAdapter: "CITY" };
  const i = e.create("u");
  e.appendTranscript(i, "USER", "Cứu! Tôi bị đâm, đang chảy máu");
  assert.equal(i.emergency?.kind, "STABBED");
  assert.equal(i.riskLevel, 4);
  assert.ok(i.metrics.sosAt);
  assert.match(i.escalation!, /115/);
  assert.ok(i.seals!.length >= 1 && /^[a-f0-9]{64}$/.test(i.seals![0].hash));
  e.recordStatement(i, "Người lạ", "Nam, áo đen, <script>alert(1)</script>");
  const html = dossierHtml(i);
  assert.ok(!html.includes("<script>alert"), "dossier escapes user text");
  assert.match(html, /KHẨN CẤP: Bị đâm/);
});

test("Losing the phone during a trip keeps the last trace, alerts and seals", () => {
  const e = new GuardianEngine(new Store(":memory:"), 5);
  e.defaults = { placesAdapter: "CITY", routeAdapter: "CITY" };
  const i = e.create("u");
  e.startTrip(i, { label: "Nhà", lat: 0, lng: 0 }, 15);
  e.simMove(i, "step");
  e.simMove(i, "lost");
  assert.ok(i.location.stale);
  assert.ok(i.events.some((v) => v.type === "CONTACT_LOST"));
  assert.ok(i.seals?.some((s) => s.reason === "Mất liên lạc"));
  assert.ok(i.track!.length >= 1);
});
