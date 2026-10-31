import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getEngine, type GuardianEngine } from "./engine";
import { Database } from "./database";
import { PersistentStore } from "./persistent-store";
import type { Incident } from "./types";
import type { Member } from "./network";

type Runtime = { engine: GuardianEngine; database: Database; flush: () => Promise<void> };
const state = globalThis as unknown as { guardianDurableRuntime?: Promise<Runtime> };
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

function tokenCipher(secret: string) {
  const key = createHash("sha256").update(secret).digest();
  return {
    encrypt(value: string) {
      const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv);
      const content = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), content]).toString("base64");
    },
    decrypt(value: string) {
      const bytes = Buffer.from(value, "base64"), cipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
      cipher.setAuthTag(bytes.subarray(12, 28));
      return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString("utf8");
    },
  };
}

async function initialize(): Promise<Runtime> {
  const url = process.env.GUARDIAN_POSTGRES_URL;
  const secret = process.env.GUARDIAN_SESSION_SECRET;
  if (!url || !secret || secret.length < 32) throw new Error("Cấu hình PostgreSQL hoặc khóa phiên chưa sẵn sàng.");
  const database = new Database(":memory:", url);
  await database.ready;
  const cipher = tokenCipher(secret);
  // SQLite is only a process-local working cache. It is rebuilt exclusively
  // from committed PostgreSQL rows at startup, never uploaded as a database file.
  const engine = getEngine(), cache = engine.store.db;
  const repository = new PersistentStore(database);
  const revisions = new Map<string, number>();
  const incidents = await database.query("SELECT * FROM incidents ORDER BY updated_at");
  const snapshots = await database.query("SELECT id,incident_id,time,payload FROM event_snapshots ORDER BY ordinal");
  const reports = await database.query("SELECT * FROM report_revisions ORDER BY incident_id,seq");
  const members = await database.query("SELECT * FROM members ORDER BY created_at");
  const settings = await database.query("SELECT * FROM settings");
  const sos = await database.query("SELECT * FROM sos_log ORDER BY ordinal");
  const rings = await database.query("SELECT * FROM ring_log ORDER BY ordinal");
  cache.exec("BEGIN");
  try {
    for (const row of incidents) {
      cache.prepare("INSERT INTO incidents(id,owner,updated_at,payload) VALUES(?,?,?,?)").run(row.id,row.owner,row.updated_at,row.payload);
      revisions.set(row.id, Number(row.revision));
    }
    for (const row of snapshots) cache.prepare("INSERT INTO event_snapshots(id,incident_id,time,payload) VALUES(?,?,?,?)").run(row.id,row.incident_id,row.time,row.payload);
    for (const row of reports) cache.prepare("INSERT INTO report_revisions VALUES(?,?,?,?,?,?)").run(row.incident_id,Number(row.seq),row.time,row.payload,row.previous_hash,row.hash);
    for (const row of members) cache.prepare("INSERT INTO members(id,owner,role,name,token,category,lat,lng,on_duty,joined,created_at,slot) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(row.id,row.owner,row.role,row.name,cipher.decrypt(row.token_ciphertext),row.category,row.lat,row.lng,row.on_duty,row.joined,row.created_at,row.slot);
    for (const row of settings) cache.prepare("INSERT INTO settings VALUES(?,?)").run(row.owner,row.payload);
    for (const row of sos) cache.prepare("INSERT INTO sos_log VALUES(?,?)").run(row.owner,row.at);
    for (const row of rings) cache.prepare("INSERT INTO ring_log VALUES(?,?)").run(row.member_id,row.at);
    cache.exec("COMMIT");
  } catch {
    cache.exec("ROLLBACK");
    await database.close();
    throw new Error("Không thể phục hồi dữ liệu đã lưu từ PostgreSQL.");
  }

  let tail: Promise<void> = Promise.resolve();
  let failed = false;
  const enqueue = (work: () => Promise<unknown>) => {
    tail = tail.then(async () => {
      if (failed) throw new Error("Kho dữ liệu bị gián đoạn; cần khởi động lại backend để phục hồi.");
      await work();
    }).catch(() => {
      failed = true;
      throw new Error("Chưa lưu được dữ liệu lên PostgreSQL. Không xác nhận thao tác thành công.");
    });
    void tail.catch(() => {});
  };
  const flush = async () => {
    let pending;
    do { pending = tail; await pending; } while (pending !== tail);
    if (failed) throw new Error("Kho dữ liệu chưa sẵn sàng.");
  };
  const save = engine.store.save.bind(engine.store);
  engine.store.save = (incident: Incident) => {
    // Preserve the synchronous domain interpreter. Durable acknowledgement is
    // explicitly awaited at HTTP and event-delivery boundaries below.
    const captured = structuredClone(incident);
    save(incident);
    enqueue(async () => {
      const next = await repository.save(captured, revisions.get(captured.id) ?? 0);
      revisions.set(captured.id, next);
    });
  };
  const erase = engine.store.deleteReportHistory.bind(engine.store);
  engine.store.deleteReportHistory = id => {
    erase(id);
    enqueue(() => database.query("DELETE FROM report_revisions WHERE incident_id=?", [id]));
  };
  const eraseSnapshots = engine.store.deleteSnapshots.bind(engine.store);
  engine.store.deleteSnapshots = id => {
    eraseSnapshots(id);
    enqueue(() => database.query("DELETE FROM event_snapshots WHERE incident_id=?", [id]));
  };

  const persistMember = (member: Member) => {
    const m = structuredClone(member), encrypted = cipher.encrypt(m.token);
    enqueue(() => database.query(`INSERT INTO members(id,owner,role,name,token_hash,token_ciphertext,category,lat,lng,on_duty,joined,created_at,slot)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,category=excluded.category,lat=excluded.lat,lng=excluded.lng,on_duty=excluded.on_duty,joined=excluded.joined,slot=excluded.slot`,
      [m.id,m.owner,m.role,m.name,digest(m.token),encrypted,m.category,m.lat,m.lng,m.onDuty?1:0,m.joined?1:0,m.createdAt,m.slot]));
  };
  const network = engine.network;
  const create = network.create.bind(network);
  network.create = (...args) => { const result = create(...args); persistMember(result); return result; };
  const update = network.update.bind(network);
  network.update = (...args) => { const result = update(...args); persistMember(result); return result; };
  const remove = network.remove.bind(network);
  network.remove = (owner,id) => { remove(owner,id); enqueue(() => database.query("DELETE FROM members WHERE owner=? AND id=?",[owner,id])); };
  const saveSettings = network.saveSettings.bind(network);
  network.saveSettings = (owner,patch) => {
    const result = saveSettings(owner,patch), payload = JSON.stringify(result);
    enqueue(() => database.query("INSERT INTO settings(owner,payload) VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET payload=excluded.payload",[owner,payload]));
    return result;
  };
  const recordSos = network.recordSos.bind(network);
  network.recordSos = owner => {
    const result = recordSos(owner);
    const at = String(cache.prepare("SELECT at FROM sos_log WHERE owner=? ORDER BY rowid DESC LIMIT 1").get(owner)!.at);
    enqueue(() => database.query("INSERT INTO sos_log(owner,at) VALUES(?,?)",[owner,at]));
    return result;
  };
  const tryRing = network.tryRing.bind(network);
  network.tryRing = memberId => {
    const result = tryRing(memberId);
    if (result) {
      const at = String(cache.prepare("SELECT at FROM ring_log WHERE member_id=? ORDER BY rowid DESC LIMIT 1").get(memberId)!.at);
      enqueue(() => database.query("INSERT INTO ring_log(member_id,at) VALUES(?,?)",[memberId,at]));
    }
    return result;
  };
  const emit = engine.bus.emit.bind(engine.bus);
  engine.bus.emit = (event, ...args) => {
    const captured = structuredClone(args), committed = tail;
    void committed.then(() => { if (!failed) emit(event,...captured); }).catch(() => {});
    return engine.bus.listenerCount(event) > 0;
  };
  // Hydrate active incidents through the existing restart recovery rules.
  // Pending calls are marked interrupted; restarting never re-dials people.
  for (const row of incidents) {
    const incident: Incident = JSON.parse(row.payload);
    if (!["CLOSED","USER_CANCELLED"].includes(incident.status)) engine.get(incident.id,incident.owner);
  }
  await flush();
  return { engine, database, flush };
}

export async function durableRuntime() {
  if (!process.env.GUARDIAN_POSTGRES_URL) return undefined;
  if (!state.guardianDurableRuntime) {
    const pending = initialize();
    state.guardianDurableRuntime = pending;
    void pending.catch(() => {
      const cache = globalThis as unknown as { guardianEngine?: GuardianEngine };
      // A transient startup failure before a cache was built can be retried.
      // A failed active writer remains unavailable until an explicit restart.
      if (!cache.guardianEngine && state.guardianDurableRuntime === pending) state.guardianDurableRuntime = undefined;
    });
  }
  return state.guardianDurableRuntime;
}

export async function durableRequest(work: () => Promise<Response>): Promise<Response> {
  let runtime: Runtime | undefined;
  let response: Response | undefined;
  try {
    runtime = await durableRuntime();
    await runtime?.flush();
    response = await work();
    await runtime?.flush();
    return response;
  } catch {
    await response?.body?.cancel().catch(() => {});
    return Response.json({ error: "Kho dữ liệu chưa sẵn sàng. Thao tác chưa được xác nhận lưu; vui lòng thử lại sau." },
      { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
