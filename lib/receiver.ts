import { meters, type GuardianEngine } from "./engine";
import { cityAnchor, locate } from "./city";
import type { Member } from "./network";
import type { Incident } from "./types";
const terminal = (i: Incident) =>
  ["CLOSED", "USER_CANCELLED"].includes(i.status);
// Event types whose summary may carry the user's own words; never shown to receivers.
const privateEvents = new Set([
  "TRANSCRIPT_RECEIVED",
  "AI_REPLY",
  "CALL_TRANSCRIBED",
  "RISK_ASSESSED",
  "FOLLOWUP_QUESTION",
  "SUPPORT_EXTRACTED",
  "SUPPORT_UPDATED",
  "NO_RESPONDERS",
]);
export function latestIncident(engine: GuardianEngine, m: Member) {
  const stored = engine.store.latest(m.owner);
  return stored ? engine.get(stored.id, m.owner) : undefined;
}
// What a contact or partner device may see. Partners get exact location only after confirming.
export function receiverView(engine: GuardianEngine, m: Member) {
  const i = latestIncident(engine, m),
    settings = engine.network.settings(m.owner),
    member = {
      id: m.id,
      name: m.name,
      role: m.role,
      category: m.category,
      joined: m.joined,
      onDuty: m.onDuty,
      hasLocation: m.lat !== null,
      voiceConfigured: (() => { try { return !!engine.aiService.configured(); } catch { return false; } })(),
      voiceEnabled: !!i?.ai.enabled,
    };
  if (!i) return { member, userName: settings.userName, incident: null };
  const where =
      i.routeAdapter === "CITY" ? locate(cityAnchor, i.location).text : null,
    nav = i.nav && {
      target: i.nav.target,
      remaining: i.nav.remaining ?? null,
      offRoute: i.nav.offRoute,
      arrived: i.nav.arrived,
    },
    plan = i.plans.find((p) => !p.superseded),
    place = i.places.find((p) => p.id === plan?.selectedPlaceId),
    location = {
      lat: i.location.lat,
      lng: i.location.lng,
      kind: i.location.kind,
      stale: i.location.stale,
      observedAt: i.location.observedAt,
    };
  if (m.role === "CONTACT") {
    const alert = i.contacts.find((c) => c.memberId === m.id);
    if (!alert && !i.trip)
      return { member, userName: settings.userName, incident: null };
    return {
      member,
      userName: settings.userName,
      incident: {
        kind: "CONTACT" as const,
        id: i.id,
        status: i.status,
        closed: terminal(i),
        sos: !!i.metrics.sosAt,
        sharing: !!alert && !i.metrics.sosAt,
        covert: !!i.covert,
        riskLevel: i.riskLevel,
        appearance: i.appearance ?? null,
        location,
        where,
        nav: nav ?? null,
        alert: alert ?? null,
        evidence: alert && i.evidenceShare ? { at: i.evidenceShare.at, hash: i.evidenceShare.hash.slice(0, 16) } : null,
        destination: place
          ? {
              name: place.name,
              lat: place.lat,
              lng: place.lng,
              revision: plan!.revision,
            }
          : null,
        trip: i.trip
          ? {
              status: i.trip.status,
              label: i.trip.destination.label,
              expectedBy: i.trip.expectedBy,
              checkinReason: i.trip.checkinReason ?? null,
            }
          : null,
        events: i.events
          .filter((e) => !privateEvents.has(e.type))
          .slice(-8)
          .reverse()
          .map((e) => ({
            id: e.id,
            time: e.time,
            agent: e.agent,
            summary: e.summary,
          })),
      },
    };
  }
  const call = i.calls.filter((c) => c.memberId === m.id).at(-1),
    target = call && i.places.find((p) => p.id === call.placeId);
  if (!call || !target)
    return { member, userName: settings.userName, incident: null };
  return {
    member,
    userName: settings.userName,
    incident: {
      kind: "PARTNER" as const,
      id: i.id,
      status: i.status,
      closed: terminal(i),
      covert: !!i.covert,
      riskLevel: i.riskLevel,
      brief: i.riskReasons[0] ?? null,
      appearance: i.appearance ?? null,
      distance: meters(i.location, target),
      call: {
        id: call.id,
        status: call.status,
        generation: call.generation,
        startedAt: call.startedAt,
        falseAlarm: !!call.falseAlarm,
      },
      selectedHere: plan?.selectedPlaceId === target.id,
      assignment: plan?.coordination?.assignments.find((a) => a.ref === "call:" + call.id) ?? null,
      planId: plan?.selectedPlaceId === target.id ? plan.id : null,
      support: call.support ?? null,
      questions: call.questions ?? [],
      transcript: call.transcript,
      // Exact user location is shared only with a partner that confirmed support.
      location: call.status === "CONFIRMED" ? location : null,
      where: call.status === "CONFIRMED" ? where : null,
    },
  };
}
export type ReceiverView = ReturnType<typeof receiverView>;
