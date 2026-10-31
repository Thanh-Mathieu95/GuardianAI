import { test } from "node:test";
import assert from "node:assert/strict";
import { GuardianEngine } from "../lib/engine";
import { Store } from "../lib/store";
import { AIService } from "../lib/ai";
import { mapPlaceAppearance, visibleMapPlaces } from "../lib/map-places";

test("A fresh map hides the catalogue; SOS reveals open places while retaining the full research data", async () => {
  const e = new GuardianEngine(new Store(":memory:"), 1, new AIService(() => null));
  const i = e.create("map-visibility", { simulatorOnly: true, placesAdapter: "CITY", routeAdapter: "CITY" });
  assert.equal(i.places.length, 30);
  assert.deepEqual(visibleMapPlaces(i), []);
  assert.deepEqual(visibleMapPlaces(i, true), [], "The closed-store toggle must not bypass SOS discovery");
  await e.sos(i, "Tôi cần giúp");
  const open = visibleMapPlaces(i);
  assert.ok(open.length > 0 && open.length < i.places.length);
  assert.equal(open.some(p => p.id === "coffee-leaf"), false);
  assert.equal(visibleMapPlaces(i, true).length, 30);
  assert.equal(i.places.length, 30, "Hidden stores remain available for reasoning and evidence");
  await e.setScenarioClock(i, "14:30");
  assert.ok(visibleMapPlaces(i).some(p => p.id === "coffee-leaf"));
  await e.setScenarioClock(i, "22:15");
  assert.equal(visibleMapPlaces(i).some(p => p.id === "coffee-leaf"), false);
  e.close(i, true);
  const fresh = e.create("map-visibility", { placesAdapter: "CITY", routeAdapter: "CITY" });
  assert.deepEqual(visibleMapPlaces(fresh), []);
  e.store.db.close();
});

test("Affiliation, opening hours and incident consent are separate display facts", () => {
  const e = new GuardianEngine(new Store(":memory:"), 1, new AIService(() => null));
  const i = e.create("map-colors", { placesAdapter: "CITY", routeAdapter: "CITY" });
  const hotel = i.places.find(p => p.id === "b")!, atm = i.places.find(p => p.id === "atm-sala")!, police = i.places.find(p => p.id === "police")!;
  assert.equal(mapPlaceAppearance(i, hotel).group, "SUPPORT_LIST");
  assert.equal(hotel.supportStatus, "UNKNOWN", "Being in the support list must not manufacture acceptance");
  assert.equal(mapPlaceAppearance(i, atm).group, "REFERENCE");
  assert.equal(mapPlaceAppearance(i, atm).availability, "OPEN");
  assert.equal(mapPlaceAppearance(i, police).closed, false, "Administrative hours do not prove a police duty desk is closed");
  assert.equal(mapPlaceAppearance(i, police).availability, "UNKNOWN");
  assert.match(mapPlaceAppearance(i, police).availabilityLabel, /chưa xác minh/);
  e.store.db.close();
});
