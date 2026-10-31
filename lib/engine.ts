import { places, isOpen, placeProfile } from "./city";
import {
  coordination,
  enqueueIncident,
  pump,
  cancelCalls,
  callActive,
  callTerminal,
  transition,
  utterance,
  intro,
  deadlines,
  assignCalls,
  findCall,
} from "./calls";
import { opening } from "./directory";
import { callAssistant } from "./ai";
import { randomBytes, randomUUID } from "node:crypto";
import { Repository, digest } from "./repository";
import {
  admission,
  parseNeeds,
  demoStart,
  distance,
  routeDistance,
  emergency,
  liveRoute,
  ruleExtract,
  simulatedRoute,
  validateExtraction,
} from "./rules";
import { aiConfigured, analyze, extract, recommend } from "./ai";
import {
  now,
  type Account,
  type Incident,
  type Locale,
  type Member,
  type Pair,
  type Point,
  type Reply,
} from "./types";
export const terminal = (i: Incident) =>
  ["COMPLETE", "CANCELLED"].includes(i.status);
export const activePlan = (i: Incident) =>
  i.plans.findLast((p) => !p.invalidatedAt);
export function fresh(
  mode: Incident["mode"] = "DEMO",
  locale: Locale = "vi",
): Incident {
  const at = now();
  return {
    id: randomUUID(),
    mode,
    locale,
    status: "READY",
    generation: 0,
    createdAt: at,
    updatedAt: at,
    location:
      mode === "DEMO" ? { ...demoStart, at, source: "SIMULATED" } : null,
    track: [],
    needs: { maxWalk: 1200, avoidAlleys: true, discreet: false, canMove: true },
    risk: 1,
    sosAt: null,
    replies: [],
    plans: [],
    events: [],
    transcript: [],
    ai: {
      enabled: false,
      consentedAt: null,
      status: "OFF",
      calls: 0,
      error: null,
    },
    trip: null,
    demo: null,
    blocked: false,
    sharedAt: null,
    seals: [],
    covert: false,
    recordings: [],
    recordingConsentAt: null,
  };
}
export function event(
  i: Incident,
  type: string,
  message: Pair,
  refs: string[] = [],
) {
  i.updatedAt = now();
  i.events.push({
    id: randomUUID(),
    at: i.updatedAt,
    type,
    message,
    source: i.mode === "DEMO" ? "SIMULATED" : "LIVE",
    refs,
  });
}
export function seal(i: Incident, reason: Pair) {
  i.seals.push({ at: now(), reason, hash: digest(i) });
  event(i, "SEALED", reason);
}
export function invalidate(i: Incident, reason: Pair) {
  const p = activePlan(i);
  if (p) {
    p.invalidatedAt = now();
    event(i, "PLAN_INVALIDATED", reason, [p.id]);
  }
  if (!terminal(i)) i.status = "NO_SUPPORT";
}
export function original(
  i: Incident,
  who: string,
  text: string,
  id: string = randomUUID(),
) {
  if (i.transcript.some((t) => t.id === id)) return;
  i.transcript.push({ id, who, text, at: now() });
}
const blankReply = (m: Member, simulated = false): Reply => ({
  id: randomUUID(),
  memberId: m.id,
  name: m.name,
  role: m.role,
  state: "RINGING",
  quote: "",
  offer: "",
  minutes: null,
  at: now(),
  expiresAt: null,
  location: m.location,
  simulated,
  entrance: "",
  discreet: false,
  viaAlley: false,
  conditions: [],
  handoff: false,
});
export class Engine {
  private queues = new Map<string, Promise<unknown>>();
  constructor(public repo = new Repository()) {}
  async account(id: string, mode: Incident["mode"] = "DEMO") {
    let a = await this.repo.load(id);
    if (!a) {
      a = { id, version: 0, incident: fresh(mode), members: [], history: [] };
      await this.repo.save(a, true);
    }
    return a;
  }
  async with<T>(id: string, fn: (a: Account) => Promise<T> | T): Promise<T> {
    const before = this.queues.get(id) || Promise.resolve();
    const task = before
      .catch(() => {})
      .then(async () => {
        const a = await this.account(id);
        const result = await fn(a);
        if (terminal(a.incident) || a.incident.status === "SIGNAL_LOST")
          cancelCalls(a.incident);
        else if (a.incident.sosAt) assignCalls(a.incident, this.callMembers(a));
        await this.repo.save(a);
        return result;
      });
    this.queues.set(id, task);
    try {
      return await task;
    } finally {
      if (this.queues.get(id) === task) this.queues.delete(id);
    }
  }
  async create(a: Account, mode: Incident["mode"], locale: Locale) {
    const old = a.incident;
    if (!terminal(old)) {
      old.status = "CANCELLED";
      old.generation++;
      if (old.demo) old.demo.status = "STOPPED";
      cancelCalls(old);
      seal(old, ["Phiên đã dừng", "Session stopped"]);
    }
    await this.repo.save(a);
    a.history.push(old);
    a.incident = fresh(mode, locale);
    return a.incident;
  }
  async invite(a: Account, name: string, role: Member["role"]) {
    if (a.members.length >= 12) throw new Error("MEMBER_LIMIT");
    const token = randomBytes(32).toString("base64url");
    const member: Member = {
      id: randomUUID(),
      name,
      role,
      tokenHash: digest(token),
      joined: false,
      onDuty: false,
      location: null,
      createdAt: now(),
    };
    a.members.push(member);
    return { token, member: { ...member, tokenHash: undefined } };
  }
  async member(token: string) {
    const owner = await this.repo.ownerByToken(token);
    if (!owner) throw new Error("NOT_FOUND");
    const a = await this.account(owner),
      m = a.members.find((m) => m.tokenHash === digest(token));
    if (!m) throw new Error("NOT_FOUND");
    return { a, m };
  }
  alert(i: Incident, members: Member[]) {
    for (const m of members.filter(
      (m) => m.joined && (m.role === "CONTACT" || m.onDuty),
    )) {
      if (!i.replies.some((r) => r.memberId === m.id)) {
        const r = blankReply(m, i.mode === "DEMO");
        r.profile = m.profile;
        i.replies.push(r);
      }
    }
    event(i, "CONTACTS_ALERTED", [
      `${i.replies.length} người nhận trong app; chưa có xác nhận`,
      `${i.replies.length} in-app recipients; no confirmation yet`,
    ]);
  }
  async sos(a: Account, text: string) {
    const i = a.incident;
    if (terminal(i)) throw new Error("SESSION_ENDED");
    if (i.sosAt) throw new Error("SOS_ALREADY_ACTIVE");
    if (
      i.mode === "LIVE" &&
      (!i.location ||
        i.location.source !== "LIVE" ||
        Date.now() - Date.parse(i.location.at) > 90000)
    )
      throw new Error("CURRENT_LOCATION_REQUIRED");
    original(i, "You", text);
    i.needs = parseNeeds(text, i.needs);
    const hit = emergency(text);
    i.risk = hit?.risk || 3;
    i.sosAt = now();
    i.status = "CONTACTING";
    i.generation++;
    event(i, "SOS", [
      "Đã nhận SOS. Đang chờ người nhận trả lời.",
      "SOS received. Waiting for recipients to respond.",
    ]);
    const members = this.callMembers(a);
    this.alert(i, members);
    enqueueIncident(i, members);
    seal(i, ["Đã ghi nhận yêu cầu hỗ trợ", "Support request recorded"]);
    if (!i.replies.length) i.status = "NO_SUPPORT";
  }
  async autoSos(a: Account, text: string) {
    const i = a.incident;
    if (!i.ai.enabled || !i.ai.consentedAt)
      throw new Error("AI_CONSENT_REQUIRED");
    if (i.mode !== "LIVE") throw new Error("LIVE_ONLY");
    if (terminal(i)) throw new Error("SESSION_ENDED");
    if (i.sosAt) return { autoSos: true, alreadyActive: true };
    if (
      !i.location ||
      i.location.source !== "LIVE" ||
      Date.now() - Date.parse(i.location.at) > 90000
    ) {
      event(i, "AI_SOS_BLOCKED", [
        "AI nhận thấy cần SOS. Hãy bật GPS hiện tại rồi gửi lại yêu cầu; chưa báo người nhận.",
        "AI identified a need for SOS. Enable current GPS and retry; recipients have not been alerted.",
      ]);
      return { autoSos: false, blocked: "CURRENT_LOCATION_REQUIRED" };
    }
    await this.sos(a, text);
    event(i, "AI_SOS", [
      "AI đã tự kích hoạt SOS từ cuộc trò chuyện. Chỉ người đã tham gia nhận yêu cầu trong app.",
      "AI activated SOS from the conversation. Requests go only to joined in-app recipients.",
    ]);
    return { autoSos: true, recipients: i.replies.length };
  }
  demoMembers(): Member[] {
    return [
      {
        id: "venue-cafe",
        name: "Café Đèn Vàng",
        role: "PARTNER",
        location: places[0].point,
      },
      {
        id: "venue-hotel",
        name: "Khách sạn Bến Sông",
        role: "PARTNER",
        location: places[1].point,
      },
      {
        id: "venue-shop",
        name: "Cửa hàng Sao Mai",
        role: "PARTNER",
        location: places[2].point,
      },
      { id: "contact-linh", name: "Linh", role: "CONTACT", location: null },
      { id: "contact-minh", name: "Minh", role: "CONTACT", location: null },
    ].map(
      (m) =>
        ({
          ...m,
          tokenHash: "",
          joined: true,
          onDuty: true,
          createdAt: now(),
          callConsentAt: now(),
          lastSeenAt: now(),
          ...("location" in m && m.location
            ? { profile: this.demoProfile(m.id) }
            : {}),
        }) as Member,
    );
  }
  demoProfile(id: string) {
    const p = places.find((p) => p.id === id);
    if (!p) return undefined;
    const details = placeProfile(p);
    return {
      kind: details.category[1],
      address: p.name,
      contact: "in-app:" + id,
      contactVerifiedAt: now(),
      timezone: "Asia/Ho_Chi_Minh",
      hours: [
        { days: [0, 1, 2, 3, 4, 5, 6], open: p.open, close: p.close % 1440 },
      ],
      updatedAt: now(),
      source: "SIMULATED" as const,
      receiving: true,
      staffed: true,
      waiting: true,
      accessible: true,
      limitations: "SIMULATED",
      entrance: "Main entrance",
      meeting: "Staff at entrance",
    };
  }
  callMembers(a: Account) {
    return a.incident.mode === "DEMO" ? this.demoMembers() : a.members;
  }
  async callMessage(
    a: Account,
    memberId: string,
    callId: string,
    text: string,
    messageId: string,
    attempt: number,
  ) {
    const i = a.incident,
      c = findCall(i, memberId, callId);
    if (terminal(i) || i.status === "SIGNAL_LOST")
      throw new Error("SESSION_ENDED");
    if (c.turns.some((t) => t.id === messageId)) return { duplicate: true };
    if (c.attempt !== attempt || !["CONNECTED", "CONVERSING"].includes(c.state))
      throw new Error("CALL_NOT_CONNECTED");
    if (c.turns.filter((t) => t.who === "RECIPIENT").length >= 4)
      throw new Error("CALL_TURN_LIMIT");
    if (i.transcript.some((t) => t.id === messageId))
      throw new Error("EVIDENCE_ID_ALREADY_USED");
    const evidence = utterance(i, c, "RECIPIENT", text, messageId);
    if (c.purpose === "INQUIRY")
      await this.reply(i, memberId, text, true, evidence);
    else {
      original(i, c.name, text, evidence);
      event(
        i,
        "TASK_RESPONSE",
        [
          "Đã ghi phản hồi nhiệm vụ; không tự xác nhận đã gặp.",
          "Task response recorded; handoff has not been assumed.",
        ],
        [c.id, c.planId!, evidence],
      );
    }
    const r = i.replies.find((r) => r.memberId === memberId);
    const done =
      c.purpose === "ASSIGNMENT" ||
      (r && r.state !== "CLARIFY" && r.state !== "RINGING") ||
      c.turns.filter((t) => t.who === "RECIPIENT").length >= 4;
    let answer =
      i.locale === "vi"
        ? "Bạn có thể nói rõ bạn đồng ý giúp việc gì và trong bao lâu không?"
        : "What specific help can you confirm, and for how long?";
    if (done)
      answer =
        i.locale === "vi"
          ? "Cảm ơn. Tôi đã gửi nguyên văn lời bạn tới bộ điều phối. Việc hỗ trợ vẫn cần được theo dõi và xác nhận."
          : "Thank you. Your exact statement has been sent to the coordinator. Support still needs tracking and confirmation.";
    else if (i.ai.enabled && aiConfigured() && i.ai.calls < 40) {
      i.ai.calls++;
      try {
        answer = await callAssistant(i.locale, c);
      } catch {
        /* bounded question remains available */
      }
    }
    utterance(i, c, "AI", answer);
    if (done) transition(i, c, "COMPLETED", "STATEMENT_RECORDED");
    else transition(i, c, "CONVERSING");
    if (activePlan(i)) coordination(i).outcome = "OFFER_AVAILABLE";
    pump(i, this.callMembers(a));
    return { reply: answer };
  }
  async runCalls(a: Account, time = Date.now()) {
    const i = a.incident,
      s = coordination(i),
      members = this.callMembers(a);
    if (i.demo) return;
    deadlines(i, time);
    pump(i, members, time);
    if (i.mode !== "DEMO" || !s.autoplay) return;
    const vi = i.locale === "vi";
    for (const c of s.calls.filter(callActive)) {
      if (time - Date.parse(c.updatedAt) < 1800) continue;
      if (c.state === "CALLING")
        transition(i, c, "RINGING", "SIMULATED_DELIVERY", time);
      else if (c.state === "RINGING") {
        transition(i, c, "CONVERSING", "SIMULATED_ANSWER", time);
        utterance(i, c, "AI", intro(i, c));
      } else if (c.state === "CONVERSING") {
        const lines: Record<string, Pair> = {
          "venue-cafe": [
            "Đồng ý, bạn có thể ngồi chờ ở cửa chính; có nhân viên tiếp nhận.",
            "I accept. You can wait here; staff will meet you at the main entrance.",
          ],
          "venue-hotel": [
            "Đồng ý, vào chờ qua cửa sau trong hẻm.",
            "I accept. You can wait here through the back entrance in the alley.",
          ],
          "venue-shop": [
            "Đồng ý, bạn có thể vào chờ ở cửa chính.",
            "I accept. You can wait here by the main entrance.",
          ],
          "contact-linh": [
            "Tôi đang đến đón, 10 phút nữa tới.",
            "I am on my way to pick you up, arriving in 10 minutes.",
          ],
          "contact-minh": ["Tôi sẽ giữ liên lạc.", "I will stay in touch."],
        };
        const text =
          c.purpose === "ASSIGNMENT"
            ? vi
              ? "Tôi đã nhận nhiệm vụ; sẽ báo lại khi gặp."
              : "I received the task and will confirm when we meet."
            : lines[c.memberId]?.[vi ? 0 : 1];
        if (text)
          await this.callMessage(
            a,
            c.memberId,
            c.id,
            text,
            randomUUID(),
            c.attempt,
          );
      }
    }
  }
  async reply(
    i: Incident,
    memberId: string,
    text: string,
    useAI = true,
    evidenceId: string = randomUUID(),
  ) {
    if (terminal(i)) throw new Error("SESSION_ENDED");
    const r = i.replies.find((r) => r.memberId === memberId);
    if (!r) throw new Error("NO_ACTIVE_REQUEST");
    original(i, r.name, text, evidenceId);
    let x = ruleExtract(text);
    if (useAI && i.ai.enabled && aiConfigured() && i.ai.calls < 40) {
      i.ai.calls++;
      try {
        x = validateExtraction(await extract(text, r.role), text);
        i.ai.status = "LIVE";
        i.ai.error = null;
      } catch (e) {
        i.ai.status = "ERROR";
        i.ai.error = e instanceof Error ? e.message : "AI_FAILED";
        event(i, "AI_FALLBACK", [
          "AI chưa phân tích được; dùng quy tắc có giới hạn.",
          "AI extraction unavailable; using bounded rules.",
        ]);
      }
    }
    // Noisy transcripts cannot erase a sourced commitment or ETA.
    if (
      x.decision === "CLARIFY" &&
      ["ON_THE_WAY", "KEEP_CONTACT", "ACCEPTED"].includes(r.state)
    ) {
      event(
        i,
        "REPLY_UNCLEAR",
        [
          "Chưa đủ thông tin để thay đổi cam kết trước.",
          "Not enough information to change the previous commitment.",
        ],
        [r.id],
      );
      return;
    }
    const wasAccepted = r.state === "ACCEPTED";
    r.evidenceIds = [evidenceId];
    r.state = x.decision === "DECLINED" && wasAccepted ? "REVOKED" : x.decision;
    r.quote = x.quote;
    r.offer = x.offer;
    r.minutes = x.minutes;
    r.at = now();
    r.expiresAt =
      r.role === "PARTNER" && r.state === "ACCEPTED"
        ? new Date(Date.now() + 15 * 60000).toISOString()
        : null;
    r.entrance = x.entrance;
    r.discreet = x.discreet;
    r.viaAlley = x.viaAlley;
    r.conditions = x.conditions;
    if (i.mode === "DEMO" && i.demo && !coordination(i).autoplay) {
      const c = coordination(i).calls.find(
        (c) =>
          c.memberId === memberId &&
          c.purpose === "INQUIRY" &&
          !callTerminal(c),
      );
      if (c && callActive(c)) {
        if (!c.turns.length) utterance(i, c, "AI", intro(i, c));
        utterance(i, c, "RECIPIENT", text, evidenceId);
        transition(
          i,
          c,
          x.decision === "CLARIFY" ? "CONVERSING" : "COMPLETED",
          "SIMULATED_SCRIPT_RESPONSE",
        );
        pump(i, this.demoMembers());
      }
    }
    event(
      i,
      "REPLY",
      [
        `${r.name}: đã ghi lời phản hồi gốc.`,
        `${r.name}: original response recorded.`,
      ],
      [r.id],
    );
    await this.plan(i);
  }
  async plan(i: Incident, time = Date.now()) {
    if (terminal(i) || i.status === "SIGNAL_LOST") return;
    const current = activePlan(i);
    if (current) {
      const r = i.replies.find((r) => r.id === current.replyId);
      if (
        r &&
        !admission(i, r, time).length &&
        current.route.meters <= i.needs.maxWalk
      ) {
        this.coordinate(i);
        return;
      }
      invalidate(i, [
        "Cam kết không còn hợp lệ. Dừng hướng dẫn cũ.",
        "The commitment is no longer valid. Previous guidance stopped.",
      ]);
    }
    if (!i.location) return;
    if (
      i.mode === "LIVE" &&
      (i.blocked || time - Date.parse(i.location.at) > 90000)
    ) {
      if (i.sosAt) i.status = "NO_SUPPORT";
      return;
    }
    const eligible = i.replies
      .filter(
        (r) =>
          !admission(i, r, time).length &&
          (i.mode !== "DEMO" ||
            !places.some((p) => p.id === r.memberId) ||
            isOpen(places.find((p) => p.id === r.memberId)!, i.scenarioMinute)),
      )
      .sort(
        (a, b) =>
          distance(i.location!, a.location!) -
          distance(i.location!, b.location!),
      );
    if (eligible.length && i.ai.enabled && aiConfigured() && i.ai.calls < 40) {
      i.ai.calls++;
      try {
        const choice = await recommend(i, eligible);
        const index = eligible.findIndex((r) => r.id === choice.replyId);
        if (index < 0) throw new Error("UNVERIFIED_AI_PLAN");
        eligible.unshift(...eligible.splice(index, 1));
        i.ai.status = "LIVE";
        event(
          i,
          "AI_COMPARISON",
          [
            "AI đã so sánh các lời đồng ý hợp lệ; engine kiểm tra tuyến trước khi đề xuất.",
            "AI compared eligible offers; the engine checks the route before proposing it.",
          ],
          [choice.replyId],
        );
      } catch {
        event(i, "PLANNER_FALLBACK", [
          "Chưa dùng được đề xuất AI; so sánh khoảng cách giữa các lời đồng ý đã kiểm chứng.",
          "AI selection unavailable; comparing distance between verified offers.",
        ]);
      }
    }
    for (const r of eligible) {
      try {
        const route =
          i.mode === "DEMO"
            ? simulatedRoute(i.location, r.location!, i.blocked)
            : await liveRoute(i.location, r.location!);
        if (route.meters > i.needs.maxWalk) continue;
        const revision = i.plans.length + 1;
        i.plans.push({
          id: randomUUID(),
          revision,
          replyId: r.id,
          destination: r.name,
          route,
          acceptedAt: null,
          invalidatedAt: null,
          reason: [
            "Có lời đồng ý rõ, phù hợp nhu cầu và khoảng cách.",
            "Explicit consent, compatible needs and walking distance.",
          ],
          userArrived: false,
        });
        i.status = "REVIEW";
        this.coordinate(i);
        event(
          i,
          "PLAN_PROPOSED",
          [
            `Phương án ${revision}: ${r.name}. Chờ bạn chấp nhận.`,
            `Plan ${revision}: ${r.name}. Waiting for your acceptance.`,
          ],
          [r.id],
        );
        return;
      } catch (e) {
        event(
          i,
          "ROUTE_UNAVAILABLE",
          [
            "Chưa lấy được tuyến thật. Không dùng tuyến mô phỏng thay thế.",
            "A live route is unavailable. No simulated route substituted.",
          ],
          [r.id],
        );
      }
    }
    if (i.sosAt) i.status = "NO_SUPPORT";
  }
  coordinate(i: Incident) {
    const p = activePlan(i);
    if (!p) return;
    p.coordination = i.replies.map((r) => ({
      ref: r.id,
      who: r.name,
      role:
        r.id === p.replyId
          ? ("PRIMARY" as const)
          : r.role === "CONTACT" &&
              ["ON_THE_WAY", "KEEP_CONTACT"].includes(r.state)
            ? ("SUPPORT" as const)
            : r.role === "PARTNER" && !admission(i, r).length
              ? ("BACKUP" as const)
              : ("UNUSED" as const),
      instruction:
        r.id === p.replyId
          ? [`Tiếp nhận tại ${p.destination}`, `Receive at ${p.destination}`]
          : r.state === "ON_THE_WAY"
            ? [
                `Tự báo ${r.minutes ?? "?"} phút; hẹn gặp tại ${p.destination}`,
                `Reported ${r.minutes ?? "?"} minutes; meet at ${p.destination}`,
              ]
            : r.state === "KEEP_CONTACT"
              ? ["Giữ liên lạc với người dùng", "Stay in touch with the walker"]
              : r.role === "PARTNER" && !admission(i, r).length
                ? [
                    "Dự phòng khi phương án chính mất hiệu lực",
                    "Backup if the primary offer becomes invalid",
                  ]
                : ["Chưa có cam kết phù hợp", "No eligible commitment yet"],
    }));
  }
  accept(i: Incident, id: string) {
    const p = activePlan(i),
      r = i.replies.find((r) => r.id === p?.replyId);
    if (!p || p.id !== id || !r || admission(i, r).length)
      throw new Error("PLAN_CHANGED");
    if (
      i.mode === "LIVE" &&
      (!i.location || Date.now() - Date.parse(i.location.at) > 90000)
    )
      throw new Error("CURRENT_LOCATION_REQUIRED");
    p.acceptedAt = now();
    i.status = "GUIDING";
    event(
      i,
      "PLAN_ACCEPTED",
      ["Bạn đã chấp nhận phương án.", "You accepted the plan."],
      [id],
    );
  }
  async block(i: Incident) {
    invalidate(i, [
      "Bạn báo đường không phù hợp. Cần phương án mới.",
      "You reported an unsuitable road. A new plan is needed.",
    ]);
    i.blocked = true;
    if (i.mode === "DEMO") await this.plan(i);
    else
      event(i, "LIVE_BLOCK", [
        "Không thể xác minh đường vòng tự động; hãy liên hệ người hỗ trợ.",
        "Cannot verify an automatic detour; contact your helper.",
      ]);
  }
  handoff(i: Incident, side: "USER" | "PARTNER", memberId?: string) {
    const p = activePlan(i),
      r = i.replies.find((r) => r.id === p?.replyId);
    if (!p?.acceptedAt || !r || admission(i, r).length)
      throw new Error("NO_ACCEPTED_PLAN");
    if (side === "USER") p.userArrived = true;
    else {
      if (memberId !== r.memberId) throw new Error("FORBIDDEN");
      r.handoff = true;
    }
    if (p.userArrived && r.handoff) {
      i.status = "COMPLETE";
      seal(i, [
        "Hai bên xác nhận đã gặp nhau",
        "Both sides confirmed the handoff",
      ]);
    } else
      event(i, "HANDOFF_PENDING", [
        "Chờ bên còn lại xác nhận đã gặp.",
        "Waiting for the other person to confirm meeting.",
      ]);
  }
  async location(i: Incident, p: Point) {
    if (terminal(i)) throw new Error("SESSION_ENDED");
    if (i.mode !== "LIVE") throw new Error("DEMO_LOCATION_IS_SIMULATED");
    i.location = { ...p, at: now(), source: "LIVE" };
    i.track.push({ ...p, at: now() });
    if (i.track.length > 1500) i.track.shift();
    event(i, "LOCATION", ["Đã cập nhật GPS", "GPS updated"]);
    const plan = activePlan(i);
    if (plan?.acceptedAt && routeDistance(p, plan.route.points) > 75) {
      invalidate(i, [
        "GPS cách tuyến đã nhận hơn 75 m; cần xem lại phương án.",
        "GPS is more than 75 m from the accepted route; review a new plan.",
      ]);
      await this.plan(i);
    }
    if (i.status === "SIGNAL_LOST") i.status = i.sosAt ? "NO_SUPPORT" : "READY";
  }
  async chat(i: Incident, text: string) {
    if (terminal(i)) throw new Error("SESSION_ENDED");
    if (!i.ai.enabled || !i.ai.consentedAt)
      throw new Error("AI_CONSENT_REQUIRED");
    if (i.ai.calls >= 40) throw new Error("AI_SESSION_LIMIT");
    original(i, "You", text);
    i.needs = parseNeeds(text, i.needs);
    const hit = emergency(text);
    if (hit) {
      i.risk = hit.risk;
      event(i, "URGENT", [
        "Nội dung cần chú ý khẩn cấp. Bạn có thể chọn SOS hoặc gọi hỗ trợ.",
        "Urgent content detected. You can choose SOS or call for help.",
      ]);
    }
    i.ai.calls++;
    try {
      const result = await analyze(i, text);
      original(i, "Guardian AI", result.reply);
      i.ai.status = "LIVE";
      i.ai.error = null;
      return { ...result, intent: hit ? "SOS" : result.intent };
    } catch (e) {
      i.ai.status = "ERROR";
      i.ai.error = e instanceof Error ? e.message : "AI_FAILED";
      event(i, "AI_ERROR", [
        "AI chưa trả lời; SOS bằng nút vẫn dùng được.",
        "AI did not respond; the SOS button still works.",
      ]);
      return { reply: "", intent: hit ? "SOS" : "CHAT", reason: i.ai.error };
    }
  }
  lose(i: Incident) {
    if (terminal(i) || i.status === "SIGNAL_LOST") return;
    invalidate(i, [
      "Mất cập nhật vị trí; dừng chỉ dẫn.",
      "Location updates lost; guidance stopped.",
    ]);
    i.status = "SIGNAL_LOST";
    i.sharedAt = now();
    seal(i, [
      "Mất liên lạc; hồ sơ được mở cho người thân đã tham gia.",
      "Contact lost; joined contacts can access the sealed record.",
    ]);
  }
  async tick(a: Account, time = Date.now()) {
    const i = a.incident;
    if (terminal(i)) {
      cancelCalls(i);
      return false;
    }
    await this.runCalls(a, time);
    if (
      i.demo?.status === "RUNNING" &&
      !i.demo.paused &&
      Date.parse(i.demo.nextAt) <= time
    ) {
      await this.demoStep(i);
      return true;
    }
    if (i.demo) return false;
    let changed = false;
    for (const reply of i.replies) {
      if (reply.state === "RINGING" && time - Date.parse(reply.at) >= 45000) {
        reply.state = "NO_ANSWER";
        event(
          i,
          "NO_ANSWER",
          [
            `${reply.name}: chưa trả lời sau 45 giây.`,
            `${reply.name}: no answer after 45 seconds.`,
          ],
          [reply.id],
        );
        changed = true;
      }
    }
    const p = activePlan(i),
      r = i.replies.find((r) => r.id === p?.replyId);
    if (p && r && admission(i, r, time).length) {
      await this.plan(i, time);
      changed = true;
    }
    if (
      i.mode === "LIVE" &&
      i.location &&
      (i.sosAt || i.trip?.state === "ACTIVE") &&
      time - Date.parse(i.location.at) > 90000 &&
      i.status !== "SIGNAL_LOST"
    ) {
      this.lose(i);
      changed = true;
    }
    const trip = i.trip;
    if (trip?.state === "ACTIVE" && Date.parse(trip.dueAt) <= time) {
      trip.state = "CHECKING";
      trip.checkBy = new Date(time + 30000).toISOString();
      i.status = "CHECK_IN";
      event(i, "CHECK_IN", [
        "Bạn vẫn ổn chứ? Xác nhận trong 30 giây.",
        "Are you OK? Check in within 30 seconds.",
      ]);
      changed = true;
    } else if (
      trip?.state === "CHECKING" &&
      Date.parse(trip.checkBy!) <= time
    ) {
      trip.state = "STOPPED";
      if (!i.sosAt && i.location && time - Date.parse(i.location.at) < 90000)
        await this.sos(
          a,
          i.locale === "vi"
            ? "Không trả lời hẹn giờ kiểm tra."
            : "Missed scheduled check-in.",
        );
      this.lose(i);
      changed = true;
    }
    return changed;
  }
  async startDemo(a: Account, locale: Locale, ai = false) {
    await this.create(a, "DEMO", locale);
    const i = a.incident;
    if (ai) {
      i.ai.enabled = true;
      i.ai.consentedAt = now();
      i.ai.status = "READY";
    }
    i.demo = {
      step: -1,
      paused: false,
      nextAt: now(),
      status: "RUNNING",
      error: null,
    };
    await this.demoStep(i);
    return i;
  }
  async demoStep(i: Incident) {
    const d = i.demo;
    if (!d || d.status !== "RUNNING") return;
    const step = d.step + 1;
    const t = (vi: string, en: string) => (i.locale === "vi" ? vi : en);
    try {
      if (step === 0)
        event(i, "DEMO_CONTEXT", [
          "22:15. Tình huống mô phỏng: một người đi bộ cảm thấy bị theo dõi.",
          "22:15. Simulated scenario: a walker feels they are being followed.",
        ]);
      if (step === 1) {
        const a = {
          id: "demo",
          version: 0,
          incident: i,
          members: [],
          history: [],
        } as Account;
        await this.sos(
          a,
          t(
            "Có người bám theo tôi. Tôi cần chỗ chờ, không qua hẻm.",
            "Someone is following me. I need a place to wait without using an alley.",
          ),
        );
        if (i.replies.length !== 5)
          throw new Error("DEMO_EXPECTED_FIVE_RECIPIENTS");
      }
      if (step === 2) {
        await this.reply(
          i,
          "venue-cafe",
          t("Có lẽ được, để hỏi quản lý.", "Maybe, let me ask the manager."),
          false,
        );
        await this.reply(
          i,
          "venue-hotel",
          t(
            "Đồng ý, bạn có thể vào chờ qua cửa sau ở hẻm.",
            "I accept. You can wait here; use the back entrance through the alley.",
          ),
          false,
        );
        await this.reply(
          i,
          "contact-linh",
          t(
            "Tôi đang đến đón, 10 phút nữa tới.",
            "I am on my way to pick you up, arriving in 10 minutes.",
          ),
          false,
        );
        await this.reply(
          i,
          "contact-minh",
          t("Tôi sẽ giữ liên lạc.", "I will stay in touch."),
          false,
        );
        if (activePlan(i)) throw new Error("UNVERIFIED_PLAN");
      }
      if (step === 3) {
        await this.reply(
          i,
          "venue-cafe",
          t(
            "Đồng ý, có chỗ ngồi chờ, nhân viên đón ở cửa chính.",
            "I accept. You can wait here; staff will meet you at the main entrance.",
          ),
          i.ai.enabled,
        );
        await this.reply(
          i,
          "venue-shop",
          t(
            "Đồng ý, bạn có thể vào chờ ở cửa chính.",
            "I accept. You can wait here by the main entrance.",
          ),
          i.ai.enabled,
        );
        if (!activePlan(i)) throw new Error("NO_CONFIRMED_PLAN");
      }
      if (step === 4) {
        const p = activePlan(i)!;
        event(
          i,
          "COMPARE",
          [
            `Chọn ${p.destination} từ lời đồng ý; nơi qua hẻm bị loại.`,
            `Selected ${p.destination} from a confirmed offer; alley access is excluded.`,
          ],
          [p.replyId],
        );
      }
      if (step === 5) {
        this.accept(i, activePlan(i)!.id);
        event(i, "COORDINATION", [
          "Linh tự báo 10 phút; Minh giữ liên lạc.",
          "Linh reported 10 minutes; Minh stays in touch.",
        ]);
      }
      if (step === 6) {
        const old = activePlan(i)!;
        const r = i.replies.find((r) => r.id === old.replyId)!;
        await this.reply(
          i,
          r.memberId,
          t(
            "Xin lỗi, nhân viên vừa đi, không thể nhận giúp nữa.",
            "Sorry, our staff have left. I can no longer help.",
          ),
          false,
        );
        if (!old.invalidatedAt || !activePlan(i) || activePlan(i)?.acceptedAt)
          throw new Error("WITHDRAWAL_NOT_REPLANNED");
      }
      if (step === 7) {
        const old = activePlan(i)!;
        await this.block(i);
        if (!old.invalidatedAt || !activePlan(i) || activePlan(i)?.acceptedAt)
          throw new Error("BLOCK_NOT_REPLANNED");
      }
      if (step === 8) {
        i.risk = 4;
        original(
          i,
          "You",
          t(
            "Tôi bị cướp và đang chảy máu.",
            "I have been robbed and I am bleeding.",
          ),
        );
        event(i, "EMERGENCY", [
          "Tình huống mô phỏng có thương tích. Nút 115 do người dùng tự chọn.",
          "Simulated injury. Only the user can choose to dial 115.",
        ]);
        seal(i, [
          "Ghi nhận tình huống khẩn cấp mô phỏng",
          "Simulated emergency recorded",
        ]);
      }
      if (step === 9) {
        this.lose(i);
        if (!i.sharedAt || !i.seals.length || activePlan(i))
          throw new Error("LOSS_NOT_SEALED");
        d.status = "DONE";
      }
      d.step = step;
      d.nextAt = new Date(Date.now() + 12000).toISOString();
      event(i, "DEMO_STEP", [
        `Chặng ${step + 1}/10 hoàn tất theo trạng thái engine.`,
        `Step ${step + 1}/10 completed from engine state.`,
      ]);
    } catch (e) {
      d.status = "FAILED";
      d.error = e instanceof Error ? e.message : "DEMO_FAILED";
      event(i, "DEMO_FAILED", [
        "Demo dừng vì không đạt điều kiện.",
        "Demo stopped because a condition was not met.",
      ]);
    }
  }
}
const shared = globalThis as unknown as {
  guardianNew?: Engine;
  guardianTimer?: ReturnType<typeof setInterval>;
  guardianTick?: boolean;
};
export function getEngine() {
  if (!shared.guardianNew) shared.guardianNew = new Engine();
  if (!shared.guardianTimer) {
    shared.guardianTimer = setInterval(async () => {
      if (shared.guardianTick) return;
      shared.guardianTick = true;
      try {
        const e = shared.guardianNew!;
        for (const a of await e.repo.all()) {
          if (terminal(a.incident)) continue;
          await e.with(a.id, async (fresh) => {
            await e.tick(fresh);
          });
        }
      } catch {
        /* Fail closed: clients see errors; never log private state. */
      } finally {
        shared.guardianTick = false;
      }
    }, 2000);
    shared.guardianTimer.unref();
  }
  return shared.guardianNew;
}
