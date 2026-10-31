"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  FileText,
  MapPin,
  Mic,
  MicOff,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Square,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  Phone,
  EyeOff,
  ChevronRight,
  Copy,
  ExternalLink,
  X,
} from "lucide-react";
import type { PublicAccount, Incident, Pair } from "@/lib/types";
import { choose } from "@/lib/types";
import { errors, stages, states } from "@/lib/copy";
import { Header } from "./home";
import { useLanguage } from "./language";
import GuardianMap from "./guardian-map";
import { connectVoice, type Voice } from "./voice";
export default function Workspace({ demo = false }: { demo?: boolean }) {
  const { locale, t } = useLanguage();
  const [deletePending, setDeletePending] = useState(false);
  const [aiCode, setAiCode] = useState("");
  const [data, setData] = useState<PublicAccount | null>(null),
    [online, setOnline] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [tab, setTab] = useState<"journey" | "people" | "record">("journey"),
    [message, setMessage] = useState(""),
    [aiConsent, setAiConsent] = useState(false),
    [record, setRecord] = useState(false),
    [talking, setTalking] = useState(false),
    [muted, setMuted] = useState(false),
    [gps, setGps] = useState(false),
    [narrate, setNarrate] = useState(false),
    [proposal, setProposal] = useState("");
  const [name, setName] = useState(""),
    [role, setRole] = useState<"CONTACT" | "PARTNER">("CONTACT"),
    [invite, setInvite] = useState(""),
    [copied, setCopied] = useState(false),
    [minutes, setMinutes] = useState(20),
    [destination, setDestination] = useState("");
  const current = useRef(data),
    voice = useRef<Voice | null>(null),
    geo = useRef<number | null>(null),
    queue = useRef(Promise.resolve()),
    lastGps = useRef(0);
  current.current = data;
  const translate = (p: Pair) => choose(p, locale);
  const status = (s: string) => (states[s] ? translate(states[s]) : s);
  const apply = (next: PublicAccount) =>
    setData((old) => (!old || next.version >= old.version ? next : old));
  async function fetchJSON(url: string, body?: unknown) {
    const res = await fetch("/api/" + url, {
      cache: "no-store",
      ...(body
        ? {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-guardian-ai-code": aiCode,
            },
            body: JSON.stringify(body),
          }
        : {}),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "REQUEST_FAILED");
    return d;
  }
  async function action(action: string, fields: Record<string, unknown> = {}) {
    if (["new", "demo", "cancel", "stop"].includes(action)) {
      await voice.current?.close();
      await queue.current;
    }
    const d = await fetchJSON("action", {
      action,
      incidentId: current.current?.incident.id,
      ...fields,
    });
    if (d.incident) apply(d);
    return d.result;
  }
  async function run(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "REQUEST_FAILED");
    } finally {
      setBusy(false);
    }
  }
  function stopGps() {
    if (geo.current !== null) navigator.geolocation.clearWatch(geo.current);
    geo.current = null;
    setGps(false);
  }
  function stopVoice() {
    voice.current?.close();
    voice.current = null;
    setTalking(false);
  }
  useEffect(() => {
    let alive = true,
      handle: ReturnType<typeof setTimeout>;
    const load = async (first = false) => {
      try {
        const d = await fetchJSON(first ? "session" : "state");
        if (alive) {
          apply(d);
          setOnline(true);
        }
      } catch {
        if (alive) setOnline(false);
      }
      if (alive) handle = setTimeout(() => void load(), 1500);
    };
    void load(true);
    return () => {
      alive = false;
      clearTimeout(handle);
      stopVoice();
      if (geo.current !== null) navigator.geolocation.clearWatch(geo.current);
      speechSynthesis?.cancel();
    };
  }, []);
  useEffect(() => {
    stopGps();
    stopVoice();
    setProposal("");
  }, [data?.incident.id]);
  useEffect(() => {
    if (data && data.incident.locale !== locale)
      void action("locale", { locale }).catch(() => {});
  }, [locale, data?.incident.id]);
  useEffect(() => {
    if (data && ["COMPLETE", "CANCELLED"].includes(data.incident.status)) {
      stopGps();
      stopVoice();
    }
  }, [data?.incident.status]);
  useEffect(() => {
    const i = data?.incident;
    if (i)
      voice.current?.update(
        JSON.stringify({
          status: i.status,
          replies: i.replies.map((r) => ({
            name: r.name,
            state: r.state,
            minutes: r.minutes,
            quote: r.quote,
          })),
          plan: i.plans.findLast((p) => !p.invalidatedAt),
        }),
      );
  }, [data?.incident.events.length]);
  useEffect(() => {
    if (
      !narrate ||
      !data?.incident.demo ||
      data.incident.demo.paused ||
      !window.speechSynthesis
    )
      return;
    const i = data.incident,
      step = i.demo!.step;
    const text =
      translate(stages[Math.max(0, step)]) +
      ". " +
      (i.events.at(-1) ? translate(i.events.at(-1)!.message) : "");
    const u = new SpeechSynthesisUtterance(text);
    u.lang = locale === "vi" ? "vi-VN" : "en-US";
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    return () => speechSynthesis.cancel();
  }, [data?.incident.demo?.step, data?.incident.demo?.paused, narrate, locale]);
  function startGps() {
    if (gps) {
      stopGps();
      return;
    }
    if (!navigator.geolocation || !window.isSecureContext) {
      setError("LOCATION_REQUIRES_HTTPS");
      return;
    }
    const id = data!.incident.id;
    geo.current = navigator.geolocation.watchPosition(
      (p) => {
        if (
          current.current?.incident.id !== id ||
          Date.now() - lastGps.current < 5000
        )
          return;
        lastGps.current = Date.now();
        void action("location", {
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          consent: true,
        })
          .then(() => setGps(true))
          .catch((e) => {
            setError(e.message);
            stopGps();
          });
      },
      () => {
        setError("GPS_PERMISSION_REQUIRED");
        stopGps();
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );
  }
  async function startVoice() {
    if (talking) {
      stopVoice();
      return;
    }
    if (!aiConsent) throw new Error("AI_CONSENT_REQUIRED");
    if (!data!.incident.ai.enabled)
      await action("ai", { enabled: true, consent: true });
    if (record) await action("recording-consent", { consent: true });
    const id = data!.incident.id,
      audioId = crypto.randomUUID();
    voice.current = await connectVoice(
      () => action("voice", { consent: true }),
      {
        transcript: (who, text, transcriptId) => {
          queue.current = queue.current
            .then(() =>
              action("transcript", {
                who,
                text,
                id: transcriptId,
                incidentId: id,
              }),
            )
            .catch((e) => setError(e.message));
        },
        tool: async (name, args) => {
          if (name === "request_help") {
            setProposal(String(args.summary || ""));
            return { confirmationRequired: true };
          }
          return {
            status: current.current?.incident.status,
            replies: current.current?.incident.replies,
          };
        },
        error: setError,
        ended: () => setTalking(false),
        ...(record
          ? {
              record: (blob: Blob, seq: number) => {
                queue.current = queue.current
                  .then(async () => {
                    const r = await fetch(
                      `/api/audio/${id}?id=${audioId}&seq=${seq}`,
                      {
                        method: "POST",
                        headers: { "Content-Type": blob.type || "audio/webm" },
                        body: blob,
                      },
                    );
                    if (!r.ok) throw new Error("RECORDING_UPLOAD_FAILED");
                  })
                  .catch((e) => setError(e.message));
              },
            }
          : {}),
      },
    );
    setTalking(true);
    setMuted(false);
  }
  async function addPerson() {
    const result = await fetchJSON("members", { name, role });
    setInvite(`${location.origin}/join/${result.token}?lang=${locale}`);
    setName("");
    setCopied(false);
    apply(await fetchJSON("state"));
  }
  if (!data)
    return (
      <main className="loading">
        <ShieldCheck size={42} />
        <h1>Guardian AI</h1>
        <p role="status">
          {online
            ? t("Đang chuẩn bị phiên riêng…", "Preparing your private session…")
            : t(
                "Đang kết nối. Nếu mạng gián đoạn, trang sẽ tự thử lại.",
                "Connecting. The page will retry if the connection is interrupted.",
              )}
        </p>
      </main>
    );
  const i = data.incident,
    plan = i.plans.findLast((p) => !p.invalidatedAt),
    running = i.demo?.status === "RUNNING",
    ended = ["COMPLETE", "CANCELLED"].includes(i.status),
    live = i.mode === "LIVE",
    joined = data.members.filter(
      (m) => m.joined && m.role === "CONTACT",
    ).length;
  if (i.covert)
    return (
      <main className="covert">
        <div className="covert-avatar">L</div>
        <h1>Linh</h1>
        <p>
          {talking
            ? t("Đang kết nối âm thanh", "Audio connected")
            : t(
                "Cuộc gọi giả · không gọi số thật",
                "Decoy call · no real number called",
              )}
        </p>
        <button
          className="round-call"
          aria-label={t("Trở về", "Back")}
          onClick={() => void run(() => action("covert", { enabled: false }))}
        >
          <Phone size={27} />
        </button>
      </main>
    );
  return (
    <main className={`workspace ${demo ? "demo-workspace" : "walk-workspace"}`}>
      <Header />
      <div className="workspace-source">
        <span className="source">
          {live
            ? t("THỬ TRÊN THIẾT BỊ", "DEVICE TRIAL")
            : t("MÔ PHỎNG", "SIMULATION")}
        </span>
        <p>
          {live
            ? t(
                "Chỉ người đã tham gia nhận yêu cầu · giữ trang mở",
                "Only joined people receive requests · keep pages open",
              )
            : t(
                "Vai và địa điểm minh họa · mọi quyết định qua engine",
                "Illustrative people and places · decisions run through the engine",
              )}
        </p>
        <span className="connection" role="status">
          {online ? <Wifi size={15} /> : <WifiOff size={15} />}{" "}
          {online
            ? t("Đã nối", "Connected")
            : t("Đang nối lại", "Reconnecting")}
        </span>
      </div>
      {error && (
        <div className="error-box" role="alert">
          <p>
            {errors[error]
              ? translate(errors[error])
              : t(
                  "Thao tác chưa hoàn tất. Kiểm tra quyền truy cập hoặc kết nối rồi thử lại.",
                  "The action did not finish. Check permissions or connection and retry.",
                )}
            <small>{error}</small>
          </p>
          <button
            className="icon-button"
            aria-label={t("Đóng lỗi", "Dismiss error")}
            onClick={() => setError("")}
          >
            <X size={18} />
          </button>
        </div>
      )}
      {demo && (
        <section className="director">
          <div>
            <h1>
              {i.demo
                ? translate(stages[Math.max(0, i.demo.step)])
                : t(
                    "Một lời cầu cứu. Cùng tìm cách giúp.",
                    "One request. A coordinated response.",
                  )}
            </h1>
            <p role="status">
              {i.demo
                ? t(
                    `${i.replies.length} người nhận · ${i.plans.length} phương án · ${i.seals.length} lần niêm phong`,
                    `${i.replies.length} recipients · ${i.plans.length} plans · ${i.seals.length} seals`,
                  )
                : t(
                    "Hai phút theo dõi lời đồng ý, thay đổi phương án và hồ sơ cuối cùng.",
                    "Two minutes following commitments, changing plans and the final record.",
                  )}
            </p>
          </div>
          <div className="actions">
            <button
              className="primary"
              disabled={busy || running || !online}
              onClick={() =>
                void run(() =>
                  action("demo", {
                    locale,
                    ai: i.ai.enabled,
                    consent: aiConsent,
                  }),
                )
              }
            >
              {i.demo ? <RotateCcw size={17} /> : <Play size={17} />}{" "}
              {i.demo ? t("Chạy lại", "Run again") : t("Chạy demo", "Run demo")}
            </button>
            {running && (
              <>
                <button
                  disabled={busy}
                  onClick={() => void run(() => action("pause"))}
                >
                  {i.demo?.paused ? <Play size={17} /> : <Pause size={17} />}{" "}
                  {i.demo?.paused
                    ? t("Tiếp tục", "Resume")
                    : t("Tạm dừng", "Pause")}
                </button>
                <button
                  className="icon-button"
                  disabled={busy || i.demo?.paused}
                  aria-label={t("Bước tiếp", "Next step")}
                  onClick={() => void run(() => action("next"))}
                >
                  <ChevronRight size={20} />
                </button>
                <button
                  className="icon-button"
                  disabled={busy}
                  aria-label={t("Dừng demo", "Stop demo")}
                  onClick={() => void run(() => action("stop"))}
                >
                  <Square size={17} />
                </button>
              </>
            )}
            <button
              className="icon-button"
              aria-pressed={narrate}
              aria-label={t("Bật lời dẫn", "Toggle narration")}
              onClick={() => setNarrate(!narrate)}
            >
              {narrate ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
          </div>
          {i.demo && (
            <ol
              className="stage-track"
              aria-label={t("Tiến trình demo", "Demo progress")}
            >
              {stages.map((p, n) => (
                <li
                  key={n}
                  className={
                    n === i.demo?.step
                      ? "current"
                      : n < i.demo!.step
                        ? "done"
                        : ""
                  }
                  aria-current={n === i.demo?.step ? "step" : undefined}
                >
                  <span>{n + 1}</span>
                  <b>{translate(p)}</b>
                </li>
              ))}
            </ol>
          )}
          {i.demo?.status === "FAILED" && (
            <p role="alert">
              {t(
                "Demo dừng vì không đạt điều kiện: ",
                "Demo stopped after a failed check: ",
              )}
              {i.demo.error}
            </p>
          )}
        </section>
      )}
      <nav className="workspace-tabs" aria-label={t("Chức năng", "Workspace")}>
        <button
          aria-pressed={tab === "journey"}
          onClick={() => setTab("journey")}
        >
          <MapPin size={17} />
          {t("Đồng hành", "Companion")}
        </button>
        <button
          aria-pressed={tab === "people"}
          onClick={() => setTab("people")}
        >
          <Users size={17} />
          {t("Người hỗ trợ", "Your people")}
        </button>
        <button
          aria-pressed={tab === "record"}
          onClick={() => setTab("record")}
        >
          <FileText size={17} />
          {t("Hồ sơ", "Record")}
        </button>
      </nav>
      {tab === "journey" && (
        <div className="journey-grid">
          <section className="companion">
            <div className="companion-title">
              <h2>{t("Mình ở đây cùng bạn.", "I’m here with you.")}</h2>
              <p role="status">{status(i.status)}</p>
            </div>
            {i.status === "SIGNAL_LOST" && (
              <p className="night-warning">
                {t(
                  "Chưa có vị trí mới. Chỉ lưu vị trí được báo lần cuối.",
                  "No fresh location. Only the last reported position is retained.",
                )}
              </p>
            )}
            {i.risk === 4 && (
              <div className="emergency">
                <b>{t("Cần hỗ trợ khẩn cấp?", "Need urgent help?")}</b>
                <p>
                  {t(
                    "Tại Việt Nam · bạn tự bấm gọi",
                    "In Vietnam · you choose to call",
                  )}
                </p>
                <div className="actions">
                  <a className="button danger" href="tel:113">
                    <Phone size={17} />
                    113
                  </a>
                  <a className="button danger" href="tel:115">
                    <Phone size={17} />
                    115
                  </a>
                </div>
              </div>
            )}
            {!ended && !running && (
              <>
                <label htmlFor="request">
                  {t("Bạn đang cần gì?", "What do you need?")}
                </label>
                <textarea
                  id="request"
                  value={message}
                  maxLength={2000}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t(
                    "Ví dụ: Có người theo tôi. Tôi không muốn đi qua hẻm.",
                    "For example: Someone is following me. I want to avoid alleys.",
                  )}
                />
                <button
                  className="sos"
                  disabled={busy || !online || !!i.sosAt || (live && !gps)}
                  onClick={() =>
                    void run(() =>
                      action("sos", {
                        text:
                          message.trim() ||
                          t(
                            "Tôi thấy không an toàn. Tôi cần hỗ trợ.",
                            "I feel unsafe. I need help.",
                          ),
                      }),
                    )
                  }
                >
                  {t("SOS · Tôi cần hỗ trợ", "SOS · I need help")}
                </button>
                <p className="subtle">
                  {live
                    ? t(
                        "Yêu cầu được báo trong app. Không tự gọi điện hay gửi SMS.",
                        "Requests appear in the app. No automatic phone calls or SMS.",
                      )
                    : t(
                        "Đây là phiên mô phỏng. Dùng Chạy demo để xem toàn bộ luồng.",
                        "This is a simulation. Use Run demo to see the complete flow.",
                      )}
                </p>
              </>
            )}
            {proposal && (
              <div className="night-warning">
                <p>
                  {t(
                    "AI đề nghị kích hoạt SOS. Bạn có muốn gửi yêu cầu?",
                    "AI suggests an SOS. Would you like to send a request?",
                  )}
                </p>
                <button
                  disabled={busy || !!i.sosAt}
                  onClick={() =>
                    void run(async () => {
                      await action("sos", { text: proposal });
                      setProposal("");
                    })
                  }
                >
                  {t("Xác nhận gửi SOS", "Confirm SOS")}
                </button>
                <button onClick={() => setProposal("")}>
                  {t("Bỏ qua", "Dismiss")}
                </button>
              </div>
            )}
            <div className="next-action">
              {plan ? (
                <>
                  <div className="verified">
                    <Check size={19} />
                    {t("CÓ LỜI ĐỒNG Ý", "CONFIRMED OFFER")}
                  </div>
                  <h3>{plan.destination}</h3>
                  <p>
                    {plan.route.meters} m · v{plan.revision} ·{" "}
                    {plan.route.source === "SIMULATED"
                      ? t("mô phỏng", "simulated")
                      : t("bản đồ thật", "live map")}
                  </p>
                  <p>{translate(plan.route.note)}</p>
                  {!plan.acceptedAt ? (
                    <button
                      className="primary"
                      disabled={busy || running || !online}
                      onClick={() =>
                        void run(() => action("accept", { planId: plan.id }))
                      }
                    >
                      {t("Chấp nhận phương án", "Accept this plan")}
                      <ArrowRight size={17} />
                    </button>
                  ) : (
                    <>
                      <p className="accepted">
                        <Check size={17} />
                        {t("Bạn đã chấp nhận", "You accepted this plan")}
                      </p>
                      <button
                        disabled={busy || running || ended}
                        onClick={() =>
                          void run(() => action("handoff", { planId: plan.id }))
                        }
                      >
                        {t("Tôi đã gặp người giúp", "I have met my helper")}
                      </button>
                      {plan.userArrived && i.status !== "COMPLETE" && (
                        <p>
                          {t(
                            "Đang chờ người nhận giúp xác nhận.",
                            "Waiting for the helper to confirm.",
                          )}
                        </p>
                      )}
                      <button
                        disabled={busy || running || ended}
                        onClick={() => void run(() => action("block"))}
                      >
                        {t(
                          "Đường này không phù hợp",
                          "This road is unsuitable",
                        )}
                      </button>
                    </>
                  )}
                </>
              ) : (
                <>
                  <h3>{t("Bước tiếp theo", "Your next step")}</h3>
                  <p>
                    {i.sosAt
                      ? t(
                          "Chưa có tuyến tiếp nhận hợp lệ. Xem người nào đã trả lời; đừng coi lời hứa chưa rõ là đã nhận giúp.",
                          "No valid confirmed route yet. Check who has replied; an unclear promise is not confirmation.",
                        )
                      : t(
                          "Mời người thân và đợi họ tham gia trước khi đi.",
                          "Invite a trusted person and wait for them to join before walking.",
                        )}
                  </p>
                  <button onClick={() => setTab("people")}>
                    <Users size={17} />
                    {t("Xem người hỗ trợ", "See your people")}
                  </button>
                </>
              )}
            </div>
            {i.trip?.state === "CHECKING" && (
              <div className="check-in" role="alert">
                <h3>{t("Bạn vẫn ổn chứ?", "Are you OK?")}</h3>
                <p>
                  {t(
                    "Không phản hồi trong 30 giây sẽ gửi SOS và mở hồ sơ cho người thân.",
                    "No response within 30 seconds triggers SOS and shares the record with contacts.",
                  )}
                </p>
                <button
                  className="primary"
                  onClick={() => void run(() => action("checkin"))}
                >
                  {t("Tôi vẫn ổn", "I’m OK")}
                </button>
              </div>
            )}
            <details>
              <summary>
                {t("Nói chuyện với AI thật", "Talk with live AI")}
              </summary>
              <p>
                {t(
                  "Nội dung gửi tới OpenAI khi bật. Bạn luôn tự quyết định SOS và cuộc gọi khẩn cấp.",
                  "Content is sent to OpenAI when enabled. You decide on SOS and emergency calls.",
                )}
              </p>
              <label className="check">
                <input
                  type="checkbox"
                  checked={aiConsent}
                  onChange={(e) => setAiConsent(e.target.checked)}
                />
                {t(
                  "Đồng ý gửi nội dung tới OpenAI",
                  "I consent to sending content to OpenAI",
                )}
              </label>
              {data.config.aiAccessRequired && (
                <label>
                  {t("Mã truy cập AI", "AI access code")}
                  <input
                    type="password"
                    autoComplete="off"
                    value={aiCode}
                    onChange={(e) => setAiCode(e.target.value)}
                    placeholder={t(
                      "Người tổ chức demo cung cấp",
                      "Provided by your demo host",
                    )}
                  />
                </label>
              )}
              <label className="check">
                <input
                  type="checkbox"
                  checked={record}
                  disabled={talking}
                  onChange={(e) => setRecord(e.target.checked)}
                />
                {t(
                  "Ghi âm cuộc hội thoại vào hồ sơ",
                  "Record this voice conversation in the record",
                )}
              </label>
              <div className="actions">
                <button
                  disabled={
                    busy || ended || !data.config.ai || (!aiConsent && !talking)
                  }
                  onClick={() => void run(startVoice)}
                >
                  <Mic size={17} />
                  {talking
                    ? t("Kết thúc thoại", "End voice")
                    : t("Bắt đầu thoại", "Start voice")}
                </button>
                {talking && (
                  <button
                    aria-pressed={muted}
                    onClick={() => setMuted(voice.current?.mute() || false)}
                  >
                    {muted ? <MicOff size={17} /> : <Mic size={17} />}
                  </button>
                )}
                <button
                  disabled={busy || !data.config.ai || !aiConsent || ended}
                  onClick={() =>
                    void run(() =>
                      action("ai", { enabled: !i.ai.enabled, consent: true }),
                    )
                  }
                >
                  {i.ai.enabled
                    ? t("Tắt AI", "Disable AI")
                    : t("Bật AI", "Enable AI")}
                </button>
                {i.ai.enabled && (
                  <button
                    disabled={busy || !message.trim() || ended}
                    onClick={() =>
                      void run(async () => {
                        const result = await action("chat", { text: message });
                        if (result.intent === "SOS") setProposal(message);
                      })
                    }
                  >
                    {t("Gửi cho AI", "Send to AI")}
                  </button>
                )}
              </div>
              <p role="status">
                {talking
                  ? record
                    ? t(
                        "Micro bật · đang gửi ghi âm",
                        "Microphone on · recording uploads active",
                      )
                    : t(
                        "Micro bật · không ghi âm",
                        "Microphone on · not recording",
                      )
                  : data.config.ai
                    ? t(
                        "API đã cấu hình · bật khi bạn chọn",
                        "API configured · enabled only when you choose",
                      )
                    : t(
                        "Chưa có API. Demo vẫn hoạt động.",
                        "API not configured. Demo still works.",
                      )}
              </p>
            </details>
            <details>
              <summary>{t("Nhu cầu của tôi", "My preferences")}</summary>
              <label>
                {t("Tối đa bao nhiêu mét?", "Maximum walking distance (m)")}
                <input
                  type="number"
                  min={20}
                  max={5000}
                  key={`${i.id}-${i.needs.maxWalk}`}
                  defaultValue={i.needs.maxWalk}
                  onBlur={(e) =>
                    void run(() =>
                      action("needs", {
                        ...i.needs,
                        maxWalk: Number(e.target.value),
                      }),
                    )
                  }
                />
              </label>
              {(["avoidAlleys", "discreet", "canMove"] as const).map((key) => (
                <label className="check" key={key}>
                  <input
                    type="checkbox"
                    checked={i.needs[key]}
                    onChange={(e) =>
                      void run(() =>
                        action("needs", {
                          ...i.needs,
                          [key]: e.target.checked,
                        }),
                      )
                    }
                  />
                  {key === "avoidAlleys"
                    ? t("Không đi qua hẻm", "Avoid alleys")
                    : key === "discreet"
                      ? t("Cần hỗ trợ kín đáo", "Need discreet help")
                      : t("Tôi có thể đi bộ", "I can walk")}
                </label>
              ))}
            </details>
            {!ended && (
              <div className="actions secondary-actions">
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(() => action("covert", { enabled: true }))
                  }
                >
                  <EyeOff size={16} />
                  {t("Màn hình kín đáo", "Discreet screen")}
                </button>
                <button
                  disabled={busy}
                  onClick={() => void run(() => action("cancel"))}
                >
                  {t("Kết thúc phiên", "End session")}
                </button>
              </div>
            )}
          </section>
          <section className="map-area">
            <GuardianMap incident={i} />
            <div className="map-under">
              <span>
                <ShieldCheck size={15} />
                {t(
                  "Chưa xác nhận an toàn thực địa",
                  "Real-world safety is not verified",
                )}
              </span>
              <span>
                {i.location
                  ? new Date(i.location.at).toLocaleTimeString(locale)
                  : t("Chưa có GPS", "No GPS yet")}
              </span>
            </div>
          </section>
          <aside className="coordination">
            <h2>{t("Ai đang giúp?", "Who is helping?")}</h2>
            {!i.replies.length && (
              <div className="empty">
                <Users size={28} />
                <p>
                  {t(
                    "Chưa có lời xác nhận. Mời người thân hoặc chạy demo để bắt đầu.",
                    "No confirmations yet. Invite contacts or run the demo to begin.",
                  )}
                </p>
              </div>
            )}
            {i.replies.map((r) => (
              <article
                className={`commitment ${r.state === "REVOKED" ? "revoked" : ""}`}
                key={r.id}
              >
                <div>
                  <b>{r.name}</b>
                  {r.state === "ACCEPTED" && <Check size={17} />}
                </div>
                <span className="commitment-state">{status(r.state)}</span>
                {r.minutes !== null && (
                  <small>
                    {t("Tự báo: ", "Self-reported: ")}
                    {r.minutes} {t("phút", "min")}
                  </small>
                )}
                {r.quote && <q>{r.quote}</q>}
              </article>
            ))}
            <p className="subtle">
              {t(
                "Trích dẫn luôn giữ nguyên ngôn ngữ gốc.",
                "Quotes always keep their original language.",
              )}
            </p>
            {i.demo?.status === "DONE" && (
              <button className="primary" onClick={() => setTab("record")}>
                <FileText size={17} />
                {t("Mở hồ sơ vừa tạo", "Open the completed record")}
              </button>
            )}
            <details>
              <summary>{t("Diễn biến mới nhất", "Latest events")}</summary>
              {i.events
                .slice(-5)
                .reverse()
                .map((e) => (
                  <p key={e.id}>
                    <time>{new Date(e.at).toLocaleTimeString(locale)}</time>
                    <br />
                    {translate(e.message)}
                  </p>
                ))}
            </details>
          </aside>
        </div>
      )}
      {tab === "people" && (
        <section className="setup">
          <h1>
            {t(
              "Có người biết bạn đang đi đâu.",
              "Someone knows where you are.",
            )}
          </h1>
          <p className="lead">
            {t(
              "Tạo link mời riêng, gửi cho người bạn tin tưởng và chờ họ bấm tham gia. Link là quyền truy cập; chỉ chia sẻ với đúng người.",
              "Create a private invitation, share it with someone you trust and wait for them to join. The link grants access; share it only with the intended person.",
            )}
          </p>
          <div className="setup-grid">
            <div>
              <h2>{t("Mời người hỗ trợ", "Invite your people")}</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(addPerson);
                }}
              >
                <label>
                  {t("Tên hiển thị", "Display name")}
                  <input
                    required
                    maxLength={60}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label>
                  {t("Vai trò", "Role")}
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as typeof role)}
                  >
                    <option value="CONTACT">
                      {t("Người thân / bạn bè", "Trusted contact")}
                    </option>
                    <option value="PARTNER">
                      {t("Điểm hỗ trợ thử nghiệm", "Trial support venue")}
                    </option>
                  </select>
                </label>
                <button className="primary" disabled={busy || !name.trim()}>
                  {t("Tạo link mời", "Create invitation")}
                  <ArrowRight size={17} />
                </button>
              </form>
              {invite && (
                <div className="invite">
                  <label>
                    {t(
                      "Link này chỉ hiện khi tạo",
                      "This link is shown only when created",
                    )}
                    <input readOnly value={invite} />
                  </label>
                  <div className="actions">
                    <button
                      onClick={() =>
                        void run(async () => {
                          await navigator.clipboard.writeText(invite);
                          setCopied(true);
                        })
                      }
                    >
                      <Copy size={16} />
                      {copied
                        ? t("Đã chép", "Copied")
                        : t("Sao chép", "Copy link")}
                    </button>
                    <a
                      className="button"
                      href={invite}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink size={16} />
                      {t("Mở thử", "Open test")}
                    </a>
                  </div>
                </div>
              )}
              <div className="member-list">
                {data.members.map((m) => (
                  <article key={m.id}>
                    <div>
                      <b>{m.name}</b>
                      <small>
                        {m.role === "CONTACT"
                          ? t("Người thân", "Contact")
                          : t("Điểm hỗ trợ", "Venue")}
                      </small>
                    </div>
                    <span>
                      {m.joined
                        ? t("Đã tham gia", "Joined")
                        : t("Chờ đồng ý", "Awaiting consent")}
                      {m.role === "PARTNER" && m.joined
                        ? m.onDuty
                          ? t(" · đang trực", " · on duty")
                          : t(" · ngừng trực", " · off duty")
                        : ""}
                    </span>
                  </article>
                ))}
              </div>
            </div>
            <div>
              <h2>
                {t("Chuẩn bị phiên trên thiết bị", "Prepare a device trial")}
              </h2>
              <ul className="readiness">
                <li>
                  <Users size={18} />
                  {joined} {t("người thân đã tham gia", "contacts joined")}
                </li>
                <li>
                  <MapPin size={18} />
                  {gps
                    ? t("Đang chia sẻ GPS", "GPS sharing on")
                    : t("Chưa chia sẻ GPS", "GPS sharing off")}
                </li>
                <li>
                  <ShieldCheck size={18} />
                  {data.config.maps
                    ? t(
                        "Đã cấu hình tuyến bản đồ thật",
                        "Live routes configured",
                      )
                    : t(
                        "Chưa có tuyến thật · không tạo tuyến giả",
                        "No live routing · no fake routes substituted",
                      )}
                </li>
              </ul>
              <p>
                {t(
                  "Giữ trang mở ở cả hai thiết bị. Vị trí chỉ được chia sẻ sau khi bạn cho phép. Trang web chưa thể báo như cuộc gọi khi khóa màn hình.",
                  "Keep both devices’ pages open. Location is shared only with your permission. The website cannot ring like a phone call when the screen is locked.",
                )}
              </p>
              <div className="actions">
                {!live || ended ? (
                  <button
                    className="primary"
                    disabled={busy || running}
                    onClick={() =>
                      void run(() => action("new", { mode: "LIVE", locale }))
                    }
                  >
                    {t("Tạo phiên thử trên thiết bị", "Create device trial")}
                  </button>
                ) : (
                  <button className="primary" onClick={startGps}>
                    <MapPin size={17} />
                    {gps
                      ? t("Dừng GPS", "Stop GPS")
                      : t("Cho phép và chia sẻ GPS", "Allow and share GPS")}
                  </button>
                )}
                <button
                  disabled={busy || running}
                  onClick={() =>
                    void run(() => action("new", { mode: "DEMO", locale }))
                  }
                >
                  {t("Phiên mô phỏng mới", "New simulation")}
                </button>
              </div>
              <small>
                {t(
                  "Tạo phiên mới kết thúc phiên hiện tại; lời mời được giữ.",
                  "A new session ends the current one; invitations are retained.",
                )}
              </small>
              {live && !ended && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(() =>
                      action("trip", { label: destination, minutes }),
                    );
                  }}
                >
                  <h2>
                    {t("Hẹn giờ về tới nơi", "Schedule an arrival check-in")}
                  </h2>
                  <label>
                    {t("Bạn đi đâu?", "Where are you going?")}
                    <input
                      required
                      maxLength={80}
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                    />
                  </label>
                  <label>
                    {t("Dự kiến bao nhiêu phút?", "Expected minutes")}
                    <input
                      type="number"
                      min={1}
                      max={240}
                      value={minutes}
                      onChange={(e) => setMinutes(Number(e.target.value))}
                    />
                  </label>
                  <button
                    disabled={
                      busy ||
                      !gps ||
                      !joined ||
                      !!i.sosAt ||
                      i.trip?.state === "ACTIVE"
                    }
                  >
                    {t("Bắt đầu hẹn giờ", "Start check-in timer")}
                  </button>
                  {i.trip && (
                    <>
                      <p>
                        {t("Hẹn lúc ", "Due at ")}
                        {new Date(i.trip.dueAt).toLocaleTimeString(locale)}
                      </p>
                      <div className="actions">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void run(() => action("arrived"))}
                        >
                          {t("Tôi đã tới nơi", "I have arrived")}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void run(() => action("trip-stop"))}
                        >
                          {t("Dừng hẹn giờ", "Stop timer")}
                        </button>
                      </div>
                    </>
                  )}
                </form>
              )}
            </div>
          </div>
        </section>
      )}
      {tab === "record" && (
        <section className="record-view">
          <div className="record-title">
            <div>
              <h1>{t("Hồ sơ của phiên này", "This session’s record")}</h1>
              <p>
                {status(i.status)} · {i.id.slice(0, 8)}
              </p>
            </div>
            <a
              className="button primary"
              target="_blank"
              rel="noreferrer"
              href={`/api/record/${i.id}?lang=${locale}`}
            >
              <FileText size={17} />
              {t("Mở / In hồ sơ", "Open / Print record")}
            </a>
          </div>
          <p className="lead">
            {t(
              "Lịch sử được ghi từ engine. Chuỗi băm giúp kiểm tra toàn vẹn, không chứng minh một lời khai là sự thật.",
              "History recorded by the engine. Hash chaining helps verify integrity, not whether a statement is true.",
            )}
          </p>
          <div className="record-numbers">
            <span>
              <b>{i.plans.length}</b>
              {t("phương án", "plans")}
            </span>
            <span>
              <b>{i.seals.length}</b>
              {t("niêm phong", "seals")}
            </span>
            <span>
              <b>{i.recordings.length}</b>
              {t("phiên ghi âm", "recordings")}
            </span>
          </div>
          <h2>{t("Lịch sử phương án", "Plan history")}</h2>
          {i.plans.map((p) => (
            <article className="plan-history" key={p.id}>
              <b>
                v{p.revision} · {p.destination}
              </b>
              <span>
                {p.invalidatedAt
                  ? t("Đã hủy hiệu lực", "Invalidated")
                  : p.acceptedAt
                    ? t("Đã chấp nhận", "Accepted")
                    : t("Chờ chấp nhận", "Awaiting acceptance")}
              </span>
              <p>
                {translate(p.reason)} · {p.route.meters} m
              </p>
            </article>
          ))}
          <h2>{t("Hội thoại gốc", "Original conversation")}</h2>
          {!i.transcript.length && (
            <p>
              {t(
                "Chưa có nội dung hội thoại.",
                "No conversation recorded yet.",
              )}
            </p>
          )}
          {i.transcript.map((x) => (
            <blockquote key={x.id}>
              <b>{x.who}</b>
              <p>{x.text}</p>
            </blockquote>
          ))}
          {i.recordings.map((r) => (
            <article key={r.id}>
              <audio controls src={`/api/audio/${i.id}/${r.id}`} />
              <small>
                {r.bytes} bytes · SHA-256 {r.hash}
              </small>
            </article>
          ))}
          <details>
            <summary>
              {t("Diễn biến và nguồn dữ liệu", "Events and data sources")}
            </summary>
            {i.events.map((e) => (
              <article className="event-row" key={e.id}>
                <time>{new Date(e.at).toLocaleTimeString(locale)}</time>
                <span>{translate(e.message)}</span>
                <small>{e.source}</small>
              </article>
            ))}
          </details>
          <div className="actions">
            <a
              className="button"
              target="_blank"
              rel="noreferrer"
              href={`/api/record/${i.id}?format=json`}
            >
              {t("Mở dữ liệu JSON", "Open JSON record")}
            </a>
            {ended && !deletePending && (
              <button onClick={() => setDeletePending(true)}>
                {t(
                  "Xóa hội thoại và ghi âm của phiên",
                  "Delete session conversation and audio",
                )}
              </button>
            )}
          </div>
          {ended && deletePending && (
            <div className="delete-confirm" role="alert">
              <p>
                {t(
                  "Xóa vĩnh viễn hội thoại và ghi âm của phiên này? Các phiên bản hồ sơ chứa nội dung đó cũng sẽ bị xóa.",
                  "Permanently delete this session’s conversation and audio? Record revisions containing that content will also be deleted.",
                )}
              </p>
              <div className="actions">
                <button onClick={() => setDeletePending(false)}>
                  {t("Giữ lại", "Keep records")}
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await action("delete-transcript");
                      setDeletePending(false);
                    })
                  }
                >
                  {t("Xác nhận xóa", "Confirm deletion")}
                </button>
              </div>
            </div>
          )}
        </section>
      )}
      <footer className="workspace-footer">
        <span>
          {i.ai.status === "LIVE"
            ? t(
                "AI thật đã trả kết quả hợp lệ",
                "Live AI returned a validated result",
              )
            : i.ai.enabled
              ? t(
                  "AI bật · chưa xác nhận kết quả mới",
                  "AI enabled · new result not yet verified",
                )
              : t(
                  "AI tắt · điều phối bằng quy tắc",
                  "AI off · rule-based coordination",
                )}
        </span>
        <span>
          {t(
            "Hỗ trợ phối hợp · không thay thế cứu hộ",
            "Coordination support · not an emergency service",
          )}
        </span>
      </footer>
    </main>
  );
}
