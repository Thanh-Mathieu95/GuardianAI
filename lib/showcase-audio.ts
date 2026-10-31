/** Browser narration only: completion comes from audio playback, never a fixed estimate. */
export function playShowcaseNarration(options: {
  synthesis: Pick<SpeechSynthesis, "cancel" | "speak">;
  createUtterance: (text: string) => SpeechSynthesisUtterance;
  text: string;
  voice?: SpeechSynthesisVoice;
  onStart: () => void;
  onFinished: () => void;
  onUnavailable: () => void;
  startTimeoutMs?: number;
  finishTimeoutMs?: number;
}) {
  let disposed = false, settled = false;
  let startTimer: ReturnType<typeof setTimeout> | undefined;
  let finishTimer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => { clearTimeout(startTimer); clearTimeout(finishTimer); };
  const unavailable = () => {
    if (disposed || settled) return;
    settled = true; clear(); options.synthesis.cancel(); options.onUnavailable();
  };
  try {
    options.synthesis.cancel();
    const utterance = options.createUtterance(options.text);
    utterance.lang = "vi-VN"; utterance.rate = 1.03;
    if (options.voice) utterance.voice = options.voice;
    utterance.onstart = () => {
      if (disposed || settled) return;
      clearTimeout(startTimer); options.onStart();
      finishTimer = setTimeout(unavailable, options.finishTimeoutMs ?? 60000);
    };
    utterance.onend = () => {
      if (disposed || settled) return;
      settled = true; clear(); options.onFinished();
    };
    utterance.onerror = unavailable;
    startTimer = setTimeout(unavailable, options.startTimeoutMs ?? 8000);
    options.synthesis.speak(utterance);
  } catch { unavailable(); }
  // Pause, stop, next, unmount and changed incident cancel without acknowledging old audio.
  return () => { disposed = true; clear(); options.synthesis.cancel(); };
}
