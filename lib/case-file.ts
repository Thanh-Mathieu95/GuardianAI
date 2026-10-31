import type { Incident, Pair } from "./types";
export function caseFile(i: Incident) {
  const claims: { id: string; statement: Pair; refs: string[] }[] = [];
  for (const r of i.replies.filter((r) => r.quote))
    claims.push({
      id: "claim-" + r.id,
      statement: [
        `${r.name}: ${r.state}${r.minutes !== null ? ` · tự báo ${r.minutes} phút` : ""}`,
        `${r.name}: ${r.state}${r.minutes !== null ? ` · self-reported ${r.minutes} minutes` : ""}`,
      ],
      refs: r.evidenceIds?.length ? r.evidenceIds : [r.id],
    });
  for (const p of i.plans)
    claims.push({
      id: "claim-" + p.id,
      statement: [
        `${p.destination}: phương án v${p.revision}, ${p.invalidatedAt ? "đã hủy hiệu lực" : p.acceptedAt ? "người dùng đã chấp nhận" : "chờ người dùng chấp nhận"}.`,
        `${p.destination}: plan v${p.revision}, ${p.invalidatedAt ? "invalidated" : p.acceptedAt ? "accepted by user" : "awaiting user acceptance"}.`,
      ],
      refs: [p.id, p.replyId],
    });
  return {
    incidentId: i.id,
    mode: i.mode,
    generatedAt: i.updatedAt,
    method: "COORDINATOR_EVIDENCE" as const,
    status: i.status,
    participants: i.supportProfiles || [],
    claims,
    unresolved: [
      ...(!i.location ? ["CURRENT_LOCATION_REQUIRED"] : []),
      ...(!i.replies.some((r) => r.role === "PARTNER" && r.state === "ACCEPTED")
        ? ["NO_CONFIRMED_RECEPTION"]
        : []),
      ...(!i.plans.some((p) => !p.invalidatedAt) ? ["NO_VALID_ROUTE"] : []),
      ...(i.status !== "COMPLETE" ? ["HANDOFF_NOT_CONFIRMED"] : []),
    ],
    calls:
      i.coordination?.calls.map((c) => ({
        id: c.id,
        memberId: c.memberId,
        purpose: c.purpose,
        planId: c.planId,
        state: c.state,
        source: c.adapter,
        evidenceIds: c.turns.map((t) => t.id),
      })) || [],
  };
}
