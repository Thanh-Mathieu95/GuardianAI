const DEFAULT_START_TIMEOUT_MS = 8_000;
const DEFAULT_FINISH_TIMEOUT_MS = 60_000;

type ShowcaseNarrationOptions = {
  synthesis: Pick<SpeechSynthesis, "cancel" | "speak">;
  createUtterance: (text: string) => SpeechSynthesisUtterance;
  text: string;
  voice?: SpeechSynthesisVoice;
  onStart: () => void;
  onFinished: () => void;
  onUnavailable: () => void;
  startTimeoutMs?: number;
  finishTimeoutMs?: number;
};

/** Browser narration only: completion comes from audio playback, never a fixed estimate. */
export function playShowcaseNarration(
  options: ShowcaseNarrationOptions,
): () => void {
  let disposed = false;
  let settled = false;
  let startTimer: ReturnType<typeof setTimeout> | undefined;
  let finishTimer: ReturnType<typeof setTimeout> | undefined;
  const clearTimers = () => {
    clearTimeout(startTimer);
    clearTimeout(finishTimer);
  };
  const reportUnavailable = () => {
    if (disposed || settled) return;
    settled = true;
    clearTimers();
    options.synthesis.cancel();
    options.onUnavailable();
  };

  try {
    options.synthesis.cancel();
    const utterance = options.createUtterance(options.text);
    utterance.lang = "vi-VN";
    utterance.rate = 1.03;
    if (options.voice) utterance.voice = options.voice;

    utterance.onstart = () => {
      if (disposed || settled) return;
      clearTimeout(startTimer);
      options.onStart();
      finishTimer = setTimeout(
        reportUnavailable,
        options.finishTimeoutMs ?? DEFAULT_FINISH_TIMEOUT_MS,
      );
    };
    utterance.onend = () => {
      if (disposed || settled) return;
      settled = true;
      clearTimers();
      options.onFinished();
    };
    utterance.onerror = reportUnavailable;
    startTimer = setTimeout(
      reportUnavailable,
      options.startTimeoutMs ?? DEFAULT_START_TIMEOUT_MS,
    );
    options.synthesis.speak(utterance);
  } catch {
    reportUnavailable();
  }

  // Pause, stop, next, unmount and changed incident cancel without acknowledging old audio.
  return () => {
    disposed = true;
    clearTimers();
    options.synthesis.cancel();
  };
}
