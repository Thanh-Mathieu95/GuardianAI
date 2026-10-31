import { callLabels } from "./call-labels";
import { randomUUID } from "node:crypto";
import type { Account, Incident, Member, Pair } from "./types";
import type { AppCall, CallState, Coordination } from "./coordination-types";
import { discover, opening } from "./directory";

export const callTerminal = (c: AppCall) =>
  ["COMPLETED", "NO_ANSWER", "BUSY", "DECLINED", "ERROR", "CANCELLED"].includes(
    c.state,
  );
export const callActive = (c: AppCall) =>
  ["CALLING", "RINGING", "CONNECTED", "CONVERSING"].includes(c.state);
export function coordination(i: Incident): Coordination {
  return (i.coordination ??= {
    calls: [],
    discovery: null,
    reservedSeconds: 0,
    autoplay: false,
    outcome: "SEARCHING",
    limits: {
      concurrency: 3,
      durationSeconds: 90,
      queueSeconds: 45,
      retries: 1,
      budgetSeconds: 900,
      maxPartners: 5,
      initialRadius: 500,
      maxRadius: 4000,
    },
  });
}
function note(i: Incident, type: string, message: Pair, refs: string[]) {
  const at = new Date().toISOString();
  i.updatedAt = at;
  i.events.push({
    id: randomUUID(),
    at,
    type,
    message,
    refs,
    source:
      i.mode === "DEMO"
        ? "SIMULATED"
        : i.mode === "TEAM"
          ? "REHEARSAL"
          : "LIVE",
  });
}
export function transition(
  i: Incident,
  c: AppCall,
  state: CallState,
  reason: string | null = null,
  time = Date.now(),
) {
  c.state = state;
  c.reason = reason;
  c.updatedAt = new Date(time).toISOString();
  c.seq++;
  c.history.push({ state, at: c.updatedAt, reason, attempt: c.attempt });
  if (callTerminal(c)) c.endedAt = c.updatedAt;
  note(
    i,
    "CALL_" + state,
    [
      `${c.name}: ${callLabels[state][0]}`,
      `${c.name}: ${callLabels[state][1]}`,
    ],
    [c.id],
  );
}
export function utterance(
  i: Incident,
  c: AppCall,
  who: "AI" | "RECIPIENT",
  text: string,
  id: string = randomUUID(),
) {
  if (c.turns.some((t) => t.id === id)) return id;
  c.turns.push({
    id,
    who,
    text,
    at: new Date().toISOString(),
    source: i.mode === "DEMO" ? "SIMULATED" : who,
  });
  return id;
}
export function queueCall(
  i: Incident,
  m: Member,
  purpose: AppCall["purpose"] = "INQUIRY",
  planId: string | null = null,
  task: Pair | null = null,
) {
  const state = coordination(i);
  const existing = state.calls.find(
    (c) => c.memberId === m.id && c.purpose === purpose && c.planId === planId,
  );
  if (existing) return existing;
  const at = new Date().toISOString();
  const call: AppCall = {
    id: randomUUID(),
    incidentId: i.id,
    memberId: m.id,
    name: m.name,
    role: m.role,
    purpose,
    planId,
    task,
    adapter: i.mode === "DEMO" ? "SIMULATED" : "IN_APP",
    state: "QUEUED",
    attempt: 0,
    seq: 0,
    createdAt: at,
    updatedAt: at,
    startedAt: null,
    deadline: null,
    retryAt: null,
    endedAt: null,
    reason: null,
    seenEvents: [],
    turns: [],
    history: [{ at, state: "QUEUED", attempt: 0, reason: null }],
  };
  state.calls.push(call);
  note(
    i,
    "CALL_QUEUED",
    [
      `Đã xếp cuộc gọi trong app tới ${m.name}.`,
      `In-app call queued for ${m.name}.`,
    ],
    [call.id],
  );
  return call;
}
export function enqueueIncident(i: Incident, members: Member[]) {
  const s = coordination(i);
  const previous = JSON.stringify(s.discovery?.candidates);
  s.discovery = discover(i, members);
  const before = s.calls.length;
  const eligible = new Set(
    s.discovery.candidates.filter((c) => c.eligible).map((c) => c.memberId),
  );
  for (const m of members.filter(
    (m) =>
      m.joined &&
      m.callConsentAt &&
      (m.role === "CONTACT" || eligible.has(m.id)),
  ))
    queueCall(i, m);
  s.outcome = "WAITING";
  if (
    before !== s.calls.length ||
    previous !== JSON.stringify(s.discovery.candidates)
  )
    note(
      i,
      "DISCOVERY",
      [
        `Tìm trong ${s.discovery.radius} m: ${eligible.size} đối tác đủ điều kiện liên hệ.`,
        `Searched ${s.discovery.radius} m: ${eligible.size} partners eligible for contact.`,
      ],
      s.discovery.candidates.filter((c) => c.eligible).map((c) => c.memberId),
    );
  pump(i, members);
}
export function intro(i: Incident, c: AppCall): string {
  const vi = i.locale === "vi";
  if (c.purpose === "ASSIGNMENT")
    return vi
      ? `Tôi là trợ lý AI Guardian. Người dùng đã chấp nhận phương án. ${c.task?.[0] || "Bạn hãy giữ liên lạc."} Bạn có xác nhận nhiệm vụ này không?`
      : `I am the Guardian AI assistant. The user accepted a plan. ${c.task?.[1] || "Please stay in touch."} Can you confirm this task?`;
  return vi
    ? `Tôi là trợ lý AI Guardian, gọi trong app theo sự đồng ý của bạn. Một người đang cần hỗ trợ. ${c.role === "PARTNER" ? "Bạn có thể tiếp nhận tại chỗ, có nhân viên và chỗ chờ không? Vui lòng nói rõ lối vào và điều kiện." : "Bạn có thể giúp thế nào? Nếu đang đến, khoảng bao nhiêu phút?"}`
    : `I am the Guardian AI assistant, calling in the app with your consent. Someone needs support. ${c.role === "PARTNER" ? "Can you receive them with staff and a waiting place? Please state the entrance and any conditions." : "What help can you offer? If you are coming, in about how many minutes?"}`;
}
export interface CallAdapter {
  canDeliver(member: Member | undefined, time: number): boolean;
}
export class InAppAdapter implements CallAdapter {
  canDeliver(m: Member | undefined, time: number) {
    return Boolean(
      m?.joined &&
        m.callConsentAt &&
        m.lastSeenAt &&
        time - Date.parse(m.lastSeenAt) < 20000,
    );
  }
}
export class SimulatedCallAdapter implements CallAdapter {
  canDeliver() {
    return true;
  }
}
export function pump(i: Incident, members: Member[], time = Date.now()) {
  const s = coordination(i);
  if (!i.sosAt || ["COMPLETE", "CANCELLED", "SIGNAL_LOST"].includes(i.status))
    return;
  const adapter: CallAdapter =
    i.mode === "DEMO" ? new SimulatedCallAdapter() : new InAppAdapter();
  if (i.mode !== "DEMO")
    for (const c of s.calls) {
      const m = members.find((m) => m.id === c.memberId);
      if (
        c.state === "NO_ANSWER" &&
        c.attempt === 0 &&
        c.reason === "RECIPIENT_OFFLINE_OR_QUEUE_TIMEOUT" &&
        adapter.canDeliver(m, time)
      ) {
        transition(i, c, "QUEUED", "RECIPIENT_NOW_AVAILABLE", time);
      }
    }
  let slots = s.limits.concurrency - s.calls.filter(callActive).length;
  for (const c of s.calls) {
    if (slots <= 0) break;
    if (c.state !== "QUEUED" || (c.retryAt && Date.parse(c.retryAt) > time))
      continue;
    const m = members.find((m) => m.id === c.memberId);
    if (
      i.mode !== "DEMO" &&
      (!m?.joined ||
        !m.callConsentAt ||
        (m.role === "PARTNER" &&
          (!m.onDuty || !m.profile || opening(m.profile, time) !== "OPEN")))
    ) {
      transition(i, c, "CANCELLED", "CONSENT_OR_DUTY_REVOKED", time);
      continue;
    }
    if (s.reservedSeconds + s.limits.durationSeconds > s.limits.budgetSeconds) {
      transition(i, c, "ERROR", "INCIDENT_BUDGET_REACHED", time);
      continue;
    }
    if (!adapter.canDeliver(m, time)) continue;
    s.reservedSeconds += s.limits.durationSeconds;
    c.attempt++;
    c.startedAt = new Date(time).toISOString();
    c.deadline = new Date(time + s.limits.durationSeconds * 1000).toISOString();
    c.endedAt = null;
    c.retryAt = null;
    transition(i, c, "CALLING", "APP_DELIVERY_ACKNOWLEDGED", time);
    slots--;
  }
}
export function cancelCalls(i: Incident, reason = "INCIDENT_ENDED") {
  const s = coordination(i);
  for (const c of s.calls)
    if (!callTerminal(c)) transition(i, c, "CANCELLED", reason);
  s.outcome = i.status === "COMPLETE" ? "COMPLETE" : "STOPPED";
}
export function findCall(i: Incident, memberId: string, callId: string) {
  const c = coordination(i).calls.find(
    (c) => c.id === callId && c.memberId === memberId && c.incidentId === i.id,
  );
  if (!c) throw new Error("CALL_NOT_FOUND");
  return c;
}
export function callEvent(
  i: Incident,
  memberId: string,
  data: {
    callId: string;
    eventId: string;
    attempt: number;
    seq: number;
    kind: "ringing" | "answer" | "decline" | "busy" | "end";
  },
) {
  const c = findCall(i, memberId, data.callId);
  if (c.seenEvents.includes(data.eventId)) return { duplicate: true, call: c };
  if (data.attempt !== c.attempt || data.seq !== c.seq || callTerminal(c))
    return { stale: true, call: c };
  const target: Partial<Record<typeof data.kind, CallState>> = {
    ringing: "RINGING",
    answer: "CONNECTED",
    decline: "DECLINED",
    busy: "BUSY",
    end: "COMPLETED",
  };
  const allowed =
    data.kind === "ringing"
      ? c.state === "CALLING"
      : data.kind === "answer"
        ? ["CALLING", "RINGING"].includes(c.state)
        : data.kind === "end"
          ? ["CONNECTED", "CONVERSING"].includes(c.state)
          : ["CALLING", "RINGING"].includes(c.state);
  if (!allowed) return { stale: true, call: c };
  c.seenEvents.push(data.eventId);
  c.seenEvents = c.seenEvents.slice(-80);
  transition(i, c, target[data.kind]!);
  if (data.kind === "answer") {
    utterance(i, c, "AI", intro(i, c));
    transition(i, c, "CONVERSING");
  }
  return { call: c };
}
export function retryCall(i: Incident, c: AppCall, time = Date.now()) {
  const s = coordination(i);
  if (
    !["NO_ANSWER", "BUSY"].includes(c.state) ||
    c.attempt > s.limits.retries ||
    ["COMPLETE", "CANCELLED", "SIGNAL_LOST"].includes(i.status)
  )
    return false;
  c.retryAt = new Date(time + 10000).toISOString();
  c.endedAt = null;
  transition(i, c, "QUEUED", "BOUNDED_RETRY", time);
  return true;
}
export function deadlines(i: Incident, time = Date.now()) {
  const s = coordination(i);
  for (const c of s.calls) {
    if (
      c.state === "QUEUED" &&
      time - Date.parse(c.retryAt || c.createdAt) > s.limits.queueSeconds * 1000
    ) {
      transition(i, c, "NO_ANSWER", "RECIPIENT_OFFLINE_OR_QUEUE_TIMEOUT", time);
    } else if (callActive(c) && c.deadline && Date.parse(c.deadline) <= time) {
      transition(
        i,
        c,
        ["CALLING", "RINGING"].includes(c.state) ? "NO_ANSWER" : "COMPLETED",
        "DURATION_LIMIT",
        time,
      );
    }
    if (
      c.endedAt &&
      ["NO_ANSWER", "BUSY"].includes(c.state) &&
      c.attempt > 0 &&
      c.reason !== "RECIPIENT_OFFLINE_OR_QUEUE_TIMEOUT"
    )
      retryCall(i, c, time);
  }
}
export function assignCalls(i: Incident, members: Member[]) {
  const p = i.plans.findLast((p) => !p.invalidatedAt);
  const s = coordination(i);
  for (const c of s.calls)
    if (
      c.purpose === "ASSIGNMENT" &&
      (c.planId !== p?.id || !p?.acceptedAt) &&
      !callTerminal(c)
    )
      transition(i, c, "CANCELLED", "PLAN_CHANGED");
  if (!p?.acceptedAt) return;
  for (const task of p.coordination || []) {
    if (!["PRIMARY", "SUPPORT"].includes(task.role)) continue;
    const r = i.replies.find((r) => r.id === task.ref);
    const m = members.find((m) => m.id === r?.memberId);
    if (m && (i.mode === "DEMO" || m.callConsentAt))
      queueCall(i, m, "ASSIGNMENT", p.id, task.instruction);
  }
  s.outcome = "TASKS_ASSIGNED";
  pump(i, members);
}
export { callLabels } from "./call-labels";
