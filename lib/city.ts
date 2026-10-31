import raw from "./city-data.json";
import type { Point, Route, Pair } from "./types";
const nodes: Record<string, Point> = raw.nodes;
const meters = (a: Point, b: Point) =>
  Math.hypot((a.lat - b.lat) * 111320, (a.lng - b.lng) * 109360);
export const nearestNode = (p: Point) =>
  Object.keys(nodes).sort(
    (a, b) => meters(nodes[a], p) - meters(nodes[b], p),
  )[0];
const anchor = { lat: 10.772, lng: 106.719 };
const cycleNodes = new Set<string>();
for (const excluded of raw.edges) {
  const seen = new Set([excluded.a]),
    queue = [excluded.a];
  for (let n = 0; n < queue.length; n++)
    for (const e of raw.edges) {
      if (e.id === excluded.id) continue;
      const next = e.a === queue[n] ? e.b : e.b === queue[n] ? e.a : null;
      if (next && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  if (seen.has(excluded.b)) {
    cycleNodes.add(excluded.a);
    cycleNodes.add(excluded.b);
  }
}
const origin =
  [...cycleNodes].sort(
    (a, b) => meters(nodes[a], anchor) - meters(nodes[b], anchor),
  )[0] || nearestNode(anchor);
export const cityStart = nodes[origin];
export const cityEdges = raw.edges;
export function roadCondition(edgeId: string) {
  const n = Number(edgeId.slice(1));
  return {
    lighting: n % 7 === 0 ? "LOW" : "LIT",
    activity: n % 5 === 0 ? "QUIET" : "BUSY",
    incidentRisk: n % 19 === 0 ? 0.7 : 0,
    source: "SIMULATED" as const,
  };
}
export const roadWarnings = raw.edges
  .filter((e) => {
    const c = roadCondition(e.id);
    return c.lighting === "LOW" || c.activity === "QUIET" || c.incidentRisk > 0;
  })
  .map((e) => ({
    ...e,
    ...roadCondition(e.id),
    condition: roadCondition(e.id).incidentRisk
      ? "INCIDENT"
      : roadCondition(e.id).lighting === "LOW"
        ? "DARK"
        : "QUIET",
  }));
export const kinds: Pair[] = [
  ["Cửa hàng tiện lợi", "Convenience store"],
  ["Khách sạn", "Hotel"],
  ["Nhà thuốc", "Pharmacy"],
  ["Cà phê", "Café"],
  ["Quán ăn", "Restaurant"],
  ["Trạm xăng", "Fuel station"],
  ["ATM / ngân hàng", "ATM / bank"],
  ["Siêu thị", "Supermarket"],
  ["Công an", "Police"],
  ["Phòng khám", "Clinic"],
  ["Cấp cứu", "Emergency department"],
  ["Bảo vệ", "Security desk"],
];
const nearby = [...cycleNodes]
  .filter(
    (id) =>
      meters(nodes[id], cityStart) > 90 && meters(nodes[id], cityStart) < 700,
  )
  .sort((a, b) => meters(nodes[a], cityStart) - meters(nodes[b], cityStart));
export const places = Array.from({ length: 30 }, (_, n) => {
  const kind = n < 3 ? [3, 1, 0][n] : n % 12,
    point = nodes[nearby[(n * 3 + 4) % nearby.length]],
    allDay = [0, 1, 5, 10, 11].includes(kind);
  return {
    id:
      n === 0
        ? "venue-cafe"
        : n === 1
          ? "venue-hotel"
          : n === 2
            ? "venue-shop"
            : `place-${n}`,
    name:
      n === 0
        ? "Café Đèn Vàng"
        : n === 1
          ? "Khách sạn Bến Sông"
          : n === 2
            ? "Cửa hàng Sao Mai"
            : `${kinds[kind][0]} ${n + 1}`,
    kind: n < 3 ? [3, 1, 0][n] : kind,
    point,
    open: allDay ? 0 : 8 * 60,
    close: allDay ? 1440 : n % 3 === 0 ? 26 * 60 : 21 * 60,
    staffed: kind !== 6,
    waiting: kind !== 6 && kind !== 5,
    firstAid: [2, 9, 10].includes(kind),
    hours: allDay ? "24/7" : n % 3 === 0 ? "08:00–02:00" : "08:00–21:00",
    simulated: true as const,
  };
});
export function isOpen(p: (typeof places)[number], minute = 22 * 60 + 15) {
  return p.close > 1440
    ? minute >= p.open || minute < p.close - 1440
    : minute >= p.open && minute < p.close;
}
export function placeProfile(
  p: (typeof places)[number],
  minute = 22 * 60 + 15,
) {
  const services: Pair[] = [];
  if (p.staffed)
    services.push([
      "Có nhân viên theo hồ sơ mô phỏng",
      "Staffed in the simulated profile",
    ]);
  if (p.waiting) services.push(["Có chỗ ngồi chờ", "Seated waiting area"]);
  if (p.firstAid)
    services.push(["Hỗ trợ sơ cứu cơ bản", "Basic first-aid capability"]);
  if ([0, 1, 3, 7].includes(p.kind))
    services.push(["Có thể sạc điện thoại", "Phone charging capability"]);
  const goods: Pair[] = [0, 3, 4, 7].includes(p.kind)
    ? [
        ["Nước uống", "Drinking water"],
        ["Thức ăn", "Food"],
      ]
    : p.kind === 2
      ? [["Thuốc và vật tư y tế", "Medicines and medical supplies"]]
      : [];
  const limitations: Pair[] = [
    [
      "Còn mở không có nghĩa đã đồng ý tiếp nhận; phải chờ phản hồi.",
      "Open does not mean reception is confirmed; a response is required.",
    ],
  ];
  if (p.kind === 6)
    limitations.push([
      "ATM hoạt động không đồng nghĩa có người trực hay chỗ chờ.",
      "An operating ATM does not imply staff or a waiting area.",
    ]);
  if ([2, 9].includes(p.kind))
    limitations.push([
      "Không phải khoa cấp cứu.",
      "This is not an emergency department.",
    ]);
  if (p.kind === 8)
    limitations.push([
      "Giờ hành chính khác trực ban; cần hỏi khả năng tiếp nhận.",
      "Office hours differ from duty coverage; ask about reception.",
    ]);
  return {
    id: p.id,
    name: p.name,
    category: kinds[p.kind],
    hours: p.hours,
    openingStatus: isOpen(p, minute) ? ("OPEN" as const) : ("CLOSED" as const),
    services,
    goods,
    limitations,
    staffed: p.staffed,
    waiting: p.waiting,
    firstAid: p.firstAid,
    point: p.point,
    source: "SIMULATED" as const,
  };
}
export function walkingRoute(
  from: Point,
  to: Point,
  blocked: string[] = [],
  simulation = true,
  variant = 0,
): Route {
  const start = nearestNode(from),
    end = nearestNode(to);
  if (meters(from, nodes[start]) > 150 || meters(to, nodes[end]) > 150)
    throw Error("OUTSIDE_WALKING_GRAPH");
  const scores = new Map<string, number>([[start, 0]]),
    previous = new Map<
      string,
      { id: string; edge: (typeof raw.edges)[number] }
    >(),
    queue = new Set(Object.keys(nodes));
  while (queue.size) {
    let current: string | undefined,
      best = Infinity;
    for (const id of queue) {
      const score = scores.get(id) ?? Infinity;
      if (score < best) {
        best = score;
        current = id;
      }
    }
    if (!current || current === end) break;
    queue.delete(current);
    for (const edge of raw.edges) {
      if (blocked.includes(edge.id)) continue;
      const next =
        edge.a === current ? edge.b : edge.b === current ? edge.a : null;
      if (!next || !queue.has(next)) continue;
      const length = edge.points
        .slice(1)
        .reduce((sum, p, n) => sum + meters(edge.points[n], p), 0);
      const index = Number(edge.id.slice(1)),
        condition = roadCondition(edge.id);
      const factor = simulation
        ? (index % 7 === 0 ? 1.8 : 1) *
          (index % 5 === 0 ? 1.25 : 1) *
          (1 + condition.incidentRisk) *
          (variant === 1 && index % 3 === 0 ? 1.4 : 1)
        : 1;
      const score = best + length * factor;
      if (score < (scores.get(next) ?? Infinity)) {
        scores.set(next, score);
        previous.set(next, { id: current, edge });
      }
    }
  }
  if (start !== end && !previous.has(end)) throw Error("NO_WALKING_ROUTE");
  const segments: { edge: (typeof raw.edges)[number]; forward: boolean }[] = [];
  let current = end;
  while (current !== start) {
    const p = previous.get(current)!;
    segments.unshift({ edge: p.edge, forward: p.edge.a === p.id });
    current = p.id;
  }
  const points = [
    from,
    ...segments.flatMap((s) =>
      s.forward ? s.edge.points : [...s.edge.points].reverse(),
    ),
    to,
  ];
  return {
    points,
    meters: Math.round(
      points.slice(1).reduce((sum, p, n) => sum + meters(points[n], p), 0),
    ),
    source: simulation ? "SIMULATED" : "OSM",
    note: simulation
      ? [
          "Đường phố OSM thật; ánh sáng và rủi ro chỉ mô phỏng.",
          "Actual OSM streets; lighting and risk are simulated.",
        ]
      : [
          "Đồ thị đi bộ OSM lưu cục bộ; cần kiểm tra điều kiện thực địa.",
          "Cached OSM walking graph; check real-world conditions.",
        ],
    edgeIds: segments.map((s) => s.edge.id),
    steps: segments.reduce<{ street: string; meters: number }[]>((list, s) => {
      const length = Math.round(
        s.edge.points
          .slice(1)
          .reduce((sum, p, n) => sum + meters(s.edge.points[n], p), 0),
      );
      if (list.at(-1)?.street === s.edge.name)
        list[list.length - 1].meters += length;
      else list.push({ street: s.edge.name, meters: length });
      return list;
    }, []),
  };
}
