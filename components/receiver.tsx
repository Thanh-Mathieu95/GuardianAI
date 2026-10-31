"use client";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  MapPin,
  Mic,
  Phone,
  ShieldCheck,
  Users,
  FileText,
} from "lucide-react";
import type { Event, Incident, Member, Plan, Reply } from "@/lib/types";
import { choose } from "@/lib/types";
import { states, errors } from "@/lib/copy";
import { useLanguage, LanguageSwitch } from "./language";
import { connectVoice, type Voice } from "./voice";
import type { AppCall } from "@/lib/coordination-types";
import { RecipientCall } from "./recipient-call";
import { PartnerProfileForm } from "./partner-profile";
type View = {
  member: Omit<Member, "tokenHash" | "createdAt">;
  config: { ai: boolean };
  incident: {
    id: string;
    mode: string;
    status: string;
    locale: "vi" | "en";
    risk: number;
    reply: Reply;
    location: Incident["location"];
    plan: Plan | null;
    trip: Incident["trip"];
    shared: boolean;
    events: Event[];
    calls: AppCall[];
  } | null;
};
export default function Receiver({ token }: { token: string }) {
  const { locale, t } = useLanguage(),
    [view, setView] = useState<View | null>(null),
    [error, setError] = useState(""),
    [online, setOnline] = useState(false),
    [busy, setBusy] = useState(false),
    [text, setText] = useState(""),
    [minutes, setMinutes] = useState(10),
    [consent, setConsent] = useState(false),
    [talking, setTalking] = useState(false);
  const voice = useRef<Voice | null>(null),
    current = useRef(view),
    heartbeatAt = useRef(0);
  current.current = view;
  async function api(body?: unknown) {
    const r = await fetch("/api/join/" + token, {
      cache: "no-store",
      ...(body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    return d;
  }
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      setView(await api());
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "REQUEST_FAILED");
      return false;
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let alive = true,
      timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const d = await api();
        if (alive) {
          setView(d);
          setOnline(true);
        }
        if (d.member.joined && Date.now() - heartbeatAt.current > 10000) {
          heartbeatAt.current = Date.now();
          await api({ action: "heartbeat" });
        }
      } catch (e) {
        if (alive) {
          setOnline(false);
          setError(e instanceof Error ? e.message : "REQUEST_FAILED");
        }
      }
      if (alive) timer = setTimeout(poll, 1500);
    };
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
      voice.current?.close();
    };
  }, [token]);
  const i = view?.incident,
    m = view?.member,
    ended = !!i && ["COMPLETE", "CANCELLED"].includes(i.status);
  useEffect(() => {
    voice.current?.close();
    voice.current = null;
    setTalking(false);
  }, [i?.id, ended]);
  const reply = (message: string) =>
    api({ action: "reply", text: message, incidentId: i!.id });
  async function startVoice() {
    if (voice.current) {
      voice.current.close();
      voice.current = null;
      setTalking(false);
      return;
    }
    if (!i) return;
    const incidentId = i.id;
    const voiceMessageIds = new Map<string, string>();
    const call = i.calls?.find((c) =>
      ["CONNECTED", "CONVERSING"].includes(c.state),
    );
    voice.current = await connectVoice(
      () =>
        api({
          action: "voice",
          consent: true,
          locale,
          ...(call ? { callId: call.id } : {}),
        }),
      {
        transcript: (who, text, transcriptId) => {
          if (who === "You" && current.current?.incident?.id === incidentId)
            void api(
              call
                ? {
                    action: "call-message",
                    incidentId,
                    callId: call.id,
                    attempt: call.attempt,
                    messageId:
                      voiceMessageIds.get(transcriptId) ||
                      (voiceMessageIds.set(transcriptId, crypto.randomUUID()),
                      voiceMessageIds.get(transcriptId)!),
                    text,
                  }
                : { action: "reply", incidentId, text },
            ).catch((e) => setError(e.message));
        },
        tool: async () => ({}),
        error: setError,
        ended: () => setTalking(false),
      },
    );
    setTalking(true);
  }
  function setLocation() {
    if (!navigator.geolocation) {
      setError("GPS_PERMISSION_REQUIRED");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) =>
        void run(() =>
          api({
            action: "location",
            lat: p.coords.latitude,
            lng: p.coords.longitude,
            consent: true,
          }),
        ),
      () => setError("GPS_PERMISSION_REQUIRED"),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }
  return (
    <main className="receiver">
      <header>
        <a className="brand" href="/">
          <ShieldCheck size={23} />
          Guardian AI
        </a>
        <LanguageSwitch />
      </header>
      {error && (
        <p role="alert" className="error-box">
          {errors[error]
            ? choose(errors[error], locale)
            : t(
                "Thao tác chưa hoàn tất. Kiểm tra kết nối và quyền truy cập.",
                "Action not completed. Check connection and permissions.",
              )}
        </p>
      )}
      {!view ? (
        <div className="loading-inline">
          <p>{t("Đang mở lời mời…", "Opening your invitation…")}</p>
        </div>
      ) : !m!.joined ? (
        <section className="receiver-welcome">
          <div className="person-emblem">
            <Users size={32} />
          </div>
          <h1>
            {t(
              `Chào ${m!.name}. Cùng có mặt khi cần.`,
              `Hello ${m!.name}. Be there when it matters.`,
            )}
          </h1>
          <p>
            {t(
              "Bạn được mời làm người hỗ trợ. Khi tham gia, bạn có thể nhận yêu cầu trong trang này và chủ động chọn cách giúp.",
              "You have been invited to help. After joining, you can receive requests here and choose what support to offer.",
            )}
          </p>
          <p>
            {t(
              "Giữ trang mở. Không có cuộc gọi tự động, thông báo nền hay nghĩa vụ cứu hộ. Link này là riêng tư.",
              "Keep this page open. There are no automatic calls, background alerts or rescue obligations. This link is private.",
            )}
          </p>
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              void run(() => api({ action: "join", consent: true }))
            }
          >
            <Check size={18} />
            {t("Đồng ý tham gia", "Agree to join")}
          </button>
        </section>
      ) : (
        <section className="receiver-content">
          <div className="receiver-title">
            <h1>{m!.name}</h1>
            <span>
              {online
                ? t("Đã kết nối", "Connected")
                : t("Đang kết nối lại", "Reconnecting")}
            </span>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={!!m!.callConsentAt}
              disabled={busy}
              onChange={(e) =>
                void run(() =>
                  api({ action: "call-consent", enabled: e.target.checked }),
                )
              }
            />
            {t(
              "Đồng ý nhận cuộc gọi AI trong app khi trang đang mở",
              "Allow AI calls in the app while this page is open",
            )}
          </label>
          {m!.role === "PARTNER" && (
            <div className="partner-setup">
              <PartnerProfileForm
                profile={m!.profile}
                busy={busy}
                save={async (body) => {
                  await run(() => api(body));
                }}
              />
              <h2>{t("Sẵn sàng tiếp nhận?", "Ready to offer support?")}</h2>
              <p>
                {t(
                  "Cần vị trí của điểm hỗ trợ và trạng thái đang trực trước khi có tuyến hợp lệ.",
                  "A venue location and on-duty status are needed before a valid route can be proposed.",
                )}
              </p>
              <div className="actions">
                <button disabled={busy} onClick={setLocation}>
                  <MapPin size={17} />
                  {m!.location
                    ? t("Cập nhật vị trí điểm", "Update venue location")
                    : t("Đặt vị trí điểm hỗ trợ", "Set venue location")}
                </button>
                <button
                  aria-pressed={m!.onDuty}
                  disabled={busy}
                  onClick={() =>
                    void run(() => api({ action: "duty", enabled: !m!.onDuty }))
                  }
                >
                  {m!.onDuty
                    ? t("Đang trực · tắt trực", "On duty · go off duty")
                    : t("Bật đang trực", "Go on duty")}
                </button>
              </div>
            </div>
          )}
          {!i ? (
            <div className="receiver-empty">
              <ShieldCheck size={35} />
              <h2>
                {t("Đã sẵn sàng nhận yêu cầu.", "Ready to receive a request.")}
              </h2>
              <p>
                {t(
                  "Bạn chưa nhận yêu cầu nào. Giữ trang này mở để trạng thái được cập nhật.",
                  "No request yet. Keep this page open for updates.",
                )}
              </p>
            </div>
          ) : (
            <>
              <span className="source">
                {i.mode === "DEMO"
                  ? t("MÔ PHỎNG", "SIMULATION")
                  : t("PHIÊN TRÊN THIẾT BỊ", "DEVICE TRIAL")}
              </span>
              <h2>
                {ended
                  ? t("Phiên đã kết thúc", "Session ended")
                  : t("Có người đang cần bạn.", "Someone is counting on you.")}
              </h2>
              <p role="status">
                {states[i.status] ? choose(states[i.status], locale) : i.status}
              </p>
              {i.calls
                ?.filter((c) =>
                  ["CALLING", "RINGING", "CONNECTED", "CONVERSING"].includes(
                    c.state,
                  ),
                )
                .map((c) => (
                  <RecipientCall
                    key={c.id}
                    call={c}
                    busy={busy}
                    api={async (body) => {
                      return await run(() => api(body));
                    }}
                  />
                ))}
              {i.location ? (
                <div className="shared-location">
                  <MapPin size={20} />
                  <div>
                    <b>{t("Vị trí báo lần cuối", "Last reported location")}</b>
                    <p>
                      {i.location.lat.toFixed(5)}, {i.location.lng.toFixed(5)}
                    </p>
                    <small>
                      {new Date(i.location.at).toLocaleString(locale)}
                    </small>
                    <a
                      target="_blank"
                      rel="noreferrer"
                      href={`https://www.google.com/maps?q=${i.location.lat},${i.location.lng}`}
                    >
                      {t("Mở bản đồ ngoài", "Open external map")}
                    </a>
                  </div>
                </div>
              ) : (
                <p className="privacy-note">
                  {t(
                    "Vị trí chính xác chỉ hiện sau khi bạn đồng ý nhận giúp.",
                    "Exact location appears only after you agree to help.",
                  )}
                </p>
              )}
              {i.plan && (
                <div className="receiver-plan">
                  <b>{t("Điểm hẹn đề xuất", "Proposed meeting place")}</b>
                  <h3>{i.plan.destination}</h3>
                  <p>
                    {i.plan.acceptedAt
                      ? t("Người dùng đã chấp nhận", "The user accepted")
                      : t(
                          "Người dùng chưa chấp nhận",
                          "The user has not accepted yet",
                        )}
                  </p>
                </div>
              )}
              {!ended && (
                <>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(() => reply(text));
                    }}
                  >
                    <label>
                      {t("Bạn có thể giúp bằng cách nào?", "How can you help?")}
                      <textarea
                        required
                        value={text}
                        maxLength={1000}
                        onChange={(e) => setText(e.target.value)}
                        placeholder={
                          m!.role === "PARTNER"
                            ? t(
                                "Đồng ý. Có chỗ chờ và nhân viên ở cửa chính.",
                                "I accept. You can wait here; staff are at the main entrance.",
                              )
                            : t(
                                "Tôi đang đến, khoảng 10 phút.",
                                "I am on my way, about 10 minutes.",
                              )
                        }
                      />
                    </label>
                    <button className="primary" disabled={busy || !text.trim()}>
                      {t("Gửi lời phản hồi", "Send response")}
                    </button>
                  </form>
                  {m!.role === "CONTACT" && (
                    <div className="quick-replies">
                      <label>
                        {t(
                          "Thời gian bạn dự kiến đến (phút)",
                          "Your expected arrival (minutes)",
                        )}
                        <input
                          type="number"
                          min={1}
                          max={240}
                          value={minutes}
                          onChange={(e) => setMinutes(Number(e.target.value))}
                        />
                      </label>
                      <div className="actions">
                        <button
                          disabled={busy}
                          onClick={() =>
                            void run(() =>
                              reply(
                                t(
                                  `Tôi đang đến, ${minutes} phút nữa tới.`,
                                  `I am on my way, ${minutes} minutes.`,
                                ),
                              ),
                            )
                          }
                        >
                          {t("Tôi đang đến", "I am on my way")}
                        </button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            void run(() =>
                              reply(
                                t(
                                  "Tôi sẽ giữ liên lạc.",
                                  "I will stay in touch.",
                                ),
                              ),
                            )
                          }
                        >
                          {t("Tôi giữ liên lạc", "I will stay in touch")}
                        </button>
                      </div>
                    </div>
                  )}
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        reply(
                          t(
                            "Tôi không thể nhận giúp lúc này.",
                            "I cannot help right now.",
                          ),
                        ),
                      )
                    }
                  >
                    {t("Tôi không thể giúp lúc này", "I cannot help right now")}
                  </button>
                  {m!.role === "PARTNER" &&
                    i.plan?.acceptedAt &&
                    i.plan.replyId === i.reply.id && (
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() =>
                          void run(() =>
                            api({ action: "handoff", incidentId: i.id }),
                          )
                        }
                      >
                        <Check size={17} />
                        {t("Đã gặp người cần giúp", "I have met the person")}
                      </button>
                    )}
                  <details>
                    <summary>
                      {t(
                        "Trả lời bằng giọng nói với AI",
                        "Respond by voice with AI",
                      )}
                    </summary>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                      />
                      {t(
                        "Đồng ý gửi giọng nói tới OpenAI để ghi nhận lời đề nghị",
                        "Consent to send voice to OpenAI to capture my offer",
                      )}
                    </label>
                    <button
                      disabled={
                        busy || !view.config.ai || (!consent && !talking)
                      }
                      onClick={() => void run(startVoice)}
                    >
                      <Mic size={17} />
                      {talking
                        ? t("Dừng thoại", "End voice")
                        : t("Nói với AI", "Talk with AI")}
                    </button>
                    {!view.config.ai && (
                      <p>
                        {t(
                          "Người khởi tạo chưa bật AI; dùng phản hồi chữ.",
                          "The session owner has not enabled AI; use a text response.",
                        )}
                      </p>
                    )}
                  </details>
                </>
              )}
              {i.shared && (
                <a
                  className="button primary"
                  target="_blank"
                  rel="noreferrer"
                  href={`/api/join/${token}/record?lang=${locale}`}
                >
                  <FileText size={17} />
                  {t("Mở hồ sơ được chia sẻ", "Open shared record")}
                </a>
              )}
              <div className="your-promise">
                <h3>{t("Phản hồi đang ghi nhận", "Your recorded response")}</h3>
                <b>
                  {choose(
                    states[i.reply.state] || ["Đang chờ", "Waiting"],
                    locale,
                  )}
                </b>
                <q>
                  {i.reply.quote ||
                    t("Chưa có lời phản hồi.", "No response yet.")}
                </q>
              </div>
            </>
          )}
        </section>
      )}
      <footer>
        {t(
          "Guardian AI hỗ trợ phối hợp, không bảo đảm cứu hộ.",
          "Guardian AI supports coordination, not guaranteed rescue.",
        )}
      </footer>
    </main>
  );
}
