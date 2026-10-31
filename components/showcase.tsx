"use client";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, FileText, Pause, Play, RotateCcw, Square, Volume2, VolumeX, SkipForward } from "lucide-react";
import type { Incident } from "@/lib/types";
import { playShowcaseNarration } from "@/lib/showcase-audio";
import { offersOf } from "@/lib/coordination";

const steps = ["Có người bám theo", "Gọi 5 người", "Mỗi người một ý", "AI tổng hợp", "Hỏi đồn công an", "Lên đường", "Cam kết đổi", "Tránh đoạn tối", "Bị tấn công", "Mất liên lạc · gửi hồ sơ"];
export default function Showcase({ state, act, disabled }: {
  state: Omit<Incident, "owner">;
  act: (action: string, data?: object) => Promise<void>;
  disabled: boolean;
}) {
  const demo = state.showcase;
  const running = demo?.status === "RUNNING";
  const [expanded, setExpanded] = useState(false);
  const [speak, setSpeak] = useState(true);
  const [presenter, setPresenter] = useState(false);
  const [useAI, setUseAI] = useState(false);
  const [pace, setPace] = useState<"PRESENTATION" | "BALANCED" | "QUICK">("BALANCED");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState("");
  const [audioStatus, setAudioStatus] = useState("Sẵn sàng đọc tiếng Việt");
  const [replayAudio, setReplayAudio] = useState(0);
  const actRef = useRef(act);
  actRef.current = act;
  useEffect(() => {
    const synthesis = window.speechSynthesis;
    if (!synthesis) { setAudioStatus("Trình duyệt không hỗ trợ giọng đọc · dùng phụ đề"); return; }
    const refresh = () => setVoices(synthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith("vi")));
    refresh(); synthesis.addEventListener("voiceschanged", refresh);
    return () => synthesis.removeEventListener("voiceschanged", refresh);
  }, []);
  useEffect(() => {
    if (!presenter || !demo || state.frozen || !["RUNNING", "COMPLETED"].includes(demo.status)) return;
    const acknowledge = (playback: "FINISHED" | "UNAVAILABLE") => {
      if (demo.status === "RUNNING" && demo.narrationId)
        void actRef.current("demo/narration", { narrationId: demo.narrationId, playback });
    };
    if (!speak || !window.speechSynthesis) { acknowledge("UNAVAILABLE"); return; }
    setAudioStatus("Đang chuẩn bị giọng đọc…");
    const voice = window.speechSynthesis.getVoices().find(v => v.voiceURI === voiceURI)
      ?? window.speechSynthesis.getVoices().find(v => v.lang.toLowerCase().startsWith("vi"));
    return playShowcaseNarration({ synthesis: window.speechSynthesis, createUtterance: text => new SpeechSynthesisUtterance(text), text: demo.narration, voice,
      onStart: () => setAudioStatus("Đang đọc · chờ đọc xong mới chuyển bước"),
      onFinished: () => { setAudioStatus("Đã đọc xong · đang chờ bạn xem tình huống"); acknowledge("FINISHED"); },
      onUnavailable: () => { setAudioStatus("Chưa phát được tiếng · dùng phụ đề. Bấm đọc lại để thử."); acknowledge("UNAVAILABLE"); },
    });
  // Playback acknowledgements and unrelated SSE updates must not restart the voice.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenter, speak, demo?.narrationId, demo?.status, state.id, state.frozen, voiceURI, replayAudio]);
  const changePacing = (nextPace: "PRESENTATION" | "BALANCED" | "QUICK", nextSpeak: boolean) => {
    setPace(nextPace); setSpeak(nextSpeak);
    if (running) void act("demo/pacing", { pace: nextPace, voiceEnabled: nextSpeak });
  };
  const start = () => {
    setPresenter(true);
    // Unlock synthesis inside the click gesture; the actual narration follows via SSE.
    if (speak && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const prime = new SpeechSynthesisUtterance("Mình bắt đầu nhé."); prime.lang = "vi-VN";
      const voice = window.speechSynthesis.getVoices().find(v => v.voiceURI === voiceURI) ?? window.speechSynthesis.getVoices().find(v => v.lang.startsWith("vi"));
      if (voice) prime.voice = voice;
      window.speechSynthesis.speak(prime);
    }
    void act("demo/showcase", { useAI, pace, voiceEnabled: speak });
  };
  return <section className={`showcase ${demo ? "has-demo" : ""}`} aria-label="Demo thi đấu">
    <div className="showcase-head">
      <span className="showcase-brand"><b>Guardian AI</b><small>Biên bản sự việc · {state.id}</small></span>
      <div className="showcase-intro"><b>{demo ? demo.title : "Một lời cầu cứu. Cả mạng lưới cùng phối hợp."}</b>
        <span>{demo ? `${demo.status === "COMPLETED" ? "Hoàn tất" : demo.status === "FAILED" ? "Đã dừng do lỗi" : demo.status === "STOPPED" ? "Đã dừng" : state.frozen ? "Đang tạm dừng" : "Đang trình diễn"} · ${Math.min(demo.step + 1, steps.length)}/${steps.length} chặng` : "Có lời dẫn tiếng Việt · nhịp vừa khoảng 2 phút · 30 địa điểm"}</span>
      </div>
      {state.metrics.sosAt && <span className="showcase-sos" aria-label="Thời gian từ khi SOS">SOS · {String(Math.floor(state.logicalMs / 60000)).padStart(2, "0")}:{String(Math.floor((state.logicalMs % 60000) / 1000)).padStart(2, "0")}</span>}
      <div className="showcase-actions">
        <button className="showcase-launch" disabled={disabled || running} onClick={start}>
          {demo ? <RotateCcw size={15} /> : <Play size={15} />} {demo ? "Chạy lại demo" : "Chạy demo thi đấu"}
        </button>
        {running && <>
          <button disabled={disabled} aria-label={state.frozen ? "Tiếp tục demo" : "Tạm dừng demo"} onClick={() => act("freeze")}>{state.frozen ? <Play size={15} /> : <Pause size={15} />}</button>
          <button disabled={disabled} aria-label="Dừng demo" onClick={() => act("demo/stop")}><Square size={15} /></button>
          <button disabled={disabled || state.frozen || demo.playback === "SKIPPED"} aria-label="Chuyển bước demo" onClick={() => { window.speechSynthesis?.cancel(); void act("demo/narration", { narrationId: demo.narrationId, playback: "SKIPPED" }); }}><SkipForward size={15} /></button>
        </>}
        <button aria-expanded={expanded} aria-label="Chi tiết demo thi đấu" onClick={() => setExpanded(v => !v)}><ChevronDown size={16} /></button>
      </div>
    </div>
    {demo && !expanded && <p className="showcase-line" role="status">{demo.error ?? demo.narration}</p>}
    {expanded && <div className="showcase-body">
      <div className="showcase-options">
        <label><input type="checkbox" checked={useAI} disabled={running || !state.ai.enabled} onChange={e => setUseAI(e.target.checked)} /> Dùng model thật {state.ai.enabled ? "· có sử dụng quota" : "· bật AI trước"}</label>
        <label>Nhịp demo <select aria-label="Nhịp demo" value={pace} onChange={e => changePacing(e.target.value as "PRESENTATION" | "BALANCED" | "QUICK", speak)}><option value="BALANCED">Vừa · khoảng 2 phút</option><option value="PRESENTATION">Chậm · 3–5 phút</option><option value="QUICK">Nhanh · dưới 1 phút khi tắt tiếng</option></select></label>
        <button aria-pressed={speak} onClick={() => changePacing(pace, !speak)}>{speak ? <Volume2 size={14} /> : <VolumeX size={14} />} {speak ? "Lời dẫn: bật" : "Lời dẫn: tắt"}</button>
      </div>
      <div className="showcase-audio-controls"><label>Giọng đọc <select aria-label="Giọng đọc tiếng Việt" value={voiceURI} onChange={e => setVoiceURI(e.target.value)}><option value="">Tự chọn giọng tiếng Việt của thiết bị</option>{voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>)}</select></label>
        {demo && <button disabled={!speak || state.frozen} onClick={async () => { if (running) await act("demo/narration", { narrationId: demo.narrationId, playback: "REPLAY" }); setPresenter(true); setReplayAudio(v => v + 1); }}><Volume2 size={14} /> {presenter ? "Đọc lại bước này" : "Phát lời dẫn tại tab này"}</button>}
        <span role="status">{state.frozen ? "Đã tạm dừng lời dẫn" : !presenter && demo ? "Chỉ tab khởi chạy tự phát lời dẫn để tránh chồng tiếng" : speak ? audioStatus : "Đang dùng phụ đề, không phát tiếng"}</span>
      </div>
      {demo ? <>
        <p className="showcase-narration" role="status">{demo.error ?? demo.narration}</p>
        <ol className="showcase-steps" aria-label="Tiến trình demo">{steps.map((label, index) => <li key={label} aria-current={index === demo.step ? "step" : undefined} className={index < demo.step || demo.status === "COMPLETED" ? "done" : index === demo.step ? "current" : ""}><span>{index < demo.step ? <CheckCircle2 size={13} /> : index + 1}</span>{label}</li>)}</ol>
        <div className="showcase-facts"><span><b>{offersOf(state).length}</b> người góp ý</span><span><b>{state.metrics.maxConcurrentCalls}</b> nhánh song song</span><span><b>{state.calls.reduce((n, c) => n + (c.questions?.length ?? 0), 0)}</b> lượt hỏi</span><span><b>{state.plans.length}</b> phiên bản kế hoạch</span><span><b>{state.events.filter(e => e.type === "PLAN_INVALIDATED").length}</b> lần dừng phương án cũ</span>
          <a href={`/api/incidents/${state.id}/evidence`} target="_blank" rel="noreferrer"><FileText size={14} /> Xem bằng chứng</a></div>
      </> : <p className="showcase-narration">Lan về muộn, có người bám theo. AI gọi cùng lúc 3 điểm hỗ trợ và 2 người thân; mỗi người đưa một cách giúp khác nhau. AI tổng hợp thành một kế hoạch, cân nhắc khi Lan hỏi đồn công an, đổi nơi khi cam kết bị rút, tránh đoạn tối; rồi Lan bị tấn công, mất liên lạc và hồ sơ bằng chứng được niêm phong, gửi cho người thân. Bản đồ tự lia theo từng chặng; lời dẫn tạo từ quyết định thật của hệ thống.</p>}
      <small>Mô phỏng: các vai và việc đồng ý tự chạy. Lời dẫn dùng giọng đọc trình duyệt, không phải hội thoại GPT trực tiếp; có thể phụ thuộc giọng tiếng Việt và mạng của thiết bị. Không liên hệ thành viên thật. Mặc định không dùng API AI; backend vẫn kiểm tra và tính lại kế hoạch.</small>
    </div>}
  </section>;
}
