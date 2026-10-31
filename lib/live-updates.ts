const MAX_QUEUED_UPDATES = 16;

export type LiveUpdateOptions = {
  key?: string;
  interrupt?: boolean;
};

type QueuedLiveUpdate = {
  text: string;
  key?: string;
};

// A queued plan snapshot is replaceable. Do not read obsolete plans after a long reply.
export class LiveUpdates {
  private items: QueuedLiveUpdate[] = [];

  add(text: string, key?: string): void {
    // A replacement moves to the end, preserving the order of other notices.
    if (key) this.items = this.items.filter((item) => item.key !== key);
    this.items.push({ text, key });
    if (this.items.length > MAX_QUEUED_UPDATES) this.items.shift();
  }

  get size(): number {
    return this.items.length;
  }

  drain(): string {
    const combinedText = this.items.map((item) => item.text).join(" | ");
    this.items = [];
    return combinedText;
  }
}
