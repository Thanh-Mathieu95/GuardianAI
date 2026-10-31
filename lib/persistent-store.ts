import { createHash } from "node:crypto";
import { Database } from "./database";
import type { Incident } from "./types";

const hash = (previous: string, payload: string) =>
  createHash("sha256").update(previous + "\n" + payload).digest("hex");

export type LoadedIncident = { incident: Incident; revision: number };

/** Async repository. A returned save is a committed write, never a queued one. */
export class PersistentStore {
  constructor(readonly database: Database) {}

  async load(id: string, owner: string): Promise<LoadedIncident | undefined> {
    const [row] = await this.database.query("SELECT payload, revision FROM incidents WHERE id=? AND owner=?", [id, owner]);
    return row ? { incident: JSON.parse(row.payload), revision: Number(row.revision) } : undefined;
  }

  async latest(owner: string): Promise<LoadedIncident | undefined> {
    const [row] = await this.database.query("SELECT payload, revision FROM incidents WHERE owner=? ORDER BY updated_at DESC LIMIT 1", [owner]);
    return row ? { incident: JSON.parse(row.payload), revision: Number(row.revision) } : undefined;
  }

  async save(incident: Incident, expectedRevision: number): Promise<number> {
    // Capture bytes before awaiting a lock: callers cannot change this write
    // while another transaction is being committed.
    const full = JSON.stringify(incident);
    const { owner: _, ...snapshot } = incident;
    const payload = JSON.stringify(snapshot);
    const event = incident.events.at(-1);
    const id = incident.id, owner = incident.owner, updatedAt = incident.updatedAt;
    return this.database.transaction(async query => {
      const [previous] = await query("SELECT owner, revision FROM incidents WHERE id=?", [id]);
      if (previous && previous.owner !== owner) throw new Error("NOT_FOUND");
      if (Number(previous?.revision ?? 0) !== expectedRevision) throw new Error("REVISION_CONFLICT");
      const next = expectedRevision + 1;
      // Conditional update is the actual compare-and-swap gate. A second
      // transaction cannot overwrite a revision it did not read.
      if (previous) {
        const updated = await query("UPDATE incidents SET updated_at=?,payload=?,revision=? WHERE id=? AND owner=? AND revision=? RETURNING id",
          [updatedAt, full, next, id, owner, expectedRevision]);
        if (!updated.length) throw new Error("REVISION_CONFLICT");
      } else {
        const inserted = await query("INSERT INTO incidents(id,owner,updated_at,payload,revision) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING RETURNING id",
          [id, owner, updatedAt, full, next]);
        if (!inserted.length) throw new Error("REVISION_CONFLICT");
      }
      if (event) await query("INSERT INTO event_snapshots(id,incident_id,time,payload) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING", [event.id, id, event.time, full]);
      const [report] = await query("SELECT seq,payload,hash FROM report_revisions WHERE incident_id=? ORDER BY seq DESC LIMIT 1", [id]);
      if (report?.payload !== payload) {
        const previousHash = String(report?.hash ?? "");
        await query("INSERT INTO report_revisions(incident_id,seq,time,payload,previous_hash,hash) VALUES(?,?,?,?,?,?)",
          [id, Number(report?.seq ?? 0) + 1, updatedAt, payload, previousHash, hash(previousHash, payload)]);
      }
      return next;
    });
  }

  async reportHistory(id: string, owner: string) {
    if (!await this.load(id, owner)) throw new Error("NOT_FOUND");
    return this.database.query("SELECT seq,time,payload,previous_hash,hash FROM report_revisions WHERE incident_id=? ORDER BY seq", [id]);
  }

  async integrity(id: string, owner: string) {
    const rows = await this.reportHistory(id, owner);
    let previous = "", seq = 0;
    for (const row of rows) {
      if (Number(row.seq) !== ++seq || row.previous_hash !== previous || row.hash !== hash(previous, String(row.payload)))
        return { valid: false, revisions: rows.length, brokenAt: seq, headHash: previous };
      previous = String(row.hash);
    }
    return { valid: true, revisions: rows.length, brokenAt: null, headHash: previous };
  }
}
