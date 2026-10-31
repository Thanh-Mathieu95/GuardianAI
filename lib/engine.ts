import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { Store } from "./store";
import { seeds } from "./fixtures";
import { findPlaces, getRoute, gatewayCall } from "./adapters";
import { policyGate } from "./policy";
import { meters } from "./geo";
import { MIN_REPUTATION, Network, SOS_PER_HOUR, type Member } from "./network";
import { AIService, emptyAI, type AIAnalysis, type AIDecision, type AIResult } from "./ai";
import { offersOf, offersSignature } from "./coordination";
import {
  cityAnchor,
  cityHome,
  cityPlaces,
  cityRoute,
  cityStart,
  deviate,
  edges as cityEdges,
  landmarks,
  locate,
  nodes as cityNodes,
  partnerSlots,
  progress,
  storeById,
  toLL,
  walk,
} from "./city";
import { classifyEmergency, type EmergencyHit } from "./emergency";
import { digest, dossier } from "./evidence";
import { appendRecording } from "./recordings";
import { RouteAgent } from "./route-agent";
import { groundFamily, interpretFamily } from "./family";
import { assessPlace, assessmentTime, researchCandidates, venueHours } from "./place-context";
import {
  checkSupport,
  clarificationQuestion,
  emptyNeeds,
  emptySupport,
  extractSupport,
  groundedSupport,
  latestSupport,
  needsSchema,
  offerFrom,
  partnerProfile,
  scriptedReply,
  statedNeeds,
  supportSignature,
  type DemoCase,
  type Needs,
  type Support,
} from "./support";
import type {
  Adapter,
  AgentName,
  Call,
  Incident,
  Mode,
  Place,
  Plan,
  Point,
  Route,
  RouteDecision,
  RouteOption,
  Scenario,
  Status,
  Transcript,
} from "./types";
const now = () => new Date().toISOString();
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().trim();
// What people say → venue kind (accent-free).
const kindWords: Record<string, RegExp> = {
  POLICE: /cong an|canh sat|police|trinh bao|bao an ninh/,
  HOSPITAL: /benh vien|cap cuu|hospital/,
  CLINIC: /phong kham|tram y te|\by te\b|bac si|clinic/,
  PHARMACY: /thuoc|pharmacy/,
  HOTEL: /khach san|hotel|nha nghi/,
  CAFE: /ca phe|cafe|coffee|quan nuoc/,
  RESTAURANT: /quan an|nha hang|do an|an dem|restaurant/,
  CONVENIENCE: /tien loi|cua hang|tap hoa|24h|minimart/,
  MARKET: /sieu thi|cho mini|cho dem|market/,
  BANK: /atm|ngan hang|rut tien|bank/,
  PETROL: /xang|nhien lieu|petrol/,
  SECURITY: /bao ve|security/,
  HOME: /^nha$|ve nha|nha (?:minh|toi|em)|home/,
};
const terminal = (i: Incident) =>
  ["CLOSED", "USER_CANCELLED"].includes(i.status);
export { meters };
export const isPartner = (p: Place) => p.id.startsWith("partner-");
// Demo timings, in engine ticks (500 ms in production, 5 ms in tests).
const PARTNER_RING_TICKS = 90;
const PARTNER_DECIDE_TICKS = 160;
const CONTACT_RING_MS = 60000;
const CHECKIN_MS = 30000;
export class GuardianEngine {
  routeWorker = new RouteAgent();
  cache = new Map<string, Incident>();
  bus = new EventEmitter();
  routing = new Set<string>();
  pendingReplans = new Map<string, string>();
  aiAbort = new Map<string, AbortController>();
  dialogueAbort = new Map<string, Set<AbortController>>();
  dialogueTimeoutMs = 18000;
  modelTaskTimeoutMs = 12000;
  network: Network;
  // New incidents use these adapters unless the operator picks others (tests keep FIXTURE).
  defaults: { placesAdapter: Adapter; routeAdapter: Adapter } = {
    placesAdapter: "FIXTURE",
    routeAdapter: "FIXTURE",
  };
  constructor(
    public store = new Store(),
    public tick = 500,
    public aiService = new AIService(),
  ) {
    this.bus.setMaxListeners(500);
    this.network = new Network(store.db);
  }
  get(id: string, owner: string) {
    let i = this.cache.get(id);
    if (!i) {
      i = this.store.load(id);
      if (i) {
        i.ai ??= emptyAI();
        i.contacts ??= [];
        if (i.showcase?.status === "RUNNING") {
          i.showcase.status = "FAILED";
          i.showcase.error = "Server vừa khởi động lại. Bấm chạy lại demo để bắt đầu phiên mới.";
          this.invalidatePlan(i, "Demo gián đoạn do server khởi động lại.");
          this.store.save(i);
        }
        if (i.ai.busy) {
          i.ai.busy = false;
          i.ai.status = i.ai.enabled ? "FALLBACK" : "OFF";
          i.ai.error = "AI request bị gián đoạn do restart; không tự gửi lại.";
          for (const run of i.ai.runs)
            if (run.status === "RUNNING") {
              run.status = "FAILED";
              run.error = i.ai.error;
            }
          this.store.save(i);
        }
        if (i.running) {
          i.running = false;
          i.frozen = false;
          i.generation++;
          i.message =
            "Backend vừa khởi động lại. Chạy lại gọi thử để tiếp tục.";
          i.status = "NO_RESPONDERS";
          for (const c of i.calls)
            if (["RINGING", "CONNECTED", "QUEUED"].includes(c.status))
              c.status = "FAILED";
          this.store.save(i);
        }
        this.cache.set(id, i);
      }
    }
    if (!i || i.owner !== owner) throw new Error("NOT_FOUND");
    return i;
  }
  latest(owner: string) {
    const i = this.store.latest(owner);
    return i ? this.get(i.id, owner) : this.create(owner);
  }
  create(
    owner: string,
    options: {
      locale?: "vi" | "en";
      scenario?: Scenario;
      zone?: "HANOI" | "HCM";
      mode?: Mode;
      placesAdapter?: Adapter;
      routeAdapter?: Adapter;
      aiEnabled?: boolean;
      demoCase?: DemoCase;
      needs?: Needs;
      simulatorOnly?: boolean;
      networkOnly?: boolean;
    } = {},
  ) {
    const zone = options.zone || "HANOI",
      placesAdapter = options.placesAdapter || this.defaults.placesAdapter,
      routeAdapter = options.routeAdapter || this.defaults.routeAdapter,
      scenarioClock = (options.mode ?? "SIMULATION") === "SIMULATION" && placesAdapter === "CITY" ? new Date().toISOString().slice(0, 10) + "T22:15:00+07:00" : undefined;
    const i: Incident = {
      locale: options.locale ?? "vi",
      id: "INC-" + randomUUID().slice(0, 8).toUpperCase(),
      needs: needsSchema.parse(options.needs ?? emptyNeeds()),
      demoCase: options.demoCase ?? "BASIC",
      simulatorOnly: options.simulatorOnly ?? false,
      networkOnly: options.networkOnly ?? false,
      owner,
      mode: options.mode || "SIMULATION",
      status: "ACTIVE_TRIP",
      createdAt: now(),
      updatedAt: now(),
      scenario: options.scenario || "NIGHT_WALK",
      zone,
      scenarioClock,
      location: {
        ...(placesAdapter === "CITY"
          ? toLL(cityAnchor, cityStart)
          : seeds[zone]),
        kind: "MOCK",
        observedAt: now(),
        stale: false,
      },
      riskLevel: 1,
      riskReasons: [],
      unknowns: [],
      places: placesAdapter === "CITY" ? cityPlaces(cityAnchor, now(), [], scenarioClock) : [],
      calls: [],
      plans: [],
      events: [],
      transcript: [],
      message:
        "Guardian sẵn sàng. Bạn có thể nói hoặc nhấn SOS khi cần hỗ trợ.",
      frozen: false,
      logicalMs: 0,
      running: false,
      generation: 0,
      blockedCount: 0,
      placesAdapter,
      routeAdapter,
      metrics: { maxConcurrentCalls: 0, policyBlocked: 0 },
      consent: { location: false, calls: false },
      contacts: [],
      appearance: this.network.settings(owner).appearance || undefined,
      ai: {
        ...emptyAI(),
        enabled: options.aiEnabled || false,
        consentAt: options.aiEnabled ? now() : undefined,
        status: options.aiEnabled ? "READY" : "OFF",
      },
    };
    this.cache.set(i.id, i);
    this.event(
      i,
      "Monitoring",
      "TRIP_STARTED",
      "Bắt đầu kịch bản " + i.scenario,
    );
    i.track = [
      {
        lat: i.location.lat,
        lng: i.location.lng,
        at: i.location.observedAt,
        kind: i.location.kind,
      },
    ];
    return i;
  }
  event(
    i: Incident,
    agent: AgentName,
    type: string,
    summary: string,
    status: "WORKING" | "SUCCEEDED" | "FAILED" | "WAITING" = "SUCCEEDED",
    refs: string[] = [],
    sourceKind: "LIVE" | "SIMULATED" = "SIMULATED",
  ) {
    i.updatedAt = now();
    i.events.push({
      id: randomUUID(),
      incidentId: i.id,
      time: now(),
      logicalMs: i.logicalMs,
      agent,
      type,
      status,
      summary,
      evidenceRefs: refs,
      sourceKind,
      reasonCode: type,
    });
    this.store.save(i);
    this.bus.emit(i.id, i);
    this.bus.emit("owner:" + i.owner, i);
  }
  state(i: Incident, status: Status) {
    i.status = status;
  }
  setAI(i: Incident, enabled: boolean, consent: boolean) {
    if (terminal(i)) throw new Error("Incident đã kết thúc.");
    if (enabled && (!consent || !this.aiService.configured()))
      throw new Error(
        "Cần cấu hình AI và đồng ý gửi nội dung hội thoại trước khi bật.",
      );
    if (!enabled) this.aiAbort.get(i.id)?.abort();
    if (!enabled)
      for (const controller of this.dialogueAbort.get(i.id) ?? [])
        controller.abort();
    if (!enabled) {
      i.ai.busy = false;
      for (const run of i.ai.runs)
        if (run.status === "RUNNING") {
          run.status = "FAILED";
          run.error = "Người dùng đã tắt AI.";
        }
    }
    i.ai.enabled = enabled;
    i.ai.status = enabled ? "READY" : "OFF";
    i.ai.consentAt = enabled ? now() : undefined;
    i.ai.pendingAction = undefined;
    this.event(
      i,
      "Policy",
      "AI_CONSENT",
      enabled
        ? "Đã bật AI theo đồng ý của người dùng; gửi hội thoại và ngữ cảnh đã tối thiểu hóa."
        : "Đã tắt AI. Không gửi yêu cầu mô hình mới.",
    );
  }
  private async runAI<T>(
    i: Incident,
    task: "ANALYZE" | "PLAN" | "ROUTE_DECISION",
    fn: (signal: AbortSignal) => Promise<AIResult<T>>,
  ): Promise<T> {
    if (!i.ai.enabled || !i.ai.consentAt)
      throw new Error("AI chưa bật hoặc chưa có consent.");
    if (i.ai.busy) throw new Error("AI đang xử lý yêu cầu trước.");
    if (i.ai.runs.length >= 40)
      throw new Error(
        "Đã đạt 40 yêu cầu AI cho incident. Tạo phiên mới để tiếp tục.",
      );
    const c = this.aiService.configured();
    if (!c) throw new Error("Chưa cấu hình AI. Mở SETUP-AI.cmd.");
    const generation = i.generation,
      controller = new AbortController(),
      started = Date.now();
    this.aiAbort.set(i.id, controller);
    const run: Incident["ai"]["runs"][number] = {
      id: randomUUID(),
      task,
      provider: c.provider,
      model: c.model,
      status: "RUNNING",
      time: now(),
      latencyMs: 0,
    };
    i.ai.runs.push(run);
    i.ai.busy = true;
    i.ai.status = "THINKING";
    i.ai.provider = c.provider;
    i.ai.model = c.model;
    i.ai.error = undefined;
    this.event(
      i,
      task === "ROUTE_DECISION" ? "Route" : task === "PLAN" ? "Coordinator" : "Voice",
      "AI_REQUESTED",
      `${c.provider} / ${c.model} · ${task}`,
      "WORKING",
      [run.id],
      "LIVE",
    );
    const deadline = setTimeout(() => controller.abort(), Math.min(c.timeoutMs, this.modelTaskTimeoutMs));
    try {
      const result = await Promise.race([
        fn(controller.signal),
        new Promise<never>((_, reject) => {
          const fail = () => reject(new Error("AI_TIMEOUT_OR_CANCELLED"));
          if (controller.signal.aborted) fail();
          else controller.signal.addEventListener("abort", fail, { once: true });
        }),
      ]);
      if (generation !== i.generation || terminal(i) || !i.ai.enabled)
        throw new Error("AI_CANCELLED");
      run.status = "SUCCEEDED";
      run.latencyMs = result.latencyMs;
      run.requestId = result.requestId;
      i.ai.status = "LIVE";
      i.ai.busy = false;
      this.event(
        i,
        task === "ROUTE_DECISION" ? "Route" : task === "PLAN" ? "Coordinator" : "Voice",
        "AI_COMPLETED",
        `${result.provider} / ${result.model} · ${task} · ${result.latencyMs} ms`,
        "SUCCEEDED",
        [run.id],
        "LIVE",
      );
      return result.data;
    } catch (error) {
      run.status = "FAILED";
      run.latencyMs = Date.now() - started;
      run.error =
        error instanceof Error ? error.message : "AI request thất bại";
      if (generation === i.generation && !terminal(i) && i.ai.enabled) {
        i.ai.status = "FALLBACK";
        i.ai.error = run.error;
        i.ai.busy = false;
        this.event(
          i,
          "Monitoring",
          "AI_FAILED",
          run.error,
          "FAILED",
          [run.id],
          "LIVE",
        );
      }
      throw error;
    } finally {
      clearTimeout(deadline);
      if (this.aiAbort.get(i.id) === controller) {
        this.aiAbort.delete(i.id);
        i.ai.busy = false;
      }
    }
  }
  async conversation(
    i: Incident,
    text: string,
    source: "TEXT" | "MIC" = "TEXT",
  ) {
    if (terminal(i) || i.running || i.ai.busy)
      throw new Error("Incident hoặc AI đang xử lý.");
    if (!i.ai.enabled)
      throw new Error("Bật AI cho phiên trước khi trò chuyện.");
    i.ai.pendingAction = undefined;
    const needs = statedNeeds(text, i.needs ?? emptyNeeds());
    if (JSON.stringify(needs) !== JSON.stringify(i.needs)) {
      i.needs = needs;
      if (i.plans.some((p) => !p.superseded))
        await this.replan(i, "NEEDS_UPDATED");
    }
    i.transcript.push({ speaker: "Bạn", text, time: now(), source });
    this.event(
      i,
      "Voice",
      "TRANSCRIPT_RECEIVED",
      text,
      "SUCCEEDED",
      [],
      source === "MIC" ? "LIVE" : "SIMULATED",
    );
    const g = i.generation;
    let assessment: AIAnalysis;
    try {
      assessment = await this.runAI(i, "ANALYZE", (signal) =>
        this.aiService.analyze(i, text, signal),
      );
    } catch (error) {
      if (g !== i.generation || terminal(i) || !i.ai.enabled) return;
      i.message =
        "AI chưa trả lời được. Bạn vẫn có thể dùng nút SOS để chạy luồng hỗ trợ dự phòng.";
      i.ai.status = "FALLBACK";
      i.ai.error = error instanceof Error ? error.message : "AI thất bại";
      this.event(i, "Voice", "AI_FALLBACK", i.message, "WAITING");
      return;
    }
    if (g !== i.generation || terminal(i) || !i.ai.enabled) return;
    i.ai.assessment = assessment;
    i.ai.lastReply = assessment.reply;
    i.message = assessment.reply;
    i.transcript.push({
      speaker: "Guardian AI",
      text: assessment.reply,
      time: now(),
      source: "AI",
    });
    if (
      assessment.intent === "SOS" &&
      assessment.confidence >= 0.75 &&
      !i.plans.some((p) => !p.superseded)
    ) {
      this.event(
        i,
        "Voice",
        "AI_INTENT_DETECTED",
        `Ý định SOS · confidence ${assessment.confidence.toFixed(2)}`,
        "SUCCEEDED",
        [],
        "LIVE",
      );
      await this.sos(i, text, source, true, assessment, false);
      return;
    }
    if (
      ["SOS", "BLOCK_ROUTE", "CANCEL", "ARRIVED", "ESCALATE"].includes(
        assessment.intent,
      )
    )
      i.ai.pendingAction = {
        intent: assessment.intent as NonNullable<
          Incident["ai"]["pendingAction"]
        >["intent"],
        createdAt: now(),
      };
    this.event(
      i,
      "Voice",
      "AI_REPLY",
      assessment.reply,
      "SUCCEEDED",
      [],
      "LIVE",
    );
  }
  async confirmAIAction(i: Incident, accept: boolean) {
    const pending = i.ai.pendingAction;
    if (!pending || terminal(i))
      throw new Error("Không có đề xuất AI đang chờ.");
    i.ai.pendingAction = undefined;
    if (!accept) {
      this.event(
        i,
        "Policy",
        "AI_ACTION_REJECTED",
        "Người dùng từ chối đề xuất " + pending.intent,
      );
      return;
    }
    if (Date.now() - Date.parse(pending.createdAt) > 120000) {
      this.event(
        i,
        "Policy",
        "AI_ACTION_EXPIRED",
        "Đề xuất AI đã hết hạn; yêu cầu lại để dùng trạng thái mới.",
        "WAITING",
      );
      throw new Error(
        "Đề xuất đã quá 2 phút; yêu cầu lại để dùng trạng thái mới.",
      );
    }
    this.event(
      i,
      "Policy",
      "AI_ACTION_CONFIRMED",
      "Người dùng xác nhận " + pending.intent,
    );
    if (pending.intent === "CANCEL") {
      this.close(i, true);
      return;
    }
    if (pending.intent === "ARRIVED") {
      if (!i.plans.some((p) => !p.superseded))
        throw new Error("Chưa có nơi tiếp nhận đã xác nhận.");
      this.confirmHandoff(i, "USER", i.plans.find((p) => !p.superseded)!.id);
      return;
    }
    if (pending.intent === "SOS") {
      const last = i.transcript.filter((t) => t.speaker === "Bạn").at(-1);
      await this.sos(
        i,
        last?.text || "Tôi cần hỗ trợ.",
        last?.source === "MIC" ? "MIC" : "TEXT",
        true,
        i.ai.assessment,
        false,
      );
      return;
    }
    if (pending.intent === "BLOCK_ROUTE") {
      await this.userBlocksRoute(i);
      return;
    }
    this.escalate(i);
  }
  async delay(i: Incident, generation: number, multiplier = 1) {
    let elapsed = 0;
    while (elapsed < this.tick * multiplier) {
      await new Promise((r) => setTimeout(r, Math.min(this.tick, 100)));
      if (generation !== i.generation || terminal(i)) return false;
      if (!i.frozen) {
        elapsed += Math.min(this.tick, 100);
        i.logicalMs += Math.min(this.tick, 100);
      }
    }
    while (i.frozen) {
      await new Promise((r) => setTimeout(r, 100));
      if (generation !== i.generation || terminal(i)) return false;
    }
    return generation === i.generation && !terminal(i);
  }
  async sos(
    i: Incident,
    text: string,
    source: "TEXT" | "MIC" = "TEXT",
    explicit = true,
    aiAssessment?: AIAnalysis,
    recordTranscript = true,
  ) {
    if (terminal(i) || i.running || i.plans.some((p) => !p.superseded))
      throw new Error(
        "Incident đang xử lý hoặc đã kết thúc. Tạo kịch bản mới để bắt đầu lại.",
      );
    if (i.mode === "TEST_LIVE" && (i.location.kind !== "LIVE" || i.location.stale))
      throw new Error("Live location is required before dispatch. Update GPS and retry.");
    if (recordTranscript)
      i.transcript.push({ speaker: "Bạn", text, time: now(), source });
    i.needs = statedNeeds(text, i.needs ?? emptyNeeds());
    this.event(
      i,
      "Voice",
      "TRANSCRIPT_RECEIVED",
      text,
      "SUCCEEDED",
      [],
      source === "MIC" ? "LIVE" : "SIMULATED",
    );
    if (
      !explicit &&
      !/giúp|cứu|sos|theo tôi|nguy hiểm|khẩn cấp|help/i.test(text)
    ) {
      i.status = "AWAITING_CONFIRMATION";
      i.message = "Bạn có muốn kích hoạt SOS không? Nhấn SOS để xác nhận.";
      this.event(i, "Voice", "CONFIRMATION_REQUIRED", i.message, "WAITING");
      return;
    }
    i.status = "SOS_RECEIVED";
    i.running = true;
    i.metrics.sosAt = now();
    // SOS coordination owns the map from here; an old free-walk route must not reappear.
    i.freeRoute = undefined;
    i.nav = undefined;
    const g = ++i.generation;
    this.event(
      i,
      "Coordinator",
      "SOS_TRIGGERED",
      i.covert
        ? "SOS bí mật (mật mã an toàn); khởi động tác vụ phối hợp."
        : "Đã nhận yêu cầu hỗ trợ; khởi động tác vụ phối hợp.",
      "WORKING",
    );
    if (!i.seals?.length) this.sealEvidence(i, "Kích hoạt SOS");
    if (i.trip && ["ACTIVE", "CHECKING"].includes(i.trip.status))
      i.trip.status = "ESCALATED";
    // Anti-spam: contacts are always alerted; partners only within limits.
    const sosCount = i.showcase ? 0 : this.network.recordSos(i.owner),
      reputation = this.network.settings(i.owner).reputation,
      partnersAllowed = sosCount <= SOS_PER_HOUR && reputation > MIN_REPUTATION;
    if (!partnersAllowed)
      this.event(
        i,
        "Policy",
        "PARTNER_DISPATCH_LIMITED",
        sosCount > SOS_PER_HOUR
          ? `Đã ${sosCount} SOS trong 1 giờ (giới hạn ${SOS_PER_HOUR}); chỉ báo người thân.`
          : "Uy tín tài khoản thấp do báo động giả; chỉ báo người thân.",
        "WAITING",
      );
    if (!i.showcase) this.alertContacts(i, g);
    if (!(await this.delay(i, g))) return;
    i.status = "TRIAGE";
    if (i.ai.enabled && !aiAssessment) {
      try {
        aiAssessment = await this.runAI(i, "ANALYZE", (signal) =>
          this.aiService.analyze(i, text, signal),
        );
        i.ai.assessment = aiAssessment;
        i.ai.lastReply = aiAssessment.reply;
      } catch (error) {
        if (g !== i.generation || terminal(i)) return;
        i.ai.status = i.ai.enabled ? "FALLBACK" : "OFF";
        i.ai.error = error instanceof Error ? error.message : "AI thất bại";
        this.event(
          i,
          "Risk",
          "AI_FALLBACK",
          "AI chưa khả dụng; SOS tiếp tục bằng logic dự phòng.",
          "WAITING",
        );
      }
    }
    if (g !== i.generation || terminal(i)) return;
    i.riskLevel = aiAssessment
      ? (aiAssessment.riskLevel as 1 | 2 | 3 | 4)
      : /theo|cứu|khẩn|nguy hiểm/i.test(text)
        ? 3
        : 2;
    i.riskReasons = aiAssessment
      ? aiAssessment.reasons
      : ["Người dùng chủ động yêu cầu hỗ trợ", `Nội dung: ${text}`];
    i.unknowns = [
      "Chưa xác minh nguy hiểm thực địa",
      "Không suy ra hành vi tội phạm từ GPS",
      ...(aiAssessment?.unknowns || []),
    ];
    i.message =
      aiAssessment?.reply ||
      "Tôi đã nhận yêu cầu. Đang tìm và xác minh các điểm có thể tiếp nhận bạn.";
    this.event(
      i,
      "Risk",
      "RISK_ASSESSED",
      "Mức hỗ trợ " +
        i.riskLevel +
        "/4 · " +
        (aiAssessment
          ? "AI đề xuất, chưa xác minh thực địa."
          : "logic dự phòng, không phải kết luận có tội phạm."),
      "SUCCEEDED",
      [],
      aiAssessment ? "LIVE" : "SIMULATED",
    );
    if (!(await this.delay(i, g))) return;
    i.status = "SEARCHING";
    this.event(
      i,
      "Research",
      "SEARCH_STARTED",
      "Tìm điểm hỗ trợ qua " + i.placesAdapter,
      "WORKING",
    );
    try {
      const places =
        i.networkOnly && i.mode === "TEST_LIVE" ? [] : i.placesAdapter === "CITY"
          ? cityPlaces(cityAnchor, now(), this.takenStores(i), assessmentTime(i))
          : await findPlaces(i.location, i.placesAdapter);
      if (g !== i.generation || terminal(i)) return;
      i.places = [
        ...(partnersAllowed && !i.simulatorOnly ? this.partnerPlaces(i) : []),
        ...places,
      ];
    } catch (error) {
      if (g !== i.generation || terminal(i)) return;
      i.message =
        String(error) + ". Bạn có thể chuyển sang fixture trong kịch bản mới.";
      i.status = "NO_RESPONDERS";
      i.running = false;
      this.event(i, "Research", "SEARCH_FAILED", i.message, "FAILED");
      return;
    }
    i.metrics.candidatesMs = Date.now() - Date.parse(i.metrics.sosAt!);
    this.event(
      i,
      "Research",
      "PLACE_FOUND",
      `Tìm thấy ${i.places.length} ứng viên; chưa có nơi xác nhận hỗ trợ.`,
      "SUCCEEDED",
      i.places.flatMap((p) => p.evidenceRefs),
      i.placesAdapter === "GOOGLE" ? "LIVE" : "SIMULATED",
    );
    for (const p of i.places)
      this.event(
        i,
        "Verification",
        "PLACE_VERIFIED",
        `${p.name}: ${isPartner(p) ? "ĐỐI TÁC ĐÃ ĐĂNG KÝ" : "PUBLIC_INFO_ONLY"} · ${p.contactEligibility}`,
        "SUCCEEDED",
        p.evidenceRefs,
        i.placesAdapter === "GOOGLE" ? "LIVE" : "SIMULATED",
      );
    i.running = false;
    i.status = "CONTACTING";
    if (i.places.some(isPartner)) {
      // Registered partners are dispatched immediately; no operator step.
      i.message = "Đang gọi các điểm đối tác gần bạn qua app Guardian.";
      this.event(i, "Calling", "CALLS_READY", i.message, "WORKING");
      void this.startCalls(i, i.networkOnly ? "APP" : i.mode === "SIMULATION" ? "MOCK" : "APP").catch(
        (e) => {
          i.running = false;
          this.event(i, "Monitoring", "TASK_FAILED", String(e), "FAILED");
        },
      );
      return;
    }
    if (i.mode === "TEST_LIVE") i.status = "NO_RESPONDERS";
    i.message = i.mode === "TEST_LIVE"
      ? "Chưa có điểm hỗ trợ đăng ký sẵn sàng. Kiểm tra phản hồi của người thân; chưa có tuyến tiếp nhận."
      : "Các điểm chưa xác nhận. Bắt đầu cuộc gọi mô phỏng để kiểm tra khả năng tiếp nhận.";
    this.event(i, "Calling", "CALLS_READY", i.message, "WAITING");
    if (i.scenario === "LOCATION_LOST") this.inject(i, "GPS_STALE");
  }
  // Map stores currently answered by a real partner (their simulated twin is hidden).
  takenStores(i: Incident) {
    return this.network
      .list(i.owner)
      .filter(
        (m) =>
          m.role === "PARTNER" && m.joined && m.onDuty && storeById(m.slot),
      )
      .map((m) => m.slot!);
  }
  // Partners on duty become candidate places; unknown coordinates are placed near the user (demo).
  partnerPlaces(i: Incident): Place[] {
    return this.network
      .list(i.owner)
      .filter((m) => m.role === "PARTNER" && m.joined && m.onDuty)
      .filter((m) => i.mode !== "TEST_LIVE" || (m.lat !== null && m.lng !== null))
      .slice(0, 3)
      .map((m, n) => ({
        id: "partner-" + m.id,
        name: m.name,
        category: m.category,
        ...(i.placesAdapter === "CITY" && m.slot ? { profile: storeById(m.slot)?.profile } : {}),
        // On the simulated city partners occupy a chosen store or a fixed street address.
        ...(i.placesAdapter === "CITY"
          ? toLL(cityAnchor, storeById(m.slot) ?? partnerSlots[n])
          : {
              lat: m.lat ?? i.location.lat + [0.0021, -0.0017, 0.0012][n],
              lng: m.lng ?? i.location.lng + [0.0026, 0.0019, -0.0029][n],
            }),
        address:
          i.placesAdapter === "CITY"
            ? (storeById(m.slot)?.address ?? partnerSlots[n].address) +
              " · Thủ Thiêm (đối tác mô phỏng)"
            : m.lat === null
              ? "Vị trí demo gần người dùng"
              : "Vị trí đối tác đăng ký",
        source: "Mạng lưới đối tác Guardian · đã đồng ý nhận cuộc gọi",
        capturedAt: now(),
        openingStatus: "OPEN",
        supportStatus: "UNKNOWN",
        contactEligibility: "ALLOWLIST",
        verification: "PUBLIC_INFO_ONLY",
        evidenceRefs: ["partner:" + m.id],
      }));
  }
  alertContacts(i: Incident, g: number) {
    // The showcase must never ring real members, including escalation/GPS recovery paths.
    if (i.showcase) return;
    const members = this.network
      .list(i.owner)
      .filter((m) => m.role === "CONTACT" && m.joined);
    if (!members.length) {
      this.event(
        i,
        "Contact",
        "NO_CONTACTS",
        "Chưa có người thân nào tham gia mạng lưới.",
        "WAITING",
      );
      return;
    }
    for (const m of members)
      if (!i.contacts.some((c) => c.memberId === m.id))
        i.contacts.push({
          memberId: m.id,
          name: m.name,
          status: "RINGING",
          alertedAt: now(),
          updatedAt: now(),
        });
    this.event(
      i,
      "Contact",
      "CONTACT_ALERTED",
      "Đổ chuông app người thân: " + members.map((m) => m.name).join(", "),
      "WORKING",
      members.map((m) => "member:" + m.id),
      "LIVE",
    );
    setTimeout(() => {
      if (g !== i.generation || terminal(i)) return;
      const missed = i.contacts.filter((c) => c.status === "RINGING");
      for (const c of missed) {
        c.status = "MISSED";
        c.updatedAt = now();
      }
      if (missed.length)
        this.event(
          i,
          "Contact",
          "CONTACT_MISSED",
          "Chưa nghe máy: " + missed.map((c) => c.name).join(", "),
          "WAITING",
        );
    }, CONTACT_RING_MS).unref?.();
  }
  contactAction(
    i: Incident,
    m: Pick<Member, "id" | "name">,
    action: "ANSWER" | "ON_THE_WAY" | "KEEP_CONTACT" | "CANNOT_HELP",
    arrivalMinutes?: number,
  ) {
    if (terminal(i)) throw new Error("Sự cố đã kết thúc.");
    const c = i.contacts.find((c) => c.memberId === m.id);
    if (!c) throw new Error("Không có cảnh báo cho bạn.");
    if (action === "ANSWER" && c.status === "ON_THE_WAY") return;
    c.status = action === "ANSWER" ? "ANSWERED" : action;
    c.arrivalMinutes = action === "ON_THE_WAY" ? arrivalMinutes : undefined;
    c.updatedAt = now();
    this.event(
      i,
      "Contact",
      action === "ANSWER" ? "CONTACT_ANSWERED" : "CONTACT_" + action,
      action === "ANSWER"
        ? `${m.name} đã nghe máy và đang theo dõi.`
        : `${m.name}: ${{ ON_THE_WAY: "có thể đi đón", KEEP_CONTACT: "có thể giữ liên lạc", CANNOT_HELP: "không thể giúp" }[action]}${arrivalMinutes !== undefined ? ` · tự báo ${arrivalMinutes} phút` : ""}.`,
      "SUCCEEDED",
      ["member:" + m.id],
      i.simulatorOnly ? "SIMULATED" : "LIVE",
    );
    // Capabilities affect the coordination projection even when the destination stays stable.
    if (i.metrics.sosAt) void this.replan(i, "FAMILY_UPDATED");
  }
  async contactTranscript(i: Incident, m: Pick<Member, "id" | "name">, speaker: "AI" | "PARTNER", text: string, externalId?: string) {
    if (terminal(i)) throw new Error("Sự cố đã kết thúc.");
    const c = i.contacts.find(c => c.memberId === m.id);
    if (!c) throw new Error("Không có cảnh báo cho bạn.");
    const history = c.transcript ??= [];
    if (externalId && history.some(t => t.externalId === externalId)) return;
    if (history.length >= 100) throw new Error("Đã đạt giới hạn hội thoại; hãy dùng nút cập nhật khả năng.");
    history.push({ speaker: speaker === "AI" ? "Guardian AI" : m.name, text, time: now(), source: "APP", externalId });
    if (speaker === "PARTNER") {
      const turn = history.length;
      const response = (await this.semanticFamily(i, history, m.id, c.status)) ?? interpretFamily(history, m.id, c.status);
      // A newer family turn arrived while GPT was thinking; that turn owns the update.
      if (terminal(i) || history.length !== turn) return;
      c.response = response;
      const before = c.offer?.text;
      const ref = response.evidenceRefs[0] ?? `family:${m.id}:${turn - 1}`;
      c.offer = response.offer ? { text: response.offer, quote: text, evidenceRef: ref, source: "AI" } : offerFrom(`family:${m.id}`, history) ?? c.offer;
      const offerChanged = c.offer?.text !== before;
      if (response.message) c.lastMessage = response.message;
      if (response.message)
        this.event(i, "Contact", "CONTACT_MESSAGE", `${m.name} nhắn bạn: “${response.message}”`, "SUCCEEDED", response.evidenceRefs, i.simulatorOnly ? "SIMULATED" : "LIVE");
      if (response.action) this.contactAction(i, m, response.action, response.arrivalMinutes ?? undefined);
      // A turn without a clear capability (noise, mis-transcription, small talk) never downgrades a commitment;
      // only a conditional answer does. Repeated "unclear" turns are not re-announced.
      else if (response.conditions.length || c.status === "RINGING") {
        c.status = "ANSWERED"; c.arrivalMinutes = undefined;
        this.event(i, "Contact", "CONTACT_CAPABILITY_UPDATED", `${m.name}: cần làm rõ khả năng hỗ trợ.`, "WAITING", response.evidenceRefs);
        void this.replan(i, "FAMILY_UPDATED");
      } else if (offerChanged && i.metrics.sosAt) void this.replan(i, "FAMILY_UPDATED");
    }
    i.updatedAt = now(); this.store.save(i); this.bus.emit(i.id, i); this.bus.emit("owner:" + i.owner, i);
  }
  private async semanticFamily(i: Incident, history: Transcript[], memberId: string, current?: string) {
    if (!i.ai.enabled || !i.ai.consentAt || (i.familyRequests ?? 0) >= 40 || !this.aiService.configured()) return undefined;
    i.familyRequests = (i.familyRequests ?? 0) + 1;
    try {
      const r = await this.aiService.family(history.map(t => ({ speaker: t.speaker, text: t.text })), AbortSignal.timeout(5000));
      const grounded = groundFamily(history, memberId, r.data, current);
      this.event(i, "Contact", "FAMILY_AI_EXTRACTED", `Phân tích lời người thân · ${r.model} · ${r.latencyMs} ms`, "SUCCEEDED", grounded.evidenceRefs, "LIVE");
      return grounded;
    } catch {
      this.event(i, "Contact", "FAMILY_AI_FALLBACK", "Phân tích AI lỗi; dùng bộ đọc bảo thủ.", "WAITING", ["member:" + memberId]);
      return undefined;
    }
  }
  verifiedContactAction(i: Incident, m: Pick<Member, "id" | "name">, action: "ON_THE_WAY" | "KEEP_CONTACT" | "CANNOT_HELP", arrivalMinutes?: number) {
    const c = i.contacts.find(c => c.memberId === m.id);
    // Already recorded from the original statement: the tool call is a no-op confirmation.
    if (c?.status === action && (arrivalMinutes === undefined || arrivalMinutes === c.arrivalMinutes)) return;
    const response = c?.response;
    if (!response || response.action !== action || (arrivalMinutes !== undefined && arrivalMinutes !== response.arrivalMinutes))
      throw new Error("Chưa có lời xác nhận gốc phù hợp. Lời người thân đã được lưu và bộ điều phối tự phân tích; không hỏi lại nhiều lần, chỉ hỏi tối đa một câu ngắn nếu thật sự chưa rõ, không tự đoán thời gian đến.");
    this.contactAction(i, m, action, response.arrivalMinutes ?? undefined);
  }

  admissionChecks(i: Incident, placeId: string, route?: Route) {
    const checks = checkSupport(latestSupport(i, placeId), i.needs ?? emptyNeeds(), route);
    const place = i.places.find(p => p.id === placeId);
    if (place) checks.push(...assessPlace(i, place).blockers);
    const call = i.calls.filter(c => c.placeId === placeId).at(-1);
    if (call?.providerMode === "APP") {
      const member = call.memberId ? this.network.byId(call.memberId) : undefined;
      if (!member || member.owner !== i.owner || member.role !== "PARTNER" || !member.joined || !member.onDuty)
        checks.push("Đối tác chưa tham gia hoặc không còn trực");
    }
    return checks;
  }
  invalidatePlan(i: Incident, reason: string) {
    const plan = i.plans.find(p => !p.superseded);
    if (!plan || terminal(i)) return;
    plan.superseded = true; plan.route.superseded = true;
    i.nav = undefined; i.handoff = undefined; i.ai.pendingAction = undefined;
    i.status = "REPLANNING";
    this.event(i, "Coordinator", "PLAN_INVALIDATED", reason, "WAITING", [plan.id]);
  }
  async setScenarioClock(i: Incident, time: string) {
    if (i.mode !== "SIMULATION" || terminal(i)) throw new Error("Chỉ chỉnh đồng hồ trong sự cố mô phỏng đang mở.");
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Giờ không hợp lệ.");
    i.scenarioClock = i.createdAt.slice(0, 10) + `T${time}:00+07:00`;
    for (const p of i.places) if (p.profile) p.openingStatus = venueHours(p.profile, i.scenarioClock).status;
    const current = i.plans.find(p => !p.superseded);
    if (current && this.admissionChecks(i, current.selectedPlaceId, current.route).length)
      this.invalidatePlan(i, "Giờ hoạt động đã thay đổi; kiểm tra lại nơi tiếp nhận.");
    this.event(i, "Research", "VENUE_HOURS_UPDATED", `Đồng hồ tình huống: ${time} giờ Việt Nam. Đánh giá lại giờ mở cửa và chức năng địa điểm.`, "SUCCEEDED", [], "SIMULATED");
    if (i.metrics.sosAt) await this.replan(i, "VENUE_CONTEXT_CHANGED");
  }
  async reportDarkRoad(i: Incident) {
    if (terminal(i)) throw new Error("Sự cố đã kết thúc.");
    if (i.mode !== "SIMULATION") throw new Error("Cần xác định đoạn đường thực tế trước khi đổi tuyến; nút báo đoạn tối hiện phục vụ bản đồ mô phỏng.");
    const current = i.plans.find(p => !p.superseded);
    const target = i.places.find(p => p.id === current?.selectedPlaceId);
    if (!current || !target || i.routeAdapter !== "CITY") throw new Error("Cần phương án trên bản đồ CITY để báo đoạn tối.");
    const known = i.roadObservations?.map(r => r.edgeId) ?? [];
    const internal = [...new Set(current.route.edges?.slice(1, -1) ?? [])].filter(id => !known.includes(id));
    // Select a forward demo segment only if the graph actually offers a different walk.
    let darkId: string | undefined;
    for (const id of internal.slice(0, 12)) {
      try {
        const alternative = cityRoute(cityAnchor, i.location, target, target.name, i.blockedEdges, "dark-preview", [...known, id]);
        if (!alternative.edges?.includes(id)) { darkId = id; break; }
      } catch { /* Do not claim a detour exists when the graph cannot provide one. */ }
    }
    if (!darkId) throw new Error("Chưa tìm được đoạn phía trước có đường tránh; hãy tạm dừng và cập nhật vị trí.");
    const edge = cityEdges.find(e => e.id === darkId)!, a = cityNodes.get(edge.a)!, b = cityNodes.get(edge.b)!;
    (i.roadObservations ??= []).push({ edgeId: darkId, kind: "DARK", observedAt: now(), sourceKind: i.mode === "SIMULATION" ? "SIMULATED" : "USER_REPORT" });
    current.route.darkAt = toLL(cityAnchor, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    this.invalidatePlan(i, `Đoạn ${edge.name} vừa được báo thiếu sáng. Dừng tuyến cũ và tính đường tránh.`);
    this.event(i, "Monitoring", "ROAD_DARK", `${edge.name}: báo thiếu sáng; nguồn ${i.mode === "SIMULATION" ? "mô phỏng" : "người dùng"}, không phải dữ liệu cảm biến.`, "SUCCEEDED", [darkId], i.mode === "SIMULATION" ? "SIMULATED" : "LIVE");
    await this.replan(i, "ROAD_DARK");
  }
  async networkChanged(owner: string) {
    for (const i of this.cache.values()) {
      if (i.owner !== owner || terminal(i)) continue;
      const plan = i.plans.find(p => !p.superseded);
      if (plan && this.admissionChecks(i, plan.selectedPlaceId, plan.route).length)
        this.invalidatePlan(i, "Đối tác thay đổi trạng thái trực; dừng phương án cũ để kiểm tra lại.");
      for (const c of i.calls.filter(c => c.providerMode === "APP")) {
        const m = c.memberId && this.network.byId(c.memberId);
        if ((!m || !m.joined || !m.onDuty) && ["RINGING", "CONNECTED", "CONFIRMED"].includes(c.status)) {
          c.generation++; c.status = "FAILED"; c.endedAt = now();
          if (c.support) c.support.decision = "REVOKED";
          const p = i.places.find(p => p.id === c.placeId); if (p) p.supportStatus = "UNKNOWN";
        }
      }
      if (i.metrics.sosAt) await this.replan(i, "NETWORK_CHANGED");
    }
  }
  partnerCall(i: Incident, m: Member, callId: string) {
    const c = i.calls.find((c) => c.id === callId && c.memberId === m.id);
    if (!c) throw new Error("NOT_FOUND");
    return c;
  }
  partnerAnswer(i: Incident, m: Member, callId: string) {
    const c = this.partnerCall(i, m, callId);
    if (c.status !== "RINGING")
      throw new Error("Cuộc gọi không còn đổ chuông.");
    c.status = "CONNECTED";
    this.event(
      i,
      "Calling",
      "CALL_CONNECTED",
      `${m.name} đã nghe máy · AI đang trao đổi.`,
      "WORKING",
      [c.id],
      "LIVE",
    );
  }
  async partnerTranscript(
    i: Incident,
    m: Member,
    callId: string,
    speaker: "AI" | "PARTNER",
    text: string,
    externalId?: string,
  ) {
    if (terminal(i)) return;
    const c = this.partnerCall(i, m, callId);
    if (externalId && c.transcript.some(t => t.externalId === externalId)) return;
    if (!["CONNECTED", "CONFIRMED"].includes(c.status)) return;
    if (speaker === "PARTNER") {
      await this.partnerReply(i, c, text, m.name, c.generation, externalId);
      return;
    }
    c.transcript.push({
      speaker: speaker === "AI" ? "Guardian AI" : m.name,
      text,
      time: now(),
      source: "APP",
      externalId,
    });
    i.updatedAt = now();
    this.store.save(i);
    this.bus.emit(i.id, i);
    this.bus.emit("owner:" + i.owner, i);
  }
  async partnerDecide(
    i: Incident,
    m: Member,
    callId: string,
    accept: boolean,
    note = "",
    fromAI = false,
  ) {
    if (terminal(i)) throw new Error("Sự cố đã kết thúc.");
    const c = this.partnerCall(i, m, callId),
      p = i.places.find((p) => p.id === c.placeId);
    if (!p) throw new Error("NOT_FOUND");
    if (!["RINGING", "CONNECTED", "CONFIRMED"].includes(c.status) && !(fromAI && c.status === "DECLINED"))
      throw new Error("Cuộc gọi đã hết hiệu lực");
    const wasConfirmed = c.status === "CONFIRMED";
    if (wasConfirmed && !accept && !fromAI) c.generation++;
    if (fromAI) {
      // Model tool arguments are summaries, never original partner evidence.
      this.checkCall(i, c, c.support ?? extractSupport(c));
      this.event(
        i,
        "Verification",
        "PARTNER_TOOL_CHECKED",
        "Đã kiểm tra transcript gốc; chưa đủ dữ kiện thì tiếp tục hỏi.",
        "SUCCEEDED",
        [c.id],
      );
      await this.replan(i, "SUPPORT_UPDATED");
    } else
      await this.partnerReply(
        i,
        c,
        accept
          ? note || "Đồng ý tiếp nhận"
          : (wasConfirmed ? "Rút lại xác nhận. " : "Không thể tiếp nhận. ") +
              note,
        m.name,
      );
    if (wasConfirmed && !accept)
      this.event(
        i,
        "Calling",
        "SUPPORT_REVOKED",
        m.name + " thu hồi tiếp nhận",
        "SUCCEEDED",
        [c.id],
      );
  }

  reportFalseAlarm(i: Incident, m: Member, callId: string) {
    const c = this.partnerCall(i, m, callId);
    if (c.falseAlarm) throw new Error("Đã báo cáo trước đó.");
    c.falseAlarm = true;
    const reputation = this.network.settings(i.owner).reputation - 1;
    this.network.saveSettings(i.owner, { reputation });
    this.event(
      i,
      "Policy",
      "FALSE_ALARM_REPORTED",
      `${m.name} báo cáo báo động giả · uy tín tài khoản ${reputation}.`,
      "WAITING",
      [c.id],
      "LIVE",
    );
  }
  acceptRoute(i: Incident, expectedPlanId?: string) {
    if (expectedPlanId && i.plans.find(p => !p.superseded)?.id !== expectedPlanId)
      throw new Error("Phương án đã thay đổi; cần giải thích và xin chấp nhận lại kế hoạch mới.");
    if (!i.plans.some((p) => !p.superseded) || i.location.stale)
      throw new Error("Không có tuyến hiện hành");
    const plan = i.plans.find((p) => !p.superseded)!;
    if (
      this.admissionChecks(i, plan.selectedPlaceId, plan.route).length
    )
      throw new Error(
        "Điều kiện tiếp nhận không còn hợp lệ; cần lập lại kế hoạch.",
      );
    plan.acceptedAt = now();
    i.freeRoute = undefined;
    i.handoff = { planId: plan.id };
    i.status = "GUIDING";
    i.message =
      "Bạn đã chấp nhận tuyến đề xuất. Luôn kiểm tra điều kiện thực địa.";
    this.event(i, "Route", "ROUTE_ACCEPTED", i.message);
    this.navigate(i);
  }
  // City map: close the next street segment of the route so replanning really avoids it.
  blockAhead(i: Incident, route: Route) {
    if (!route.edges?.length) return;
    const id = route.edges[Math.min(1, route.edges.length - 1)],
      e = cityEdges.find((x) => x.id === id)!,
      a = cityNodes.get(e.a)!,
      b = cityNodes.get(e.b)!;
    (i.blockedEdges ??= []).push(id);
    route.blockedAt = toLL(cityAnchor, {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    });
  }
  async userBlocksRoute(i: Incident) {
    const current = i.plans.find((p) => !p.superseded);
    if (!current) throw new Error("Chưa có tuyến để thay đổi.");
    this.blockAhead(i, current.route);
    current.route.blocked = true;
    i.blockedCount++;
    this.event(
      i,
      "Monitoring",
      "ROUTE_BLOCKED",
      "Người dùng báo tuyến không đi được.",
      "SUCCEEDED",
      [current.route.id],
    );
    await this.replan(i, "USER_REJECTS_ROUTE");
  }
  // Realtime voice transcripts: kept on the incident without a timeline event per utterance.
  appendTranscript(i: Incident, speaker: "USER" | "AI", text: string) {
    if (terminal(i)) return;
    if (speaker === "USER") {
      const needs = statedNeeds(text, i.needs ?? emptyNeeds());
      if (JSON.stringify(needs) !== JSON.stringify(i.needs)) {
        i.needs = needs;
        if (i.plans.some((p) => !p.superseded))
          void this.replan(i, "NEEDS_UPDATED");
      }
    }
    i.transcript.push({
      speaker: speaker === "AI" ? "Guardian AI" : "Bạn",
      text,
      time: now(),
      source: speaker === "AI" ? "AI" : "MIC",
    });
    if (i.transcript.length > 200) i.transcript.splice(0, 50);
    if (speaker === "AI" && !i.covert) i.message = text;
    i.updatedAt = now();
    this.store.save(i);
    this.bus.emit(i.id, i);
    this.bus.emit("owner:" + i.owner, i);
    if (speaker === "USER") this.checkEmergency(i, text, "MIC", false);
  }
  // Runs on every user utterance/message; true when it was an emergency and has been handled.
  checkEmergency(
    i: Incident,
    text: string,
    source: "TEXT" | "MIC",
    record: boolean,
  ) {
    const hit = classifyEmergency(text);
    if (!hit || terminal(i)) return false;
    this.emergency(i, text, source, hit, record);
    return true;
  }
  emergency(
    i: Incident,
    text: string,
    source: "TEXT" | "MIC",
    hit: EmergencyHit,
    record: boolean,
  ) {
    if (record)
      i.transcript.push({ speaker: "Bạn", text, time: now(), source });
    const escalating =
      !i.emergency || (hit.critical && !i.emergency.medical && hit.medical);
    i.emergency = {
      kind: hit.kind,
      label: hit.label,
      medical: hit.medical || !!i.emergency?.medical,
      at: now(),
      text,
    };
    i.riskLevel = hit.critical ? 4 : (Math.max(i.riskLevel, 3) as 3 | 4);
    i.riskReasons = [
      `${hit.label}: "${text}"`,
      ...i.riskReasons.filter((r) => !r.startsWith(hit.label)),
    ].slice(0, 4);
    if (!i.covert)
      i.message = hit.medical
        ? "Gọi 115 ngay. Ấn chặt vào vết thương bằng vải sạch, KHÔNG rút vật nhọn ra. Mình đang báo người thân và gửi vị trí."
        : "Mình đã bật SOS khẩn cấp. Chạy về phía có đèn, có người nếu còn đi được. Đang báo người thân và gửi vị trí.";
    this.event(
      i,
      "Risk",
      "EMERGENCY_DETECTED",
      `KHẨN CẤP · ${hit.label}${hit.medical ? " · cần cấp cứu 115" : ""} · "${text.slice(0, 120)}"`,
      "FAILED",
      [],
      source === "MIC" ? "LIVE" : "SIMULATED",
    );
    if (!escalating) return;
    this.escalate(i);
    this.sealEvidence(i, "Phát hiện khẩn cấp: " + hit.label);
    if (!i.metrics.sosAt && !i.running && !i.plans.some((p) => !p.superseded))
      void this.sos(
        i,
        text,
        source,
        true,
        {
          intent: "SOS",
          confidence: 1,
          riskLevel: hit.critical ? 4 : 3,
          reasons: [
            hit.label,
            "Phát hiện tức thì từ lời người dùng (luật, không chờ AI)",
          ],
          unknowns: [],
          reply: i.message,
        },
        false,
      ).catch(() => {});
    else this.alertContacts(i, i.generation);
  }
  // Hash the whole dossier now and log it, so later edits are detectable.
  sealEvidence(i: Incident, reason: string) {
    const hash = digest(dossier(i));
    (i.seals ??= []).push({ at: now(), reason, hash });
    this.event(
      i,
      "Monitoring",
      "EVIDENCE_SEALED",
      `Niêm phong hồ sơ bằng chứng · ${reason} · SHA-256 ${hash.slice(0, 12)}…`,
    );
  }
  // Phone went silent (no location / app killed / simulated): keep the last trace, tell contacts.
  signalLost(i: Incident, reason: string) {
    if (terminal(i) || i.location.stale) return;
    i.location.stale = true;
    const where =
      i.routeAdapter === "CITY"
        ? locate(cityAnchor, i.location).text
        : `${i.location.lat.toFixed(5)}, ${i.location.lng.toFixed(5)}`;
    this.event(
      i,
      "Monitoring",
      "CONTACT_LOST",
      `Mất liên lạc với điện thoại · ${reason} · vị trí cuối: ${where} lúc ${new Date(i.location.observedAt).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}`,
      "FAILED",
    );
    this.alertContacts(i, i.generation);
    if (!i.escalation) this.escalate(i);
    this.sealEvidence(i, "Mất liên lạc");
    if (i.contacts.length) this.shareEvidence(i, "Mất liên lạc");
  }
  addRecording(i: Incident, session: string, seq: number, mime: string, data: Buffer) {
    const { recording, started } = appendRecording(i, session, seq, mime, data);
    if (started) this.event(i, "Voice", "RECORDING_STARTED", "Bắt đầu ghi âm cuộc trò chuyện vào hồ sơ bằng chứng (micro + giọng AI, lưu từng đoạn 10 giây).", "SUCCEEDED", [recording.session], i.mode === "SIMULATION" ? "SIMULATED" : "LIVE");
    i.updatedAt = now(); this.store.save(i); this.bus.emit(i.id, i); this.bus.emit("owner:" + i.owner, i);
    return recording;
  }
  // Give trusted contacts the sealed dossier (last location, statements, track) so they can act or hand it to police.
  shareEvidence(i: Incident, reason: string) {
    const seal = i.seals?.at(-1);
    if (!seal) return;
    const to = i.contacts.map((c) => c.name);
    i.evidenceShare = { at: now(), reason, hash: seal.hash, to };
    this.event(i, "Contact", "EVIDENCE_SHARED", `Đã gửi hồ sơ bằng chứng cho ${to.join(", ")} · ${reason} · SHA-256 ${seal.hash.slice(0, 12)}… · gồm vị trí cuối, lời khai, đường đi`, "SUCCEEDED", [], i.simulatorOnly ? "SIMULATED" : "LIVE");
  }
  recordStatement(i: Incident, topic: string, text: string) {
    (i.statements ??= []).push({ topic, text, at: now() });
    this.event(
      i,
      "Voice",
      "STATEMENT_RECORDED",
      `Lời khai · ${topic}: ${text}`,
    );
  }
  // Called by the ticker: live phones that stop reporting during SOS or a trip are treated as lost.
  tickSignal(i: Incident) {
    if (!terminal(i)) {
      let changed = false;
      for (const c of i.calls)
        if (
          c.support?.decision === "ACCEPTED" &&
          c.support.validUntil &&
          Date.parse(c.support.validUntil) <= Date.now()
        ) {
          c.support.decision = "EXPIRED";
          c.generation++;
          changed = true;
          const p = i.places.find((p) => p.id === c.placeId);
          if (p) p.supportStatus = "UNKNOWN";
        }
      if (changed) void this.replan(i, "SUPPORT_EXPIRED");
    }
    const watching =
      !!i.metrics.sosAt ||
      (i.trip && ["ACTIVE", "CHECKING", "ESCALATED"].includes(i.trip.status));
    if (
      watching &&
      i.location.kind === "LIVE" &&
      Date.now() - Date.parse(i.location.observedAt) > 90000
    )
      this.signalLost(i, "không nhận được vị trí quá 90 giây");
  }
  tickRouteAgent(i: Incident) {
    const adopted = i.plans.find(p => !p.superseded);
    if (!terminal(i) && adopted && this.admissionChecks(i, adopted.selectedPlaceId, adopted.route).length) {
      this.invalidatePlan(i, "Điều kiện tiếp nhận không còn hợp lệ; đang tìm phương án khác.");
      void this.replan(i, "ADMISSION_CHANGED");
      return;
    }
    if (terminal(i) || this.routing.has(i.id) || i.frozen) return;
    const reason = this.routeWorker.monitor(i);
    if (reason) {
      this.event(i, "Route", "ROUTE_AGENT_TRIGGERED", "Agent tuyến phát hiện thay đổi: " + reason, "WORKING");
      void this.replan(i, reason).catch(() => {
        if (!terminal(i)) this.event(i, "Route", "ROUTE_AGENT_FAILED", "Chưa cập nhật được tuyến; không tự hướng dẫn bằng tuyến mới.", "FAILED");
      });
    }
  }
  // Demo operator answers on behalf of a simulated store (real partners answer on their own phone).
  async decidePlace(i: Incident, placeId: string, accept: boolean) {
    if (i.mode !== "SIMULATION")
      throw new Error("Chỉ đóng vai cửa hàng trong chế độ SIMULATION.");
    if (terminal(i)) throw new Error("Sự cố đã kết thúc.");
    const p = i.places.find((x) => x.id === placeId);
    if (!p) throw new Error("Không có địa điểm này.");
    if (isPartner(p))
      throw new Error("Đối tác thật tự trả lời trên app của họ.");
    if (p.contactEligibility !== "ALLOWLIST")
      throw new Error(
        "Địa điểm công khai này không nhận cuộc gọi của app; người dùng tự liên hệ (113 / 115).",
      );
    for (const c of i.calls.filter(
      (c) =>
        c.placeId === p.id &&
        ["RINGING", "CONNECTED", "CONFIRMED"].includes(c.status),
    )) {
      c.generation++;
      if (c.status !== "CONFIRMED") c.status = "FAILED";
      c.endedAt = now();
    }
    const id = randomUUID();
    p.supportStatus = accept ? "CONFIRMED" : "DECLINED";
    p.verification = accept ? "SUPPORT_CONFIRMED" : "CONTACT_ATTEMPTED";
    i.calls.push({
      id,
      placeId: p.id,
      status: accept ? "CONFIRMED" : "DECLINED",
      providerMode: "MOCK",
      generation: 0,
      startedAt: now(),
      endedAt: now(),
      transcript: [
        {
          speaker: p.name + " (người điều khiển đóng vai)",
          text: accept
            ? "Được, chúng tôi cho người đó vào chờ."
            : "Xin lỗi, chúng tôi không tiếp nhận được.",
          time: now(),
          source: "MOCK",
        },
      ],
    });
    const manual = i.calls.at(-1)!;
    if (accept)
      manual.transcript[0].text =
        "Đồng ý tiếp nhận, có chỗ chờ. Cửa vào: cửa chính. Điều kiện: không yêu cầu thêm. Tương tác kín đáo: có. Cần di chuyển: có. Qua ngõ: không.";
    this.checkCall(i, manual);
    if (accept) {
      p.evidenceRefs.push(id);
      i.metrics.firstConfirmedMs ??=
        Date.now() - Date.parse(i.metrics.sosAt || i.createdAt);
    }
    this.event(
      i,
      "Calling",
      accept ? "HELP_CONFIRMED" : "SUPPORT_REVOKED",
      `${p.name}: ${accept ? "đồng ý tiếp nhận" : "từ chối"} (người điều khiển đóng vai)`,
      "SUCCEEDED",
      [id],
    );
    await this.replan(i, accept ? "STORE_ACCEPTS" : "STORE_DECLINES");
  }
  setAppearance(i: Incident, text: string) {
    i.appearance = text;
    this.network.saveSettings(i.owner, { appearance: text });
    this.event(i, "Voice", "APPEARANCE_UPDATED", "Thẻ nhận diện: " + text);
  }
  escalate(i: Incident) {
    const sim = i.mode === "SIMULATION";
    i.escalation = [
      `${sim ? "113 SIMULATED" : "BẢN TÓM TẮT CHO 113"} · ${i.id}`,
      `Tôi cần hỗ trợ. Vị trí ${i.location.kind}: ${i.location.lat.toFixed(5)}, ${i.location.lng.toFixed(5)} (${i.location.observedAt}${i.location.stale ? " · ĐÃ CŨ" : ""}).`,
      i.riskReasons.slice(0, 2).join(". ") || "Người dùng yêu cầu hỗ trợ.",
      ...(i.appearance ? ["Nhận diện: " + i.appearance] : []),
      ...(i.emergency
        ? [
            `KHẨN CẤP: ${i.emergency.label}${i.emergency.medical ? " · CẦN CẤP CỨU 115" : ""}.`,
          ]
        : []),
      "Chưa có xác nhận cứu hộ; app không tự gọi số khẩn cấp.",
    ].join("\n");
    this.event(
      i,
      "Contact",
      "ESCALATION_OFFERED",
      "Đã chuẩn bị tóm tắt; người dùng tự bấm gọi, app không tự gọi 113.",
    );
  }
  startTrip(
    i: Incident,
    destination: Point & { label: string },
    minutes: number,
  ) {
    if (terminal(i)) throw new Error("Sự cố đã kết thúc.");
    if (i.trip && ["ACTIVE", "CHECKING"].includes(i.trip.status))
      throw new Error("Đang có chuyến đi.");
    // The simulated city has a fixed home address; a real map would use the saved address.
    if (i.routeAdapter === "CITY" && i.mode === "SIMULATION")
      destination = {
        ...toLL(cityAnchor, cityHome),
        label: destination.label || cityHome.label,
      };
    i.trip = {
      destination,
      startedAt: now(),
      expectedBy: new Date(Date.now() + minutes * 60000).toISOString(),
      status: "ACTIVE",
      lastMovedAt: now(),
    };
    i.message = `Mình sẽ đồng hành cùng bạn về ${destination.label}.`;
    this.event(
      i,
      "Monitoring",
      "TRIP_STARTED",
      `Đồng hành về ${destination.label} · dự kiến ${minutes} phút · cách ${meters(i.location, destination)} m.`,
    );
    if (i.routeAdapter === "CITY")
      this.directions(i, destination.label, destination);
  }
  checkin(i: Incident, reason: string) {
    const t = i.trip;
    if (!t || t.status !== "ACTIVE" || terminal(i)) return;
    t.status = "CHECKING";
    t.checkinReason = reason;
    t.checkinDueAt = new Date(Date.now() + CHECKIN_MS).toISOString();
    i.message = `${reason}. Bạn ổn không? Không phản hồi trong ${CHECKIN_MS / 1000} giây sẽ tự động SOS.`;
    this.event(i, "Monitoring", "CHECKIN_REQUESTED", i.message, "WAITING");
  }
  checkinOk(i: Incident) {
    const t = i.trip;
    if (!t || t.status !== "CHECKING")
      throw new Error("Không có yêu cầu kiểm tra.");
    t.status = "ACTIVE";
    t.checkinDueAt = undefined;
    t.lastMovedAt = now();
    if (Date.parse(t.expectedBy) < Date.now())
      t.expectedBy = new Date(Date.now() + 10 * 60000).toISOString();
    i.message = "Cảm ơn bạn. Mình tiếp tục đồng hành.";
    this.event(i, "Monitoring", "CHECKIN_OK", "Người dùng xác nhận vẫn ổn.");
  }
  endTrip(i: Incident, arrived: boolean) {
    const t = i.trip;
    if (!t || !["ACTIVE", "CHECKING"].includes(t.status))
      throw new Error("Không có chuyến đi đang hoạt động.");
    t.status = arrived ? "ARRIVED" : "ENDED";
    t.checkinDueAt = undefined;
    i.message = arrived
      ? `Đã về tới ${t.destination.label}. Người thân đã nhận thông báo an toàn.`
      : "Đã dừng đồng hành.";
    this.event(
      i,
      "Monitoring",
      arrived ? "TRIP_ARRIVED" : "TRIP_ENDED",
      arrived ? `Đã về tới ${t.destination.label} an toàn.` : i.message,
    );
  }
  onLocation(i: Incident, previous: Point) {
    const track = (i.track ??= []);
    track.push({
      lat: i.location.lat,
      lng: i.location.lng,
      at: i.location.observedAt,
      kind: i.location.kind,
    });
    if (track.length > 1000) track.splice(0, track.length - 1000);
    this.navigate(i);
    const t = i.trip;
    if (!t || !["ACTIVE", "CHECKING"].includes(t.status)) return;
    if (meters(previous, i.location) > 15) t.lastMovedAt = now();
    if (
      meters(i.location, t.destination) < 60 &&
      !i.events.some(
        (e) => e.type === "TRIP_NEAR_DESTINATION" && e.time >= t.startedAt,
      )
    )
      this.event(
        i,
        "Monitoring",
        "TRIP_NEAR_DESTINATION",
        "Vị trí ở gần điểm đến; cần người dùng tự xác nhận đã về. Chưa xác nhận đã an toàn.",
        "WAITING",
      );
  }
  activeRoute(i: Incident) {
    const plan = i.plans.find((p) => !p.superseded);
    if (plan?.acceptedAt)
      return {
        route: plan.route,
        target:
          i.places.find((p) => p.id === plan.selectedPlaceId)?.name ||
          "điểm hỗ trợ",
      };
    // A place the user asked for themselves (also during SOS, until they accept a coordinated plan).
    return i.freeRoute
      ? { route: i.freeRoute, target: i.freeRoute.target }
      : undefined;
  }
  // Resolve "đồn công an", "bệnh viện", a place name, a landmark or home to ranked map targets.
  findDestinations(i: Incident, query: string) {
    const anchor = cityAnchor, q = fold(query);
    const places = i.places.length ? i.places : [...this.partnerPlaces(i), ...cityPlaces(anchor, now(), this.takenStores(i), i.scenarioClock ?? now())];
    const kinds = Object.entries(kindWords).filter(([, r]) => r.test(q)).map(([k]) => k);
    const pool: { name: string; lat: number; lng: number; kind?: string; place?: Place }[] = [
      ...places.map(p => ({ name: p.name, lat: p.lat, lng: p.lng, kind: p.profile?.kind, place: p })),
      ...landmarks.map(l => ({ name: l.name, kind: "LANDMARK", ...toLL(anchor, l) })),
      { name: cityHome.label, kind: "HOME", ...toLL(anchor, cityHome) },
    ];
    const byName = pool.filter(p => { const n = fold(p.name); return p.kind !== "HOME" && ((q.length >= 4 && n.includes(q)) || (n.length >= 5 && q.includes(n))); });
    const matches = byName.length ? byName : pool.filter(p => p.kind && kinds.includes(p.kind));
    return matches.map(m => {
      const route = cityRoute(anchor, i.location, m, m.name, i.blockedEdges, "free-" + randomUUID().slice(0, 6));
      const assessment = m.place ? assessPlace(i, m.place) : undefined;
      return { ...m, route, open: m.place ? m.place.openingStatus !== "CLOSED" && !assessment?.blockers.some(b => /đóng cửa/i.test(b)) : true, assessment };
    }).sort((a, b) => Number(b.open) - Number(a.open) || (a.route.distanceMeters ?? Infinity) - (b.route.distanceMeters ?? Infinity));
  }
  // Walking directions on the city map to whatever the user asked for, plus the facts needed to judge the trip.
  directions(i: Incident, name: string, point?: Point) {
    if (i.routeAdapter !== "CITY")
      throw new Error(
        "Chỉ đường từng bước chỉ có trên bản đồ mô phỏng (CITY).",
      );
    const anchor = cityAnchor;
    const found = point ? [] : this.findDestinations(i, name);
    if (!point && !found.length)
      throw new Error(
        "Không tìm thấy nơi này trên bản đồ khu vực. Có các loại: công an, bệnh viện/cấp cứu, trạm y tế/phòng khám, nhà thuốc, khách sạn, cửa hàng tiện lợi, cà phê, quán ăn, siêu thị/chợ, ATM/ngân hàng, trạm xăng, bảo vệ, Nhà.",
      );
    const target = point ?? found[0];
    const label = point ? name : found[0].name;
    i.freeRoute = {
      ...(point ? cityRoute(anchor, i.location, target, label, i.blockedEdges, "free-" + randomUUID().slice(0, 6)) : found[0].route),
      target: label,
    };
    const options = found.slice(0, 4).map(f => ({
      name: f.name, kind: f.kind ?? null, distanceMeters: f.route.distanceMeters ?? null,
      walkMinutes: f.route.distanceMeters === undefined ? null : Math.max(1, Math.round(f.route.distanceMeters / 75)),
      open: f.open, hours: f.assessment?.hours?.label ?? null, limitations: f.place?.profile?.limitations ?? [],
      supportConfirmed: f.place?.supportStatus === "CONFIRMED",
    }));
    i.nav = undefined;
    this.event(
      i,
      "Route",
      "NAV_DIRECTIONS",
      `Chỉ đường tới ${label} · ${i.freeRoute.distanceMeters} m` +
        (i.freeRoute.advisories?.[0] ? ` · ${i.freeRoute.advisories[0]}` : ""),
      "SUCCEEDED",
      [i.freeRoute.id],
    );
    this.navigate(i);
    return { ...i.freeRoute, options };
  }
  // Turn-by-turn tracking on the simulated city: emits events only when something changes.
  navigate(i: Incident) {
    if (i.routeAdapter !== "CITY" || terminal(i)) return;
    const active = this.activeRoute(i);
    if (!active?.route.maneuvers) return;
    const anchor = cityAnchor,
      { route, target } = active,
      p = progress(anchor, route, i.location),
      where = locate(anchor, i.location).text;
    if (i.nav?.routeId !== route.id)
      i.nav = {
        routeId: route.id,
        target,
        step: -1,
        offRoute: false,
        arrived: false,
        where,
      };
    const nav = i.nav;
    nav.where = where;
    nav.remaining = p.remaining;
    nav.next = p.next?.text;
    nav.nextIn = p.next?.inMeters;
    if (p.offRoute > 40) {
      if (nav.offRoute) return;
      nav.offRoute = true;
      this.event(
        i,
        "Monitoring",
        "NAV_OFF_ROUTE",
        `Lệch khỏi tuyến tới ${target} khoảng ${p.offRoute} m · đang ở ${where}`,
        "WAITING",
      );
      if (i.trip?.status === "ACTIVE")
        this.checkin(i, "Bạn đang đi lệch khỏi tuyến về nhà");
      if (route === i.freeRoute) this.directions(i, target);
      else void this.replan(i, "OFF_ROUTE");
      return;
    }
    nav.offRoute = false;
    if (p.remaining < 25) {
      if (nav.arrived) return;
      nav.arrived = true;
      nav.next = undefined;
      i.message = `Bạn đã tới ${target}.`;
      this.event(i, "Route", "NAV_ARRIVED", `Đã tới ${target}`, "SUCCEEDED");
      return;
    }
    if (p.nextIndex !== nav.step && p.next) {
      nav.step = p.nextIndex;
      this.event(
        i,
        "Route",
        "NAV_STEP",
        `Còn ${p.remaining} m tới ${target} · ${p.next.inMeters} m nữa: ${p.next.text} · đang ở ${where}`,
      );
    }
  }
  // Demo control: walk along the active route, take a wrong turn, or jump to a tapped point.
  simMove(
    i: Incident,
    action: "step" | "deviate" | "to" | "lost" | "attack",
    to?: Point,
  ) {
    if (i.mode !== "SIMULATION" || i.routeAdapter !== "CITY")
      throw new Error(
        "Di chuyển mô phỏng cần chế độ SIMULATION trên bản đồ CITY.",
      );
    if (terminal(i)) throw new Error("Sự cố đã kết thúc.");
    if (action === "lost")
      return this.signalLost(i, "mô phỏng: điện thoại tắt / bị giật");
    if (action === "attack") {
      this.checkEmergency(
        i,
        "Cứu tôi với! Tôi bị đâm, đang chảy máu nhiều",
        "MIC",
        true,
      );
      return;
    }
    const anchor = cityAnchor,
      active = this.activeRoute(i);
    let next: Point;
    if (action === "to" && to) next = to;
    else if (action === "deviate")
      next = deviate(anchor, i.location, active?.route.edges);
    else {
      if (!active)
        throw new Error(
          "Chưa có tuyến: hãy nhờ AI chỉ đường hoặc bắt đầu đi về nhà.",
        );
      next = walk(anchor, active.route, i.location, 40);
    }
    const previous = { lat: i.location.lat, lng: i.location.lng };
    i.location = { ...next, kind: "MOCK", observedAt: now(), stale: false };
    this.onLocation(i, previous);
    this.event(
      i,
      "Monitoring",
      "LOCATION_UPDATED",
      "Di chuyển mô phỏng · " + locate(anchor, i.location).text,
    );
  }
  // Dead man's switch for an active trip; called periodically.
  tickTrip(i: Incident) {
    const t = i.trip;
    if (!t || terminal(i)) return;
    if (t.status === "CHECKING" && Date.parse(t.checkinDueAt!) < Date.now()) {
      t.status = "ESCALATED";
      t.checkinDueAt = undefined;
      this.event(
        i,
        "Monitoring",
        "CHECKIN_MISSED",
        "Không phản hồi kiểm tra an toàn · tự động SOS.",
        "FAILED",
      );
      this.sealEvidence(i, "Không phản hồi kiểm tra an toàn");
      if (!i.running && !i.metrics.sosAt)
        void this.sos(
          i,
          `Không phản hồi kiểm tra an toàn (${t.checkinReason}).`,
          "TEXT",
          true,
        ).catch(() => {});
      return;
    }
    if (t.status !== "ACTIVE") return;
    if (Date.parse(t.expectedBy) < Date.now())
      this.checkin(i, "Đã quá giờ dự kiến về tới nơi");
    else if (
      i.location.kind === "LIVE" &&
      Date.now() - Date.parse(i.location.observedAt) > 90000
    )
      this.checkin(i, "Mất tín hiệu vị trí");
    else if (
      i.location.kind === "LIVE" &&
      Date.now() - Date.parse(t.lastMovedAt) > 180000
    )
      this.checkin(i, "Bạn dừng lại khá lâu");
  }
  setNeeds(i: Incident, value: unknown) {
    if (terminal(i)) throw new Error("Sự cố đã kết thúc");
    i.needs = needsSchema.parse(value);
    this.event(
      i,
      "Coordinator",
      "NEEDS_UPDATED",
      "Đã cập nhật giới hạn do người dùng cung cấp.",
    );
    return this.replan(i, "NEEDS_UPDATED");
  }
  private checkCall(i: Incident, c: Call, extracted?: Support) {
    c.support = extracted ?? extractSupport(c);
    c.checks = this.admissionChecks(i, c.placeId);
    const p = i.places.find((p) => p.id === c.placeId)!;
    c.status =
      c.support.decision === "DECLINED" || c.support.decision === "REVOKED"
        ? "DECLINED"
        : c.checks.length
          ? "CONNECTED"
          : "CONFIRMED";
    p.supportStatus =
      c.status === "CONFIRMED"
        ? "CONFIRMED"
        : c.status === "DECLINED"
          ? "DECLINED"
          : "CONTACTED";
    p.verification =
      c.status === "CONFIRMED" ? "SUPPORT_CONFIRMED" : "CONTACT_ATTEMPTED";
    p.evidenceRefs =
      c.status === "CONFIRMED" ? [c.id, ...c.support.evidenceRefs] : [];
    if (c.status === "CONFIRMED")
      i.metrics.firstConfirmedMs ??=
        Date.now() - Date.parse(i.metrics.sosAt ?? i.createdAt);
  }
  async partnerReply(
    i: Incident,
    c: Call,
    text: string,
    speaker: string,
    expectedGeneration = c.generation,
    externalId?: string,
  ) {
    if (
      terminal(i) ||
      c.generation !== expectedGeneration ||
      !["RINGING", "CONNECTED", "CONFIRMED"].includes(c.status)
    )
      throw new Error("Kết quả đã hết hiệu lực");
    if (externalId && c.transcript.some(t => t.externalId === externalId)) return;
    c.transcript.push({ speaker, text, source: c.providerMode, time: now(), externalId });
    c.offer = offerFrom(c.id, c.transcript) ?? c.offer;
    c.dialogueMode = "WEB";
    // Invalidate the previous confirmation synchronously before optional inference.
    this.checkCall(i, c);
    const active = i.plans.find(p => !p.superseded && p.selectedPlaceId === c.placeId);
    if (active && (this.admissionChecks(i, c.placeId, active.route).length || active.supportSignature !== supportSignature(c.support)))
      this.invalidatePlan(i, "Phản hồi mới thay đổi cam kết; tạm dừng hướng dẫn cũ.");
    this.event(
      i,
      "Verification",
      "SUPPORT_RECEIVED",
      "Đã nhận phản hồi mới; kiểm tra lại điều kiện.",
      "WORKING",
      [c.id],
    );
    await this.replan(i, "SUPPORT_UPDATED");
    if (terminal(i) || c.generation !== expectedGeneration) return;
    const generation = i.generation,
      version = c.transcript.length;
    if (i.ai.enabled && c.status !== "DECLINED") {
      const controller = new AbortController(),
        timer = setTimeout(() => controller.abort(), 8000);
      const extracted = await this.semanticSupport(i, c, controller);
      clearTimeout(timer);
      if (
        terminal(i) ||
        i.generation !== generation ||
        c.generation !== expectedGeneration ||
        c.transcript.length !== version
      )
        return;
      this.checkCall(i, c, extracted);
    }
    if (
      c.checks?.length &&
      c.status === "CONNECTED" &&
      (c.questions?.length ?? 0) < 3
    ) {
      const question = clarificationQuestion(c.support, c.checks);
      (c.questions ??= []).push(question);
      c.transcript.push({
        speaker: "Guardian AI",
        text: question,
        source: "APP",
        time: now(),
      });
    }
    this.event(
      i,
      "Verification",
      "SUPPORT_UPDATED",
      `${speaker}: ${c.support?.decision} · ${c.checks?.length ? c.checks.join("; ") : "đạt điều kiện"}`,
      "SUCCEEDED",
      c.support?.evidenceRefs,
    );
    await this.replan(i, "SUPPORT_UPDATED");
  }
  private async dialogueModel(
    i: Incident,
    c: Call,
    role: "CONTACT" | "PARTNER",
    profile: ReturnType<typeof partnerProfile> | null,
    controller: AbortController,
  ) {
    if (
      !i.ai.enabled ||
      !i.ai.consentAt ||
      (i.dialogueRequests ?? 0) >= 30 ||
      (c.modelCalls ?? 0) >= 9
    )
      throw new Error("Giới hạn model/consent; dùng kịch bản dự phòng");
    i.dialogueRequests = (i.dialogueRequests ?? 0) + 1;
    c.modelCalls = (c.modelCalls ?? 0) + 1;
    const generation = i.generation,
      callGeneration = c.generation;
    const result = await Promise.race([
      this.aiService.dialogue(
        role,
        c.transcript.map((t) => ({ speaker: t.speaker, text: t.text })),
        role === "CONTACT" ? (i.needs ?? emptyNeeds()) : null,
        profile,
        controller.signal,
      ),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener(
          "abort",
          () => reject(new Error("DIALOGUE_TIMEOUT_OR_CANCEL")),
          { once: true },
        );
        if (controller.signal.aborted)
          reject(new Error("DIALOGUE_TIMEOUT_OR_CANCEL"));
      }),
    ]);
    if (
      generation !== i.generation ||
      callGeneration !== c.generation ||
      terminal(i) ||
      !i.ai.enabled
    )
      throw new Error("DIALOGUE_CANCELLED");
    this.event(
      i,
      "Calling",
      "DIALOGUE_AI_COMPLETED",
      `${role} · ${result.model} · ${result.latencyMs} ms`,
      "SUCCEEDED",
      [c.id, ...(result.requestId ? [result.requestId] : [])],
      "LIVE",
    );
    return result.data.text;
  }
  private async semanticSupport(
    i: Incident,
    c: Call,
    controller: AbortController,
  ): Promise<Support> {
    const fallback = extractSupport(c);
    if (
      !i.ai.enabled ||
      !i.ai.consentAt ||
      (i.dialogueRequests ?? 0) >= 30 ||
      (c.modelCalls ?? 0) >= 9 ||
      controller.signal.aborted
    )
      return fallback;
    i.dialogueRequests = (i.dialogueRequests ?? 0) + 1;
    c.modelCalls = (c.modelCalls ?? 0) + 1;
    try {
      const result = await Promise.race([
        this.aiService.extract(
          c.transcript.map((t) => ({ speaker: t.speaker, text: t.text })),
          controller.signal,
        ),
        new Promise<never>((_, reject) =>
          controller.signal.addEventListener(
            "abort",
            () => reject(new Error("EXTRACTION_TIMEOUT")),
            { once: true },
          ),
        ),
      ]);
      const support = groundedSupport(c, result.data);
      const latest = c.transcript.findLastIndex(t => !["Guardian AI", "Hệ thống"].includes(t.speaker));
      const offer = result.data.facts.find(f => f.field === "OFFER" && f.turn === latest && f.value.trim());
      if (offer) c.offer = { text: offer.value.trim(), quote: offer.quote, evidenceRef: `${c.id}:${offer.turn}`, source: "AI" };
      if (!terminal(i))
        this.event(
          i,
          "Verification",
          "EXTRACTION_AI_COMPLETED",
          `Trích xuất có dẫn chứng · ${result.model}`,
          "SUCCEEDED",
          support.evidenceRefs,
          "LIVE",
        );
      return support;
    } catch {
      if (!terminal(i))
        this.event(
          i,
          "Verification",
          "EXTRACTION_FALLBACK",
          "Trích xuất AI lỗi; dùng bộ đọc bảo thủ, thông tin thiếu giữ chưa biết.",
          "WAITING",
          [c.id],
        );
      return fallback;
    }
  }
  private async simulatedDialogue(
    i: Incident,
    g: number,
    c: Call,
    p: Place,
    index: number,
    hasApp: boolean,
  ) {
    const cg = c.generation,
      controller = new AbortController();
    const controllers =
      this.dialogueAbort.get(i.id) ?? new Set<AbortController>();
    controllers.add(controller);
    this.dialogueAbort.set(i.id, controllers);
    const timeout = setTimeout(
      () => controller.abort(),
      this.dialogueTimeoutMs,
    );
    // Only the simulator transport receives this profile, never the contact agent.
    const profile = partnerProfile(
      i.demoCase ?? "BASIC",
      i.demoCase === "SHOWCASE" ? index : ["a", "b", "c"].includes(p.id) ? ["a", "b", "c"].indexOf(p.id) : 2,
      i.scenario === "ALL_UNAVAILABLE",
    );
    // Existing registered partner demo keeps simulation lanes from replacing web partners.
    if (hasApp) profile.support = index === 0 ? "DECLINE" : "SILENT";
    const valid = () =>
      i.generation === g && c.generation === cg && !terminal(i);
    let useAI = i.ai.enabled && i.demoCase !== "MODEL_FAILURE";
    c.dialogueMode = "SCRIPTED_FALLBACK";
    try {
      if (!(await this.delay(i, g, 3 + index)) || !valid()) return;
      if (profile.support === "SILENT") {
        if (!(await this.delay(i, g, 9 + index)) || !valid()) return;
        c.status = "NO_ANSWER";
        c.support = {
          ...emptySupport(),
          decision: "EXPIRED",
          missing: ["Không nhận được phản hồi"],
        };
        c.checks = checkSupport(c.support, i.needs ?? emptyNeeds());
      } else {
        c.status = "CONNECTED";
        for (let turn = 0; turn < 3; turn++) {
          if (!valid()) return;
          let question =
            turn === 0
              ? "Chào bạn, có một người gần đây cần chỗ ngồi chờ người thân. Bên bạn có nhận được lúc này không?"
              : clarificationQuestion(c.support, c.checks);
          if (useAI) {
            try {
              question = await this.dialogueModel(
                i,
                c,
                "CONTACT",
                null,
                controller,
              );
            } catch {
              useAI = false;
            }
          }
          if (!valid()) return;
          (c.questions ??= []).push(question);
          c.transcript.push({
            speaker: "Guardian AI",
            text: question,
            time: now(),
            source: useAI ? "AI" : "MOCK",
          });
          this.event(
            i,
            "Calling",
            "FOLLOWUP_QUESTION",
            `${p.name} · lượt ${turn + 1}: ${question}`,
            "WORKING",
            [c.id],
          );
          let reply: string | null = null;
          if (useAI) {
            try {
              reply = await this.dialogueModel(
                i,
                c,
                "PARTNER",
                profile,
                controller,
              );
              c.dialogueMode = "AI_LIVE";
            } catch {
              useAI = false;
            }
          }
          if (!useAI) {
            c.dialogueMode = "SCRIPTED_FALLBACK";
            reply = scriptedReply(profile, turn);
            this.event(
              i,
              "Calling",
              "DIALOGUE_FALLBACK",
              `${p.name}: đối tác mô phỏng · phản hồi dùng kịch bản dự phòng`,
              "WAITING",
              [c.id],
            );
          }
          if (!(await this.delay(i, g, 2)) || !valid()) return;
          if (!reply) break;
          c.transcript.push({
            speaker: p.name + " (mô phỏng)",
            text: reply,
            time: now(),
            source: "MOCK",
          });
          c.offer = offerFrom(c.id, c.transcript) ?? c.offer;
          const extracted = useAI
            ? await this.semanticSupport(i, c, controller)
            : undefined;
          if (!valid()) return;
          this.checkCall(i, c, extracted);
          this.event(
            i,
            "Verification",
            "SUPPORT_EXTRACTED",
            `${p.name}: ${c.support!.decision} · ${c.checks!.join("; ") || "đủ điều kiện"}`,
            "SUCCEEDED",
            c.support!.evidenceRefs,
          );
          if (
            (c as Call).status === "CONFIRMED" ||
            (c as Call).status === "DECLINED"
          )
            break;
        }
      }
      if (!valid()) return;
      c.endedAt = now();
      if (c.status === "CONNECTED") c.status = "FAILED"; // exhausted turns, support remains CLARIFY
      this.event(
        i,
        "Calling",
        (c as Call).status === "CONFIRMED"
          ? "HELP_CONFIRMED"
          : "CALL_COMPLETED",
        `${p.name}: ${c.status}`,
        "SUCCEEDED",
        [c.id],
      );
      await this.replan(i, "CONTACT_CONFIRMED");
    } finally {
      clearTimeout(timeout);
      controller.abort();
      controllers.delete(controller);
      if (!controllers.size) this.dialogueAbort.delete(i.id);
    }
  }
  confirmHandoff(i: Incident, side: "USER" | "PARTNER", planId: string) {
    const p = i.plans.find((p) => p.id === planId && !p.superseded);
    if (
      terminal(i) ||
      !p?.acceptedAt ||
      this.admissionChecks(i, p.selectedPlaceId, p.route).length
    )
      throw new Error("Cần kế hoạch hiện hành đã chấp nhận");
    if (i.handoff?.planId !== p.id) i.handoff = { planId: p.id };
    if (side === "USER") i.handoff.userAt = now();
    else i.handoff.partnerAt = now();
    this.event(
      i,
      "Coordinator",
      "HANDOFF_CONFIRMATION",
      side === "USER"
        ? "Người dùng báo đã gặp nhân viên"
        : "Điểm tiếp nhận xác nhận đã tiếp nhận",
      "SUCCEEDED",
      [p.id],
    );
    if (i.handoff.userAt && i.handoff.partnerAt) {
      i.handoff.completedAt = now();
      this.close(i);
    }
  }
  async startCalls(
    i: Incident,
    provider: "MOCK" | "REAL_TEST" | "APP",
    numbers: string[] = [],
    consent = false,
  ) {
    if (terminal(i) || i.running || !i.places.length)
      throw new Error(
        "Chưa sẵn sàng gọi. Hãy gửi SOS và đợi Research hoàn tất.",
      );
    if (i.calls.some((c) => ["RINGING", "CONNECTED"].includes(c.status)))
      throw new Error("Một nhóm cuộc gọi đang chạy.");
    if (i.plans.some((p) => !p.superseded))
      throw new Error(
        "Đã có kế hoạch hiện hành; không gọi lại khi đang hướng dẫn.",
      );
    if (
      provider === "MOCK" &&
      i.calls.filter((c) => c.providerMode === "MOCK").length >= 9
    )
      throw new Error(
        "Đã đạt giới hạn 3 lượt gọi mô phỏng. Tạo kịch bản mới để thử lại.",
      );
    const allowlist = (process.env.TEST_CALL_ALLOWLIST || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    if (
      provider === "REAL_TEST" &&
      (!process.env.CALL_GATEWAY_URL || !process.env.CALL_GATEWAY_TOKEN)
    )
      throw new Error("Chưa cấu hình gateway cho cuộc gọi thật.");
    // Registered partners always get an in-app lane; remaining lanes use the selected provider.
    const partners = i.places
        .filter((p) => isPartner(p) && p.supportStatus !== "DECLINED")
        .slice(0, 3),
      places =
        provider === "APP"
          ? []
          : provider === "REAL_TEST"
            ? i.places.filter(p => !isPartner(p)).slice(0, 3 - partners.length)
            : researchCandidates(i, i.places.filter(p => !isPartner(p)), 3 - partners.length);
    if (
      provider === "REAL_TEST" &&
      (numbers.length !== places.length ||
        new Set(numbers).size !== numbers.length)
    )
      throw new Error("Cần một số test riêng biệt cho mỗi lane.");
    for (let idx = 0; idx < places.length; idx++) {
      const p = places[idx];
      const gate = policyGate(
        {
          kind: "CALL",
          mode: i.mode,
          provider,
          number: numbers[idx],
          consent,
          eligible:
            provider === "REAL_TEST"
              ? allowlist.includes(numbers[idx])
              : p.contactEligibility === "ALLOWLIST",
        },
        allowlist,
        i.calls.filter(
          (c) =>
            c.providerMode === "REAL_TEST" &&
            Date.now() - Date.parse(c.startedAt) < 600000,
        ).length + idx,
      );
      if (!gate.allowed) {
        i.metrics.policyBlocked++;
        this.event(i, "Policy", "ACTION_BLOCKED", gate.reason, "FAILED");
        throw new Error(gate.reason);
      }
    }
    const appLanes: { p: Place; memberId: string }[] = [];
    for (const p of partners) {
      const m = this.network.byId(p.id.slice("partner-".length)),
        gate = policyGate(
          {
            kind: "CALL",
            mode: i.mode,
            provider: "APP",
            consent: true,
            eligible: !!m && m.joined && m.onDuty,
          },
          [],
        );
      const reason = !gate.allowed
        ? gate.reason
        : !this.network.tryRing(m!.id)
          ? `${p.name}: đã đạt giới hạn chuông mỗi giờ của đối tác`
          : "";
      if (reason) {
        i.metrics.policyBlocked++;
        this.event(i, "Policy", "ACTION_BLOCKED", reason, "FAILED");
        continue;
      }
      appLanes.push({ p, memberId: m!.id });
    }
    if (!appLanes.length && !places.length)
      throw new Error("Không có điểm nào được phép liên hệ.");
    i.consent.calls = consent;
    i.running = true;
    const g = i.generation;
    i.status = "CONTACTING";
    // Allocate every lane before asynchronous work begins: genuinely concurrent adapter tasks.
    const lanes = [
      ...appLanes.map(({ p, memberId }) => ({
        p,
        memberId,
        mode: "APP" as const,
      })),
      ...places.map((p) => ({ p, memberId: undefined, mode: provider })),
    ].map(({ p, memberId, mode }) => {
      const c: Call = {
        id: randomUUID(),
        placeId: p.id,
        providerMode: mode,
        memberId,
        status: "RINGING",
        startedAt: now(),
        transcript: [],
        generation: 0,
      };
      i.calls.push(c);
      p.supportStatus = "CONTACTED";
      p.verification = "CONTACT_ATTEMPTED";
      return { c, p };
    });
    const hasApp = appLanes.length > 0;
    i.metrics.maxConcurrentCalls = Math.max(
      i.metrics.maxConcurrentCalls,
      lanes.length,
    );
    this.event(
      i,
      "Calling",
      "CALL_RINGING",
      `${lanes.length} cuộc gọi song song · ${hasApp ? `${appLanes.length} app đối tác` : ""}${hasApp && places.length ? " + " : ""}${places.length ? `${places.length} ${provider}` : ""}`,
      "WORKING",
      lanes.map(({ c }) => c.id),
      hasApp ? "LIVE" : "SIMULATED",
    );
    await Promise.all(
      lanes.map(async ({ c, p }, idx) => {
        const cg = c.generation,
          live = c.providerMode !== "MOCK";
        if (c.providerMode === "MOCK") {
          await this.simulatedDialogue(
            i,
            g,
            c,
            p,
            idx - appLanes.length,
            hasApp,
          );
          return;
        }
        let status: Call["status"] = "NO_ANSWER",
          reply = "Không có người trả lời trong thời hạn thử nghiệm.";
        if (c.providerMode === "APP") {
          const result = await this.awaitPartner(i, g, c, cg);
          if (!result) return;
          ({ status, reply } = result);
        } else {
          if (!(await this.delay(i, g, 2 + idx)) || c.generation !== cg) return;
          try {
            ({ status, reply } = await gatewayCall(
              numbers[idx - appLanes.length],
              i.id,
            ));
          } catch (error) {
            status = "FAILED";
            reply = String(error);
          }
        }

        if (g !== i.generation || c.generation !== cg || terminal(i)) return;
        c.status = status;
        if (!c.support) {
          c.support = extractSupport(c);
          if (status === "NO_ANSWER") c.support.decision = "EXPIRED";
        }
        c.endedAt = now();
        if (reply)
          c.transcript.push({
            speaker:
              status === "NO_ANSWER" || status === "FAILED"
                ? "Hệ thống"
                : "Người nhận",
            text: reply,
            time: now(),
            source: c.providerMode,
          });
        c.checks = checkSupport(c.support, i.needs ?? emptyNeeds());
        if (status === "CONFIRMED" && c.checks.length)
          c.status = status = "CONNECTED";
        if (c.providerMode !== "APP") {
          this.checkCall(i, c);
          status = c.status;
        }
        p.supportStatus =
          status === "CONFIRMED"
            ? "CONFIRMED"
            : status === "DECLINED"
              ? "DECLINED"
              : "UNKNOWN";
        p.verification =
          status === "CONFIRMED" ? "SUPPORT_CONFIRMED" : "CONTACT_ATTEMPTED";
        if (status === "CONFIRMED") {
          p.evidenceRefs.push(c.id);
          i.metrics.firstConfirmedMs ??=
            Date.now() - Date.parse(i.metrics.sosAt || i.createdAt);
        }
        this.event(
          i,
          "Calling",
          status === "CONFIRMED" ? "HELP_CONFIRMED" : "CALL_COMPLETED",
          `${p.name}: ${status}`,
          "SUCCEEDED",
          [c.id],
          live ? "LIVE" : "SIMULATED",
        );
        if (status === "CONFIRMED") await this.replan(i, "CONTACT_CONFIRMED");
      }),
    );
    if (g !== i.generation || terminal(i)) return;
    i.running = false;
    await this.replan(i, "CALL_POOL_FINISHED");
    if (i.scenario === "ROAD_BLOCKED" && i.plans.length && i.blockedCount === 0)
      await this.inject(i, "ROAD_BLOCKED");
  }
  // Waits for the partner's in-app decision (see partnerDecide) or a timeout.
  private async awaitPartner(i: Incident, g: number, c: Call, cg: number) {
    for (let t = 0; ; t++) {
      if (!(await this.delay(i, g)) || c.generation !== cg) return null;
      if (c.status === "CONFIRMED" || c.status === "DECLINED")
        return { status: c.status, reply: "" };
      if (
        t >=
        (c.status === "CONNECTED" ? PARTNER_DECIDE_TICKS : PARTNER_RING_TICKS)
      )
        return {
          status: "NO_ANSWER" as const,
          reply:
            c.status === "CONNECTED"
              ? "Đối tác nghe máy nhưng chưa quyết định trong thời hạn."
              : "Đối tác không nghe máy.",
        };
    }
  }
  // Who does what in the plan: GPT's validated assignments, or a conservative rule-based split.
  coordination(i: Incident, placeId: string, d?: AIDecision): NonNullable<Plan["coordination"]> {
    const offers = offersOf(i), signature = offersSignature(i);
    const place = i.places.find(p => p.id === placeId)?.name ?? placeId;
    if (d?.assignments.length)
      return { mode: "AI_LIVE", summary: d.summaryForUser || d.reasons[0], offersSignature: signature,
        assignments: d.assignments.map(a => ({ ...a, who: offers.find(o => o.ref === a.ref)!.who })) };
    const assignments = offers.map(o => {
      if (o.kind === "PARTNER") {
        const support = latestSupport(i, o.placeId!), checks = this.admissionChecks(i, o.placeId!);
        if (o.placeId === placeId)
          return { ref: o.ref, who: o.who, role: "PRIMARY" as const, instruction: `Tiếp nhận${support?.entrance ? " tại " + support.entrance : ""}: ${o.offer}`, reason: "Đã xác nhận và được chọn làm điểm đến." };
        if (!checks.length && i.places.find(p => p.id === o.placeId)?.supportStatus === "CONFIRMED")
          return { ref: o.ref, who: o.who, role: "BACKUP" as const, instruction: "Giữ sẵn làm phương án dự phòng.", reason: "Đủ điều kiện nhưng không phải lựa chọn chính." };
        return { ref: o.ref, who: o.who, role: "UNUSED" as const, instruction: "Chưa dùng.", reason: checks.slice(0, 2).map((c, k) => k ? c.charAt(0).toLowerCase() + c.slice(1) : c).join(", ") || "Chưa xác nhận tiếp nhận." };
      }
      if (o.state === "CANNOT_HELP")
        return { ref: o.ref, who: o.who, role: "UNUSED" as const, instruction: "Chưa dùng.", reason: "Đã báo không thể giúp." };
      if (o.state === "ON_THE_WAY")
        return { ref: o.ref, who: o.who, role: "SUPPORT" as const, instruction: `Tới ${place} gặp người dùng${o.arrivalMinutes !== null ? ` (tự báo ${o.arrivalMinutes} phút)` : ""}.`, reason: `Đề xuất: ${o.offer}` };
      return { ref: o.ref, who: o.who, role: "SUPPORT" as const, instruction: "Giữ liên lạc và theo dõi vị trí.", reason: `Đề xuất: ${o.offer}` };
    });
    const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
    const primaryOffer = offers.find(o => o.ref === assignments.find(a => a.role === "PRIMARY")?.ref)?.offer.split(".")[0];
    const helpers = assignments.filter(a => a.role === "SUPPORT");
    return { mode: "RULES_FALLBACK", offersSignature: signature, assignments,
      summary: [`Đi tới ${place}${primaryOffer ? ` — ${lower(primaryOffer)}` : ""}.`,
        ...helpers.map(h => `${h.who} ${lower(h.instruction)}`)].join(" ").slice(0, 400) };
  }
  async replan(i: Incident, reason: string) {
    if (terminal(i)) return;
    if (this.routing.has(i.id)) {
      this.pendingReplans.set(i.id, reason);
      return;
    }
    this.routing.add(i.id);
    const g = i.generation,
      locationAt = i.location.observedAt;
    const needs = needsSchema.parse(i.needs ?? emptyNeeds());
    const membership = () => i.calls.filter(c => c.providerMode === "APP").map(c => {
      const m = c.memberId ? this.network.byId(c.memberId) : undefined;
      return [c.id, m?.joined, m?.onDuty];
    });
    const snapshot = JSON.stringify([
      membership(),
      i.scenarioClock, i.roadObservations,
      i.needs,
      i.calls.map((c) => [c.id, c.generation, c.support]),
      i.blockedEdges, i.contacts.map(c => [c.memberId, c.status, c.arrivalMinutes]), offersSignature(i),
    ]);
    const stillValid = () =>
      g === i.generation &&
      !terminal(i) &&
      !i.location.stale &&
      locationAt === i.location.observedAt &&
      snapshot ===
        JSON.stringify([
          membership(),
          i.scenarioClock, i.roadObservations,
          i.needs,
          i.calls.map((c) => [c.id, c.generation, c.support]),
          i.blockedEdges, i.contacts.map(c => [c.memberId, c.status, c.arrivalMinutes]), offersSignature(i),
        ]);
    const current = i.plans.find((p) => !p.superseded);
    const invalidate = () => {
      if (current && !current.superseded) {
        current.superseded = true;
        current.route.superseded = true;
        i.handoff = undefined;
        i.ai.pendingAction = undefined;
        i.nav = undefined;
        i.status = "REPLANNING";
        this.event(
          i,
          "Coordinator",
          "PLAN_INVALIDATED",
          "Điều kiện đã đổi; dừng dùng kế hoạch cũ và cần xác nhận lại.",
          "WAITING",
          [current.id],
        );
      }
    };
    try {
      if (
        current &&
        (this.admissionChecks(i, current.selectedPlaceId, current.route).length ||
          current.supportSignature !==
            supportSignature(latestSupport(i, current.selectedPlaceId)) ||
          [
            "ROAD_BLOCKED",
            "USER_REJECTS_ROUTE",
            "LOCATION_UPDATED",
            "OFF_ROUTE",
            "NEEDS_UPDATED",
          ].includes(reason))
      )
        invalidate();
      if (i.location.stale) {
        invalidate();
        i.status = "LOCATION_UNAVAILABLE";
        i.message = "Vị trí đã cũ; cần cập nhật trước khi đề xuất tuyến.";
        this.event(
          i,
          "Monitoring",
          "LOCATION_UNAVAILABLE",
          i.message,
          "WAITING",
        );
        return;
      }
      const comparisons: {
        placeId: string;
        reasons: string[];
        evidenceRefs: string[];
      }[] = [];
      const routeOptions: RouteOption[] = [];
      i.routeAgent = { status: "ASSESSING", checkedAt: now(), reason };
      const candidates = await Promise.all(
        i.places.map(async (p) => {
          const context = assessPlace(i, p);
          const support = latestSupport(i, p.id),
            failures = this.admissionChecks(i, p.id);
          const comparison = {
            placeId: p.id,
            reasons: [...context.reasons, ...failures],
            evidenceRefs: [...context.evidenceRefs, ...(support?.evidenceRefs ?? [])],
          };
          comparisons.push(comparison);
          if (p.supportStatus !== "CONFIRMED" || failures.length) return null;
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            const revision = i.plans.length + 1;
            const routes = await Promise.race([
              this.routeWorker.options(i, p, revision),
              new Promise<never>((_, reject) => {
                timer = setTimeout(
                  () => reject(new Error("Định tuyến timeout")),
                  8000,
                );
              }),
            ]);
            const options = routes.map(route => {
              const checks = checkSupport(support, needs, route);
              return { placeId: p.id, route, checks, eligible: !checks.length,
                evidenceRefs: [route.id, ...(support?.evidenceRefs ?? [])] };
            });
            routeOptions.push(...options);
            const valid = options.filter(o => o.eligible);
            comparison.reasons = valid.length ? context.reasons : [...context.reasons, ...new Set(options.flatMap(o => o.checks))];
            if (!valid.length) return null;
            return { p, support: support!, route: valid[0].route, context };
          } catch {
            comparison.reasons = ["Không có dữ liệu định tuyến khả dụng"];
            return null;
          } finally {
            if (timer) clearTimeout(timer);
          }
        }),
      );
      if (!stillValid()) {
        if (!terminal(i)) this.pendingReplans.set(i.id, reason);
        return;
      }
      const eligible = candidates
        .filter((c) => c !== null)
        .sort(
          (a, b) =>
            ((a.route.safety?.weightedCost ?? a.route.distanceMeters ?? Infinity) - a.context.score * 4) -
              ((b.route.safety?.weightedCost ?? b.route.distanceMeters ?? Infinity) - b.context.score * 4) ||
            a.p.id.localeCompare(b.p.id),
        );
      if (!eligible.length) {
        invalidate();
        (i.routeDecisions ??= []).push({ id: randomUUID(), createdAt: now(), trigger: reason,
          mode: "RULES_FALLBACK", selectedPlaceId: null, selectedRouteId: null,
          reasons: ["Không có nơi và tuyến đủ điều kiện; không tạo kế hoạch."], evidenceRefs: [], candidates: structuredClone(routeOptions), assessments: [] });
        if (!i.running) {
          i.status = "NO_RESPONDERS";
          i.message =
            "Chưa có nơi đủ điều kiện tiếp nhận. Không tạo kế hoạch tiếp nhận.";
        }
        this.event(
          i,
          "Coordinator",
          "NO_RESPONDERS",
          "Chưa có nơi đủ điều kiện: " +
            comparisons
              .map((c) => `${c.placeId}: ${c.reasons.join("; ")}`)
              .join(" | "),
          "WAITING",
        );
        return;
      }
      let selected = eligible[0];
      let placeDecision: RouteDecision["placeDecision"] = { mode: "RULES_FALLBACK", reasons: ["Backend lọc giờ hoạt động, chức năng và cam kết; so sánh chi phí tuyến ưu tiên sáng đèn với mức phù hợp nhu cầu. Dữ liệu địa điểm/độ sáng được ghi nhãn mô phỏng."], evidenceRefs: selected.support.evidenceRefs };
      const previous = eligible.find(
        (c) => c.p.id === current?.selectedPlaceId,
      );
      let aiDecision: AIDecision | undefined;
      const askPlanner = async () => {
        try {
          const context = {
            ...i,
            places: eligible.map((c) => c.p),
            plannerOffers: offersOf(i),
            plannerRoutes: eligible.map((c) => ({
              placeId: c.p.id,
              source: c.route.source,
              sourceKind: c.route.sourceKind,
              capturedAt: c.route.capturedAt,
              distanceMeters: c.route.distanceMeters ?? null,
              durationSeconds: c.route.sourceKind === "LIVE" ? (c.route.durationSeconds ?? null) : null,
            })),
          };
          return await this.runAI(i, "PLAN", (signal) => this.aiService.plan(context, reason, signal));
        } catch {
          if (stillValid())
            this.event(i, "Coordinator", "AI_FALLBACK", "Planner dùng quy tắc dự phòng: điều kiện trước, quãng đường có nguồn sau; ETA chưa biết nếu thiếu dữ liệu live.", "WAITING");
          return undefined;
        }
      };
      if (current && !current.superseded && previous) {
        // Keep accepted destinations; before acceptance only switch for material distance improvement.
        if (
          current.acceptedAt ||
          previous.route.distanceMeters === undefined ||
          selected.route.distanceMeters === undefined ||
          previous.route.distanceMeters - selected.route.distanceMeters < 50
        ) {
          // New helper proposals: let the planner recombine them before deciding to keep the plan.
          const offersChanged = current.coordination?.offersSignature !== offersSignature(i);
          if (offersChanged && i.ai.enabled) {
            aiDecision = await askPlanner();
            if (!stillValid()) {
              if (!terminal(i)) this.pendingReplans.set(i.id, reason);
              return;
            }
          }
        }
        if (aiDecision && aiDecision.selectedPlaceId !== current.selectedPlaceId && !current.acceptedAt) {
          /* GPT found a better combination at another eligible place: build a new plan below. */
        } else if (
          current.acceptedAt ||
          previous.route.distanceMeters === undefined ||
          selected.route.distanceMeters === undefined ||
          previous.route.distanceMeters - selected.route.distanceMeters < 50
        ) {
          if (current.coordination?.offersSignature !== offersSignature(i)) {
            current.coordination = this.coordination(i, current.selectedPlaceId, aiDecision?.selectedPlaceId === current.selectedPlaceId ? aiDecision : undefined);
            this.event(i, "Coordinator", "COORDINATION_UPDATED", "Phương án tổng hợp: " + current.coordination.summary, "SUCCEEDED", [current.id], current.coordination.mode === "AI_LIVE" ? "LIVE" : "SIMULATED");
          }
          current.backupPlaceId = eligible.find(
            (c) => c.p.id !== current.selectedPlaceId,
          )?.p.id;
          current.comparisons = comparisons.map((c) => ({
            ...c,
            reasons: c.reasons.length
              ? c.reasons
              : [
                  c.placeId === current.selectedPlaceId
                    ? "Giữ điểm đến hợp lệ để tránh đổi liên tục"
                    : "Phương án dự phòng đã đủ điều kiện",
                ],
          }));
          (i.routeDecisions ??= []).push({ id: randomUUID(), createdAt: now(), trigger: reason,
            mode: "KEPT_CURRENT", selectedPlaceId: current.selectedPlaceId, selectedRouteId: current.route.id,
            reasons: ["Giữ kế hoạch hiện hành còn hợp lệ để tránh đổi tuyến liên tục."], evidenceRefs: current.evidenceRefs,
            candidates: structuredClone([{ placeId: current.selectedPlaceId, route: current.route, eligible: true, checks: [], evidenceRefs: [current.route.id, ...current.evidenceRefs] }, ...routeOptions.filter(o => o.route.id !== current.route.id)]),
            assessments: [], planId: current.id });
          this.event(
            i,
            "Coordinator",
            "PLAN_REEVALUATED",
            "Đã đánh giá thông tin mới; giữ điểm đến hiện hành.",
            "SUCCEEDED",
            current.evidenceRefs,
          );
          return;
        }
      }
      this.event(
        i,
        "Route",
        "ROUTE_REQUESTED",
        "So sánh kết quả đã kiểm tra: " + reason,
        "WORKING",
        eligible.flatMap((c) => c.support.evidenceRefs),
      );
      if (i.ai.enabled && !aiDecision) aiDecision = await askPlanner();
      if (aiDecision) {
        const decision = aiDecision;
        selected = eligible.find((c) => c.p.id === decision.selectedPlaceId) ?? selected;
        placeDecision = { mode: "AI_LIVE", reasons: decision.reasons, evidenceRefs: decision.evidenceRefs, runId: i.ai.runs.at(-1)?.id };
      }
      if (
        !stillValid() ||
        checkSupport(latestSupport(i, selected.p.id), needs, selected.route)
          .length
      )
      {
        if (!terminal(i)) this.pendingReplans.set(i.id, reason);
        return;
      }
      const options = routeOptions.filter(o => o.placeId === selected.p.id && o.eligible);
      const routeDecision: RouteDecision = {
        id: randomUUID(), createdAt: now(), trigger: reason,
        mode: options.length > 1 ? "RULES_FALLBACK" : "SINGLE_OPTION",
        selectedPlaceId: selected.p.id, selectedRouteId: selected.route.id,
        reasons: [options.length > 1 ? "Giữ tuyến cơ sở từ bộ định tuyến; AI chưa chọn tuyến." : "Nguồn định tuyến chỉ cung cấp một phương án hợp lệ; không tạo tuyến giả."],
        evidenceRefs: [selected.route.id, ...selected.support.evidenceRefs], candidates: structuredClone(routeOptions),
        assessments: options.map(o => ({ routeId: o.route.id, reasons: ["Đạt kiểm tra tiếp nhận, giới hạn và dữ liệu định tuyến."], evidenceRefs: o.evidenceRefs })),
        placeDecision,
      };
      if (options.length > 1 && i.ai.enabled) {
        try {
          const choice = await this.runAI(i, "ROUTE_DECISION", signal => this.aiService.decideRoute(i, options, reason, signal));
          const chosen = options.find(o => o.route.id === choice.selectedRouteId)!;
          selected = { ...selected, route: chosen.route };
          routeDecision.mode = "AI_LIVE";
          routeDecision.selectedRouteId = chosen.route.id;
          routeDecision.reasons = choice.reasons;
          routeDecision.evidenceRefs = choice.evidenceRefs;
          routeDecision.assessments = choice.assessments;
          routeDecision.runId = i.ai.runs.at(-1)?.id;
        } catch {
          routeDecision.fallbackReason = "AI lỗi, hết hạn/budget hoặc chưa sẵn sàng; dùng tuyến cơ sở đã kiểm tra.";
          routeDecision.reasons = [routeDecision.fallbackReason];
        }
      } else if (options.length > 1) routeDecision.fallbackReason = "AI chưa bật; dùng quy tắc dự phòng.";
      if (!stillValid() || checkSupport(latestSupport(i, selected.p.id), needs, selected.route).length) {
        // Keep an audit of a discarded decision only in its original live incident.
        if (!terminal(i) && i.generation === g) {
          routeDecision.discarded = true;
          (i.routeDecisions ??= []).push(routeDecision);
          this.pendingReplans.set(i.id, reason);
          this.event(i, "Route", "ROUTE_DECISION_DISCARDED", "Dữ kiện đã đổi; bỏ quyết định tuyến cũ.", "WAITING", [routeDecision.id]);
        }
        return;
      }
      invalidate();
      const revision = i.plans.length + 1;
      const planId = randomUUID();
      routeDecision.planId = planId;
      (i.routeDecisions ??= []).push(routeDecision);
      i.plans.push({
        id: planId,
        coordination: this.coordination(i, selected.p.id, aiDecision?.selectedPlaceId === selected.p.id ? aiDecision : undefined),
        routeDecisionId: routeDecision.id,
        revision,
        selectedPlaceId: selected.p.id,
        route: selected.route,
        supportUpdatedAt: selected.support.updatedAt,
        supportSignature: supportSignature(selected.support),
        backupPlaceId: eligible.find((c) => c.p.id !== selected.p.id)?.p.id,
        comparisons: comparisons.map((c) => ({
          ...c,
          reasons: c.reasons.length
            ? c.reasons
            : [
                c.placeId === selected.p.id
                  ? "Được chọn sau kiểm tra nhu cầu, điều kiện và dữ liệu tuyến"
                  : "Đủ điều kiện; giữ làm dự phòng",
              ],
        })),
        reasons: [
          ...selected.context.reasons,
          `Đối tác xác nhận: ${selected.support.supportTypes.join(", ")}; cửa vào: ${selected.support.entrance ?? "chưa nêu"}`,
          `Điều kiện: ${selected.support.conditions.join("; ") || "không nêu thêm"}`,
          `Thời hạn: ${selected.support.validUntil ?? "chưa cung cấp"}`,
          `Định tuyến: ${selected.route.source} · ${selected.route.distanceMeters === undefined ? "quãng đường chưa biết" : selected.route.distanceMeters + " m"} · ${selected.route.sourceKind === "LIVE" && selected.route.durationSeconds !== undefined ? selected.route.durationSeconds + " giây" : "ETA chưa biết"}`,
          `Lý do cập nhật: ${reason}`,
          ...(placeDecision?.mode === "AI_LIVE" ? placeDecision.reasons.map(r => "Đánh giá điểm đến của GPT: " + r) : []),
          ...routeDecision.reasons.map(r => `${routeDecision.mode === "AI_LIVE" ? "Đánh giá tuyến của GPT" : "Chọn tuyến theo dữ liệu/quy tắc"}: ${r}`),
        ],
        evidenceRefs: [
          selected.p.evidenceRefs[0],
          ...selected.support.evidenceRefs,
        ].filter(Boolean),
        createdAt: now(),
        superseded: false,
      });
      i.status = "ROUTE_PROPOSED";
      this.event(i, "Route", "ROUTE_DECIDED", `Đã đánh giá ${options.length} tuyến · ${routeDecision.mode}.`, "SUCCEEDED", [routeDecision.id, selected.route.id], routeDecision.mode === "AI_LIVE" ? "LIVE" : "SIMULATED");
      i.message = `${selected.p.name}: phương án ${i.running ? "tạm thời" : "đề xuất"} v${revision}. ${current?.acceptedAt || i.plans.some(p => p.superseded && p.acceptedAt) ? "Điều kiện thay đổi; cần chấp nhận lại trước khi tiếp tục." : "Xem điều kiện và chấp nhận trước khi đi."}`;
      this.event(
        i,
        "Route",
        "ROUTE_COMPUTED",
        `Tuyến v${revision} · ${selected.route.sourceKind}`,
        "SUCCEEDED",
        [selected.route.id],
        selected.route.sourceKind,
      );
      this.event(
        i,
        "Coordinator",
        revision === 1 ? "ROUTE_SELECTED" : "PLAN_REVISED",
        i.message,
        "SUCCEEDED",
        selected.support.evidenceRefs,
      );
      const coordination = i.plans.at(-1)!.coordination!;
      this.event(i, "Coordinator", "COORDINATION_UPDATED", "Phương án tổng hợp: " + coordination.summary, "SUCCEEDED", [planId], coordination.mode === "AI_LIVE" ? "LIVE" : "SIMULATED");
      this.navigate(i);
    } finally {
      i.routeAgent = { status: terminal(i) ? "STOPPED" : i.plans.some(p => !p.superseded) ? "WATCHING" : "PAUSED", checkedAt: now(), reason };
      this.store.save(i);
      this.routing.delete(i.id);
      this.bus.emit(i.id, i);
      this.bus.emit("owner:" + i.owner, i);
      const pending = this.pendingReplans.get(i.id);
      this.pendingReplans.delete(i.id);
      if (pending && !terminal(i)) await this.replan(i, pending);
    }
  }
  async inject(i: Incident, action: string) {
    if (i.mode !== "SIMULATION")
      throw new Error("Inject chỉ khả dụng trong SIMULATION");
    if (terminal(i)) throw new Error("Incident đã kết thúc");
    const current = i.plans.find((p) => !p.superseded);
    switch (action) {
      case "ROAD_DARK":
        await this.reportDarkRoad(i);
        break;
      case "ROAD_BLOCKED":
      case "USER_REJECTS_ROUTE":
        if (!current) throw new Error("Chưa có tuyến để thay đổi");
        i.blockedCount++;
        this.blockAhead(i, current.route);
        current.route.blocked = true;
        this.event(
          i,
          "Monitoring",
          "ROUTE_BLOCKED",
          "Tuyến hiện tại bị chặn / người dùng từ chối.",
          "SUCCEEDED",
          [current.route.id],
        );
        await this.replan(i, action);
        break;
      case "STORE_DECLINES":
      case "CONTACT_NO_ANSWER": {
        const p = i.places.find(
          (p) => p.id === (current?.selectedPlaceId || i.places[0]?.id),
        );
        if (!p) throw new Error("Chưa có điểm hỗ trợ");
        p.supportStatus = action === "STORE_DECLINES" ? "DECLINED" : "UNKNOWN";
        p.verification = "CONTACT_ATTEMPTED";
        const c = i.calls.filter((c) => c.placeId === p.id).at(-1);
        if (c) {
          if (c.support)
            c.support.decision =
              action === "STORE_DECLINES" ? "REVOKED" : "EXPIRED";
          c.generation++;
          c.status = action === "STORE_DECLINES" ? "DECLINED" : "NO_ANSWER";
          c.endedAt = now();
          c.transcript.push({
            speaker: "Operator (simulation)",
            text: "Thay đổi quyết định: " + c.status,
            time: now(),
            source: "MOCK",
          });
        }
        this.event(
          i,
          "Calling",
          "SUPPORT_REVOKED",
          p.name + " không còn xác nhận hỗ trợ.",
          "SUCCEEDED",
          c ? [c.id] : [],
        );
        await this.replan(i, action);
        break;
      }
      case "HOTEL_ACCEPTS": {
        const p = i.places.find((p) => p.id === "b") || i.places[1];
        if (!p) throw new Error("Chưa có ứng viên");
        p.supportStatus = "CONFIRMED";
        p.verification = "SUPPORT_CONFIRMED";
        const id = randomUUID();
        for (const c of i.calls.filter(
          (c) =>
            c.placeId === p.id && ["RINGING", "CONNECTED"].includes(c.status),
        )) {
          c.generation++;
          c.status = "FAILED";
          c.endedAt = now();
        }
        i.calls.push({
          id,
          placeId: p.id,
          status: "CONFIRMED",
          providerMode: "MOCK",
          generation: 0,
          startedAt: now(),
          endedAt: now(),
          transcript: [
            {
              speaker: "Operator (simulation)",
              text: "Xác nhận điểm tiếp nhận trong kịch bản demo.",
              time: now(),
              source: "MOCK",
            },
          ],
        });
        i.calls.at(-1)!.transcript[0].text =
          "Đồng ý tiếp nhận, có chỗ chờ. Cửa vào: cửa chính. Điều kiện: không yêu cầu thêm. Tương tác kín đáo: có. Cần di chuyển: có. Qua ngõ: không.";
        this.checkCall(i, i.calls.at(-1)!);
        p.evidenceRefs.push(id);
        this.event(
          i,
          "Calling",
          "HELP_CONFIRMED",
          p.name + " đồng ý tiếp nhận (operator simulation).",
          "SUCCEEDED",
          [id],
        );
        await this.replan(i, "HOTEL_ACCEPTS");
        break;
      }
      case "GPS_STALE":
        this.signalLost(i, "GPS không còn cập nhật");
        if (current) {
          current.superseded = true;
          current.route.superseded = true;
        }
        i.status = "LOCATION_UNAVAILABLE";
        i.message =
          "GPS đã cũ. Lần ghi nhận: " +
          i.location.observedAt +
          ". Cần cập nhật vị trí để tiếp tục.";
        this.event(i, "Monitoring", "GPS_STALE", i.message, "WAITING");
        break;
      case "ESCALATE":
        this.escalate(i);
        break;
      case "TRIP_STOPPED":
        if (!i.trip || i.trip.status !== "ACTIVE")
          throw new Error("Chưa có chuyến đi đang đồng hành");
        this.checkin(i, "Bạn dừng lại khá lâu ở nơi vắng");
        break;
      case "TRIP_DEVIATED":
        if (!i.trip || i.trip.status !== "ACTIVE")
          throw new Error("Chưa có chuyến đi đang đồng hành");
        this.checkin(i, "Bạn đang lệch khỏi tuyến về nhà");
        break;
      default:
        throw new Error("Inject không hợp lệ");
    }
  }
  close(i: Incident, cancel = false) {
    if (cancel && i.showcase?.status === "RUNNING") i.showcase.status = "STOPPED";
    this.routeWorker.forget(i.id);
    i.routeAgent = { status: "STOPPED", checkedAt: now(), reason: cancel ? "USER_CANCELLED" : "CLOSED" };
    if (terminal(i)) throw new Error("Incident đã kết thúc");
    if (!cancel && !i.handoff?.completedAt)
      throw new Error("Cần xác nhận bàn giao hai chiều");
    i.generation++;
    for (const controller of this.dialogueAbort.get(i.id) ?? [])
      controller.abort();
    this.dialogueAbort.delete(i.id);
    this.aiAbort.get(i.id)?.abort();
    i.ai.busy = false;
    i.ai.pendingAction = undefined;
    for (const run of i.ai.runs)
      if (run.status === "RUNNING") {
        run.status = "FAILED";
        run.error = "Người dùng đã kết thúc incident.";
      }
    i.running = false;
    i.frozen = false;
    for (const c of i.calls)
      if (["QUEUED", "RINGING", "CONNECTED"].includes(c.status)) {
        c.generation++;
        c.status = "FAILED";
        c.endedAt = now();
      }
    if (i.metrics.sosAt || i.emergency)
      this.sealEvidence(i, cancel ? "Hủy yêu cầu" : "Kết thúc sự cố");
    i.status = cancel ? "USER_CANCELLED" : "CLOSED";
    i.message = cancel
      ? "Đã hủy yêu cầu."
      : "Đã xác nhận hai chiều · hoàn thành bàn giao demo.";
    this.event(
      i,
      "Coordinator",
      cancel ? "USER_CANCELLED" : "INCIDENT_CLOSED",
      i.message,
    );
  }
}
const globalEngine = globalThis as unknown as {
  guardianEngine?: GuardianEngine;
};
export function getEngine() {
  if (!globalEngine.guardianEngine) {
    const engine = (globalEngine.guardianEngine = new GuardianEngine());
    engine.defaults = { placesAdapter: "CITY", routeAdapter: "CITY" };
    // ponytail: one in-process ticker; move to a job runner with multiple replicas.
    setInterval(() => {
      for (const i of engine.cache.values()) {
        engine.tickSignal(i);
        engine.tickTrip(i);
        engine.tickRouteAgent(i);
      }
    }, 2000).unref();
  }
  return globalEngine.guardianEngine;
}
