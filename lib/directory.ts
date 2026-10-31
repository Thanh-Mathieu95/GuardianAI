import type { Incident, Member, Point } from "./types";
import type { Discovery, PartnerProfile } from "./coordination-types";
import { places, isOpen } from "./city";
const distance = (a: Point, b: Point) =>
  Math.hypot(
    (a.lat - b.lat) * 111320,
    (a.lng - b.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180),
  );

export function opening(
  profile: PartnerProfile,
  time = Date.now(),
): "OPEN" | "CLOSED" | "UNKNOWN" {
  if (
    !profile.hours.length ||
    time - Date.parse(profile.updatedAt) > 30 * 86400000
  )
    return "UNKNOWN";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: profile.timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(time);
    const value = (type: string) => parts.find((p) => p.type === type)!.value;
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      value("weekday"),
    );
    const minute = Number(value("hour")) * 60 + Number(value("minute"));
    return profile.hours.some((h) =>
      h.open === h.close
        ? h.days.includes(day)
        : h.open < h.close
          ? h.days.includes(day) && minute >= h.open && minute < h.close
          : (h.days.includes(day) && minute >= h.open) ||
            (h.days.includes((day + 6) % 7) && minute < h.close),
    )
      ? "OPEN"
      : "CLOSED";
  } catch {
    return "UNKNOWN";
  }
}

export function discover(
  i: Incident,
  members: Member[],
  time = Date.now(),
): Discovery {
  const limits = i.coordination!.limits;
  const radii: number[] = [];
  let radius = limits.initialRadius;
  const candidates = members
    .filter((m) => m.role === "PARTNER")
    .map((m) => {
      const p = m.profile;
      const reasons: string[] = [];
      if (!m.joined) reasons.push("NOT_LINKED");
      if (!m.callConsentAt) reasons.push("NO_CALL_CONSENT");
      if (!m.onDuty) reasons.push("NOT_ON_DUTY");
      if (!m.location || !i.location) reasons.push("LOCATION_REQUIRED");
      if (p) {
        const simulated =
          i.mode === "DEMO" ? places.find((p) => p.id === m.id) : undefined;
        const status = simulated
          ? isOpen(simulated, i.scenarioMinute)
            ? "OPEN"
            : "CLOSED"
          : opening(p, time);
        if (status !== "OPEN")
          reasons.push(status === "CLOSED" ? "CLOSED" : "HOURS_UNKNOWN");
        if (!p.contactVerifiedAt) reasons.push("CONTACT_UNVERIFIED");
        if (!p.receiving || !p.staffed || !p.waiting)
          reasons.push("CAPABILITY_MISSING");
        if (!i.needs.canMove && !p.accessible)
          reasons.push("ACCESSIBILITY_UNKNOWN");
        if (i.mode === "LIVE" && p.source !== "PARTNER")
          reasons.push("UNVERIFIED_SOURCE");
      } else reasons.push("PROFILE_REQUIRED");
      return {
        memberId: m.id,
        name: m.name,
        meters:
          m.location && i.location
            ? Math.round(distance(i.location, m.location))
            : null,
        group: (!m.joined
          ? "UNLINKED"
          : reasons.length
            ? "UNKNOWN"
            : "AVAILABLE") as Discovery["candidates"][number]["group"],
        eligible: !reasons.length,
        reasons,
        profile: p,
      };
    })
    .sort((a, b) => (a.meters ?? Infinity) - (b.meters ?? Infinity));
  while (true) {
    radii.push(radius);
    if (
      candidates.filter(
        (m) => m.eligible && m.meters !== null && m.meters <= radius,
      ).length >= Math.min(2, limits.maxPartners) ||
      radius >= limits.maxRadius
    )
      break;
    radius = Math.min(limits.maxRadius, radius * 2);
  }
  let count = 0;
  for (const c of candidates) {
    if (c.meters === null || c.meters > radius) {
      c.eligible = false;
      c.reasons.push("OUTSIDE_RADIUS");
    }
    if (c.eligible && count++ >= limits.maxPartners) {
      c.eligible = false;
      c.reasons.push("CONTACT_LIMIT");
    }
  }
  return {
    at: new Date(time).toISOString(),
    radius,
    radii,
    candidates,
    references: i.coordination?.discovery?.references || [],
  };
}

// External sources return reference-only places. Never promote these to callable members.
export interface PlaceSearchAdapter {
  search(point: Point, radius: number): Promise<Discovery["references"]>;
}
export class UnconfiguredPlaceSearch implements PlaceSearchAdapter {
  async search(): Promise<Discovery["references"]> {
    return [];
  }
}
