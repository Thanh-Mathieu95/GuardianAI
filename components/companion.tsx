"use client";
import { useEffect, useRef, useState } from "react";
import {
  AudioLines,
  Check,
  Home,
  Loader2,
  Mic,
  MicOff,
  Phone,
  PhoneIncoming,
  PhoneOff,
  TriangleAlert,
} from "lucide-react";
import type { Incident } from "@/lib/types";
import type { Member, Settings } from "@/lib/network";
import { companionUpdate, type CompanionCursor } from "@/lib/coordination";
import {
  callAnswer,
  connectRealtime,
  micKey,
  post,
  savedMic,
  ring,
  unlockAudio,
  type Peer,
  type RealtimeSession,
} from "./client";
type State = Omit<Incident, "owner">;
export type Signal = {
  from: string;
  name?: string;
  type: "offer" | "answer" | "hangup";
  sdp?: string;
  at: number;
};
const recordKey = "guardian-record";
const mmss = (ms: number) =>
  `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
export default function Companion({
  state,
  signal,
  aiConfigured,
  onError,
  onLiveChange,
  startGps,
}: {
  state: State;
  signal: Signal | null;
  aiConfigured: boolean;
  onError: (text: string) => void;
  onLiveChange: (live: boolean) => void;
  startGps: () => Promise<string>;
}) {
  const [live, setLive] = useState<"" | "COMPANION" | "FAKE_CALL">(""),
    [starting, setStarting] = useState(false),
    [speaking, setSpeaking] = useState(false),
    [micOff, setMicOff] = useState(false),
    [fakeRinging, setFakeRinging] = useState(false),
    [incoming, setIncoming] = useState<Signal | null>(null),
    [talk, setTalk] = useState<{ name: string; from: string } | null>(null),
    [settings, setSettings] = useState<Settings | null>(null),
    [members, setMembers] = useState<Member[]>([]),
    [tripForm, setTripForm] = useState(false),
    [tripLabel, setTripLabel] = useState("Nhà"),
    [tripMinutes, setTripMinutes] = useState(15),
    [now, setNow] = useState(Date.now()),
    [callStart, setCallStart] = useState(0),
    [userTalking, setUserTalking] = useState(false),
    [mics, setMics] = useState<MediaDeviceInfo[]>([]),
    [mic, setMic] = useState(""),
    [recordOn, setRecordOn] = useState(true);
  const rt = useRef<RealtimeSession | null>(null),
    peer = useRef<Peer | null>(null),
    talkRef = useRef<{ name: string; from: string } | null>(null),
    coordinationCursor = useRef<CompanionCursor | null>(null),
    latestState = useRef(state),
    attemptRef = useRef(0),
    meterBar = useRef<HTMLSpanElement>(null),
    orb = useRef<HTMLButtonElement>(null),
    stopRing = useRef<(() => void) | null>(null),
    base = `/api/incidents/${state.id}`,
    closed = ["CLOSED", "USER_CANCELLED"].includes(state.status);
  latestState.current = state;
  useEffect(() => {
    fetch("/api/network", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setSettings(d.settings);
        setMembers(d.members);
      })
      .catch(() => {});
  }, []);
  useEffect(() => { try { setRecordOn(localStorage.getItem(recordKey) !== "off"); } catch {} }, []);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  // Live mic meter: if this bar never moves, the AI cannot hear the user.
  useEffect(() => {
    if (!live) return;
    let frame = 0;
    const draw = () => {
      const v = rt.current?.level() ?? 0;
      if (meterBar.current) meterBar.current.style.width = `${Math.round(v * 100)}%`;
      if (orb.current) orb.current.style.setProperty("--level", String(v));
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [live]);
  async function listMics() {
    try {
      setMic(savedMic());
      setMics(
        (await navigator.mediaDevices.enumerateDevices()).filter(
          (d) => d.kind === "audioinput",
        ),
      );
    } catch {}
  }
  useEffect(() => {
    void listMics();
  }, []);
  // New incident or closed incident: hang up everything.
  useEffect(() => {
    if (closed) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closed]);
  useEffect(() => () => stop(), [state.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => onLiveChange(!!live), [live, onLiveChange]);
  // The same state drives both the map and the companion; never replay stale plan summaries.
  useEffect(() => {
    if (!live || !rt.current) return;
    const update = companionUpdate(state, coordinationCursor.current);
    coordinationCursor.current = update.cursor;
    if (update.text) rt.current.notify(update.text, { key: "coordination", interrupt: update.interrupt });
  }, [state, live]);
  // Incoming in-app call from a trusted contact (peer-to-peer).
  useEffect(() => {
    if (!signal) return;
    if (signal.type === "offer") {
      setIncoming(signal);
      stopRing.current?.();
      stopRing.current = ring();
    } else if (signal.type === "hangup") {
      stopRing.current?.();
      setIncoming(null);
      endTalk(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signal]);
  function stop() {
    attemptRef.current++;
    coordinationCursor.current = null;
    setStarting(false);
    rt.current?.close();
    rt.current = null;
    stopRing.current?.();
    setLive("");
    setSpeaking(false);
    setFakeRinging(false);
    endTalk(true);
  }
  async function start(mode: "COMPANION" | "FAKE_CALL") {
    unlockAudio();
    const attempt = ++attemptRef.current;
    setStarting(true);
    try {
      if (!state.ai.enabled)
        await post(base + "/ai/enable", { enabled: true, consent: true });
      coordinationCursor.current = null;
      // Upload chunks strictly in order; the server rejects gaps, and a retried chunk is ignored.
      const recordingId = crypto.randomUUID();
      let uploads = Promise.resolve();
      const upload = (chunk: Blob, seq: number, mime: string) => {
        uploads = uploads.then(async () => {
          for (let tryNo = 0; tryNo < 3; tryNo++) {
            const res = await fetch(`${base}/recording?session=${recordingId}&seq=${seq}`, { method: "POST", headers: { "Content-Type": mime }, body: chunk }).catch(() => null);
            if (res?.ok) return;
            await new Promise((r) => setTimeout(r, 1500));
          }
        });
      };
      const session = await connectRealtime(() => post(base + "/realtime", { mode }), {
        ...(recordOn ? { onRecording: upload } : {}),
        onTool: async (name, args) => {
          if (attempt !== attemptRef.current) return "Phiên thoại đã kết thúc; không thực thi công cụ cũ.";
          // GPS lives in this browser, so tracking starts here before the server reads the location.
          if (name === "start_location_tracking")
            return latestState.current.routeAdapter === "CITY"
              ? "Đang dùng bản đồ phố thật Thủ Thiêm (vị trí mô phỏng): vị trí đã được theo dõi liên tục, không cần GPS. Gọi get_location để đọc vị trí."
              : startGps();
          return (await post<{ output: string }>(base + "/tool", { name, args }))
            .output;
        },
        onTranscript: (speaker, text) => {
          if (attempt === attemptRef.current)
            void post(base + "/transcript", { speaker, text }).catch(() => {});
        },
        onSpeaking: setSpeaking,
        onUserSpeaking: setUserTalking,
        onError,
        onEnd: () => {
          if (attempt !== attemptRef.current) return;
          rt.current = null;
          setLive("");
        },
      });
      if (attempt !== attemptRef.current || latestState.current.id !== state.id) { session.close(); return; }
      rt.current = session;
      void listMics();
      setLive(mode);
      setCallStart(Date.now());
      setMicOff(false);
    } catch (e) {
      if (attempt === attemptRef.current) onError(e instanceof Error ? e.message : String(e));
    } finally {
      if (attempt === attemptRef.current) setStarting(false);
    }
  }
  async function acceptIncoming() {
    const s = incoming;
    stopRing.current?.();
    setIncoming(null);
    if (!s?.sdp) return;
    try {
      rt.current?.pause(true);
      const { peer: p, sdp } = await callAnswer(s.sdp);
      peer.current = p;
      talkRef.current = { name: s.name || "Người thân", from: s.from };
      setTalk(talkRef.current);
      await post(base + "/signal", { memberId: s.from, signal: { type: "answer", sdp } });
    } catch (e) {
      rt.current?.pause(false);
      onError(e instanceof Error ? e.message : String(e));
    }
  }
  function endTalk(notify: boolean) {
    const t = talkRef.current;
    if (!peer.current || !t) return;
    peer.current.close();
    peer.current = null;
    talkRef.current = null;
    setTalk(null);
    if (notify)
      void post(base + "/signal", { memberId: t.from, signal: { type: "hangup" } }).catch(() => {});
    if (rt.current) {
      rt.current.pause(false);
      rt.current.notify(`Người dùng vừa nói chuyện trực tiếp với ${t.name}.`);
    }
  }
  async function trip(body: Record<string, unknown>) {
    try {
      await post(base + "/trip", body);
      setTripForm(false);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }
  const caller = settings?.fakeCaller || "Mẹ",
    disguised = live === "FAKE_CALL" || (!!live && !!state.covert),
    t = state.trip,
    due = t?.checkinDueAt ? Math.max(0, Date.parse(t.checkinDueAt) - now) : 0;
  return (
    <div className="companion-panel">
      {disguised && (
        <div className="fake-call-screen">
          <span>Di động</span>
          <b>{caller}</b>
          <time>{mmss(now - callStart)}</time>
          <div className={"fake-wave " + (speaking ? "on" : "")} />
          <div className="fake-call-actions">
            <button
              aria-label="Tắt mic"
              onClick={() => {
                rt.current?.pause(!micOff);
                setMicOff(!micOff);
              }}
            >
              {micOff ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
            <button className="hangup" aria-label="Kết thúc" onClick={stop}>
              <PhoneOff size={22} />
            </button>
          </div>
        </div>
      )}
      {fakeRinging && (
        <div className="fake-call-screen ringing">
          <span>Cuộc gọi đến · Di động</span>
          <b>{caller}</b>
          <div className="fake-call-actions">
            <button
              className="hangup"
              onClick={() => {
                stopRing.current?.();
                setFakeRinging(false);
              }}
            >
              <PhoneOff size={22} />
            </button>
            <button
              className="pickup"
              onClick={() => {
                stopRing.current?.();
                setFakeRinging(false);
                void start("FAKE_CALL");
              }}
            >
              <Phone size={22} />
            </button>
          </div>
        </div>
      )}
      {incoming && (
        <div className="incoming-call">
          <PhoneIncoming size={18} />
          <b>{incoming.name} đang gọi qua Guardian</b>
          <div>
            <button className="primary" onClick={acceptIncoming}>
              Nghe
            </button>
            <button
              onClick={() => {
                stopRing.current?.();
                void post(base + "/signal", { memberId: incoming.from, signal: { type: "hangup" } }).catch(() => {});
                setIncoming(null);
              }}
            >
              Từ chối
            </button>
          </div>
        </div>
      )}
      {talk && (
        <div className="incoming-call connected">
          <Phone size={16} /> Đang nói chuyện với <b>{talk.name}</b>
          <button onClick={() => endTalk(true)}>
            <PhoneOff size={14} /> Kết thúc
          </button>
        </div>
      )}
      {!closed && (
        <div
          className={
            "voice-orb-wrap " +
            (live
              ? "live " + (userTalking ? "user" : speaking ? "ai" : "listening")
              : "idle")
          }
        >
          <button
            ref={orb}
            className="voice-orb"
            disabled={!aiConfigured || starting}
            aria-label={live ? "Trạng thái giọng nói" : "Chạm để nói với Guardian"}
            onClick={() => {
              if (!live) void start("COMPANION");
            }}
          >
            <span className="orb-ring r1" />
            <span className="orb-ring r2" />
            <span className="orb-ring r3" />
            <span className="orb-core">
              {starting ? (
                <Loader2 className="orb-spin" size={32} />
              ) : live ? (
                <AudioLines size={36} />
              ) : (
                <Mic size={36} />
              )}
            </span>
          </button>
          <div className="orb-status">
            <b>
              {starting
                ? "Đang kết nối…"
                : live
                  ? userTalking
                    ? "Bạn đang nói…"
                    : speaking
                      ? "Guardian đang nói"
                      : "Guardian đang nghe"
                  : aiConfigured
                    ? "Chạm để nói với Guardian"
                    : "Cần kết nối AI trong Điều khiển"}
            </b>
            {live ? (
              <small>
                {micOff ? "Mic đang tắt" : rt.current?.micLabel || "Micro"} ·{" "}
                {mmss(now - callStart)}
                {rt.current?.recording && !state.covert && <span className="rec-dot"> · ● Đang ghi âm vào hồ sơ</span>}
              </small>
            ) : (
              aiConfigured && (
                <small>
                  Nói liên tục, AI tự xử lý phía sau · Mật mã: “{settings?.safePhrase || "…"}” ·{" "}
                  <label className="rec-toggle">
                    <input type="checkbox" checked={recordOn} onChange={(e) => { setRecordOn(e.target.checked); try { localStorage.setItem(recordKey, e.target.checked ? "on" : "off"); } catch {} }} /> Ghi âm vào hồ sơ
                  </label>
                </small>
              )
            )}
          </div>
          {live ? (
            <div className="orb-actions">
              <button
                aria-label={micOff ? "Bật mic" : "Tắt mic"}
                onClick={() => {
                  rt.current?.pause(!micOff);
                  setMicOff(!micOff);
                }}
              >
                {micOff ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
              <button className="danger" aria-label="Kết thúc" onClick={stop}>
                <PhoneOff size={16} />
              </button>
            </div>
          ) : (
            <button
              className="orb-fake"
              disabled={!aiConfigured || starting}
              title="AI gọi giả làm người quen"
              onClick={() => {
                unlockAudio();
                setFakeRinging(true);
                stopRing.current = ring();
              }}
            >
              <Phone size={13} /> Cuộc gọi giả
            </button>
          )}
        </div>
      )}
      {!live && !closed && aiConfigured && mics.length > 1 && (
        <label className="mic-select">
          Micro
          <select
            value={mic}
            onChange={(e) => {
              setMic(e.target.value);
              try {
                localStorage.setItem(micKey, e.target.value);
              } catch {}
            }}
          >
            <option value="">Mặc định của hệ thống</option>
            {mics.map((d, n) => (
              <option key={d.deviceId || n} value={d.deviceId}>
                {d.label || `Micro ${n + 1}`}
              </option>
            ))}
          </select>
        </label>
      )}
      {!state.contacts.length && !closed && (
        <p className="network-preview">
          {members.some((m) => m.joined)
            ? "Khi cần, AI sẽ gọi trong app: " +
              members
                .filter((m) => m.joined)
                .map((m) => `${m.name}${m.role === "PARTNER" ? (m.onDuty ? " (đối tác)" : " (đối tác nghỉ)") : ""}`)
                .join(", ")
            : "Chưa có người thân / đối tác. Thêm trong Mạng lưới để AI có người để gọi."}
        </p>
      )}
      {state.contacts.length > 0 && (
        <div className="contact-chips">
          {state.contacts.map((c) => (
            <span key={c.memberId} className={"contact-chip " + c.status}>
              {c.name} ·{" "}
              {{ RINGING: "đang đổ chuông", ANSWERED: "đã nghe", ON_THE_WAY: "đang đến", MISSED: "chưa nghe", KEEP_CONTACT: "giữ liên lạc", CANNOT_HELP: "không thể giúp" }[c.status]}
            </span>
          ))}
        </div>
      )}
      {state.nav && !closed && (
        <div className={"phone-nav " + (state.nav.offRoute ? "off" : state.nav.arrived ? "done" : "")}>
          <b>
            {state.nav.offRoute
              ? "⚠ Bạn đang đi lệch tuyến"
              : state.nav.arrived
                ? `✓ Đã tới ${state.nav.target}`
                : `➜ ${state.nav.next || "Tới " + state.nav.target}`}
          </b>
          <small>
            {state.nav.nextIn !== undefined && !state.nav.arrived && !state.nav.offRoute
              ? `sau ${state.nav.nextIn} m · `
              : ""}
            {state.nav.where}
            {!state.nav.arrived && state.nav.remaining !== undefined
              ? ` · còn ${state.nav.remaining} m`
              : ""}
          </small>
        </div>
      )}
      {t?.status === "CHECKING" && (
        <div className="checkin-alert" role="alert">
          <TriangleAlert size={16} />
          <div>
            <b>Bạn ổn không?</b>
            <small>
              {t.checkinReason} · tự động SOS sau {Math.ceil(due / 1000)} giây
            </small>
          </div>
          <button className="primary" onClick={() => void trip({ action: "checkin" })}>
            <Check size={14} /> Tôi ổn
          </button>
        </div>
      )}
      {t && ["ACTIVE", "CHECKING"].includes(t.status) ? (
        <div className="trip-card">
          <Home size={15} />
          <div>
            <b>Đang về {t.destination.label}</b>
            <small>
              Dự kiến {new Date(t.expectedBy).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} ·
              tự kiểm tra nếu dừng lâu, lệch tuyến, mất GPS
            </small>
          </div>
          <button onClick={() => void trip({ action: "arrived" })}>Đã về</button>
          <button className="text-button" onClick={() => void trip({ action: "stop" })}>
            Dừng
          </button>
        </div>
      ) : t?.status === "ARRIVED" ? (
        <div className="trip-card done">
          <Check size={15} /> Đã về {t.destination.label} an toàn · người thân đã được báo
        </div>
      ) : (
        !closed &&
        !state.metrics.sosAt &&
        (tripForm ? (
          <div className="trip-form">
            <input aria-label="Điểm đến" value={tripLabel} onChange={(e) => setTripLabel(e.target.value)} />
            <input
              aria-label="Số phút dự kiến"
              type="number"
              min={1}
              max={240}
              value={tripMinutes}
              onChange={(e) => setTripMinutes(Number(e.target.value))}
            />
            <button
              className="primary"
              onClick={() =>
                // ponytail: demo destination ~600 m from the user; replace with a map picker / saved home address.
                void trip({
                  action: "start",
                  label: tripLabel || "Nhà",
                  lat: state.location.lat + 0.0042,
                  lng: state.location.lng + 0.0031,
                  minutes: tripMinutes || 15,
                })
              }
            >
              Bắt đầu
            </button>
          </div>
        ) : (
          <button className="trip-start" onClick={() => setTripForm(true)}>
            <Home size={15} /> Đồng hành về nhà
          </button>
        ))
      )}
    </div>
  );
}
