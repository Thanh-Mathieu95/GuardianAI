// Conversation audio kept for the evidence dossier. Chunks are appended in order as they are
// recorded, so a phone that is snatched or switched off still leaves everything up to the last chunk.
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import type { Incident } from "./types";

export type Recording = NonNullable<Incident["recordings"]>[number];
export const RECORDING_CHUNK_SECONDS = 10;
const MAX_CHUNK_BYTES = 2_000_000, MAX_INCIDENT_BYTES = 80_000_000;
const types: Record<string, string> = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a" };
const root = () => path.resolve(/* turbopackIgnore: true */ process.env.GUARDIAN_RECORDINGS_DIR || "./data/recordings");
const file = (incident: string, r: Pick<Recording, "session" | "mime">) => path.join(root(), incident, `${r.session}.${types[r.mime]}`);

export function appendRecording(i: Incident, session: string, seq: number, mime: string, data: Buffer) {
  if (!/^[a-z0-9-]{8,40}$/i.test(session)) throw new Error("Phiên ghi âm không hợp lệ.");
  if (!types[mime]) throw new Error("Định dạng ghi âm không được hỗ trợ.");
  if (!data.length || data.length > MAX_CHUNK_BYTES) throw new Error("Đoạn ghi âm rỗng hoặc quá lớn.");
  const list = (i.recordings ??= []);
  let r = list.find((x) => x.session === session);
  if (r && r.mime !== mime) throw new Error("Đổi định dạng giữa phiên ghi âm.");
  if (seq < (r?.chunks ?? 0)) return { recording: r!, started: false }; // retried upload: already stored
  if (seq !== (r?.chunks ?? 0)) throw new Error("Đoạn ghi âm đến sai thứ tự.");
  if (list.reduce((n, x) => n + x.bytes, 0) + data.length > MAX_INCIDENT_BYTES) throw new Error("Đã đạt giới hạn dung lượng ghi âm của sự cố.");
  const now = new Date().toISOString(), started = !r;
  r ??= list[list.push({ session, mime, startedAt: now, updatedAt: now, chunks: 0, bytes: 0, sha256: "" }) - 1];
  const target = file(i.id, r);
  mkdirSync(path.dirname(target), { recursive: true });
  appendFileSync(target, data);
  r.chunks++; r.bytes += data.length; r.updatedAt = now;
  r.sha256 = createHash("sha256").update(readFileSync(target)).digest("hex");
  return { recording: r, started };
}
export function readRecording(i: Incident, session: string) {
  const r = i.recordings?.find((x) => x.session === session);
  if (!r) return undefined;
  const target = file(i.id, r);
  return existsSync(target) ? { recording: r, data: readFileSync(target) } : undefined;
}
export function deleteRecordings(i: Incident) {
  rmSync(path.join(root(), i.id), { recursive: true, force: true });
  i.recordings = [];
}
export function restoreRecordingCache(i: Incident, session: string, data: Buffer) {
  const recording = i.recordings?.find(r => r.session === session);
  if (!recording || !/^[a-z0-9-]{8,40}$/i.test(session) || !types[recording.mime]) throw new Error("Phiên ghi âm không hợp lệ.");
  if (data.length !== recording.bytes || createHash("sha256").update(data).digest("hex") !== recording.sha256)
    throw new Error("Ghi âm không khớp manifest đã lưu.");
  const target = file(i.id, recording);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, data);
}
