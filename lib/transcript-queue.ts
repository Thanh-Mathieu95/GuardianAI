const DEFAULT_TRANSCRIPT_TIMEOUT_MS = 25_000;

type PendingTranscript = {
  done: Promise<void>;
  resolve: () => void;
};

// Per voice connection: tools must wait for the original audio transcription
// and its persistence, rather than treating the model's tool arguments as evidence.
export class TranscriptQueue {
  private chain: Promise<void> = Promise.resolve();
  private pending = new Map<string, PendingTranscript>();
  private seen = new Set<string>();
  private failed = false;

  expect(id: string): void {
    if (!id || this.seen.has(id) || this.pending.has(id)) return;
    let resolve!: () => void;
    const done = new Promise<void>((resolveDone) => {
      resolve = resolveDone;
    });
    this.pending.set(id, { done, resolve });
  }

  append(id: string | undefined, write: () => Promise<unknown>): Promise<void> {
    if (id && this.seen.has(id)) return this.chain;
    if (id) this.seen.add(id);
    const writeResult = this.chain.then(async () => {
      await write();
    });

    // Later writes still run after a failure, but readiness stays blocked.
    this.chain = writeResult
      .catch(() => {
        this.failed = true;
      })
      .finally(() => {
        if (id) this.completePending(id);
      });

    // The caller must still receive the original persistence error.
    return writeResult;
  }

  fail(id: string): void {
    this.failed = true;
    this.completePending(id);
  }

  private completePending(id: string): void {
    this.pending.get(id)?.resolve();
    this.pending.delete(id);
  }

  async ready(timeoutMs = DEFAULT_TRANSCRIPT_TIMEOUT_MS): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          await Promise.all(
            [...this.pending.values()].map((item) => item.done),
          );
          await this.chain;
          return !this.failed && this.pending.size === 0;
        })(),
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(false), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
