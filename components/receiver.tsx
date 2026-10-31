"use client";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  HeartHandshake,
  MapPin,
  Navigation,
  Phone,
  PhoneOff,
  Shield,
  ShieldCheck,
  Store,
  TriangleAlert,
} from "lucide-react";
import type { ReceiverView } from "@/lib/receiver";
import { TranscriptQueue } from "@/lib/transcript-queue";
import {
  callOffer,
  connectRealtime,
  post,
  ring,
  subscribe,
  unlockAudio,
  type Peer,
  type RealtimeSession,
} from "./client";
type Line = { speaker: string; text: string };
const clock = (s: string) =>
  new Date(s).toLocaleTimeString("vi-VN", { hour12: false });
const maps = (lat: number, lng: number) =>
  `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
export default function Receiver({ token }: { token: string }) {
  const [view, setView] = useState<ReceiverView | null>(null),
    [error, setError] = useState(""),
    [online, setOnline] = useState(false),
    [armed, setArmed] = useState(false),
    [aiLive, setAiLive] = useState(false),
    [aiSpeaking, setAiSpeaking] = useState(false),
    [lines, setLines] = useState<Line[]>([]),
    [talking, setTalking] = useState<"" | "calling" | "connected">(""),
    [declinedRing, setDeclinedRing] = useState("");
  const [partnerText, setPartnerText] = useState("");
  const [arrivalMinutes, setArrivalMinutes] = useState("");
  const [aiStarting, setAiStarting] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [micLabel, setMicLabel] = useState("");
  const aiAttempt = useRef(0);
  const base = `/api/r/${token}`,
    rt = useRef<RealtimeSession | null>(null),
    p2p = useRef<Peer | null>(null),
    stopRing = useRef<(() => void) | null>(null),
    callRef = useRef(""),
    lastRelayed = useRef(""),
    lastTask = useRef(""),
    lastProgress = useRef({ bucket: -1, where: "", at: 0 });
  useEffect(() => {
    return subscribe<ReceiverView, { type: string; sdp?: string }>(base, {
      state: setView,
      online: setOnline,
      error: setError,
      signal: async (s) => {
        if (s.type === "answer" && p2p.current) {
          await p2p.current.pc.setRemoteDescription({ type: "answer", sdp: s.sdp });
          setTalking("connected");
        } else if (s.type === "hangup") endTalk(false);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);
  const inc = view?.incident,
    m = view?.member,
    partnerInc = inc?.kind === "PARTNER" ? inc : null,
    contactInc = inc?.kind === "CONTACT" ? inc : null,
    ringing =
      !!inc &&
      !inc.closed &&
      (partnerInc
        ? partnerInc.call.status === "RINGING"
        : contactInc?.alert?.status === "RINGING") &&
      declinedRing !== inc.id;
  // Ring while an incoming alert is pending.
  useEffect(() => {
    if (!ringing || !armed) return;
    stopRing.current = ring();
    return () => {
      stopRing.current?.();
      stopRing.current = null;
    };
  }, [ringing, armed]);
  // Hang up the AI when the incident ends or the partner lane finishes.
  useEffect(() => {
    if ((!rt.current && !aiStarting) || !inc) return;
    if (inc.closed || (partnerInc && ["DECLINED", "NO_ANSWER", "FAILED"].includes(partnerInc.call.status)))
      endAI();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inc?.closed, partnerInc?.call.status]);
  useEffect(() => () => {
    aiAttempt.current++;
    rt.current?.close();
    p2p.current?.close();
  }, []);
  // Keep the AI on this call informed: contacts get new incident events, partners get the walker's progress.
  useEffect(() => {
    if (!aiLive || !rt.current || !inc) return;
    if (contactInc) {
      const events = contactInc.events,
        idx = events.findIndex((e) => e.id === lastRelayed.current),
        fresh = (idx < 0 ? events.slice(0, 1) : events.slice(0, idx)).reverse();
      if (events[0]) lastRelayed.current = events[0].id;
      if (fresh.length)
        rt.current.notify(
          fresh.map((e) => e.summary).join(" | ") +
            (contactInc.where ? ` | Vị trí hiện tại: ${contactInc.where}` : ""),
        );
      return;
    }
    const task = partnerInc?.assignment;
    if (task && task.instruction !== lastTask.current) {
      lastTask.current = task.instruction;
      rt.current.notify(`Phương án điều phối giao cho bên bạn (${task.role}): ${task.instruction}. Lý do: ${task.reason}. Báo lại ngắn gọn cho lễ tân và hỏi họ có làm được không.`);
    }
    if (partnerInc?.call.status === "CONFIRMED" && partnerInc.where) {
      const bucket = Math.ceil(partnerInc.distance / 100),
        last = lastProgress.current;
      if (bucket !== last.bucket && Date.now() - last.at > 8000) {
        lastProgress.current = { bucket, where: partnerInc.where, at: Date.now() };
        rt.current.notify(
          partnerInc.distance < 40
            ? `Người cần hỗ trợ đã tới cửa, ${partnerInc.where}.`
            : `Người cần hỗ trợ đang ở ${partnerInc.where}, cách bạn khoảng ${partnerInc.distance} m${partnerInc.selectedHere ? ", đang đi tới chỗ bạn" : ""}.`,
        );
      }
    }
  }, [aiLive, inc, contactInc, partnerInc]);
  async function run(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  function endAI() {
    aiAttempt.current++;
    rt.current?.close();
    rt.current = null;
    setAiLive(false);
    setAiSpeaking(false);
    setUserSpeaking(false);
    setAiStarting(false);
  }
  async function startAI() {
    if (aiStarting || rt.current) return;
    const attempt = ++aiAttempt.current;
    const transcripts = new TranscriptQueue();
    setAiStarting(true); setError("");
    const callId = partnerInc?.call.id || "";
    callRef.current = callId;
    try {
    const session = await connectRealtime(() => post(base + "/realtime"), {
      onInputCommitted: id => transcripts.expect(id),
      onTranscriptionFailed: id => transcripts.fail(id),
      onTranscript: (speaker, text, itemId) => {
        if (attempt !== aiAttempt.current) return;
        setLines((l) => [...l.slice(-12), { speaker: speaker === "AI" ? "Guardian AI" : "Bạn", text }]);
          void transcripts.append(itemId, () => post(base + "/transcript", {
            ...(partnerInc ? { callId } : {}),
            speaker: speaker === "AI" ? "AI" : "PARTNER",
            text,
            itemId,
          })).catch(() => setError("Chưa gửi được transcript tới bộ điều phối. Hãy thử lại hoặc nhập phản hồi bằng chữ."));
      },
      onSpeaking: setAiSpeaking,
      onUserSpeaking: setUserSpeaking,
      onError: setError,
      onEnd: () => { if (attempt === aiAttempt.current) { setAiLive(false); setAiStarting(false); rt.current = null; } },
      onTool: async (name, args) => {
        const note = typeof args.note === "string" ? args.note.slice(0, 300) : "";
        if (name === "confirm_support" || name === "decline_support") {
          if (attempt !== aiAttempt.current) return "Phiên thoại đã kết thúc.";
          if (!(await transcripts.ready())) return "Chưa nhận/lưu đủ transcript gốc nên chưa được xác nhận tiếp nhận. Nhờ đối tác nhắc lại quyết định và điều kiện; không dùng ghi chú của model làm bằng chứng.";
          if (attempt !== aiAttempt.current) return "Phiên thoại đã kết thúc.";
          const result = await post<{ admitted: boolean; checks: string[]; support: unknown }>(base + "/decide", { callId, accept: name === "confirm_support", note, fromAI: true });
          return result.admitted ? "Đã đủ dữ kiện tiếp nhận. Chờ backend lập kế hoạch và người dùng chấp nhận trước khi hướng dẫn." : "Chưa đủ điều kiện tiếp nhận; không khẳng định đã xác nhận. Hỏi lại nếu còn dữ kiện thiếu: " + JSON.stringify(result);
        }
        if (name === "on_my_way") {
          if (!(await transcripts.ready())) return "Mình chưa nghe rõ lời xác nhận. Bạn nhắc lại giúp mình nhé?";
          await post(base + "/contact", { action: "ON_THE_WAY", fromAI: true });
          return "Đã báo người dùng rằng bạn đang tới.";
        }
        if (name === "report_contact_capability") {
          if (!(await transcripts.ready())) return "Chưa lưu được lời người thân; hãy hỏi lại, không tự điền khả năng hay ETA.";
          await post(base + "/contact", { action: args.action, fromAI: true, ...(typeof args.arrival_minutes === "number" && args.action === "ON_THE_WAY" ? { arrivalMinutes: args.arrival_minutes } : {}) });
          return "Đã gửi tóm tắt khả năng hỗ trợ tới bộ điều phối; không gửi toàn bộ hội thoại.";
        }
        return "Không hỗ trợ.";
      },
    });
    if (attempt !== aiAttempt.current) { session.close(); return; }
    rt.current = session;
    setMicLabel(session.micLabel);
    setAiLive(true);
    } finally { if (attempt === aiAttempt.current) setAiStarting(false); }
  }
  async function answer() {
    unlockAudio();
    stopRing.current?.();
    await run(async () => {
      if (partnerInc) await post(base + "/answer", { callId: partnerInc.call.id });
      else await post(base + "/contact", { action: "ANSWER" });
      setLines([]);
      if (m?.voiceConfigured && m.voiceEnabled) await startAI();
    });
  }
  async function decline() {
    stopRing.current?.();
    if (!inc) return;
    setDeclinedRing(inc.id);
    if (partnerInc)
      await run(() => post(base + "/decide", { callId: partnerInc.call.id, accept: false }));
  }
  async function talk() {
    endAI();
    await run(async () => {
      const { peer, sdp } = await callOffer();
      p2p.current = peer;
      setTalking("calling");
      await post(base + "/signal", { type: "offer", sdp });
    });
  }
  function endTalk(notify = true) {
    p2p.current?.close();
    p2p.current = null;
    setTalking("");
    if (notify) void post(base + "/signal", { type: "hangup" }).catch(() => {});
  }
  function shareLocation() {
    navigator.geolocation?.getCurrentPosition(
      (pos) =>
        void run(() =>
          post(base + "/location", { lat: pos.coords.latitude, lng: pos.coords.longitude }),
        ),
      (e) => setError("Không lấy được GPS: " + e.message),
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }
  if (!view)
    return (
      <main className="rx">
        <p className="rx-muted">{error || "Đang kết nối Guardian…"}</p>
        {error && <a className="rx-link" href="/demo/command-center">Về trung tâm để tạo lại link mời</a>}
      </main>
    );
  const isPartner = m!.role === "PARTNER";
  return (
    <main className="rx">
      <header className="rx-top">
        <span className="mini-shield">
          <ShieldCheck size={18} />
        </span>
        <b>
          Guardian<span>AI</span>
        </b>
        <span className={"rx-role " + m!.role}>
          {isPartner ? <Store size={13} /> : <HeartHandshake size={13} />}
          {isPartner ? "ĐIỂM ĐỐI TÁC" : "NGƯỜI THÂN"}
        </span>
        <span className={"rx-dot " + (online ? "on" : "")} title={online ? "Đã kết nối" : "Mất kết nối"} />
      </header>
      <h1>{m!.name}</h1>
      <p className="rx-muted">{m!.category}</p>
      {error && (
        <p className="rx-error" role="alert">
          <TriangleAlert size={14} /> {error}
        </p>
      )}
      {!m!.joined ? (
        <section className="rx-card">
          <h2>Lời mời từ {view.userName}</h2>
          <p>
            {isPartner
              ? `${view.userName} mời "${m!.name}" làm điểm hỗ trợ Guardian. Khi có người gần đây cần nơi chờ an toàn, app sẽ đổ chuông và trợ lý AI hỏi bạn có tiếp nhận được không.`
              : `${view.userName} thêm bạn làm người thân. Khi ${view.userName} gặp nguy hiểm, app sẽ đổ chuông, AI tóm tắt tình hình và bạn xem được vị trí trực tiếp.`}
          </p>
          <p className="rx-fine">
            Cuộc gọi có trợ lý AI: giọng nói được xử lý bởi OpenAI. Giữ trang này mở để nhận
            cuộc gọi. Bạn có thể rời mạng lưới bất kỳ lúc nào.
          </p>
          <button
            className="primary wide"
            onClick={() => {
              unlockAudio();
              setArmed(true);
              void run(() => post(base + "/join", { consent: true }));
            }}
          >
            <Check size={16} /> Đồng ý tham gia
          </button>
        </section>
      ) : !armed ? (
        <button
          className="primary wide rx-arm"
          onClick={() => {
            unlockAudio();
            setArmed(true);
          }}
        >
          <Phone size={16} /> Bật chuông nhận cuộc gọi
        </button>
      ) : null}
      {m!.joined && isPartner && (
        <section className="rx-card rx-row">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={m!.onDuty}
              onChange={(e) => void run(() => post(base + "/duty", { onDuty: e.target.checked }))}
            />
            Đang trực, nhận cuộc gọi SOS
          </label>
          <button onClick={shareLocation}>
            <MapPin size={14} /> {m!.hasLocation ? "Cập nhật vị trí" : "Đặt vị trí cửa hàng"}
          </button>
        </section>
      )}
      {ringing && (
        <div className="rx-ring" role="alertdialog" aria-label="Cuộc gọi đến">
          <div className="rx-ring-pulse">
            <Shield size={40} />
          </div>
          <b>Guardian SOS</b>
          <p>
            {partnerInc
              ? `Có người cần nơi chờ an toàn · cách bạn ${partnerInc.distance} m`
              : contactInc?.sos
                ? `${view.userName} cần hỗ trợ${contactInc.covert ? " · SOS bí mật" : ""}`
                : `${view.userName} chia sẻ vị trí với bạn`}
          </p>
          <small>Guardian AI trao đổi riêng với bạn rồi tổng hợp cho {view.userName}.</small>
          {(!m!.voiceConfigured || !m!.voiceEnabled) && <small>AI giọng nói chưa sẵn sàng. Bạn có thể nhận thông báo và trả lời trên màn hình.</small>}
          <div>
            <button className="rx-accept" onClick={answer} disabled={aiStarting}>
              <Phone size={22} /> {aiStarting ? "Đang kết nối AI…" : m!.voiceConfigured && m!.voiceEnabled ? "Trả lời bằng AI" : "Nhận thông báo"}
            </button>
            <button className="rx-decline" onClick={decline}>
              <PhoneOff size={22} /> Từ chối
            </button>
          </div>
        </div>
      )}
      {m!.joined && inc && !inc.closed && !aiLive && !talking && (!partnerInc || ["CONNECTED", "CONFIRMED"].includes(partnerInc.call.status)) && (
        <section className="rx-card">
          <h3>Nói với AI · AI tổng hợp cho {view.userName}</h3>
          <p>{!m!.voiceConfigured ? "Máy điều phối chưa cấu hình AI thật. Bạn vẫn có thể trả lời bằng chữ ở dưới." : !m!.voiceEnabled ? "Người điều phối cần bật AI cho phiên này trước khi bắt đầu hội thoại." : "Mỗi người có một phiên AI riêng. Dùng tai nghe; micro và giọng nói được kết nối tới OpenAI khi bạn bắt đầu."}</p>
          <button className="primary" disabled={aiStarting || !m!.voiceConfigured || !m!.voiceEnabled} onClick={() => void run(startAI)}><Phone size={16} />{aiStarting ? "Đang kết nối AI…" : "Nói với Guardian AI"}</button>
        </section>
      )}
      {(aiLive || talking) && (
        <section className="rx-card rx-call">
          <div className={"rx-orb " + (aiSpeaking || talking === "connected" ? "speaking" : "")} />
          <b>
            {talking === "connected"
              ? `Đang nói chuyện với ${view.userName}`
              : talking === "calling"
                ? `Đang gọi ${view.userName}…`
                : userSpeaking ? "AI đang nghe bạn" : aiSpeaking ? "AI đang trả lời" : "Micro đang mở · bạn có thể nói"}
          </b>
          {aiLive && <small>Bạn đang nói riêng với Guardian AI. Thông tin hỗ trợ được tổng hợp cho {view.userName}.</small>}
          {aiLive && micLabel && <small>{micLabel}</small>}
          <div className="rx-lines">
            {lines.map((l, n) => (
              <p key={n}>
                <span>{l.speaker}</span>
                {l.text}
              </p>
            ))}
          </div>
          <button className="rx-decline" onClick={() => (talking ? endTalk() : endAI())}>
            <PhoneOff size={16} /> Kết thúc
          </button>
        </section>
      )}
      {m!.joined && !inc && (
        <section className="rx-idle">
          <span className="pulse-dot" />
          {isPartner
            ? m!.onDuty
              ? "Đang trực · chờ cuộc gọi"
              : "Đang nghỉ · không nhận cuộc gọi"
            : `Đang chờ · bạn sẽ được báo khi ${view.userName} cần`}
        </section>
      )}
      {partnerInc && (
        <section className="rx-card">
          {!partnerInc.closed && ["RINGING", "CONNECTED", "CONFIRMED"].includes(partnerInc.call.status) && <>
            <h3>Trao đổi điều kiện tiếp nhận</h3>
            {partnerInc.questions.map((q,n) => <p key={n}>{q}</p>)}
            <p>{partnerInc.support?.missing.join("; ")}</p>
            <label>Phản hồi của bạn (quyết định, loại hỗ trợ, cửa vào, điều kiện, thời hạn nếu có)
              <textarea value={partnerText} onChange={e => setPartnerText(e.target.value)} placeholder="Tôi đồng ý tiếp nhận, có chỗ chờ. Cửa vào: … Điều kiện: …" />
            </label>
            <button disabled={!partnerText.trim()} onClick={() => void run(() => post(base + "/reply", { callId: partnerInc.call.id, generation: partnerInc.call.generation, text: partnerText }))}>Gửi phản hồi / cập nhật</button>
            {partnerInc.planId && <button onClick={() => void run(() => post(base + "/handoff", { callId: partnerInc.call.id, planId: partnerInc.planId }))}>Đã tiếp nhận người dùng</button>}
          </>}
          <div className="rx-status">
            <span className={"place-status " + partnerInc.call.status}>{partnerInc.call.status}</span>
            <small>Cuộc gọi lúc {clock(partnerInc.call.startedAt)}</small>
          </div>
          {partnerInc.closed ? (
            <>
              <h2>Sự cố đã kết thúc</h2>
              <p>Cảm ơn bạn đã tham gia mạng lưới Guardian.</p>
              {["CONFIRMED", "CONNECTED", "DECLINED"].includes(partnerInc.call.status) && (
                <button
                  disabled={partnerInc.call.falseAlarm}
                  onClick={() => void run(() => post(base + "/false-alarm", { callId: partnerInc.call.id }))}
                >
                  <TriangleAlert size={14} />
                  {partnerInc.call.falseAlarm ? "Đã báo cáo báo động giả" : "Báo cáo báo động giả"}
                </button>
              )}
            </>
          ) : partnerInc.call.status === "CONFIRMED" ? (
            <>
              <h2>{partnerInc.selectedHere ? "Người cần hỗ trợ đang tới chỗ bạn" : "Bạn là phương án dự phòng"}</h2>
              <p>Mức hỗ trợ {partnerInc.riskLevel}/4 · cách {partnerInc.distance} m</p>
              {partnerInc.appearance && (
                <p className="rx-id-card">
                  <b>Nhận diện:</b> {partnerInc.appearance}
                </p>
              )}
              {partnerInc.where && (
                <p className="rx-where">
                  <MapPin size={14} /> Đang ở {partnerInc.where}
                </p>
              )}
              {partnerInc.location && (
                <a className="rx-link" href={maps(partnerInc.location.lat, partnerInc.location.lng)} target="_blank" rel="noreferrer">
                  <Navigation size={14} /> Xem vị trí trên bản đồ ({clock(partnerInc.location.observedAt)})
                </a>
              )}
              <p className="rx-fine">Chỉ cần cho vào chỗ sáng, có người. Gọi 113 nếu thấy nguy hiểm.</p>
              <button onClick={() => void run(() => post(base + "/decide", { callId: partnerInc.call.id, accept: false, note: "Không còn tiếp nhận được" }))}>
                Không thể tiếp nhận nữa
              </button>
            </>
          ) : ["RINGING", "CONNECTED"].includes(partnerInc.call.status) ? (
            <>
              <h2>Có người cần nơi chờ an toàn</h2>
              <p>
                Cách {partnerInc.distance} m · mức hỗ trợ {partnerInc.riskLevel}/4
                {partnerInc.appearance ? ` · ${partnerInc.appearance}` : ""}
              </p>
              {partnerInc.call.status === "CONNECTED" && (
                <div className="rx-actions">
                  <button className="primary" onClick={() => void run(() => post(base + "/decide", { callId: partnerInc.call.id, accept: true }))}>
                    <Check size={15} /> Tiếp nhận
                  </button>
                  <button onClick={() => void run(() => post(base + "/decide", { callId: partnerInc.call.id, accept: false }))}>
                    Không thể
                  </button>
                </div>
              )}
            </>
          ) : (
            <p>Cuộc gọi đã kết thúc ({partnerInc.call.status}).</p>
          )}
        </section>
      )}
      {contactInc && (
        <section className="rx-card">
          {!contactInc.closed && <div className="rx-actions">
            <label>Thời gian đến do bạn tự cung cấp (phút)<input type="number" min="0" max="1440" value={arrivalMinutes} onChange={e => setArrivalMinutes(e.target.value)} /></label>
            <button onClick={() => void run(() => post(base + "/contact", { action: "KEEP_CONTACT" }))}>Có thể giữ liên lạc</button>
            <button onClick={() => void run(() => post(base + "/contact", { action: "ON_THE_WAY", ...(arrivalMinutes !== "" ? { arrivalMinutes: Number(arrivalMinutes) } : {}) }))}>Có thể đi đón</button>
            <button onClick={() => void run(() => post(base + "/contact", { action: "CANNOT_HELP" }))}>Không thể giúp</button>
          </div>}
          {contactInc.covert && !contactInc.closed && (
            <p className="rx-covert">
              <TriangleAlert size={14} /> SOS BÍ MẬT · đừng gọi điện thoại trực tiếp, chỉ theo dõi
            </p>
          )}
          <h2>
            {contactInc.trip?.status === "ARRIVED"
              ? `✅ ${view.userName} đã về tới ${contactInc.trip.label} an toàn`
              : contactInc.closed
                ? `${view.userName} đã kết thúc sự cố`
                : contactInc.sos
                  ? `${view.userName} đang cần hỗ trợ`
                  : contactInc.sharing
                    ? `${view.userName} đang chia sẻ vị trí, nhờ bạn để ý`
                    : `${view.userName} đang được Guardian đồng hành`}
          </h2>
          {contactInc.trip && contactInc.trip.status !== "ARRIVED" && (
            <p>
              Chuyến về {contactInc.trip.label} · {contactInc.trip.status}
              {contactInc.trip.checkinReason ? ` · ${contactInc.trip.checkinReason}` : ""} · dự kiến{" "}
              {clock(contactInc.trip.expectedBy)}
            </p>
          )}
          {contactInc.evidence && (
            <p className="rx-dest">
              <ShieldCheck size={15} /> {view.userName} đã mất liên lạc. Hồ sơ bằng chứng (vị trí cuối, lời khai, đường đi) đã được niêm phong ·{" "}
              <a href={`${base}/evidence`} target="_blank" rel="noreferrer">Mở hồ sơ</a> · mã {contactInc.evidence.hash}
            </p>
          )}
          {contactInc.destination && (
            <p className="rx-dest">
              <ShieldCheck size={15} /> Đang tới <b>{contactInc.destination.name}</b> (đã xác nhận tiếp
              nhận · kế hoạch v{contactInc.destination.revision})
            </p>
          )}
          {contactInc.where && (
            <p className="rx-where">
              <MapPin size={14} /> {contactInc.where}
              {contactInc.nav && !contactInc.nav.arrived && contactInc.nav.remaining !== null
                ? ` · còn ${contactInc.nav.remaining} m tới ${contactInc.nav.target}`
                : contactInc.nav?.arrived
                  ? ` · đã tới ${contactInc.nav.target}`
                  : ""}
              {contactInc.nav?.offRoute ? " · ĐANG ĐI LỆCH TUYẾN" : ""}
            </p>
          )}
          {contactInc.appearance && <p className="rx-id-card">Nhận diện: {contactInc.appearance}</p>}
          <a className="rx-link" href={maps(contactInc.location.lat, contactInc.location.lng)} target="_blank" rel="noreferrer">
            <MapPin size={14} /> Vị trí {contactInc.location.kind === "MOCK" ? "mô phỏng" : "GPS"} lúc{" "}
            {clock(contactInc.location.observedAt)}
            {contactInc.location.stale ? " · ĐÃ CŨ" : ""}
          </a>
          {(contactInc.sos || contactInc.sharing) && !contactInc.closed && (
            <details>
              <summary>Liên lạc trực tiếp (tùy chọn)</summary>
              <p className="rx-fine">Cuộc gọi này nói trực tiếp với {view.userName} và sẽ kết thúc cuộc thoại AI của bạn. Để AI thu thập khả năng hỗ trợ, dùng Nói với Guardian AI ở trên.</p>
              <button disabled={!!talking} onClick={talk}>
                <Phone size={15} /> Gọi trực tiếp cho {view.userName}
              </button>
            </details>
          )}
          <div className="rx-feed">
            {contactInc.events.map((e) => (
              <p key={e.id}>
                <time>{clock(e.time)}</time> {e.summary}
              </p>
            ))}
          </div>
        </section>
      )}
      <footer className="rx-fine">
        Guardian là công cụ hỗ trợ, không thay thế 113. Link này là khóa riêng của bạn, đừng chia sẻ.
      </footer>
    </main>
  );
}
