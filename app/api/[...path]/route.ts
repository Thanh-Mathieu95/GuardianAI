import { NextRequest, NextResponse } from "next/server";
import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { getEngine, meters, type GuardianEngine } from "@/lib/engine";
import { aiPublicConfig, type AIAnalysis } from "@/lib/ai";
import { findPlaces } from "@/lib/adapters";
import { cityAnchor, cityPlaces, safetyReport, storeById } from "@/lib/city";
import { dossier, dossierHtml } from "@/lib/evidence";
import { deleteRecordings, readRecording } from "@/lib/recordings";
import { demoCases, emptyNeeds, needsSchema } from "@/lib/support";
import { runShowcase, acknowledgeShowcase } from "@/lib/showcase";
import { verifiedPublicUrl } from "@/lib/links";
import {
  contactInstructions,
  contactTools,
  locationSummary,
  mintRealtime,
  partnerInstructions,
  partnerTools,
  statusSummary,
  userInstructions,
  userTools,
} from "@/lib/realtime";
import { latestIncident, receiverView } from "@/lib/receiver";
import type { Member } from "@/lib/network";
import type { Incident } from "@/lib/types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const globals = globalThis as unknown as {
  guardianSecret?: string;
  guardianInstanceId?: string;
  guardianAITests?: Map<string, number>;
  guardianMints?: Map<string, number[]>;
  guardianMail?: { seq: number; boxes: Map<string, Mail[]> };
};
const instanceId = globals.guardianInstanceId ??= randomUUID();
type Mail = { seq: number; at: number; data: unknown };
// Call signals go to live SSE listeners and into a short-lived mailbox for polling clients
// (Cloudflare quick tunnels do not pass SSE, so phones behind them poll instead).
const mail = (globals.guardianMail ??= { seq: 0, boxes: new Map<string, Mail[]>() });
function sendSignal(engine: GuardianEngine, key: string, data: unknown) {
  engine.bus.emit(key, data);
  const box = (mail.boxes.get(key) ?? []).filter((m) => Date.now() - m.at < 60000).slice(-19);
  box.push({ seq: ++mail.seq, at: Date.now(), data });
  mail.boxes.set(key, box);
}
// No "after" = first poll: report the current position without replaying old signals.
function pollBody(state: unknown, key: string, raw: string | null) {
  const after = raw === null ? null : Number(raw) || 0;
  return {
    state,
    signals: after === null ? [] : (mail.boxes.get(key) ?? []).filter((m) => m.seq > after).map((m) => m.data),
    seq: mail.seq,
  };
}
// Realtime sessions cost money: at most 12 per caller per 10 minutes.
function mintAllowed(key: string) {
  const mints = (globals.guardianMints ??= new Map<string, number[]>()),
    recent = (mints.get(key) || []).filter((t) => Date.now() - t < 600000);
  if (recent.length >= 12)
    throw new Error("Đã tạo quá nhiều phiên giọng nói. Thử lại sau ít phút.");
  mints.set(key, [...recent, Date.now()]);
}
const terminal = (i: Incident) =>
  ["CLOSED", "USER_CANCELLED"].includes(i.status);
type Push = (data: unknown, event?: string) => void;
// Server-Sent Events with heartbeat; setup returns its unsubscribe function.
function sse(req: NextRequest, setup: (push: Push) => () => void) {
  let teardown: () => void = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      const push: Push = (data, event) => {
        if (!closed)
          controller.enqueue(
            encoder.encode(
              `${event ? `event: ${event}\n` : ""}data: ${JSON.stringify(data)}\n\n`,
            ),
          );
      };
      const heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(": heartbeat\n\n"));
      }, 15000);
      const unsubscribe = setup(push);
      teardown = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        req.signal.removeEventListener("abort", teardown);
        try {
          controller.close();
        } catch {}
      };
      req.signal.addEventListener("abort", teardown, { once: true });
      if (req.signal.aborted) teardown();
    },
    cancel() {
      teardown();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
const signalSchema = z
  .object({
    type: z.enum(["offer", "answer", "hangup"]),
    sdp: z.string().max(20000).optional(),
  })
  .strict();
function audioResponse(i: Incident, session: string) {
  const found = readRecording(i, session);
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new Response(new Uint8Array(found.data), {
    headers: { "Content-Type": found.recording.mime, "Cache-Control": "no-store", "Content-Length": String(found.data.length) },
  });
}
function member(engine: GuardianEngine, token: string) {
  const m = engine.network.byToken(token);
  if (!m) throw new Error("NOT_FOUND");
  return m;
}
async function receiverGet(req: NextRequest, path: string[]) {
  const engine = getEngine(),
    m = member(engine, path[1]);
  if (!path[2])
    return NextResponse.json(receiverView(engine, m), {
      headers: { "Cache-Control": "no-store" },
    });
  if (path[2] === "poll") {
    const fresh = engine.network.byId(m.id) ?? m;
    return NextResponse.json(
      pollBody(receiverView(engine, fresh), "signal:" + m.id, req.nextUrl.searchParams.get("after")),
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  if (path[2] === "evidence" || path[2] === "recordings") {
    // Only a relative of this incident, and only after the dossier was shared with them.
    const i = latestIncident(engine, m);
    if (!i || m.role !== "CONTACT" || !i.evidenceShare || !i.contacts.some((c) => c.memberId === m.id))
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (path[2] === "recordings") return audioResponse(i, path[3] ?? "");
    return new Response(dossierHtml(i, engine.store.reportIntegrity(i.id), `/api/r/${path[1]}/recordings/`), {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  if (path[2] !== "stream")
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  return sse(req, (push) => {
    const update = () => {
        const fresh = engine.network.byId(m.id);
        if (fresh) push(receiverView(engine, fresh));
      },
      signal = (data: unknown) => push(data, "signal");
    update();
    engine.bus.on("owner:" + m.owner, update);
    engine.bus.on("member:" + m.id, update);
    engine.bus.on("signal:" + m.id, signal);
    return () => {
      engine.bus.off("owner:" + m.owner, update);
      engine.bus.off("member:" + m.id, update);
      engine.bus.off("signal:" + m.id, signal);
    };
  });
}
async function receiverPost(path: string[], body: unknown) {
  const engine = getEngine(),
    m = member(engine, path[1]),
    action = path.slice(2).join("/"),
    changed = () => engine.bus.emit("member:" + m.id);
  if (action === "join") {
    z.object({ consent: z.literal(true) }).strict().parse(body);
    engine.network.update(m.id, { joined: true });
    changed();
    return { ok: true };
  }
  if (!m.joined) throw new Error("Hãy đồng ý tham gia mạng lưới trước.");
  if (action === "duty") {
    const { onDuty } = z.object({ onDuty: z.boolean() }).strict().parse(body);
    engine.network.update(m.id, { onDuty });
    await engine.networkChanged(m.owner);
    changed();
    return { ok: true };
  }
  if (action === "location") {
    const d = z
      .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
      .strict()
      .parse(body);
    engine.network.update(m.id, d);
    changed();
    return { ok: true };
  }
  const i = latestIncident(engine, m);
  if (!i) throw new Error("Chưa có sự cố.");
  if (action === "signal") {
    if (m.role !== "CONTACT" || !i.contacts.some((c) => c.memberId === m.id))
      throw new Error("FORBIDDEN");
    sendSignal(engine, "signal-owner:" + m.owner, {
      from: m.id,
      name: m.name,
      ...signalSchema.parse(body),
    });
    return { ok: true };
  }
  if (action === "realtime") {
    if (terminal(i)) throw new Error("Sự cố đã kết thúc.");
    if (!i.ai.enabled || !i.ai.consentAt) throw new Error("Người điều phối cần bật AI cho phiên này trước. Bạn vẫn có thể nghe và trả lời bằng chữ.");
    mintAllowed("member:" + m.id);
    const s = engine.network.settings(m.owner);
    if (m.role === "CONTACT") {
      if (!i.contacts.some((c) => c.memberId === m.id))
        throw new Error("Không có cảnh báo cho bạn.");
      return mintRealtime(contactInstructions(i, m, s), contactTools, "cedar");
    }
    const c = i.calls.filter((c) => c.memberId === m.id).at(-1),
      place = c && i.places.find((p) => p.id === c.placeId);
    if (!c || !place || !["CONNECTED", "CONFIRMED"].includes(c.status))
      throw new Error("Nghe máy trước khi bắt đầu trao đổi.");
    return mintRealtime(
      partnerInstructions(i, m, meters(i.location, place)),
      partnerTools,
      "cedar",
    );
  }
  if (m.role === "CONTACT") {
    if (action === "transcript") {
      const d = z.object({ speaker: z.enum(["AI", "PARTNER"]), text: z.string().trim().min(1).max(1000), itemId: z.string().min(1).max(120).optional() }).strict().parse(body);
      await engine.contactTranscript(i, m, d.speaker, d.text, d.itemId);
      return { ok: true };
    }
    const { action: what, arrivalMinutes, fromAI } = z
      .object({ action: z.enum(["ANSWER", "ON_THE_WAY", "KEEP_CONTACT", "CANNOT_HELP"]), arrivalMinutes: z.number().int().min(0).max(1440).optional(), fromAI: z.boolean().default(false) })
      .strict()
      .parse(body);
    if (action !== "contact") throw new Error("NOT_FOUND");
    if (fromAI && what !== "ANSWER") engine.verifiedContactAction(i, m, what, arrivalMinutes);
    else engine.contactAction(i, m, what, arrivalMinutes);
    return { ok: true };
  }
  const { callId } = z.object({ callId: z.string().max(64) }).passthrough().parse(body);
  if (action === "reply") {
    const d = z.object({ callId: z.string().max(64), text: z.string().trim().min(1).max(1000), generation: z.number().int().min(0) }).strict().parse(body);
    await engine.partnerReply(i, engine.partnerCall(i, m, callId), d.text, m.name, d.generation);
  } else if (action === "handoff") {
    const d = z.object({ callId: z.string().max(64), planId: z.string().max(80) }).strict().parse(body);
    const c = engine.partnerCall(i, m, callId), p = i.plans.find(p => p.id === d.planId && p.selectedPlaceId === c.placeId);
    if (!p) throw new Error("FORBIDDEN");
    engine.confirmHandoff(i, "PARTNER", p.id);
  } else if (action === "answer") engine.partnerAnswer(i, m, callId);
  else if (action === "decide") {
    const d = z
      .object({ callId: z.string(), accept: z.boolean(), note: z.string().max(1000).default(""), fromAI: z.boolean().default(false) })
      .strict()
      .parse(body);
    await engine.partnerDecide(i, m, callId, d.accept, d.note, d.fromAI);
    const current = engine.partnerCall(i, m, callId);
    return { ok: true, support: current.support ?? null, checks: current.checks ?? [], admitted: current.status === "CONFIRMED" };
  } else if (action === "transcript") {
    const d = z
      .object({ callId: z.string(), speaker: z.enum(["AI", "PARTNER"]), text: z.string().trim().min(1).max(1000), itemId: z.string().min(1).max(120).optional() })
      .strict()
      .parse(body);
    await engine.partnerTranscript(i, m, callId, d.speaker, d.text, d.itemId);
  } else if (action === "false-alarm") {
    if (!terminal(i)) throw new Error("Chỉ báo cáo sau khi sự cố kết thúc.");
    engine.reportFalseAlarm(i, m, callId);
  } else throw new Error("NOT_FOUND");
  return { ok: true };
}
// Executes a function call from the user's realtime voice agent. Returns text for the model.
async function runTool(
  engine: GuardianEngine,
  i: Incident,
  name: string,
  args: Record<string, unknown>,
) {
  const text = (v: unknown, fallback = "") =>
    typeof v === "string" ? v.slice(0, 500) : fallback;
  switch (name) {
    case "trigger_sos":
    case "silent_sos": {
      if (i.running || i.plans.some((p) => !p.superseded))
        return "SOS đã đang hoạt động. Dùng get_status để xem tiến độ.";
      if (name === "silent_sos") i.covert = true;
      const reasons = Array.isArray(args.reasons)
        ? args.reasons.filter((r) => typeof r === "string").slice(0, 4)
        : [];
      const assessment: AIAnalysis = {
        intent: "SOS",
        confidence: 0.9,
        riskLevel: Math.min(4, Math.max(1, Number(args.risk_level) || 3)),
        reasons: reasons.length ? reasons : [text(args.summary, "Người dùng cần hỗ trợ")],
        unknowns: [],
        reply: "",
      };
      void engine
        .sos(i, text(args.summary, "Tôi cần hỗ trợ."), "MIC", true, assessment, false)
        .catch((e) => {
          i.running = false;
          engine.event(i, "Monitoring", "TASK_FAILED", String(e), "FAILED");
        });
      return "Đã kích hoạt SOS. Hệ thống đang báo người thân và gọi các điểm đối tác gần đó; kết quả sẽ đến qua cập nhật hệ thống.";
    }
    case "set_appearance":
      engine.setAppearance(i, text(args.description));
      return "Đã lưu mô tả nhận diện.";
    case "get_status":
      return JSON.stringify(statusSummary(i));
    case "get_location": {
      // Before SOS nothing is searched yet: preview nearby places without contacting anyone.
      const places = i.places.length
        ? i.places
        : [
            ...engine.partnerPlaces(i),
            ...(i.placesAdapter === "CITY"
              ? cityPlaces(cityAnchor, new Date().toISOString(), engine.takenStores(i))
              : await findPlaces(i.location, i.placesAdapter).catch(() => [])),
          ];
      return JSON.stringify(locationSummary(i, places));
    }
    case "get_directions": {
      const r = engine.directions(i, text(args.destination, "Nhà"));
      const meters = r.distanceMeters ?? 0, limit = i.needs?.maxWalkMeters ?? 800;
      const plan = i.plans.find((p) => !p.superseded);
      // Far trip: offer staffed places that are open and closer, as a first stop.
      const nearer = meters > limit
        ? engine.findDestinations(i, "khách sạn cửa hàng tiện lợi bảo vệ")
            .filter((d) => d.open && (d.route.distanceMeters ?? Infinity) < meters / 2)
            .slice(0, 2)
            .map((d) => ({ name: d.name, distanceMeters: d.route.distanceMeters ?? null, walkMinutes: Math.max(1, Math.round((d.route.distanceMeters ?? 0) / 75)) }))
        : [];
      return JSON.stringify({
        target: r.target,
        distanceMeters: r.distanceMeters,
        walkMinutes: Math.max(1, Math.round(meters / 75)),
        far: meters > limit,
        walkLimitMeters: limit,
        options: r.options,
        nearerStaffedPlaces: nearer,
        sosPlan: plan ? { destination: i.places.find((p) => p.id === plan.selectedPlaceId)?.name ?? null, accepted: !!plan.acceptedAt, distanceMeters: plan.route.distanceMeters ?? null, supportConfirmed: true } : null,
        steps: r.steps,
        advisories: r.advisories,
        note: "Tuyến đã được vẽ trên bản đồ. Trước khi đọc chỉ dẫn, CÂN NHẮC và nói 1–2 câu: nơi này cách bao xa/đi mấy phút, đang mở hay đã đóng (giờ hành chính khác trực ban), có hợp nhu cầu không. Nếu far=true thì nói thẳng là khá xa và gợi ý nearerStaffedPlaces làm điểm dừng trước hoặc dùng xe/taxi; nếu có sosPlan thì so sánh: nơi đó đã xác nhận nhận người, còn nơi người dùng hỏi thì chưa. Để người dùng chọn; đừng tự khẳng định nơi nào an toàn tuyệt đối. Hướng dẫn tiếp theo sẽ đến qua cập nhật hệ thống khi di chuyển.",
      });
    }
    case "record_statement": {
      const topic = text(args.topic, "Khác").slice(0, 40),
        detail = text(args.text);
      if (!detail) return "Thiếu nội dung lời khai.";
      engine.recordStatement(i, topic, detail);
      return "Đã ghi vào hồ sơ bằng chứng.";
    }
    case "get_area_safety":
      if (i.routeAdapter !== "CITY") return "Chưa có dữ liệu sự cố cho khu vực này.";
      return JSON.stringify(safetyReport(cityAnchor, i.location, text(args.street) || undefined));
    case "share_with_contacts": {
      const before = i.contacts.length;
      engine.alertContacts(i, i.generation);
      return i.contacts.length
        ? `Đang đổ chuông app của: ${i.contacts.map((c) => c.name).join(", ")}${before ? " (đã báo trước đó)" : ""}. Họ thấy vị trí trực tiếp; trạng thái sẽ đến qua cập nhật hệ thống.`
        : "Chưa có người thân nào tham gia mạng lưới; hãy thêm trong mục Mạng lưới.";
    }
    case "accept_route": {
      const { plan_id } = z.object({ plan_id: z.string().min(1).max(80) }).strict().parse(args);
      engine.acceptRoute(i, plan_id);
      return "Đã ghi nhận người dùng đi theo tuyến: " + JSON.stringify(statusSummary(i));
    }
    case "report_route_blocked":
      await engine.userBlocksRoute(i);
      return "Đã báo tuyến bị chặn; kế hoạch mới: " + JSON.stringify(statusSummary(i).destination);
    case "report_dark_road":
      await engine.reportDarkRoad(i);
      return "Đã ghi nhận đoạn thiếu sáng trong tình huống mô phỏng. Phương án cần chấp nhận lại: " + JSON.stringify(statusSummary(i).coordination);
    case "request_escalation":
      engine.escalate(i);
      return "Đã hiện bản tóm tắt và nút gọi 113 trên màn hình; người dùng tự bấm gọi.";
    case "checkin_ok":
      engine.checkinOk(i);
      return "Đã xác nhận người dùng vẫn ổn.";
    case "propose_cancel":
    case "propose_arrived":
      i.ai.pendingAction = {
        intent: name === "propose_cancel" ? "CANCEL" : "ARRIVED",
        createdAt: new Date().toISOString(),
      };
      engine.event(i, "Policy", "AI_ACTION_PROPOSED", "Chờ người dùng bấm xác nhận trên màn hình.", "WAITING");
      return "Đã hiện nút xác nhận trên màn hình; nhắc người dùng bấm.";
    default:
      return "Công cụ không tồn tại.";
  }
}
const secret = () =>
  (globals.guardianSecret ??= process.env.GUARDIAN_SESSION_SECRET || randomBytes(32).toString("hex"));
const capability = (owner: string) =>
  createHmac("sha256", secret()).update(owner).digest("hex");
// Pairing link: lets the user's own phone join this browser's session for 10 minutes.
const pairToken = (owner: string) => {
  const body = Buffer.from(
    JSON.stringify({ o: owner, e: Date.now() + 600000 }),
  ).toString("base64url");
  return body + "." + createHmac("sha256", secret()).update("pair:" + body).digest("base64url");
};
function pairOwner(token: string) {
  const [body, sig] = token.split(".");
  const expected = body
    ? createHmac("sha256", secret()).update("pair:" + body).digest("base64url")
    : "";
  if (!sig || !secureEqual(sig, expected)) return null;
  const { o, e } = JSON.parse(Buffer.from(body, "base64url").toString());
  return typeof o === "string" && e > Date.now() ? o : null;
}
const publicState = (i: Incident) => {
  const { owner: _, ...state } = i;
  return state;
};
const secureEqual = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const createSchema = z
  .object({
    locale: z.enum(["vi", "en"]).default("vi"),
    networkOnly: z.boolean().default(false),
    scenario: z
      .enum([
        "NIGHT_WALK",
        "CANNOT_TALK",
        "ROAD_BLOCKED",
        "ALL_UNAVAILABLE",
        "LOCATION_LOST",
      ])
      .optional(),
    zone: z.enum(["HANOI", "HCM"]).optional(),
    mode: z.enum(["SIMULATION", "TEST_LIVE"]).optional(),
    placesAdapter: z.enum(["FIXTURE", "GOOGLE", "CITY"]).optional(),
    routeAdapter: z.enum(["FIXTURE", "GOOGLE", "CITY"]).optional(),
    aiEnabled: z.boolean().default(false),
    aiConsent: z.boolean().default(false),
    needs: needsSchema.optional(),
    demoCase: z.enum(demoCases).optional(),
  })
  .strict()
  .refine((data) => !data.aiEnabled || data.aiConsent, {
    message: "Cần đồng ý gửi hội thoại tới AI trước khi bật.",
  });
type Context = { params: Promise<{ path: string[] }> };
// Public base for invite/pair links: PUBLIC_URL, else the running Cloudflare tunnel (scripts/tunnel.mjs).
async function publicUrl() {
  let candidate = process.env.PUBLIC_URL ?? null;
  try {
    candidate ??= JSON.parse(readFileSync("./data/tunnel-url.json", "utf8")).url;
  } catch { /* No tunnel registered. */ }
  return verifiedPublicUrl(candidate, instanceId);
}
export async function GET(req: NextRequest, { params }: Context) {
  try {
    const { path } = await params,
      engine = getEngine();
    if (path.join("/") === "health") return NextResponse.json({ service: "guardian-ai", instanceId }, { headers: { "Cache-Control": "no-store" } });
    if (path[0] === "r" && path[1]) return await receiverGet(req, path);
    if (path[0] === "pair" && path[1]) {
      const paired = pairOwner(path[1]);
      if (!paired)
        return new Response("Link ghép điện thoại đã hết hạn. Tạo link mới trên máy tính.", {
          status: 410,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      const response = NextResponse.redirect(
        new URL(
          "/demo/phone",
          `${req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", "")}://${req.headers.get("x-forwarded-host") || req.headers.get("host")}`,
        ),
      );
      response.cookies.set("guardian_session", paired, {
        httpOnly: true,
        sameSite: "lax",
        secure: (req.headers.get("x-forwarded-proto") || req.nextUrl.protocol).replace(":", "") === "https",
        path: "/",
        maxAge: 86400,
      });
      return response;
    }
    let owner = req.cookies.get("guardian_session")?.value;
    if (path.join("/") === "session") {
      if (!owner || !/^[a-f0-9-]{36}$/.test(owner)) owner = randomUUID();
      const i = engine.latest(owner);
      const response = NextResponse.json({
        incident: publicState(i),
        operatorToken: process.env.OPERATOR_PASSWORD ? null : capability(owner),
        integrations: {
          google: !!process.env.GOOGLE_MAPS_API_KEY,
          gateway:
            !!process.env.CALL_GATEWAY_URL && !!process.env.CALL_GATEWAY_TOKEN,
          ai: aiPublicConfig(),
        },
        version: "1.2.0",
      });
      response.cookies.set("guardian_session", owner, {
        httpOnly: true,
        sameSite: "strict",
        secure:
          (req.headers.get("x-forwarded-proto") || req.nextUrl.protocol).replace(":", "") === "https",
        path: "/",
        maxAge: 86400,
      });
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
    if (!owner)
      return NextResponse.json({ error: "Session required" }, { status: 401 });
    if (path.join("/") === "ai/config")
      return NextResponse.json(aiPublicConfig(), {
        headers: { "Cache-Control": "no-store" },
      });
    if (path.join("/") === "network")
      return NextResponse.json(
        {
          members: engine.network.list(owner),
          settings: engine.network.settings(owner),
          publicUrl: await publicUrl(),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    if (path[0] !== "incidents" || !path[1])
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    const i = engine.get(path[1], owner);
    if (path[2] === "stream") {
      const o = owner;
      return sse(req, (push) => {
        const state = (v: Incident) => push(publicState(v)),
          signal = (data: unknown) => push(data, "signal");
        push(publicState(i));
        engine.bus.on("owner:" + o, state);
        engine.bus.on("signal-owner:" + o, signal);
        return () => {
          engine.bus.off("owner:" + o, state);
          engine.bus.off("signal-owner:" + o, signal);
        };
      });
    }
    if (path[2] === "poll")
      return NextResponse.json(
        pollBody(publicState(engine.latest(owner)), "signal-owner:" + owner, req.nextUrl.searchParams.get("after")),
        { headers: { "Cache-Control": "no-store" } },
      );
    if (path[2] === "events") return NextResponse.json(i.events);
    if (path[2] === "recordings" && path[3]) return audioResponse(i, path[3]);
    if (path[2] === "evidence")
      return req.nextUrl.searchParams.get("format") === "json"
        ? NextResponse.json({ ...dossier(i), integrity: engine.store.reportIntegrity(i.id) }, { headers: { "Cache-Control": "no-store" } })
        : new Response(dossierHtml(i, engine.store.reportIntegrity(i.id), `/api/incidents/${i.id}/recordings/`), {
            headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
          });
    if (path[2] === "report-history")
      return NextResponse.json({ integrity: engine.store.reportIntegrity(i.id), revisions: engine.store.reportHistory(i.id) }, { headers: { "Cache-Control": "no-store" } });
    if (path[2] === "replay")
      return NextResponse.json(engine.store.replay(i.id).map(publicState));
    if (path[2])
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(publicState(i));
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: NextRequest, { params }: Context) {
  try {
    const origin = req.headers.get("origin");
    // Next can canonicalize nextUrl to localhost even when the browser uses
    // 127.0.0.1, and a tunnel forwards the public host. Compare against the real host.
    const host =
      req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
    let originHost = "";
    try {
      originHost = origin ? new URL(origin).host : "";
    } catch {}
    if (origin && originHost !== host)
      return NextResponse.json(
        { error: "Cross-origin mutation blocked" },
        { status: 403 },
      );
    const { path } = await params,
      engine = getEngine();
    // Binary audio chunk from the user's phone; everything else below is JSON.
    if (path[0] === "incidents" && path[1] && path[2] === "recording") {
      const owner = req.cookies.get("guardian_session")?.value;
      if (!owner) return NextResponse.json({ error: "Session required" }, { status: 401 });
      const i = engine.get(path[1], owner),
        session = req.nextUrl.searchParams.get("session") ?? "",
        seq = z.coerce.number().int().min(0).max(5000).parse(req.nextUrl.searchParams.get("seq")),
        mime = (req.headers.get("content-type") ?? "").split(";")[0].trim();
      const r = engine.addRecording(i, session, seq, mime, Buffer.from(await req.arrayBuffer()));
      return NextResponse.json({ ok: true, chunks: r.chunks, bytes: r.bytes });
    }
    const body = await req.json();
    if (path[0] === "r" && path[1])
      return NextResponse.json(await receiverPost(path, body));
    const owner = req.cookies.get("guardian_session")?.value;
    if (!owner)
      return NextResponse.json({ error: "Session required" }, { status: 401 });
    if (path.join("/") === "network/members") {
      const d = z
        .object({
          role: z.enum(["CONTACT", "PARTNER"]),
          name: z.string().trim().min(1).max(60),
          category: z.string().trim().max(60).default(""),
          slot: z.string().max(64).refine(value => !!storeById(value), "Điểm mô phỏng không có kênh tham gia").nullable().default(null),
        })
        .strict()
        .parse(body);
      return NextResponse.json(
        engine.network.create(owner, d.role, d.name, d.category, d.slot),
        { status: 201 },
      );
    }
    if (path.join("/") === "network/members/delete") {
      const { id } = z.object({ id: z.string().max(20) }).strict().parse(body);
      engine.network.remove(owner, id);
      await engine.networkChanged(owner);
      return NextResponse.json({ ok: true });
    }
    if (path.join("/") === "network/settings") {
      const d = z
        .object({
          userName: z.string().trim().min(1).max(40),
          safePhrase: z.string().trim().min(4).max(120),
          fakeCaller: z.string().trim().min(1).max(40),
          appearance: z.string().trim().max(200),
        })
        .partial()
        .strict()
        .parse(body);
      const saved = engine.network.saveSettings(owner, d),
        current = engine.latest(owner);
      if (
        d.appearance !== undefined &&
        d.appearance !== (current.appearance ?? "") &&
        !terminal(current)
      )
        engine.setAppearance(current, d.appearance);
      return NextResponse.json(saved);
    }
    if (path.join("/") === "operator/login") {
      const { password } = z
        .object({ password: z.string().max(200) })
        .parse(body);
      if (
        process.env.OPERATOR_PASSWORD &&
        !secureEqual(password, process.env.OPERATOR_PASSWORD)
      )
        return NextResponse.json(
          { error: "Mật khẩu operator không đúng" },
          { status: 403 },
        );
      return NextResponse.json({ operatorToken: capability(owner) });
    }
    const operator = () => {
      const token = req.headers.get("x-operator-token") || "";
      if (!secureEqual(token, capability(owner))) throw new Error("FORBIDDEN");
    };
    if (path.join("/") === "pair") {
      operator();
      return NextResponse.json({ path: "/api/pair/" + pairToken(owner) });
    }
    if (path.join("/") === "ai/test") {
      operator();
      const limits = (globals.guardianAITests ??= new Map());
      if (Date.now() - (limits.get(owner) || 0) < 15000)
        throw new Error("Chờ 15 giây giữa các lần kiểm tra kết nối.");
      limits.set(owner, Date.now());
      const result = await engine.aiService.probe();
      return NextResponse.json({
        ok: true,
        provider: result.provider,
        model: result.model,
        latencyMs: result.latencyMs,
        reply: result.data.reply,
      });
    }
    if (path.join("/") === "incidents") {
      operator();
      const options = createSchema.parse(body),
        previous = engine.latest(owner);
      if (options.mode === "TEST_LIVE" && (!options.networkOnly || options.placesAdapter !== "GOOGLE" || options.routeAdapter !== "GOOGLE"))
        throw new Error("Live trials require network-only contacts and real map adapters; simulated routing is not allowed.");
      if (options.aiEnabled && !engine.aiService.configured())
        throw new Error("Chưa cấu hình AI. Chạy SETUP-AI.cmd trước.");
      if (!["CLOSED", "USER_CANCELLED"].includes(previous.status))
        engine.close(previous, true);
      return NextResponse.json(publicState(engine.create(owner, options)), {
        status: 201,
      });
    }
    if (path[0] !== "incidents" || !path[1])
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    const i = engine.get(path[1], owner),
      action = path.slice(2).join("/");
    if (
      ["CLOSED", "USER_CANCELLED"].includes(i.status) &&
      !["reset", "demo/run", "demo/showcase", "demo/narration", "transcript/delete"].includes(action)
    )
      throw new Error("Incident đã kết thúc; tạo kịch bản mới để tiếp tục.");
    if (action === "demo/showcase") {
      operator();
      const d = z.object({ useAI: z.boolean().default(false), pace: z.enum(["PRESENTATION", "BALANCED", "QUICK"]).default("BALANCED"), voiceEnabled: z.boolean().default(false) }).strict().parse(body);
      if (d.useAI && (!i.ai.enabled || !i.ai.consentAt)) throw new Error("Bật AI và đồng ý sử dụng cho phiên trước khi chạy demo có model thật.");
      if (!terminal(i)) engine.close(i, true);
      const next = engine.create(owner, { locale: i.locale, mode: "SIMULATION", simulatorOnly: true, demoCase: "SHOWCASE", placesAdapter: "CITY", routeAdapter: "CITY", aiEnabled: d.useAI,
        needs: { ...emptyNeeds(), communication: "DISCREET", canMove: true, maxWalkMeters: 2000, refusals: ["Không đi qua ngõ hoặc hẻm"] } });
      void runShowcase(engine, next, d);
      return NextResponse.json(publicState(next), { status: 202 });
    } else if (action === "demo/narration") {
      operator();
      const d = z.object({ narrationId: z.string().uuid(), playback: z.enum(["FINISHED", "UNAVAILABLE", "SKIPPED", "REPLAY"]) }).strict().parse(body);
      const applied = acknowledgeShowcase(i, d.narrationId, d.playback);
      if (applied) { i.updatedAt = new Date().toISOString(); engine.store.save(i); engine.bus.emit(i.id, i); engine.bus.emit("owner:" + i.owner, i); }
      return NextResponse.json({ ok: true, applied });
    } else if (action === "demo/pacing") {
      operator();
      const d = z.object({ pace: z.enum(["PRESENTATION", "BALANCED", "QUICK"]), voiceEnabled: z.boolean() }).strict().parse(body);
      if (i.showcase?.status !== "RUNNING") throw new Error("Không có demo đang chạy.");
      if (d.voiceEnabled && !i.showcase.voiceEnabled) i.showcase.playback = "PENDING";
      Object.assign(i.showcase, d);
      engine.event(i, "Coordinator", "SHOWCASE_PACING", `Nhịp trình diễn: ${d.pace === "PRESENTATION" ? "chậm" : d.pace === "BALANCED" ? "vừa" : "nhanh"}; lời dẫn ${d.voiceEnabled ? "bật" : "tắt"}.`, "SUCCEEDED", [], "SIMULATED");
    } else if (action === "demo/stop") {
      operator();
      if (!i.showcase || i.showcase.status !== "RUNNING") throw new Error("Không có demo đang chạy.");
      engine.close(i, true);
    } else if (action === "demo/run") {
      operator();
      const d = z.object({ demoCase: z.enum(demoCases), needs: needsSchema, text: z.string().trim().min(1).max(2000), participants: z.enum(["SIMULATED", "NETWORK"]).default("SIMULATED") }).strict().parse(body);
      const network = d.participants === "NETWORK";
      if (network && !engine.network.list(owner).some(m => m.role === "PARTNER" && m.joined && m.onDuty)) throw new Error("Chưa có đối tác sẵn sàng. Mở Mạng lưới, thêm đối tác, gửi link và đợi họ đồng ý tham gia/đang trực trước.");
      if (!terminal(i)) engine.close(i, true);
      const next = engine.create(owner, { mode: "SIMULATION", simulatorOnly: !network, networkOnly: network, demoCase: d.demoCase, needs: d.needs, placesAdapter: network ? "CITY" : "FIXTURE", routeAdapter: network ? "CITY" : "FIXTURE", aiEnabled: i.ai.enabled });
      void (async () => { await engine.sos(next, d.text); if (!terminal(next) && !network) await engine.startCalls(next, "MOCK"); })().catch(() => { if (!terminal(next)) engine.event(next, "Monitoring", "TASK_FAILED", "Luồng demo thất bại", "FAILED"); });
      return NextResponse.json(publicState(next), { status: 202 });
    } else if (action === "locale") {
      const { locale } = z.object({ locale: z.enum(["vi", "en"]) }).strict().parse(body);
      i.locale = locale;
      engine.store.save(i);
      engine.bus.emit("owner:" + i.owner, i);
    } else if (action === "needs") {
      await engine.setNeeds(i, needsSchema.parse(body));
    } else if (action === "world/time") {
      operator();
      const d = z.object({ time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) }).strict().parse(body);
      await engine.setScenarioClock(i, d.time);
    } else if (action === "handoff") {
      const d = z.object({ side: z.enum(["USER", "PARTNER"]), planId: z.string().max(80) }).strict().parse(body);
      if (d.side === "PARTNER") {
        operator();
        if (i.mode !== "SIMULATION" || !i.simulatorOnly) throw new Error("Chỉ xác nhận thay đối tác mô phỏng trong demo một máy");
      }
      engine.confirmHandoff(i, d.side, d.planId);
    } else if (action === "demo/update") {
      operator();
      if (i.mode !== "SIMULATION" || !i.simulatorOnly) throw new Error("Chỉ dùng trong demo một máy");
      const d = z.object({ callId: z.string().max(64), text: z.string().trim().min(1).max(1000), generation: z.number().int().min(0) }).strict().parse(body);
      const c = i.calls.find(c => c.id === d.callId && c.providerMode === "MOCK");
      if (!c) throw new Error("NOT_FOUND");
      await engine.partnerReply(i, c, d.text, "Đối tác mô phỏng", d.generation);
    } else if (action === "demo/family") {
      operator();
      if (i.mode !== "SIMULATION" || !i.simulatorOnly) throw new Error("Chỉ dùng trong demo một máy");
      const d = z.object({ action: z.enum(["KEEP_CONTACT", "ON_THE_WAY", "CANNOT_HELP"]), arrivalMinutes: z.number().int().min(0).max(1440).optional() }).strict().parse(body);
      let c = i.contacts.find(c => c.memberId === "demo-family");
      if (!c) { c = { memberId: "demo-family", name: "Người thân mô phỏng", status: "ANSWERED", alertedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; i.contacts.push(c); }
      c.status = d.action; c.arrivalMinutes = d.action === "ON_THE_WAY" ? d.arrivalMinutes : undefined; c.updatedAt = new Date().toISOString();
      engine.event(i, "Contact", "CONTACT_CAPABILITY_UPDATED", `Người thân mô phỏng: ${c.status}${c.arrivalMinutes !== undefined ? ` · tự báo ${c.arrivalMinutes} phút` : ""}`);
    } else if (action === "ai/enable") {
      const data = z
        .object({ enabled: z.boolean(), consent: z.boolean().default(false) })
        .strict()
        .parse(body);
      engine.setAI(i, data.enabled, data.consent);
    } else if (action === "ai/confirm") {
      const { accept } = z.object({ accept: z.boolean() }).strict().parse(body);
      await engine.confirmAIAction(i, accept);
    } else if (
      action === "message" ||
      (action === "voice-intent" && i.ai.enabled)
    ) {
      const data = z
        .object({
          text: z.string().trim().min(1).max(2000),
          source: z.enum(["TEXT", "MIC"]).default("TEXT"),
          explicit: z.boolean().optional(),
        })
        .strict()
        .parse(body);
      if (engine.checkEmergency(i, data.text, data.source, true))
        return NextResponse.json(publicState(i), { status: 202 });
      if (i.running || i.ai.busy) throw new Error("AI hoặc tác vụ đang xử lý.");
      if (!i.ai.enabled) throw new Error("Bật AI cho phiên để trò chuyện.");
      void engine.conversation(i, data.text, data.source).catch((e) => {
        if (!["CLOSED", "USER_CANCELLED"].includes(i.status))
          engine.event(
            i,
            "Monitoring",
            "AI_TASK_FAILED",
            e instanceof Error ? e.message : "AI thất bại",
            "FAILED",
          );
      });
    } else if (action === "sos" || action === "voice-intent") {
      const data = z
        .object({
          text: z.string().trim().min(1).max(2000),
          source: z.enum(["TEXT", "MIC"]).default("TEXT"),
          explicit: z.boolean().default(true),
        })
        .strict()
        .parse(body);
      if (engine.checkEmergency(i, data.text, data.source, true))
        return NextResponse.json(publicState(i), { status: 202 });
      if (
        i.running ||
        i.ai.busy ||
        ["CLOSED", "USER_CANCELLED"].includes(i.status) ||
        i.plans.some((p) => !p.superseded)
      )
        throw new Error("Incident đang xử lý hoặc đã kết thúc.");
      void engine
        .sos(i, data.text, data.source, action === "sos" ? true : data.explicit)
        .catch((e) => {
          i.running = false;
          engine.event(i, "Monitoring", "TASK_FAILED", String(e), "FAILED");
        });
    } else if (action === "calls/start") {
      operator();
      const data = z
        .object({
          provider: z.enum(["MOCK", "REAL_TEST"]).default("MOCK"),
          numbers: z.array(z.string().max(20)).max(3).default([]),
          consent: z.boolean().default(false),
        })
        .strict()
        .parse(body);
      // Validate asynchronously but await until adapters have launched, return job acknowledgement.
      const job = engine.startCalls(
        i,
        data.provider,
        data.numbers,
        data.consent,
      );
      let rejection: unknown;
      void job.catch((e) => {
        rejection = e;
      });
      await Promise.resolve();
      if (rejection) throw rejection;
      void job.catch((e) => {
        i.running = false;
        engine.event(i, "Monitoring", "TASK_FAILED", String(e), "FAILED");
      });
    } else if (action === "inject") {
      operator();
      const data = z
        .object({
          action: z.enum([
            "ROAD_BLOCKED",
            "ROAD_DARK",
            "STORE_DECLINES",
            "HOTEL_ACCEPTS",
            "GPS_STALE",
            "CONTACT_NO_ANSWER",
            "USER_REJECTS_ROUTE",
            "ESCALATE",
            "TRIP_STOPPED",
            "TRIP_DEVIATED",
          ]),
        })
        .strict()
        .parse(body);
      await engine.inject(i, data.action);
    } else if (action === "route/replan") {
      operator();
      await engine.replan(i, "LOCATION_UPDATED");
    } else if (action === "route/accept") {
      const { planId } = z.object({ planId: z.string().max(80) }).strict().parse(body);
      if (!i.plans.some(p => p.id === planId && !p.superseded)) throw new Error("Kế hoạch đã đổi; hãy xem và xác nhận lại");
      engine.acceptRoute(i);
    } else if (action === "realtime") {
      const { mode } = z
        .object({ mode: z.enum(["COMPANION", "FAKE_CALL"]).default("COMPANION") })
        .strict()
        .parse(body);
      if (!i.ai.enabled || !i.ai.consentAt)
        throw new Error("Bật AI và đồng ý gửi giọng nói tới OpenAI trước.");
      mintAllowed("owner:" + owner);
      const session = await mintRealtime(
        userInstructions(
          i,
          engine.network.settings(owner),
          mode,
          engine.network.list(owner),
        ),
        userTools,
        "marin",
        i.locale,
      );
      engine.event(
        i,
        "Voice",
        mode === "FAKE_CALL" ? "FAKE_CALL_STARTED" : "REALTIME_STARTED",
        mode === "FAKE_CALL"
          ? "Cuộc gọi giả từ người quen (AI đóng vai)."
          : "Phiên giọng nói realtime · " + session.model,
        "SUCCEEDED",
        [],
        "LIVE",
      );
      return NextResponse.json(session);
    } else if (action === "tool") {
      const d = z
        .object({ name: z.string().max(40), args: z.record(z.string(), z.unknown()).default({}) })
        .strict()
        .parse(body);
      return NextResponse.json({ output: await runTool(engine, i, d.name, d.args) });
    } else if (action === "transcript") {
      const d = z
        .object({ speaker: z.enum(["USER", "AI"]), text: z.string().trim().min(1).max(2000) })
        .strict()
        .parse(body);
      engine.appendTranscript(i, d.speaker, d.text);
    } else if (action === "trip") {
      const d = z
        .discriminatedUnion("action", [
          z.object({
            action: z.literal("start"),
            label: z.string().trim().min(1).max(60),
            lat: z.number().min(-90).max(90),
            lng: z.number().min(-180).max(180),
            minutes: z.number().int().min(1).max(240),
          }),
          z.object({ action: z.literal("checkin") }),
          z.object({ action: z.literal("arrived") }),
          z.object({ action: z.literal("stop") }),
        ])
        .parse(body);
      if (d.action === "start")
        engine.startTrip(i, { label: d.label, lat: d.lat, lng: d.lng }, d.minutes);
      else if (d.action === "checkin") engine.checkinOk(i);
      else engine.endTrip(i, d.action === "arrived");
    } else if (action === "signal") {
      const d = z
        .object({ memberId: z.string().max(20), signal: signalSchema })
        .strict()
        .parse(body);
      const target: Member | undefined = engine.network.byId(d.memberId);
      if (!target || target.owner !== owner || !i.contacts.some((c) => c.memberId === target.id))
        throw new Error("FORBIDDEN");
      sendSignal(engine, "signal:" + target.id, { from: "user", ...d.signal });
    } else if (action === "location") {
      const data = z
        .object({
          lat: z.number().min(-90).max(90),
          lng: z.number().min(-180).max(180),
          consent: z.literal(true),
          kind: z.enum(["MOCK", "LIVE"]).default("LIVE"),
        })
        .strict()
        .parse(body);
      if (["CLOSED", "USER_CANCELLED"].includes(i.status))
        throw new Error("Incident đã kết thúc");
      if (data.kind === "MOCK" && i.mode !== "SIMULATION")
        throw new Error("MOCK location requires SIMULATION");
      const previous = { lat: i.location.lat, lng: i.location.lng },
        wasStale = i.location.stale;
      i.location = {
        lat: data.lat,
        lng: data.lng,
        kind: data.kind,
        observedAt: new Date().toISOString(),
        stale: false,
      };
      engine.onLocation(i, previous);
      i.consent.location = true;
      engine.event(
        i,
        "Monitoring",
        "LOCATION_UPDATED",
        "Cập nhật vị trí " + data.kind,
        "SUCCEEDED",
        [],
        data.kind === "LIVE" ? "LIVE" : "SIMULATED",
      );
      // On the city map, moving along a plan is tracked by navigation; reroute only when stale/off route.
      if (i.routeAdapter !== "CITY" || wasStale)
        await engine.replan(i, "LOCATION_UPDATED");
    } else if (action === "place/decide") {
      operator();
      const d = z
        .object({ placeId: z.string().max(80), accept: z.boolean() })
        .strict()
        .parse(body);
      await engine.decidePlace(i, d.placeId, d.accept);
    } else if (action === "sim/move") {
      const d = z
        .object({
          action: z.enum(["step", "deviate", "to", "lost", "attack"]),
          lat: z.number().min(-90).max(90).optional(),
          lng: z.number().min(-180).max(180).optional(),
        })
        .strict()
        .parse(body);
      engine.simMove(
        i,
        d.action,
        d.lat !== undefined && d.lng !== undefined ? { lat: d.lat, lng: d.lng } : undefined,
      );
    } else if (action === "freeze") {
      operator();
      if (i.mode !== "SIMULATION")
        throw new Error("Freeze chỉ khả dụng trong SIMULATION");
      i.frozen = !i.frozen;
      engine.event(
        i,
        "Monitoring",
        "DEMO_FREEZE",
        i.frozen ? "Đã tạm dừng đồng hồ và mô phỏng." : "Đã tiếp tục mô phỏng.",
      );
    } else if (action === "close") {
      const { cancel } = z
        .object({ cancel: z.boolean().default(false) })
        .strict()
        .parse(body);
      if (!cancel && !i.plans.some((p) => !p.superseded))
        throw new Error(
          "Cần có điểm hỗ trợ đã xác nhận trước khi đánh dấu đến nơi.",
        );
      if (cancel) engine.close(i, true);
      else engine.confirmHandoff(i, "USER", i.plans.find(p => !p.superseded)!.id);
    } else if (action === "reset") {
      operator();
      if (!["CLOSED", "USER_CANCELLED"].includes(i.status))
        engine.close(i, true);
      return NextResponse.json(
        publicState(
          engine.create(owner, {
            zone: i.zone,
            scenario: i.scenario,
            mode: i.mode,
            placesAdapter: i.placesAdapter,
            routeAdapter: i.routeAdapter,
            aiEnabled: i.ai.enabled,
            demoCase: i.demoCase,
            needs: i.needs,
            simulatorOnly: i.simulatorOnly,
            networkOnly: i.networkOnly,
          }),
        ),
        { status: 201 },
      );
    } else if (action === "transcript/delete") {
      if (!["CLOSED", "USER_CANCELLED"].includes(i.status))
        throw new Error("Kết thúc incident trước khi xóa transcript");
      i.transcript = [];
      deleteRecordings(i);
      i.routeDecisions = [];
      i.plans.forEach(p => { p.reasons = ["Nội dung đã xóa theo yêu cầu"]; p.comparisons = []; p.evidenceRefs = []; p.supportSignature = undefined; p.routeDecisionId = undefined; });
      i.calls.forEach((c) => { c.transcript = []; c.support = undefined; c.checks = []; c.questions = []; });
      i.contacts.forEach(c => { c.transcript = []; c.response = undefined; });
      i.riskReasons = ["Transcript đã xóa theo yêu cầu"];
      i.ai.assessment = undefined;
      i.ai.lastReply = undefined;
      i.ai.pendingAction = undefined;
      i.events.forEach((e) => {
        if (
          [
            "TRANSCRIPT_RECEIVED",
            "RISK_ASSESSED",
            "CALL_TRANSCRIBED",
            "AI_REPLY",
            "FOLLOWUP_QUESTION",
            "SUPPORT_EXTRACTED",
            "SUPPORT_UPDATED",
            "NO_RESPONDERS",
          ].includes(e.type)
        )
          e.summary = "Nội dung đã xóa theo yêu cầu";
      });
      engine.store.db
        .prepare("DELETE FROM event_snapshots WHERE incident_id=?")
        .run(i.id);
      engine.store.deleteReportHistory(i.id);
      engine.event(
        i,
        "Monitoring",
        "TRANSCRIPTS_DELETED",
        "Đã xóa transcript và bản replay chứa nội dung.",
      );
    } else return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(publicState(i), { status: 202 });
  } catch (e) {
    return errorResponse(e);
  }
}
function errorResponse(e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  return NextResponse.json(
    { error: message },
    {
      status:
        message === "NOT_FOUND"
          ? 404
          : message === "FORBIDDEN"
            ? 403
            : e instanceof z.ZodError
              ? 400
              : 409,
    },
  );
}
