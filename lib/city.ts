// Demo area: real streets of Thủ Thiêm (OpenStreetMap, see scripts/fetch-city.mjs) as a walkable graph,
// plus our own placed stores and a SIMULATED incident history the router and the AI reason about.
// Pure data + math (no Node APIs) so the browser map draws exactly what the AI reasons about.
import raw from "./city-data.json";
import type { Place, Point, Route } from "./types";
import { venueCatalog } from "./venue-catalog";
import { venueHours, venueLabels } from "./place-context";
type XY = { x: number; y: number };
type Street = { name: string; lit: boolean; busy: boolean };
export type Edge = Street & { id: string; a: string; b: string; len: number; way: string };
export type CityNode = XY & { id: string; name: string };
const data = raw as unknown as {
  source: string;
  anchor: Point;
  nodes: Record<string, [number, number]>;
  edges: { id: string; a: string; b: string; name: string; lit: boolean; busy: boolean; pts: [number, number][] }[];
  landmarks: { name: string; kind: string; xy: [number, number] }[];
};
export const cityAnchor: Point = data.anchor;
export const cityArea = "Khu đô thị mới Thủ Thiêm, TP. Thủ Đức (TP.HCM)";
export const citySource = "Đường phố thật: " + data.source + " · địa điểm, giờ mở cửa, độ sáng & lịch sử sự cố: dữ liệu mô phỏng";
const M = 111320;
const cos = (a: Point) => Math.cos((a.lat * Math.PI) / 180);
export const toLL = (anchor: Point, p: XY): Point => ({
  lat: anchor.lat + p.y / M,
  lng: anchor.lng + p.x / (M * cos(anchor)),
});
export const toXY = (anchor: Point, p: Point): XY => ({
  x: (p.lng - anchor.lng) * M * cos(anchor),
  y: (p.lat - anchor.lat) * M,
});
const dist = (p: XY, q: XY) => Math.hypot(q.x - p.x, q.y - p.y);
export const landmarks = data.landmarks.map((l) => ({ name: l.name, kind: l.kind, x: l.xy[0], y: l.xy[1] }));
const nearestLandmark = (p: XY) => landmarks.reduce((a, b) => (dist(p, a) <= dist(p, b) ? a : b));

// Each OSM way is split into straight segments so routing/snapping stay simple line math.
export const nodes = new Map<string, CityNode>();
export const edges: Edge[] = [];
const node = (id: string, [x, y]: [number, number]) => {
  if (!nodes.has(id)) nodes.set(id, { id, x, y, name: "" });
  return id;
};
for (const w of data.edges) {
  const name = /không tên|nội bộ/.test(w.name)
    ? `${w.name} cạnh ${nearestLandmark({ x: w.pts[w.pts.length >> 1][0], y: w.pts[w.pts.length >> 1][1] }).name}`
    : w.name;
  for (let k = 1; k < w.pts.length; k++) {
    const a = node(k === 1 ? w.a : `${w.id}_${k - 1}`, w.pts[k - 1]),
      b = node(k === w.pts.length - 1 ? w.b : `${w.id}_${k}`, w.pts[k]),
      len = Math.round(dist(nodes.get(a)!, nodes.get(b)!));
    if (len) edges.push({ id: `${w.id}.${k}`, a, b, len, way: w.id, name, lit: w.lit, busy: w.busy });
  }
}
const adj = new Map<string, Edge[]>();
for (const e of edges) for (const n of [e.a, e.b]) adj.set(n, [...(adj.get(n) ?? []), e]);
// Corners: nodes where 2+ differently named streets meet; they name the node for spoken directions.
const corners: CityNode[] = [];
for (const n of nodes.values()) {
  const names = [...new Set((adj.get(n.id) ?? []).map((e) => e.name))];
  n.name = names.length > 1 ? `ngã ${names.length > 2 ? "tư" : "ba"} ${names.slice(0, 2).join(" – ")}` : names[0] ?? "";
  if (names.length > 1) corners.push(n);
}
const xs = [...nodes.values()].map((n) => n.x),
  ys = [...nodes.values()].map((n) => n.y);
export const cityBounds = {
  minX: Math.min(...xs) - 40,
  maxX: Math.max(...xs) + 40,
  minY: Math.min(...ys) - 40,
  maxY: Math.max(...ys) + 40,
};
const ends = (e: Edge) => [nodes.get(e.a)!, nodes.get(e.b)!] as const;
// Nearest point on the street network.
export function snap(p: XY, pool: Edge[] = edges) {
  let best = { edge: pool[0], t: 0, point: p, dist: Infinity };
  for (const e of pool) {
    const [a, b] = ends(e),
      dx = b.x - a.x,
      dy = b.y - a.y,
      t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy))),
      q = { x: a.x + t * dx, y: a.y + t * dy },
      d = dist(p, q);
    if (d < best.dist) best = { edge: e, t, point: q, dist: d };
  }
  return best;
}
// A spot on the roadside: snapped to the nearest street, then pushed `side` metres off the centre line.
const roadside = (x: number, y: number, street: string, side = 14): XY => {
  const s = snap({ x, y }, edges.filter((e) => e.name === street)),
    [a, b] = ends(s.edge),
    l = dist(a, b) || 1,
    sign = (x - s.point.x) * -(b.y - a.y) + (y - s.point.y) * (b.x - a.x) >= 0 ? 1 : -1;
  return { x: s.point.x + (sign * side * -(b.y - a.y)) / l, y: s.point.y + (sign * side * (b.x - a.x)) / l };
};
const compass = ["bắc", "đông bắc", "đông", "đông nam", "nam", "tây nam", "tây", "tây bắc"];
export const heading = (from: XY, to: XY) =>
  compass[Math.round(((Math.atan2(to.x - from.x, to.y - from.y) * 180) / Math.PI + 360) / 45) % 8];

// --- Simulated incident history (demo data, NOT real reports) ------------------------------------
export type CityIncident = XY & { id: string; kind: string; month: string; hour: number; severity: number; street: string; note: string };
const rawIncidents: [string, string, number, number, number, number, string, string?][] = [
  // kind, month, hour, severity 1-3, x, y, note, street (default: nearest dark street)
  // East shortcut into Sala: Đường D6 and the dark lanes beside Sarimi.
  ["Giật đồ", "2026-09", 22, 3, 224, -46, "Xe máy áp sát giật túi người đi bộ", "Đường D6"],
  ["Giật đồ", "2026-07", 21, 3, 300, -150, "Giật điện thoại khi đang xem bản đồ", "Đường D6"],
  ["Bám theo", "2026-10", 23, 2, 345, -180, "Hai người đi xe máy chạy chậm bám theo", "Đường D6"],
  ["Quấy rối", "2026-08", 22, 2, 408, -235, "Nhóm thanh niên tụ tập trêu chọc người đi bộ"],
  // Scattered across the empty lots in the middle of the district.
  ["Giật đồ", "2026-06", 23, 3, -700, -450, "Giật dây chuyền cạnh bãi đất trống", "Đường N19"],
  ["Đèn đường hỏng", "2026-10", 20, 1, 0, -200, "Cả đoạn tối, chưa sửa"],
  ["Bám theo", "2026-05", 22, 2, -690, -330, "Người lạ đi bộ bám theo tới đầu đường", "Đường D11"],
  ["Giật đồ", "2026-08", 21, 3, 480, -380, "Cướp giật điện thoại ở đoạn vắng"],
  // On the main road: minor, so the AI warns but still prefers it.
  ["Quấy rối", "2026-07", 20, 1, 20, -45, "Xin tiền, đeo bám người đi một mình", "Cầu Kênh 1"],
];
export const incidents: CityIncident[] = rawIncidents.map(([kind, month, hour, severity, x, y, note, street], n) => {
  const s = snap({ x, y }, street ? edges.filter((e) => e.name === street) : edges.filter((e) => !e.lit));
  return { id: "inc" + n, kind, month, hour, severity, note, street: s.edge.name, ...s.point };
});
const segDist = (p: XY, e: Edge) => {
  const [a, b] = ends(e),
    dx = b.x - a.x,
    dy = b.y - a.y,
    t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
};
const RISK_RADIUS = 60;
const edgeIncidents = new Map(edges.map((e) => [e.id, incidents.filter((i) => segDist(i, e) < RISK_RADIUS)]));
export const edgeRisk = (e: Edge) => edgeIncidents.get(e.id)!.reduce((s, i) => s + i.severity * 0.6, 0);
export const riskyEdges = edges.filter((e) => edgeRisk(e) > 0);
// "2 vụ giật đồ, 1 vụ bám theo (21h–23h, 6 tháng qua)"
export function incidentText(list: CityIncident[]) {
  if (!list.length) return "";
  const kinds = new Map<string, number>();
  for (const i of list) kinds.set(i.kind, (kinds.get(i.kind) || 0) + 1);
  const label = ([k, n]: [string, number]) => (k === "Đèn đường hỏng" ? "đèn đường hỏng" : `${n} vụ ${k.toLowerCase()}`);
  const lo = Math.min(...list.map((i) => i.hour)),
    hi = Math.max(...list.map((i) => i.hour));
  return (
    [...kinds].map(label).join(", ") +
    ` (${lo === hi ? lo + "h" : `${lo}h–${hi}h`}, 6 tháng qua)`
  );
}
const uniq = (list: CityIncident[]) => [...new Map(list.map((i) => [i.id, i])).values()];

// Human description of where a point is on the city map.
export function locate(anchor: Point, ll: Point) {
  const p = toXY(anchor, ll),
    s = snap(p),
    near = corners.reduce((a, b) => (dist(s.point, a) <= dist(s.point, b) ? a : b)),
    l = nearestLandmark(p),
    landmark = { name: l.name, meters: Math.round(dist(p, l)), direction: heading(p, l) },
    around = incidents.filter((i) => dist(p, i) < 150);
  if (s.dist > 1500) return { onMap: false as const, text: "Ngoài khu vực bản đồ" };
  const atCorner = dist(s.point, near) < 25;
  return {
    onMap: true as const,
    street: s.edge.name,
    lit: s.edge.lit,
    busy: s.edge.busy,
    offStreetMeters: Math.round(s.dist),
    nearestIntersection: { name: near.name, meters: Math.round(dist(s.point, near)) },
    landmark,
    incidentsNearby: around.length ? incidentText(around) : undefined,
    text:
      (atCorner ? `Tại ${near.name}` : `${s.edge.name}, cách ${near.name} ${Math.round(dist(s.point, near))} m`) +
      (s.edge.lit ? "" : " · đoạn thiếu sáng") +
      (s.edge.busy ? "" : " · vắng người") +
      (around.length ? ` · khu vực từng có ${incidentText(around)}` : ""),
  };
}
// What the AI can look up: incident history around the user or along a named street.
export function safetyReport(anchor: Point, ll: Point, street?: string) {
  const p = toXY(anchor, ll),
    key = street?.toLowerCase().trim(),
    onStreet = key ? edges.filter((e) => e.name.toLowerCase().includes(key)) : [],
    list = key
      ? uniq(onStreet.flatMap((e) => edgeIncidents.get(e.id)!))
      : incidents.filter((i) => dist(p, i) < 400),
    byStreet = new Map<string, CityIncident[]>();
  for (const i of incidents) byStreet.set(i.street, [...(byStreet.get(i.street) ?? []), i]);
  return {
    dataNote: "Lịch sử sự cố là DỮ LIỆU MÔ PHỎNG cho demo, không phải báo cáo thật.",
    scope: key ? `Phố: ${street}` : "Bán kính 400 m quanh người dùng",
    street: onStreet[0] && {
      name: onStreet[0].name,
      lit: onStreet.every((e) => e.lit) ? "sáng đèn" : "có đoạn thiếu sáng",
      busy: onStreet.some((e) => e.busy) ? "đông người" : "vắng",
    },
    summary: list.length ? incidentText(list) : "Không có sự cố ghi nhận",
    incidents: list.map((i) => ({
      kind: i.kind,
      street: i.street,
      when: `${i.month}, khoảng ${i.hour}h`,
      note: i.note,
      distanceMeters: Math.round(dist(p, i)),
      direction: heading(p, i),
    })),
    hotspots: [...byStreet]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 3)
      .map(([name, l]) => `${name}: ${incidentText(l)}`),
  };
}

// --- Demo scenario: start, home and the stores we place ourselves on real streets -----------------
export const cityStart: XY = roadside(-612, -40, "Trần Bạch Đằng", 0);
export const cityHome = { ...roadside(600, -150, "Đường N2"), label: "Nhà", address: "Chung cư Sarimi, khu Sala" };
const place = (id: string, name: string, category: string, street: string, x: number, y: number, callable = true) => ({
  id,
  name,
  category,
  address: street,
  callable,
  ...roadside(x, y, street),
});
const publicPlaces = venueCatalog.map(p => ({ ...place(p.id, p.name, venueLabels[p.kind], p.street, p.x, p.y, p.callable), profile: p.profile }));
export const stores = publicPlaces.filter((p) => p.callable).map(({ id, name, category }) => ({ id, name, category }));
export const storeById = (id: string | null) => publicPlaces.find((p) => p.id === id && p.callable);
export const partnerSlots: (XY & { address: string })[] = [
  { ...roadside(-615, -60, "Trần Bạch Đằng"), address: "Trần Bạch Đằng" },
  { ...roadside(350, 100, "Mai Chí Thọ"), address: "Mai Chí Thọ" },
  { ...roadside(-150, -450, "Tố Hữu"), address: "Tố Hữu" },
];
export function cityPlaces(anchor: Point, now: string, taken: string[] = [], clock = now): Place[] {
  return publicPlaces
    .filter((p) => !taken.includes(p.id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      profile: structuredClone(p.profile),
      address: `${p.address}, Thủ Thiêm · điểm dựng cho demo`,
      ...toLL(anchor, p),
      source: "Bản đồ Thủ Thiêm (OSM) · điểm hỗ trợ mô phỏng",
      capturedAt: now,
      openingStatus: venueHours(p.profile, clock).status,
      supportStatus: "UNKNOWN",
      contactEligibility: p.callable ? "ALLOWLIST" : "NOT_ALLOWED",
      verification: "PUBLIC_INFO_ONLY",
      evidenceRefs: ["city:" + p.id],
    }));
}

// --- Routing ------------------------------------------------------------------------------------
// Night-safety weights: dark, empty streets and streets with an incident history cost more.
const safeCost = (e: Edge, meters: number) => meters * (e.lit ? 1 : 1.8) * (e.busy ? 1 : 1.25) * (1 + edgeRisk(e));
const plainCost = (_: Edge, meters: number) => meters;
const turn = (h1: XY, h2: XY) => {
  const cross = h1.x * h2.y - h1.y * h2.x,
    dot = h1.x * h2.x + h1.y * h2.y,
    angle = (Math.atan2(cross, dot) * 180) / Math.PI;
  return Math.abs(angle) < 30 ? "Đi thẳng" : angle > 0 ? "Rẽ trái" : "Rẽ phải";
};
type Leg = { edge: Edge; from: XY; to: XY };
type Snapped = ReturnType<typeof snap>;
// Dijkstra over intersections with virtual start/target attached to their streets.
function shortest(from: Snapped, to: Snapped, banned: Set<string>, cost: (e: Edge, m: number) => number): Leg[] | null {
  if (from.edge.id === to.edge.id) return [{ edge: from.edge, from: from.point, to: to.point }];
  const distTo = new Map<string, number>(),
    prev = new Map<string, { node: string; edge: Edge }>(),
    done = new Set<string>();
  for (const n of [from.edge.a, from.edge.b]) distTo.set(n, cost(from.edge, dist(from.point, nodes.get(n)!)));
  // ponytail: linear min-scan instead of a heap; fine for a ~2k-node district graph.
  for (;;) {
    let u = "",
      best = Infinity;
    for (const [n, d] of distTo) if (!done.has(n) && d < best) [u, best] = [n, d];
    if (!u) break;
    done.add(u);
    for (const e of adj.get(u) ?? []) {
      if (banned.has(e.id)) continue;
      const v = e.a === u ? e.b : e.a,
        alt = best + cost(e, e.len);
      if (alt < (distTo.get(v) ?? Infinity)) {
        distTo.set(v, alt);
        prev.set(v, { node: u, edge: e });
      }
    }
  }
  const [ta, tb] = ends(to.edge),
    viaA = (distTo.get(ta.id) ?? Infinity) + cost(to.edge, dist(ta, to.point)),
    viaB = (distTo.get(tb.id) ?? Infinity) + cost(to.edge, dist(tb, to.point));
  if (!Number.isFinite(Math.min(viaA, viaB))) return null;
  const last = viaA <= viaB ? ta : tb,
    chain: Leg[] = [{ edge: to.edge, from: last, to: to.point }];
  let cur = last.id;
  while (prev.has(cur)) {
    const { node: n, edge: e } = prev.get(cur)!;
    chain.unshift({ edge: e, from: nodes.get(n)!, to: nodes.get(cur)! });
    cur = n;
  }
  return [{ edge: from.edge, from: from.point, to: nodes.get(cur)! }, ...chain].filter((l) => dist(l.from, l.to) > 1);
}
const legsLen = (legs: Leg[]) => legs.reduce((s, l) => s + dist(l.from, l.to), 0);
// Why this route: which shortcut was skipped and what to watch for on the way.
function advise(safe: Leg[], plain: Leg[] | null) {
  const out: string[] = [],
    used = new Set(safe.map((l) => l.edge.id)),
    extra = plain ? Math.round(legsLen(safe) - legsLen(plain)) : 0;
  if (plain && extra > 20) {
    const skipped = plain.filter((l) => !used.has(l.edge.id)).map((l) => l.edge),
      seen = uniq(skipped.flatMap((e) => edgeIncidents.get(e.id)!)),
      names = [...new Set(skipped.filter((e) => !e.lit || edgeIncidents.get(e.id)!.length).map((e) => e.name))]
        .sort((x, y) => seen.filter((i) => i.street === y).length - seen.filter((i) => i.street === x).length)
        .slice(0, 2);
    if (names.length)
      out.push(
        `Không đi lối tắt qua ${names.join(", ")} (ngắn hơn ${extra} m): ` +
          [seen.length ? "từng có " + incidentText(seen) : "", skipped.some((e) => !e.lit) ? "thiếu đèn" : "", skipped.some((e) => !e.busy) ? "vắng người" : ""]
            .filter(Boolean)
            .join("; ") +
          ".",
      );
  }
  const onRoute = new Map<string, CityIncident[]>();
  for (const l of safe)
    if (edgeIncidents.get(l.edge.id)!.length)
      onRoute.set(l.edge.name, uniq([...(onRoute.get(l.edge.name) ?? []), ...edgeIncidents.get(l.edge.id)!]));
  for (const [name, list] of onRoute) out.push(`Lưu ý trên ${name}: ${incidentText(list)} — đi sát phía có đèn, không dừng lại.`);
  if (out.length) out.push("(Lịch sử sự cố là dữ liệu mô phỏng cho demo.)");
  return out;
}
// Safety-weighted shortest walk between two points on the street network.
export function cityRoute(
  anchor: Point,
  fromLL: Point,
  toLLp: Point,
  target: string,
  blocked: string[] = [],
  id = "route",
  avoidDark: string[] = [],
): Route {
  const from = snap(toXY(anchor, fromLL)),
    to = snap(toXY(anchor, toLLp)),
    banned = new Set([...blocked, ...avoidDark]),
    legs = shortest(from, to, banned, safeCost);
  if (!legs) throw new Error("Không còn đường đi an toàn tới " + target);
  const advisories = advise(legs, shortest(from, to, banned, plainCost));
  // Merge consecutive legs on the same street into maneuvers.
  const runs: { street: string; lit: boolean; from: XY; to: XY; len: number }[] = [];
  for (const l of legs) {
    const r = runs.at(-1),
      len = dist(l.from, l.to);
    if (r && r.street === l.edge.name) {
      r.to = l.to;
      r.len += len;
      r.lit &&= l.edge.lit;
    } else runs.push({ street: l.edge.name, lit: l.edge.lit, from: l.from, to: l.to, len });
  }
  let at = 0;
  const maneuvers: NonNullable<Route["maneuvers"]> = runs.map((r, n) => {
    const h = { x: r.to.x - r.from.x, y: r.to.y - r.from.y },
      prevRun = runs[n - 1],
      text =
        n === 0
          ? `Đi theo ${r.street} về phía ${heading(r.from, r.to)} ${Math.round(r.len)} m`
          : `${turn({ x: prevRun.to.x - prevRun.from.x, y: prevRun.to.y - prevRun.from.y }, h)} vào ${r.street}, đi ${Math.round(r.len)} m`,
      m = { ...toLL(anchor, r.from), text: text + (r.lit ? "" : " (đoạn thiếu sáng, đi sát mép sáng)"), at: Math.round(at) };
    at += r.len;
    return m;
  });
  maneuvers.push({ ...toLL(anchor, to.point), text: `Đến ${target}`, at: Math.round(at) });
  const points = [legs[0]?.from ?? from.point, ...legs.map((l) => l.to)].map((p) => toLL(anchor, p));
  return {
    id,
    source: "Phố thật Thủ Thiêm (OSM) · ưu tiên phố sáng đèn, đông người, tránh nơi từng có sự cố",
    sourceKind: "SIMULATED",
    capturedAt: new Date().toISOString(),
    points: points.length > 1 ? points : [toLL(anchor, from.point), toLL(anchor, to.point)],
    steps: maneuvers.map((m) => m.text),
    distanceMeters: Math.round(at),
    durationSeconds: Math.round(at / 1.3),
    superseded: false,
    blocked: false,
    maneuvers,
    edges: legs.map((l) => l.edge.id),
    advisories: [...advisories, ...(avoidDark.length ? ["Tránh đoạn vừa được báo thiếu sáng; thông tin tình huống mô phỏng/người dùng cung cấp, không phải cảm biến trực tiếp."] : [])],
    safety: { darkMeters: Math.round(legs.filter(l => !l.edge.lit).reduce((n, l) => n + dist(l.from, l.to), 0)), quietMeters: Math.round(legs.filter(l => !l.edge.busy).reduce((n, l) => n + dist(l.from, l.to), 0)), weightedCost: Math.round(legs.reduce((n, l) => n + safeCost(l.edge, dist(l.from, l.to)), 0)), sourceKind: "SIMULATED" },
  };
}
// Where the walker is along a route: deviation, remaining distance and the next maneuver.
export function progress(anchor: Point, route: Route, ll: Point) {
  const p = toXY(anchor, ll),
    pts = route.points.map((q) => toXY(anchor, q));
  let best = { d: Infinity, along: 0 },
    along = 0;
  for (let n = 1; n < pts.length; n++) {
    const a = pts[n - 1],
      b = pts[n],
      len = dist(a, b),
      t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (len * len))) : 0,
      d = dist(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
    if (d < best.d) best = { d, along: along + t * len };
    along += len;
  }
  const total = along,
    nextIndex = (route.maneuvers || []).findIndex((m) => m.at > best.along + 8),
    next = nextIndex >= 0 ? route.maneuvers![nextIndex] : undefined;
  return {
    offRoute: Math.round(best.d),
    along: Math.round(best.along),
    remaining: Math.max(0, Math.round(total - best.along)),
    nextIndex,
    next: next && { text: next.text, inMeters: Math.max(0, Math.round(next.at - best.along)) },
  };
}
// A point `meters` further along the route from the walker (simulated walking).
export function walk(anchor: Point, route: Route, ll: Point, meters: number): Point {
  const target = progress(anchor, route, ll).along + meters,
    pts = route.points.map((q) => toXY(anchor, q));
  let along = 0;
  for (let n = 1; n < pts.length; n++) {
    const len = dist(pts[n - 1], pts[n]);
    if (along + len >= target) {
      const t = (target - along) / len;
      return toLL(anchor, {
        x: pts[n - 1].x + t * (pts[n].x - pts[n - 1].x),
        y: pts[n - 1].y + t * (pts[n].y - pts[n - 1].y),
      });
    }
    along += len;
  }
  return route.points.at(-1)!;
}
// Simulated wrong turn: from one of the nearest corners, walk 70 m into a street the route does not use.
export function deviate(anchor: Point, ll: Point, routeEdges: string[] = []): Point {
  const p = toXY(anchor, ll),
    near = [...corners].sort((a, b) => dist(p, a) - dist(p, b)).slice(0, 8),
    used = edges.filter((e) => routeEdges.includes(e.id)),
    away = (q: XY) => (used.length ? Math.min(...used.map((e) => segDist(q, e))) : 0),
    // Try every street leaving those corners; take the one ending farthest from the route (dark first on ties).
    tries = near
      .flatMap((c) =>
        (adj.get(c.id) ?? []).filter((e) => !routeEdges.includes(e.id)).map((e) => ({ e, q: follow(c, e, 100, routeEdges) })),
      )
      .sort((a, b) => Math.round(away(b.q) / 10) - Math.round(away(a.q) / 10) || Number(a.e.lit) - Number(b.e.lit));
  return toLL(anchor, tries[0]?.q ?? follow(near[0], adj.get(near[0].id)![0], 70));
}
// Walk `meters` from a node along a street (then any connecting street off the route).
function follow(start: CityNode, e: Edge, meters: number, avoid: string[] = []): XY {
  let at = start,
    cur = e,
    left = meters;
  for (;;) {
    const other = nodes.get(cur.a === at.id ? cur.b : cur.a)!;
    if (cur.len >= left) {
      const t = left / cur.len;
      return { x: at.x + t * (other.x - at.x), y: at.y + t * (other.y - at.y) };
    }
    left -= cur.len;
    const out = (adj.get(other.id) ?? []).filter((x) => x.id !== cur.id && !avoid.includes(x.id)),
      next = out.find((x) => x.name === cur.name) ?? out[0];
    if (!next) return other;
    at = other;
    cur = next;
  }
}
// Compact text the voice agent reads once per session to know the map.
export function cityBrief() {
  const main = ["Mai Chí Thọ", "Trần Bạch Đằng", "Tố Hữu", "Hoàng Thế Thiện", "Nguyễn Cơ Thạch", "Bùi Thiện Ngộ"];
  return {
    area: cityArea,
    layout:
      "Khu đô thị mới bên kia sông Sài Gòn đối diện Quận 1, còn nhiều bãi đất trống. Trục sáng đèn, đông xe: Mai Chí Thọ (chạy tây–đông qua giữa khu), Trần Bạch Đằng và Tố Hữu (phía tây), Hoàng Thế Thiện và Nguyễn Cơ Thạch (phía đông, quanh khu Sala), Bùi Thiện Ngộ (phía nam). Giữa các trục là đường nội khu không tên, ít đèn, ban đêm rất vắng.",
    mainStreets: main,
    landmarks: landmarks.map((l) => l.name),
    places: publicPlaces.map((p) => `${p.name} (${p.category}, ${p.address})`),
    home: `${cityHome.label}: ${cityHome.address}`,
    incidentHistory: {
      note: "Mô phỏng 6 tháng qua, không phải báo cáo thật. Dùng get_area_safety để tra chi tiết.",
      hotspots: safetyReport(cityAnchor, cityAnchor).hotspots,
    },
  };
}
