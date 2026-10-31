export type LiveUpdateOptions = { key?: string; interrupt?: boolean };

// A queued plan snapshot is replaceable. Do not read obsolete plans after a long reply.
export class LiveUpdates {
  private items: { text: string; key?: string }[] = [];
  add(text: string, key?: string) {
    if (key) this.items = this.items.filter(item => item.key !== key);
    this.items.push({ text, key });
    if (this.items.length > 16) this.items.shift();
  }
  get size() { return this.items.length; }
  drain() {
    const result = this.items.map(item => item.text).join(" | ");
    this.items = [];
    return result;
  }
}
