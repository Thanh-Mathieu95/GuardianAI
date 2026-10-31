// Per voice connection: tools must wait for the original audio transcription
// and its persistence, rather than treating the model's tool arguments as evidence.
export class TranscriptQueue {
  private chain: Promise<void> = Promise.resolve();
  private pending = new Map<string, { done: Promise<void>; resolve: () => void }>();
  private seen = new Set<string>();
  private failed = false;
  expect(id: string) {
    if (!id || this.seen.has(id) || this.pending.has(id)) return;
    let resolve!: () => void;
    const done = new Promise<void>(r => { resolve = r; });
    this.pending.set(id, { done, resolve });
  }
  append(id: string | undefined, write: () => Promise<unknown>) {
    if (id && this.seen.has(id)) return this.chain;
    if (id) this.seen.add(id);
    const next = this.chain.then(async () => { await write(); });
    this.chain = next.catch(() => { this.failed = true; }).finally(() => {
      if (id) { this.pending.get(id)?.resolve(); this.pending.delete(id); }
    });
    return next;
  }
  fail(id: string) {
    this.failed = true; this.pending.get(id)?.resolve(); this.pending.delete(id);
  }
  async ready(timeoutMs = 25000) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          await Promise.all([...this.pending.values()].map(item => item.done));
          await this.chain;
          return !this.failed && this.pending.size === 0;
        })(),
        new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); }),
      ]);
    } finally { if (timer) clearTimeout(timer); }
  }
}
