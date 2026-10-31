"use client";
export type Voice = {
  close: () => void;
  update: (text: string) => void;
  mute: () => boolean;
};
export async function connectVoice(
  mint: () => Promise<{ value: string }>,
  callbacks: {
    transcript: (who: "You" | "Guardian AI", text: string, id: string) => void;
    tool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
    error: (message: string) => void;
    ended: () => void;
    record?: (blob: Blob, seq: number) => void;
  },
): Promise<Voice> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
    throw new Error("MICROPHONE_REQUIRES_HTTPS");
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
  });
  let secret: string;
  try {
    secret = (await mint()).value;
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    throw e;
  }
  const pc = new RTCPeerConnection(),
    audio = new Audio();
  audio.autoplay = true;
  let recorder: MediaRecorder | undefined,
    context: AudioContext | undefined,
    closed = false,
    seq = 0;
  const channel = pc.createDataChannel("oai-events");
  let speaking = false;
  const pending: string[] = [];
  const send = (data: unknown) => {
    if (channel.readyState === "open") channel.send(JSON.stringify(data));
  };
  const flush = () => {
    if (!speaking && pending.length) {
      send({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "system",
          content: [{ type: "input_text", text: pending.splice(0).at(-1) }],
        },
      });
    }
  };
  pc.ontrack = (e) => {
    audio.srcObject = e.streams[0];
    void audio.play().catch(() => callbacks.error("AUDIO_PLAYBACK_BLOCKED"));
    if (callbacks.record && typeof MediaRecorder !== "undefined") {
      context = new AudioContext();
      const destination = context.createMediaStreamDestination();
      context.createMediaStreamSource(stream).connect(destination);
      context.createMediaStreamSource(e.streams[0]).connect(destination);
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg"].find(
        (x) => MediaRecorder.isTypeSupported(x),
      );
      recorder = new MediaRecorder(
        destination.stream,
        mime ? { mimeType: mime } : undefined,
      );
      recorder.ondataavailable = (e) => {
        if (e.data.size) callbacks.record!(e.data, seq++);
      };
      recorder.start(10000);
    }
  };
  stream.getTracks().forEach((t) => pc.addTrack(t, stream));
  const close = () => {
    if (closed) return;
    closed = true;
    if (recorder?.state === "recording") recorder.stop();
    stream.getTracks().forEach((t) => t.stop());
    channel.close();
    pc.close();
    audio.pause();
    audio.srcObject = null;
    void context?.close();
    callbacks.ended();
  };
  channel.onmessage = async (event) => {
    let d;
    try {
      d = JSON.parse(event.data);
    } catch {
      return;
    }
    if (
      d.type === "input_audio_buffer.speech_started" ||
      d.type === "response.created"
    )
      speaking = true;
    if (
      d.type === "input_audio_buffer.speech_stopped" ||
      d.type === "response.done"
    ) {
      speaking = false;
      flush();
    }
    if (d.type === "conversation.item.input_audio_transcription.completed")
      callbacks.transcript("You", d.transcript, d.item_id);
    if (d.type === "response.output_audio_transcript.done")
      callbacks.transcript(
        "Guardian AI",
        d.transcript,
        d.item_id || crypto.randomUUID(),
      );
    if (d.type === "response.function_call_arguments.done") {
      let output;
      try {
        output = await callbacks.tool(d.name, JSON.parse(d.arguments || "{}"));
      } catch {
        output = { error: "ACTION_NOT_COMPLETED" };
      }
      send({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: d.call_id,
          output: JSON.stringify(output),
        },
      });
      send({ type: "response.create" });
    }
    if (d.type === "error") callbacks.error("VOICE_CONNECTION_ERROR");
  };
  channel.onopen = () => send({ type: "response.create" });
  pc.onconnectionstatechange = () => {
    if (["failed", "closed"].includes(pc.connectionState)) close();
  };
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const res = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/sdp",
      },
      body: offer.sdp,
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error("VOICE_CONNECTION_FAILED");
    await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });
  } catch (e) {
    close();
    throw e;
  }
  return {
    close,
    update: (text) => {
      pending.push(text);
      flush();
    },
    mute: () => {
      const track = stream.getAudioTracks()[0];
      track.enabled = !track.enabled;
      return !track.enabled;
    },
  };
}
