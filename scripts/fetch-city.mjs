// Builds lib/city-data.json from OpenStreetMap (Overpass): real streets of the demo area as a walkable graph.
// Run once: node scripts/fetch-city.mjs   (output is committed so the demo works offline)
import { writeFileSync } from "node:fs";

const bbox = [10.7655, 106.712, 10.7785, 106.726]; // Thủ Thiêm, TP. Thủ Đức
const kinds = "primary|secondary|tertiary|unclassified|residential|living_street|service|pedestrian";
const overpass = async (body) => {
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "User-Agent": "GuardianAI-demo/1.2", "Content-Type": "application/x-www-form-urlencoded" },
    body: "data=" + encodeURIComponent(`[out:json][timeout:60];${body}`),
  });
  if (!res.ok) throw new Error("Overpass " + res.status);
  return (await res.json()).elements;
};
const b = bbox.join(",");
const elements = (await overpass(`way["highway"~"^(${kinds})$"](${b});out geom;`)).filter(
  (w) => w.tags?.tunnel !== "yes" && w.tags?.access !== "private",
);
const pois = await overpass(
  `(nwr["name"]["leisure"~"park|garden"](${b});nwr["name"]["amenity"~"school|university|place_of_worship|hospital|marketplace|theatre"](${b});nwr["name"]["tourism"](${b});nwr["name"]["building"~"commercial|retail|apartments|office"](${b}););out center;`,
);

const anchor = { lat: (bbox[0] + bbox[2]) / 2, lng: (bbox[1] + bbox[3]) / 2 };
const M = 111320,
  cos = Math.cos((anchor.lat * Math.PI) / 180);
const xy = (p) => [Math.round((p.lon - anchor.lng) * M * cos), Math.round((p.lat - anchor.lat) * M)];

// Node ids shared by 2+ ways (or way ends) become intersections; ways are split there into edges.
const uses = new Map();
for (const w of elements) w.nodes.forEach((n, k) => uses.set(n, (uses.get(n) || 0) + (k === 0 || k === w.nodes.length - 1 ? 2 : 1)));
const nodes = {},
  edges = [];
const busyKinds = new Set(["primary", "secondary", "tertiary"]);
for (const w of elements) {
  const t = w.tags || {},
    name = t.name || (t.highway === "service" ? "Đường nội bộ" : "Đường không tên"),
    busy = busyKinds.has(t.highway),
    lit = t.lit ? t.lit === "yes" : busy;
  let start = 0;
  for (let k = 1; k < w.nodes.length; k++) {
    if (uses.get(w.nodes[k]) < 2 && k < w.nodes.length - 1) continue;
    const seg = w.geometry.slice(start, k + 1).map(xy),
      a = "n" + w.nodes[start],
      b = "n" + w.nodes[k];
    nodes[a] = seg[0];
    nodes[b] = seg.at(-1);
    edges.push({ id: "e" + edges.length, a, b, name, kind: t.highway, lit, busy, pts: seg });
    start = k;
  }
}
// Keep only the largest connected street network so every route is solvable.
const parent = {};
const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x] ?? (parent[x] = x))));
for (const id in nodes) parent[id] = id;
for (const e of edges) parent[find(e.a)] = find(e.b);
const size = {};
for (const id in nodes) size[find(id)] = (size[find(id)] || 0) + 1;
const main = Object.entries(size).sort((x, y) => y[1] - x[1])[0][0];
const keptEdges = edges.filter((e) => find(e.a) === main);
const keptNodes = Object.fromEntries(Object.entries(nodes).filter(([id]) => find(id) === main));
const landmarks = pois
  .map((p) => ({ name: p.tags.name, kind: p.tags.leisure || p.tags.amenity || p.tags.tourism || p.tags.building, xy: xy(p.center || p) }))
  .filter((p, k, all) => all.findIndex((q) => q.name === p.name) === k);

writeFileSync(
  new URL("../lib/city-data.json", import.meta.url),
  JSON.stringify({ source: "© OpenStreetMap contributors", anchor, bbox, nodes: keptNodes, edges: keptEdges, landmarks }),
);
console.log(`ways ${elements.length} → nodes ${Object.keys(keptNodes).length}, edges ${keptEdges.length} (of ${edges.length})`);
console.log(landmarks.map((l) => `${l.name} [${l.kind}] ${l.xy}`).join("\n"));
const xs = Object.values(keptNodes).map((p) => p[0]),
  ys = Object.values(keptNodes).map((p) => p[1]);
console.log("bounds", Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys));
