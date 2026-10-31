import { cityStart, walkingRoute } from "./city";
import { z } from "zod";
import type { Incident, Reply, Point, Route } from "./types";
export const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
export function spokenMinutes(text: string): number | null {
  const s = fold(text),
    numeric = s.match(/\b(\d{1,3})\s*(phut|minutes?|mins?)\b/);
  if (numeric) return Math.min(240, Number(numeric[1]));
  const words: Record<string, number> = {
    nam: 5,
    muoi: 10,
    "muoi lam": 15,
    "hai muoi": 20,
    "ba muoi": 30,
    hai: 2,
    ba: 3,
    mot: 1,
  };
  for (const [word, value] of Object.entries(words).sort(
    (a, b) => b[0].length - a[0].length,
  ))
    if (new RegExp("\\b" + word + " phut\\b").test(s)) return value;
  return null;
}
export function parseNeeds(
  text: string,
  previous: Incident["needs"],
): Incident["needs"] {
  const s = fold(text),
    next = { ...previous };
  const limit = s.match(
    /(?:chi|toi da|khong qua|only|at most|max(?:imum)?)\D{0,25}(\d{1,4})\s*(?:met|meters?|m\b)/,
  );
  if (limit) next.maxWalk = Math.max(20, Math.min(5000, Number(limit[1])));
  if (
    /khong (?:muon )?(?:di |qua |vao )*hem|tranh hem|avoid alleys|no alleys/.test(
      s,
    )
  )
    next.avoidAlleys = true;
  if (/kin dao|discreet/.test(s)) next.discreet = true;
  if (/khong (?:the )?(?:di duoc|di bo duoc)|cannot walk|can't walk/.test(s))
    next.canMove = false;
  return next;
}
export function emergency(
  text: string,
): { risk: 3 | 4; medical: boolean } | null {
  const s = fold(text);
  if (/\b(neu|gia su|what if|hypothetically|in a movie)\b/.test(s)) return null;
  const positive = s
    .split(/[.!?;,]/)
    .filter((x) => !/\b(khong bi|chua bi|not |isn't |wasn't )/.test(x))
    .join(" ");
  if (
    /\b(bi dam|bi chem|chay mau|bi thuong|stabbed|bleeding|cannot breathe|can't breathe|unconscious)\b/.test(
      positive,
    )
  )
    return { risk: 4, medical: true };
  if (
    /\b(bi danh|bi tan cong|bat coc|cam dao|co sung|attacked|kidnapped|has a knife|has a gun)\b/.test(
      positive,
    )
  )
    return { risk: 4, medical: false };
  if (
    /\b(bam theo|theo toi|following me|being followed|bi cuop|robbed|help me|cuu toi)\b/.test(
      positive,
    )
  )
    return { risk: 3, medical: false };
  return null;
}
export const extractionSchema = z
  .object({
    decision: z.enum([
      "ACCEPTED",
      "DECLINED",
      "CLARIFY",
      "REVOKED",
      "ON_THE_WAY",
      "KEEP_CONTACT",
    ]),
    quote: z.string(),
    offer: z.string(),
    minutes: z.number().int().min(0).max(240).nullable(),
    entrance: z.string(),
    discreet: z.boolean(),
    viaAlley: z.boolean(),
    conditions: z.array(z.string()),
  })
  .strict();
export type Extraction = z.infer<typeof extractionSchema>;
export function ruleExtract(text: string): Extraction {
  const s = fold(text);
  let decision: Extraction["decision"] = "CLARIFY";
  if (
    /\b(khong the|khong nhan|chua nhan|nhan vien.*di|rut lai|cannot help|can't help|no longer|withdraw|decline)\b/.test(
      s,
    )
  )
    decision = "DECLINED";
  else if (
    /\b(chac|co le|neu|maybe|perhaps|might|if )/.test(s) ||
    (/\bco the\b/.test(s) && !s.includes("dong y"))
  )
    decision = "CLARIFY";
  else if (
    /\b(dang den|dang toi|di don|chay xe qua|on my way|coming to|pick you up)\b/.test(
      s,
    )
  )
    decision = "ON_THE_WAY";
  else if (
    /\b(giu may|giu lien lac|stay on|stay in touch|keep contact)\b/.test(s)
  )
    decision = "KEEP_CONTACT";
  else if (
    /\b(dong y|nhan giup|cho.*vao|co cho.*cho|accept|you can wait|can wait here|welcome inside|staff will meet)\b/.test(
      s,
    )
  )
    decision = "ACCEPTED";
  const eta = s.match(/\b(\d{1,3})\s*(phut|minutes?|mins?)\b/);
  return {
    decision,
    quote: text,
    offer: text,
    minutes: spokenMinutes(text),
    entrance: /cua chinh|main entrance/.test(s) ? "Main entrance" : "",
    discreet: /kin dao|discreet/.test(s),
    viaAlley: /cua sau|qua hem|back alley|back entrance/.test(s),
    conditions: /the thanh vien|membership|purchase|mua hang/.test(s)
      ? ["Unverified condition"]
      : [],
  };
}
export function validateExtraction(
  value: Extraction,
  text: string,
): Extraction {
  const parsed = extractionSchema.parse(value),
    rule = ruleExtract(text);
  if (!parsed.quote || !text.includes(parsed.quote))
    throw new Error("UNSOURCED_QUOTE");
  if (["DECLINED", "REVOKED"].includes(rule.decision)) return rule;
  if (parsed.decision === "ACCEPTED" && rule.decision !== "ACCEPTED")
    return { ...parsed, decision: "CLARIFY" };
  // Never accept an invented ETA even when it fits the model schema.
  const eta = fold(text).match(/\b(\d{1,3})\s*(phut|minutes?|mins?)\b/);
  if (parsed.minutes !== null && spokenMinutes(text) !== parsed.minutes)
    parsed.minutes = null;
  return parsed;
}
export function distance(a: Point, b: Point) {
  const r = Math.PI / 180,
    dlat = (b.lat - a.lat) * r,
    dlng = (b.lng - a.lng) * r;
  const v =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dlng / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(v), Math.sqrt(1 - v)));
}
export function admission(i: Incident, r: Reply, time = Date.now()): string[] {
  const why: string[] = [];
  if (r.role !== "PARTNER" || r.state !== "ACCEPTED" || !r.quote)
    why.push("NOT_CONFIRMED");
  if (!r.location) why.push("NO_VENUE_LOCATION");
  if (!i.location) why.push("NO_USER_LOCATION");
  if (r.expiresAt && Date.parse(r.expiresAt) <= time) why.push("EXPIRED");
  if (r.conditions.length) why.push("UNVERIFIED_CONDITION");
  if (i.needs.avoidAlleys && r.viaAlley) why.push("ALLEY");
  if (i.needs.discreet && !r.discreet) why.push("NOT_DISCREET");
  if (!i.needs.canMove) why.push("CANNOT_WALK");
  if (
    i.location &&
    r.location &&
    distance(i.location, r.location) > i.needs.maxWalk
  )
    why.push("TOO_FAR");
  if (i.mode === "LIVE" && (r.simulated || i.location?.source !== "LIVE"))
    why.push("SIMULATED_DATA");
  return why;
}
// Local projection measures distance to segments, not sparse route vertices.
export function routeDistance(point: Point, route: Point[]): number {
  if (route.length < 2)
    return route.length ? distance(point, route[0]) : Infinity;
  const scale = Math.cos((point.lat * Math.PI) / 180);
  const xy = (p: Point) => ({
    x: (p.lng - point.lng) * 111320 * scale,
    y: (p.lat - point.lat) * 111320,
  });
  let minimum = Infinity;
  for (let n = 1; n < route.length; n++) {
    const a = xy(route[n - 1]),
      b = xy(route[n]);
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const t = Math.max(
      0,
      Math.min(1, -(a.x * dx + a.y * dy) / (dx * dx + dy * dy || 1)),
    );
    minimum = Math.min(minimum, Math.hypot(a.x + t * dx, a.y + t * dy));
  }
  return minimum;
}
export const demoStart: Point = cityStart;
export function simulatedRoute(
  from: Point,
  to: Point,
  blocked: boolean,
): Route {
  const direct = walkingRoute(from, to, [], true);
  if (!blocked) return direct;
  for (const edge of [...(direct.edgeIds || [])].reverse())
    try {
      return walkingRoute(from, to, [edge], true);
    } catch {}
  throw Error("NO_ALTERNATIVE_WALKING_ROUTE");
}
export async function liveRoute(from: Point, to: Point): Promise<Route> {
  if (!process.env.GOOGLE_MAPS_API_KEY)
    return walkingRoute(from, to, [], false);
  const res = await fetch(
    "https://routes.googleapis.com/directions/v2:computeRoutes",
    {
      method: "POST",
      signal: AbortSignal.timeout(12000),
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask":
          "routes.distanceMeters,routes.polyline.geoJsonLinestring",
      },
      body: JSON.stringify({
        origin: {
          location: { latLng: { latitude: from.lat, longitude: from.lng } },
        },
        destination: {
          location: { latLng: { latitude: to.lat, longitude: to.lng } },
        },
        travelMode: "WALK",
        polylineEncoding: "GEO_JSON_LINESTRING",
      }),
    },
  );
  if (!res.ok) throw new Error("LIVE_ROUTE_UNAVAILABLE");
  const d = await res.json(),
    r = d.routes?.[0];
  if (!r?.polyline?.geoJsonLinestring?.coordinates?.length)
    throw new Error("NO_WALKING_ROUTE");
  return {
    points: r.polyline.geoJsonLinestring.coordinates.map(
      ([lng, lat]: number[]) => ({ lng, lat }),
    ),
    meters: r.distanceMeters,
    source: "GOOGLE",
    note: [
      "Tuyến đi bộ tham khảo; chưa xác minh ánh sáng và an toàn",
      "Walking directions; lighting and safety have not been verified",
    ],
  };
}
