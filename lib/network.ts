import { randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
export type Role = "CONTACT" | "PARTNER";
export type Member = {
  id: string;
  owner: string;
  role: Role;
  name: string;
  token: string;
  category: string;
  lat: number | null;
  lng: number | null;
  onDuty: boolean;
  joined: boolean;
  createdAt: string;
  // Simulated city: which store on the map this partner answers for (null = own address).
  slot: string | null;
};
export type Settings = {
  userName: string;
  safePhrase: string;
  fakeCaller: string;
  appearance: string;
  reputation: number;
};
const defaults: Settings = {
  userName: "Lan",
  safePhrase: "tối nay nấu canh chua nhé",
  fakeCaller: "Mẹ",
  appearance: "",
  reputation: 0,
};
// Anti-spam limits. ponytail: fixed constants, move to per-org config when partners negotiate SLAs.
export const SOS_PER_HOUR = Number(process.env.SOS_PER_HOUR) || 3;
export const RINGS_PER_PARTNER_HOUR = 5;
export const MIN_REPUTATION = -2;
const hourAgo = () => new Date(Date.now() - 3600000).toISOString();
const row = (r: Record<string, unknown>): Member => ({
  id: r.id as string,
  owner: r.owner as string,
  role: r.role as Role,
  name: r.name as string,
  token: r.token as string,
  category: r.category as string,
  lat: r.lat as number | null,
  lng: r.lng as number | null,
  onDuty: !!r.on_duty,
  joined: !!r.joined,
  createdAt: r.created_at as string,
  slot: (r.slot as string | null) ?? null,
});
export class Network {
  constructor(private db: DatabaseSync) {
    db.exec(
      "CREATE TABLE IF NOT EXISTS members(id TEXT PRIMARY KEY, owner TEXT NOT NULL, role TEXT NOT NULL, name TEXT NOT NULL, token TEXT UNIQUE NOT NULL, category TEXT NOT NULL, lat REAL, lng REAL, on_duty INTEGER NOT NULL DEFAULT 1, joined INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL); CREATE INDEX IF NOT EXISTS members_owner ON members(owner); CREATE TABLE IF NOT EXISTS settings(owner TEXT PRIMARY KEY, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sos_log(owner TEXT NOT NULL, at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS ring_log(member_id TEXT NOT NULL, at TEXT NOT NULL);",
    );
    // v1.3 column; older databases get it added in place.
    if (!db.prepare("PRAGMA table_info(members)").all().some((c) => c.name === "slot"))
      db.exec("ALTER TABLE members ADD COLUMN slot TEXT");
  }
  create(owner: string, role: Role, name: string, category = "", slot: string | null = null) {
    if (this.list(owner).length >= 12)
      throw new Error("Tối đa 12 thành viên mạng lưới cho mỗi phiên demo.");
    const m: Member = {
      id: randomUUID().slice(0, 8),
      owner,
      role,
      name,
      token: randomBytes(24).toString("base64url"),
      category: category || (role === "PARTNER" ? "Điểm hỗ trợ" : "Người thân"),
      lat: null,
      lng: null,
      onDuty: true,
      joined: false,
      createdAt: new Date().toISOString(),
      slot: role === "PARTNER" ? slot : null,
    };
    this.db
      .prepare(
        "INSERT INTO members(id,owner,role,name,token,category,on_duty,joined,created_at,slot) VALUES(?,?,?,?,?,?,1,0,?,?)",
      )
      .run(m.id, owner, role, name, m.token, m.category, m.createdAt, m.slot);
    return m;
  }
  list(owner: string) {
    return this.db
      .prepare("SELECT * FROM members WHERE owner=? ORDER BY created_at")
      .all(owner)
      .map(row);
  }
  byToken(token: string) {
    const r = this.db.prepare("SELECT * FROM members WHERE token=?").get(token);
    return r ? row(r) : undefined;
  }
  byId(id: string) {
    const r = this.db.prepare("SELECT * FROM members WHERE id=?").get(id);
    return r ? row(r) : undefined;
  }
  remove(owner: string, id: string) {
    this.db.prepare("DELETE FROM members WHERE owner=? AND id=?").run(owner, id);
  }
  update(
    id: string,
    patch: Partial<Pick<Member, "joined" | "onDuty" | "lat" | "lng">>,
  ) {
    const m = this.byId(id);
    if (!m) throw new Error("NOT_FOUND");
    const next = { ...m, ...patch };
    this.db
      .prepare("UPDATE members SET joined=?, on_duty=?, lat=?, lng=? WHERE id=?")
      .run(next.joined ? 1 : 0, next.onDuty ? 1 : 0, next.lat, next.lng, id);
    return next;
  }
  settings(owner: string): Settings {
    const r = this.db
      .prepare("SELECT payload FROM settings WHERE owner=?")
      .get(owner);
    return { ...defaults, ...(r ? JSON.parse(r.payload as string) : {}) };
  }
  saveSettings(owner: string, patch: Partial<Settings>) {
    const next = { ...this.settings(owner), ...patch };
    this.db
      .prepare("INSERT OR REPLACE INTO settings VALUES(?,?)")
      .run(owner, JSON.stringify(next));
    return next;
  }
  // Returns how many SOS dispatches this owner made in the last hour, including this one.
  recordSos(owner: string) {
    this.db
      .prepare("INSERT INTO sos_log VALUES(?,?)")
      .run(owner, new Date().toISOString());
    return Number(
      this.db
        .prepare("SELECT COUNT(*) n FROM sos_log WHERE owner=? AND at>?")
        .get(owner, hourAgo())!.n,
    );
  }
  tryRing(memberId: string) {
    const n = Number(
      this.db
        .prepare("SELECT COUNT(*) n FROM ring_log WHERE member_id=? AND at>?")
        .get(memberId, hourAgo())!.n,
    );
    if (n >= RINGS_PER_PARTNER_HOUR) return false;
    this.db
      .prepare("INSERT INTO ring_log VALUES(?,?)")
      .run(memberId, new Date().toISOString());
    return true;
  }
}
