import { test } from "node:test";
import assert from "node:assert/strict";
import { cityStart, places, walkingRoute, isOpen } from "../lib/city";
test("offline directions follow OSM edges and can avoid a blocked street", () => {
  const route = walkingRoute(cityStart, places[2].point);
  assert.ok(route.edgeIds?.length);
  assert.ok(route.steps?.every((s) => s.street && s.meters >= 0));
  let rerouted = false;
  for (const edge of route.edgeIds || [])
    try {
      const alternate = walkingRoute(cityStart, places[2].point, [edge]);
      assert.ok(!alternate.edgeIds?.includes(edge));
      rerouted = true;
      break;
    } catch {}
  assert.ok(rerouted);
});
test("overnight opening hours and unattended ATMs stay distinct", () => {
  const overnight = { ...places[0], open: 8 * 60, close: 26 * 60 };
  assert.equal(isOpen(overnight, 60), true);
  assert.equal(isOpen(overnight, 3 * 60), false);
  assert.equal(
    places.filter((p) => p.kind === 6).every((p) => !p.staffed && !p.waiting),
    true,
  );
  assert.equal(places.length, 30);
});
test("local graph refuses off-area GPS instead of inventing connecting roads", () => {
  assert.throws(
    () => walkingRoute({ lat: 21, lng: 105 }, places[0].point, [], false),
    /OUTSIDE_WALKING_GRAPH/,
  );
});
