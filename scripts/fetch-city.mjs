import { mkdirSync, writeFileSync } from "node:fs";
const query =
  '[out:json][timeout:40];way[highway][highway!~"motorway|motorway_link|trunk|trunk_link|construction|proposed"][access!~"private|no"][foot!="no"][tunnel!="yes"](10.7655,106.712,10.7785,106.726);out geom;';
let response;
for (const endpoint of [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
]) {
  response = await fetch(endpoint + "?data=" + encodeURIComponent(query), {
    signal: AbortSignal.timeout(55000),
  });
  if (response.ok) break;
  console.log("OSM endpoint status", response.status);
}
if (!response.ok) throw Error("OSM_DOWNLOAD_FAILED");
const data = await response.json();
const nodes = {},
  edges = [];
for (const way of data.elements) {
  for (let n = 0; n < way.nodes.length; n++) {
    const id = String(way.nodes[n]),
      p = way.geometry[n];
    nodes[id] = { lat: p.lat, lng: p.lon };
    if (n)
      edges.push({
        id: "e" + edges.length,
        a: String(way.nodes[n - 1]),
        b: id,
        name: way.tags.name || way.tags.highway,
        kind: way.tags.highway,
        points: [
          { lat: way.geometry[n - 1].lat, lng: way.geometry[n - 1].lon },
          nodes[id],
        ],
      });
  }
}
const adj = {};
for (const e of edges) {
  (adj[e.a] ??= []).push(e.b);
  (adj[e.b] ??= []).push(e.a);
}
let largest = [],
  seen = new Set();
for (const id of Object.keys(nodes)) {
  if (seen.has(id)) continue;
  const group = [id];
  seen.add(id);
  for (let n = 0; n < group.length; n++)
    for (const next of adj[group[n]] || [])
      if (!seen.has(next)) {
        seen.add(next);
        group.push(next);
      }
  if (group.length > largest.length) largest = group;
}
const keep = new Set(largest);
mkdirSync("lib", { recursive: true });
writeFileSync(
  "lib/city-data.json",
  JSON.stringify({
    source: "OpenStreetMap contributors / Overpass",
    license: "ODbL-1.0",
    downloadedAt: new Date().toISOString(),
    bounds: [10.7655, 106.712, 10.7785, 106.726],
    nodes: Object.fromEntries(largest.map((id) => [id, nodes[id]])),
    edges: edges.filter((e) => keep.has(e.a) && keep.has(e.b)),
  }),
);
console.log(
  `Saved connected walking graph: ${largest.length} nodes, ${edges.filter((e) => keep.has(e.a) && keep.has(e.b)).length} edges.`,
);
