"use client";
import { LiveUpdates, type LiveUpdateOptions } from "@/lib/live-updates";
// Browser-side voice plumbing: OpenAI Realtime over WebRTC, peer-to-peer calls, ringtone.
export async function post<T = unknown>(url: string, body: unknown = {}) {
  const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as T;
}
// Live updates from `${base}/stream` (SSE). Some proxies never deliver SSE (Cloudflare quick
// tunnels), so if nothing arrives within 3 s we switch to polling `${base}/poll` every 1.5 s.
export function subscribe<S, G>(
  base: string,
  on: { state: (s: S) => void; signal: (g: G) => void; online: (v: boolean) => void; error?: (message: string, status: number) => void },
) {
  let got = false,
    stopped = false,
    after: number | null = null,
    timer = 0,
    polling = false;
  const es = new EventSource(base + "/stream");
  es.onmessage = (e) => {
    got = true;
    on.state(JSON.parse(e.data));
    on.online(true);
  };
  es.addEventListener("signal", (e) => on.signal(JSON.parse((e as MessageEvent).data)));
  es.onerror = () => { on.online(false); startPolling(); };
  const poll = async () => {
    if (stopped) return;
    try {
      const res = await fetch(`${base}/poll${after === null ? "" : `?after=${after}`}`, { cache: "no-store" });
      if (!res.ok) {
        if ([404, 410].includes(res.status)) {
          on.error?.("Link mời không còn tồn tại trên máy chủ này. Hãy mở lại link từ mục Mạng lưới của đúng phiên đang gọi.", res.status);
          es.close(); stopped = true;
        }
        throw new Error();
      }
      const d = (await res.json()) as { state: S; signals: G[]; seq: number };
      if (stopped) return;
      on.state(d.state);
      d.signals.forEach(on.signal);
      after = d.seq;
      on.online(true);
    } catch {
      on.online(false);
    }
    timer = window.setTimeout(poll, 1500);
  };
  const startPolling = () => {
    if (polling || stopped) return;
    polling = true; es.close(); void poll();
  };
  const fallback = window.setTimeout(() => { if (!got) startPolling(); }, 3000);
  return () => {
    stopped = true;
    es.close();
    clearTimeout(fallback);
    clearTimeout(timer);
  };
}
// The microphone chosen in the companion panel; empty = system default.
export const micKey = "guardian-mic";
export function savedMic() {
  try {
    return localStorage.getItem(micKey) || "";
  } catch {
    return "";
  }
}
// Virtual / loopback inputs are silent unless their app runs; never pick them by default.
const virtualMic = /virtual|voice ?changer|stereo mix|cable|voicemeeter|loopback/i;
const capture = (deviceId?: string) =>
  navigator.mediaDevices.getUserMedia({
    audio: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
export const micStream = async () => {
  const chosen = savedMic();
  if (chosen) {
    try {
      return await capture(chosen);
    } catch {} // device unplugged: fall back to automatic choice
  }
  const stream = await capture();
  if (!virtualMic.test(stream.getAudioTracks()[0]?.label || "")) return stream;
  const real = (await navigator.mediaDevices.enumerateDevices()).find(
    (d) =>
      d.kind === "audioinput" &&
      !["default", "communications"].includes(d.deviceId) &&
      !virtualMic.test(d.label),
  );
  if (!real) return stream;
  stream.getTracks().forEach((t) => t.stop());
  return capture(real.deviceId);
};
// 0..1 loudness of a stream, for the on-screen mic meter.
export function meter(stream: MediaStream) {
  unlockAudio();
  const analyser = audioCtx!.createAnalyser(),
    data = new Uint8Array(512);
  analyser.fftSize = 512;
  audioCtx!.createMediaStreamSource(stream).connect(analyser);
  return () => {
    analyser.getByteTimeDomainData(data);
    let peak = 0;
    for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
    return Math.min(1, peak / 64);
  };
}
export type RealtimeHandlers = {
  onTool?: (name: string, args: Record<string, unknown>) => Promise<string>;
  onTranscript?: (speaker: "USER" | "AI", text: string, itemId?: string) => void;
  onInputCommitted?: (itemId: string) => void;
  onTranscriptionFailed?: (itemId: string) => void;
  onSpeaking?: (ai: boolean) => void;
  onUserSpeaking?: (speaking: boolean) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
  // Mixed mic + AI audio, delivered every 10 s so evidence survives a lost phone.
  onRecording?: (chunk: Blob, seq: number, mime: string) => void;
};
export type RealtimeSession = {
  notify: (text: string, options?: LiveUpdateOptions) => void;
  say: (instruction: string) => void;
  pause: (paused: boolean) => void;
  close: () => void;
  level: () => number;
  recording: boolean;
  micLabel: string;
};
// Connects the browser directly to OpenAI with a short-lived key minted by our backend.
export async function connectRealtime(
  mint: () => Promise<{ value: string }>,
  h: RealtimeHandlers,
  greet = true,
): Promise<RealtimeSession> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error("Micro cần HTTPS trên điện thoại. Hãy mở link HTTPS của cùng phiên Guardian.");
  // Mint failure must not leave a microphone stream running in the background.
  const mic = await micStream();
  let value: string;
  try { ({ value } = await mint()); } catch (error) { mic.getTracks().forEach(t => t.stop()); throw error; }
  const pc = new RTCPeerConnection(),
    audio = new Audio();
  audio.autoplay = true;
  let recorder: MediaRecorder | undefined, mix: MediaStreamAudioDestinationNode | undefined;
  if (h.onRecording && typeof MediaRecorder !== "undefined") {
    try {
      unlockAudio();
      mix = audioCtx!.createMediaStreamDestination();
      audioCtx!.createMediaStreamSource(mic).connect(mix);
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(mix.stream, mime ? { mimeType: mime } : undefined);
      let seq = 0;
      rec.ondataavailable = (e) => { if (e.data.size) h.onRecording!(e.data, seq++, rec.mimeType.split(";")[0]); };
      rec.start(10000);
      recorder = rec;
    } catch { recorder = undefined; } // recording is best effort; the conversation must still work
  }
  pc.ontrack = (e) => {
    audio.srcObject = e.streams[0];
    void audio.play().catch(() => h.onError?.("Trình duyệt đang chặn âm thanh. Chạm nút nghe AI để thử lại."));
    try { if (mix) audioCtx!.createMediaStreamSource(e.streams[0]).connect(mix); } catch {}
  };
  mic.getTracks().forEach((t) => pc.addTrack(t, mic));
  const dc = pc.createDataChannel("oai-events"),
    level = meter(mic);
  let responding = false,
    userSpeaking = false,
    audioPlaying = false,
    closed = false;
  const queue = new LiveUpdates();
  const send = (event: unknown) => {
    if (dc.readyState === "open") dc.send(JSON.stringify(event));
  };
  // System updates wait until neither side is talking, then the agent relays them.
  const flush = () => {
    if (closed || dc.readyState !== "open" || responding || audioPlaying || userSpeaking || !queue.size) return;
    send({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "system",
        content: [
          { type: "input_text", text: "[CẬP NHẬT HỆ THỐNG] " + queue.drain() },
        ],
      },
    });
    responding = true;
    send({ type: "response.create" });
  };
  const timer = setInterval(flush, 1200);
  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    // stop() flushes the last partial chunk through ondataavailable.
    try { if (recorder?.state !== "inactive") recorder?.stop(); } catch {}
    try {
      dc.close();
    } catch {}
    pc.close();
    mic.getTracks().forEach((t) => t.stop());
    audio.srcObject = null;
    h.onEnd?.();
  };
  dc.onopen = () => {
    if (queue.size) flush();
    else if (greet) {
      responding = true;
      send({ type: "response.create" });
    }
  };
  dc.onmessage = async (msg) => {
    let e;
    try { e = JSON.parse(msg.data); } catch { return; }
    switch (e.type) {
      case "input_audio_buffer.speech_started":
        userSpeaking = true;
        h.onUserSpeaking?.(true);
        break;
      case "input_audio_buffer.speech_stopped":
        userSpeaking = false;
        h.onUserSpeaking?.(false);
        break;
      case "input_audio_buffer.committed":
        if (e.item_id) h.onInputCommitted?.(e.item_id);
        break;
      case "conversation.item.input_audio_transcription.failed":
        h.onTranscriptionFailed?.(e.item_id);
        h.onError?.("Không nhận được bản chép lời. Hãy nói lại hoặc nhập phản hồi bằng chữ.");
        break;
      case "response.created":
        responding = true;
        break;
      case "output_audio_buffer.started":
        audioPlaying = true;
        h.onSpeaking?.(true);
        break;
      case "output_audio_buffer.stopped":
      case "output_audio_buffer.cleared":
        audioPlaying = false;
        h.onSpeaking?.(false);
        flush();
        break;
      case "conversation.item.input_audio_transcription.completed":
        if (e.transcript?.trim()) h.onTranscript?.("USER", e.transcript.trim(), e.item_id);
        else h.onTranscriptionFailed?.(e.item_id);
        break;
      case "response.output_audio_transcript.done":
      case "response.audio_transcript.done":
        if (e.transcript?.trim()) h.onTranscript?.("AI", e.transcript.trim(), e.item_id);
        break;
      case "error":
        h.onError?.(e.error?.message || "Lỗi Realtime");
        break;
      case "response.done": {
        if (e.response?.status === "cancelled") {
          responding = false;
          flush();
          break;
        }
        const calls = (e.response?.output || []).filter(
          (o: { type: string }) => o.type === "function_call",
        );
        if (!calls.length) {
          responding = false;
          flush();
          break;
        }
        for (const c of calls) {
          let output: string;
          try {
            output = h.onTool
              ? await h.onTool(c.name, JSON.parse(c.arguments || "{}"))
              : "Không hỗ trợ";
          } catch (err) {
            output = "Lỗi: " + (err instanceof Error ? err.message : String(err));
          }
          send({
            type: "conversation.item.create",
            item: { type: "function_call_output", call_id: c.call_id, output },
          });
        }
        responding = false;
        if (queue.size) flush();
        else {
          responding = true;
          send({ type: "response.create" });
        }
        break;
      }
    }
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed") h.onError?.("Kết nối thoại AI thất bại. Kiểm tra mạng rồi bấm nói với AI để thử lại.");
    if (["failed", "closed"].includes(pc.connectionState)) close();
  };
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const res = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      body: offer.sdp,
      headers: { Authorization: `Bearer ${value}`, "Content-Type": "application/sdp" },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`OpenAI Realtime HTTP ${res.status}: ${await res.text()}`);
    await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });
  } catch (e) {
    close();
    throw e;
  }
  return {
    notify(text, options) {
      queue.add(text, options?.key);
      // Stop obsolete spoken guidance when an accepted plan becomes invalid.
      // Never cut off the user's own speech; response.done unlocks the new snapshot.
      if (options?.interrupt && !userSpeaking && dc.readyState === "open") {
        if (responding) send({ type: "response.cancel" });
        if (audioPlaying) send({ type: "output_audio_buffer.clear" });
      }
      flush();
    },
    say(instruction) {
      send({ type: "response.create", response: { instructions: instruction } });
    },
    pause(paused) {
      mic.getAudioTracks().forEach((t) => (t.enabled = !paused));
      audio.muted = paused;
    },
    close,
    level,
    recording: !!recorder,
    micLabel: mic.getAudioTracks()[0]?.label || "Micro mặc định",
  };
}
// Peer-to-peer voice between two Guardian devices; signaling goes through our SSE + POST.
const iceServers = [{ urls: "stun:stun.l.google.com:19302" }];
async function settled(pc: RTCPeerConnection) {
  if (pc.iceGatheringState === "complete") return;
  await new Promise<void>((resolve) => {
    const done = () => resolve();
    pc.addEventListener("icegatheringstatechange", () => {
      if (pc.iceGatheringState === "complete") done();
    });
    setTimeout(done, 2500); // ponytail: no trickle ICE; fine on LAN / one tunnel.
  });
}
export type Peer = { pc: RTCPeerConnection; close: () => void };
function peer(stream: MediaStream): Peer {
  const pc = new RTCPeerConnection({ iceServers }),
    audio = new Audio();
  audio.autoplay = true;
  pc.ontrack = (e) => (audio.srcObject = e.streams[0]);
  stream.getTracks().forEach((t) => pc.addTrack(t, stream));
  return {
    pc,
    close() {
      pc.close();
      stream.getTracks().forEach((t) => t.stop());
      audio.srcObject = null;
    },
  };
}
export async function callOffer() {
  const p = peer(await micStream());
  await p.pc.setLocalDescription(await p.pc.createOffer());
  await settled(p.pc);
  return { peer: p, sdp: p.pc.localDescription!.sdp };
}
export async function callAnswer(offer: string) {
  const p = peer(await micStream());
  await p.pc.setRemoteDescription({ type: "offer", sdp: offer });
  await p.pc.setLocalDescription(await p.pc.createAnswer());
  await settled(p.pc);
  return { peer: p, sdp: p.pc.localDescription!.sdp };
}
let audioCtx: AudioContext | null = null;
// Call from a click handler once so later ringtones are allowed to play.
export function unlockAudio() {
  audioCtx ??= new AudioContext();
  void audioCtx.resume();
}
export function ring(): () => void {
  unlockAudio();
  const ctx = audioCtx!;
  let stopped = false;
  const beep = () => {
    if (stopped) return;
    for (const [f, at] of [
      [880, 0],
      [660, 0.25],
    ]) {
      const o = ctx.createOscillator(),
        g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.2, ctx.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + 0.22);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + at);
      o.stop(ctx.currentTime + at + 0.23);
    }
    navigator.vibrate?.([300, 150, 300]);
  };
  beep();
  const t = setInterval(beep, 1500);
  return () => {
    stopped = true;
    clearInterval(t);
    navigator.vibrate?.(0);
  };
}
