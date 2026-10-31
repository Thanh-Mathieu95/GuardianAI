import { createHash } from "node:crypto";
import { durableRuntime } from "./runtime-persistence";
import { deleteRecordings, readRecording, restoreRecordingCache } from "./recordings";
import type { GuardianEngine } from "./engine";
import type { Incident } from "./types";

const bucket = "guardianai-recordings";
const hash = (data: Buffer) => createHash("sha256").update(data).digest("hex");
async function storage(path: string, options: RequestInit = {}) {
  const url = process.env.GUARDIAN_SUPABASE_URL, key = process.env.GUARDIAN_SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("Kho ghi âm Supabase chưa được cấu hình.");
  const origin = new URL(url);
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/")
    throw new Error("Địa chỉ kho ghi âm không hợp lệ.");
  const headers = new Headers(options.headers);
  headers.set("Authorization", "Bearer " + key);
  headers.set("apikey", key);
  try {
    return await fetch(origin.origin + "/storage/v1/" + path, { ...options, headers,
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30000) });
  } catch { throw new Error("Không thể kết nối kho ghi âm Supabase."); }
}
const objectPath = (key: string) => "object/" + bucket + "/" + key.split("/").map(encodeURIComponent).join("/");

export async function readDurableRecording(incident: Incident, session: string) {
  const runtime = await durableRuntime();
  if (!runtime) return readRecording(incident, session);
  await runtime.flush();
  const recording = incident.recordings?.find(row => row.session === session);
  if (!recording) return undefined;
  const rows = await runtime.database.query("SELECT * FROM recording_chunks WHERE incident_id=? AND session=? ORDER BY seq", [incident.id,session]);
  if (rows.length !== recording.chunks) throw new Error("Manifest ghi âm chưa đầy đủ.");
  const chunks: Buffer[] = [];
  for (let seq = 0; seq < rows.length; seq++) {
    const row = rows[seq];
    if (Number(row.seq) !== seq || row.mime !== recording.mime) throw new Error("Thứ tự ghi âm không hợp lệ.");
    const response = await storage(objectPath(row.object_key));
    if (!response.ok) throw new Error("Không tải được ghi âm riêng tư.");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length !== Number(row.bytes) || hash(bytes) !== row.sha256) throw new Error("Nội dung ghi âm không khớp checksum.");
    chunks.push(bytes);
  }
  const data = Buffer.concat(chunks);
  if (data.length !== recording.bytes || hash(data) !== recording.sha256) throw new Error("Ghi âm không khớp hồ sơ đã lưu.");
  return { recording, data };
}

export async function addDurableRecording(engine: GuardianEngine, incident: Incident, session: string, seq: number, mime: string, data: Buffer) {
  const runtime = await durableRuntime();
  if (!runtime) return engine.addRecording(incident,session,seq,mime,data);
  if (!/^[a-z0-9-]{8,40}$/i.test(session) || !Number.isInteger(seq) || seq < 0 ||
      !["audio/webm","audio/ogg","audio/mp4"].includes(mime) || !data.length || data.length > 2000000)
    throw new Error("Đoạn ghi âm không hợp lệ.");
  await runtime.flush();
  const previous = incident.recordings?.find(row => row.session === session);
  const checksum = hash(data);
  const [existing] = await runtime.database.query("SELECT * FROM recording_chunks WHERE incident_id=? AND session=? AND seq=?",[incident.id,session,seq]);
  if (existing && (existing.sha256 !== checksum || existing.mime !== mime || Number(existing.bytes) !== data.length))
    throw new Error("Đoạn gửi lại khác nội dung đã lưu.");
  if (previous && seq < previous.chunks) {
    if (!existing) throw new Error("Thiếu đoạn ghi âm đã xác nhận.");
    return previous;
  }
  if (seq !== (previous?.chunks ?? 0) || (previous && previous.mime !== mime)) throw new Error("Thứ tự hoặc định dạng ghi âm không hợp lệ.");
  if ((incident.recordings ?? []).reduce((sum,row) => sum + row.bytes,0) + data.length > 80000000) throw new Error("Đã đạt giới hạn ghi âm của sự cố.");
  if (previous) {
    const recovered = await readDurableRecording(incident,session);
    if (!recovered) throw new Error("Không phục hồi được ghi âm.");
    restoreRecordingCache(incident,session,recovered.data);
  }
  const key = `${incident.id}/${session}/${seq}`;
  if (!existing) {
    const uploaded = await storage(objectPath(key), { method: "POST", headers: { "Content-Type": mime, "x-upsert": "false" }, body: new Uint8Array(data) });
    if (!uploaded.ok) {
      // A previous attempt may have uploaded the object before its DB commit.
      const retry = await storage(objectPath(key));
      if (!retry.ok || hash(Buffer.from(await retry.arrayBuffer())) !== checksum) throw new Error("Chưa lưu được đoạn ghi âm.");
    }
    await runtime.database.query("INSERT INTO recording_chunks(incident_id,session,seq,object_key,bytes,mime,sha256) VALUES(?,?,?,?,?,?,?) ON CONFLICT(incident_id,session,seq) DO NOTHING",
      [incident.id,session,seq,key,data.length,mime,checksum]);
  }
  return engine.addRecording(incident,session,seq,mime,data);
}

export async function deleteDurableRecordings(incident: Incident) {
  const runtime = await durableRuntime();
  if (runtime) {
    await runtime.flush();
    const rows = await runtime.database.query("SELECT object_key FROM recording_chunks WHERE incident_id=?",[incident.id]);
    if (rows.length) {
      const deleted = await storage("object/" + bucket, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: rows.map(row => row.object_key) }) });
      if (!deleted.ok) throw new Error("Chưa xóa được các đoạn ghi âm riêng tư.");
    }
    await runtime.database.query("DELETE FROM recording_chunks WHERE incident_id=?",[incident.id]);
  }
  deleteRecordings(incident);
}
