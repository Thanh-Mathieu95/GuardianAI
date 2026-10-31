import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Incident } from "./types";
import { createHash } from "node:crypto";
const hash = (previous: string, payload: string) =>
  createHash("sha256")
    .update(previous + "\n" + payload)
    .digest("hex");
export class Store {
  db: DatabaseSync;
  constructor(
    filename = process.env.GUARDIAN_DB_PATH || "./data/guardian.sqlite",
  ) {
    if (filename !== ":memory:")
      mkdirSync(
        path.dirname(path.resolve(/* turbopackIgnore: true */ filename)),
        { recursive: true },
      );
    this.db = new DatabaseSync(filename);
    this.db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS incidents(id TEXT PRIMARY KEY, owner TEXT NOT NULL, updated_at TEXT NOT NULL, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS event_snapshots(id TEXT PRIMARY KEY,incident_id TEXT NOT NULL,time TEXT NOT NULL,payload TEXT NOT NULL); CREATE INDEX IF NOT EXISTS owner_idx ON incidents(owner);",
    );
    // Evidence is retained until an explicit deletion. Opening the app must not erase it.
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS report_revisions(incident_id TEXT NOT NULL,seq INTEGER NOT NULL,time TEXT NOT NULL,payload TEXT NOT NULL,previous_hash TEXT NOT NULL,hash TEXT NOT NULL,PRIMARY KEY(incident_id,seq))",
    );
  }
  save(i: Incident) {
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare("INSERT OR REPLACE INTO incidents VALUES(?,?,?,?)")
        .run(i.id, i.owner, i.updatedAt, JSON.stringify(i));
      const e = i.events.at(-1);
      if (e)
        this.db
          .prepare("INSERT OR IGNORE INTO event_snapshots VALUES(?,?,?,?)")
          .run(e.id, i.id, e.time, JSON.stringify(i));
      // Persist non-event updates too (voice transcripts, navigation and route decisions).
      // No owner/session credentials in the exportable report snapshot.
      const { owner: _, ...snapshot } = i;
      const payload = JSON.stringify(snapshot);
      const previous = this.db
        .prepare(
          "SELECT seq,payload,hash FROM report_revisions WHERE incident_id=? ORDER BY seq DESC LIMIT 1",
        )
        .get(i.id);
      if (previous?.payload !== payload) {
        const previousHash = String(previous?.hash ?? "");
        this.db
          .prepare("INSERT INTO report_revisions VALUES(?,?,?,?,?,?)")
          .run(
            i.id,
            Number(previous?.seq ?? 0) + 1,
            new Date().toISOString(),
            payload,
            previousHash,
            hash(previousHash, payload),
          );
      }
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  load(id: string): Incident | undefined {
    const r = this.db
      .prepare("SELECT payload FROM incidents WHERE id=?")
      .get(id);
    return r ? JSON.parse(r.payload as string) : undefined;
  }
  latest(owner: string): Incident | undefined {
    const r = this.db
      .prepare(
        "SELECT payload FROM incidents WHERE owner=? ORDER BY updated_at DESC LIMIT 1",
      )
      .get(owner);
    return r ? JSON.parse(r.payload as string) : undefined;
  }
  replay(id: string): Incident[] {
    return this.db
      .prepare(
        "SELECT payload FROM event_snapshots WHERE incident_id=? ORDER BY rowid",
      )
      .all(id)
      .map((r) => JSON.parse(r.payload as string));
  }
  reportHistory(id: string) {
    return this.db
      .prepare(
        "SELECT seq,time,payload,previous_hash,hash FROM report_revisions WHERE incident_id=? ORDER BY seq",
      )
      .all(id)
      .map((r) => ({
        sequence: Number(r.seq),
        recordedAt: String(r.time),
        previousHash: String(r.previous_hash),
        hash: String(r.hash),
        snapshot: JSON.parse(String(r.payload)) as Omit<Incident, "owner">,
      }));
  }
  reportIntegrity(id: string) {
    const rows = this.db
      .prepare(
        "SELECT seq,payload,previous_hash,hash FROM report_revisions WHERE incident_id=? ORDER BY seq",
      )
      .all(id);
    let previous = "",
      sequence = 0;
    for (const row of rows) {
      sequence++;
      if (
        Number(row.seq) !== sequence ||
        row.previous_hash !== previous ||
        row.hash !== hash(previous, String(row.payload))
      )
        return {
          valid: false,
          revisions: rows.length,
          brokenAt: Number(row.seq),
          headHash: previous,
        };
      previous = String(row.hash);
    }
    return {
      valid: true,
      revisions: rows.length,
      brokenAt: null,
      headHash: previous,
    };
  }
  deleteReportHistory(id: string) {
    this.db.prepare("DELETE FROM report_revisions WHERE incident_id=?").run(id);
  }
}
