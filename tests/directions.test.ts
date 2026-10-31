import { test } from "node:test";
import assert from "node:assert/strict";
import { GuardianEngine } from "../lib/engine";
import { Store } from "../lib/store";
import { AIService } from "../lib/ai";

const city = () => {
  const e = new GuardianEngine(new Store(":memory:"), 1, new AIService(() => null));
  return { e, i: e.create("owner", { placesAdapter: "CITY", routeAdapter: "CITY" }) };
};

test("Spoken place types resolve to the right map targets without accent or word collisions", () => {
  const { e, i } = city();
  const first = (q: string) => e.findDestinations(i, q)[0];
  assert.equal(first("tìm đồn cảnh sát gần nhất")?.kind, "POLICE");
  assert.equal(first("cong an")?.kind, "POLICE");
  assert.equal(first("bệnh viện cấp cứu")?.kind, "HOSPITAL");
  assert.equal(first("nhà thuốc")?.kind, "PHARMACY");
  assert.equal(first("về nhà")?.kind, "HOME");
  assert.equal(first("Khách sạn Bình Minh")?.name, "Khách sạn Bình Minh");
  assert.equal(e.findDestinations(i, "cho mình chỗ an toàn để đón").length, 0);
  e.store.db.close();
});

test("Directions work during SOS, draw a followable route and give facts for judging distance", async () => {
  const { e, i } = city();
  await e.sos(i, "Tôi cần giúp");
  const r = e.directions(i, "đồn công an");
  assert.equal(r.target, "Công an phường An Khánh");
  assert.ok((r.distanceMeters ?? 0) > 0 && r.points.length > 1);
  assert.equal(i.freeRoute?.target, r.target);
  assert.equal(e.activeRoute(i)?.target, r.target, "user-chosen route is followed until a coordinated plan is accepted");
  assert.ok(r.options[0].walkMinutes! >= 1);
  assert.equal(typeof r.options[0].open, "boolean");
  e.close(i, true); e.store.db.close();
});
