import { z } from "zod";
import type { Incident, Reply, Point, Route } from "./types";
export const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
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
    minutes: eta ? Math.min(240, Number(eta[1])) : null,
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
  if (parsed.minutes !== null && (!eta || Number(eta[1]) !== parsed.minutes))
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
export const demoStart: Point = { lat: 10.7714, lng: 106.7049 };
export function simulatedRoute(
  from: Point,
  to: Point,
  blocked: boolean,
): Route {
  // Illustrative paths only. This geometry is never used for LIVE sessions.
  const points = blocked
    ? [
        from,
        { lat: from.lat - 0.0007, lng: from.lng },
        { lat: from.lat - 0.0007, lng: to.lng },
        to,
      ]
    : [from, { lat: from.lat, lng: to.lng }, to];
  return {
    points,
    meters: points.slice(1).reduce((n, p, k) => n + distance(points[k], p), 0),
    source: "SIMULATED",
    note: blocked
      ? [
          "Đường vòng minh họa tránh đoạn tối",
          "Illustrative detour around a dark segment",
        ]
      : [
          "Tuyến minh họa, không dùng để đi ngoài thực tế",
          "Illustrative route, not for real-world navigation",
        ],
  };
}
export async function liveRoute(from: Point, to: Point): Promise<Route> {
  if (!process.env.GOOGLE_MAPS_API_KEY)
    throw new Error("LIVE_MAPS_NOT_CONFIGURED");
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
