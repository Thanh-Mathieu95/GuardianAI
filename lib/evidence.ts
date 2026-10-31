// Evidence dossier: everything the app saw about an incident, in one hashed, printable document.
import { createHash } from "node:crypto";
import { cityAnchor, locate } from "./city";
import { RECORDING_CHUNK_SECONDS } from "./recordings";
import type { Incident } from "./types";

export function dossier(i: Incident) {
  const city = i.routeAdapter === "CITY",
    plan = i.plans.find((p) => !p.superseded),
    place = (id: string) => i.places.find((p) => p.id === id)?.name ?? id;
  return {
    schemaVersion: 2,
    incident: i.id,
    simulated: i.mode === "SIMULATION",
    createdAt: i.createdAt,
    sosAt: i.metrics.sosAt ?? null,
    status: i.status,
    updatedAt: i.updatedAt,
    needs: i.needs ?? null,
    scenarioClock: i.scenarioClock ?? null,
    placeCatalogue: i.places.map(p => ({ id: p.id, name: p.name, profile: p.profile ?? null, openingStatus: p.openingStatus, source: p.source })),
    roadObservations: i.roadObservations ?? [],
    emergency: i.emergency ?? null,
    riskLevel: i.riskLevel,
    riskReasons: i.riskReasons,
    appearance: i.appearance ?? null,
    statements: i.statements ?? [],
    lastLocation: {
      lat: i.location.lat,
      lng: i.location.lng,
      kind: i.location.kind,
      at: i.location.observedAt,
      stale: i.location.stale,
      where: city ? locate(cityAnchor, i.location).text : null,
    },
    track: (i.track ?? []).map((p) => ({ ...p, where: city ? locate(cityAnchor, p).text : null })),
    contacts: i.contacts,
    calls: i.calls.map((c) => ({ id: c.id, place: place(c.placeId), status: c.status, startedAt: c.startedAt, transcript: c.transcript,
      support: c.support ?? null, checks: c.checks ?? [], questions: c.questions ?? [], mode: c.providerMode, dialogueMode: c.dialogueMode ?? null })),
    plan: plan && { place: place(plan.selectedPlaceId), steps: plan.route.steps, advisories: plan.route.advisories ?? [] },
    plans: i.plans,
    routeDecisions: i.routeDecisions ?? [],
    routeAgent: i.routeAgent ?? null,
    handoff: i.handoff ?? null,
    modelRuns: i.ai.runs,
    seals: i.seals ?? [],
    // File hashes, so a seal also commits to the audio.
    recordings: i.recordings ?? [],
    evidenceShare: i.evidenceShare ?? null,
    escalation: i.escalation ?? null,
    transcript: i.transcript,
    timeline: i.events.map((e) => ({ id: e.id, time: e.time, agent: e.agent, type: e.type, summary: e.summary, evidenceRefs: e.evidenceRefs, sourceKind: e.sourceKind })),
  };
}
export const digest = (d: ReturnType<typeof dossier>) => createHash("sha256").update(JSON.stringify(d)).digest("hex");

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const tz = { timeZone: "Asia/Ho_Chi_Minh" } as const;
const t = (iso: string) => new Date(iso).toLocaleString("vi-VN", tz);
const hm = (iso: string) => new Date(iso).toLocaleTimeString("vi-VN", { ...tz, hour: "2-digit", minute: "2-digit", second: "2-digit" });
const day = (iso: string) => new Date(iso).toLocaleDateString("vi-VN", tz);
const rows = (head: string[], body: unknown[][]) =>
  `<div class="tw"><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${body
    .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table></div>`;
// One line per moment in the main timeline: first sentence, capped.
const brief = (s: string) => { const first = s.split(/(?<=[.!?])\s/)[0]; return first.length > 170 ? first.slice(0, 168) + "…" : first; };

const statusVi: Record<string, string> = {
  SOS_RECEIVED: "Đã nhận SOS", CONTACTING: "Đang liên hệ", ROUTE_PROPOSED: "Có phương án chờ chấp nhận", NAVIGATING: "Đang dẫn đường",
  REPLANNING: "Đang lập lại phương án", NO_RESPONDERS: "Chưa có nơi tiếp nhận", LOCATION_UNAVAILABLE: "Mất vị trí / mất liên lạc",
  CLOSED: "Đã kết thúc", USER_CANCELLED: "Người dùng đã hủy", IDLE: "Chưa kích hoạt",
};
const callVi: Record<string, string> = {
  CONFIRMED: "Đồng ý tiếp nhận", DECLINED: "Từ chối / thu hồi", NO_ANSWER: "Không nghe máy", FAILED: "Dừng giữa chừng",
  CONNECTED: "Đang trao đổi", RINGING: "Đang đổ chuông", QUEUED: "Chờ gọi",
};
const contactVi: Record<string, string> = {
  ON_THE_WAY: "Đang tới", KEEP_CONTACT: "Giữ liên lạc", CANNOT_HELP: "Không giúp được", ANSWERED: "Đã nghe máy",
  RINGING: "Chưa nghe máy", MISSED: "Không nghe máy",
};
const roleVi = { PRIMARY: "Vai chính", SUPPORT: "Phối hợp", BACKUP: "Dự phòng", UNUSED: "Không dùng" };
// Only the events a reader needs to follow what happened; the full log stays in the appendix.
const keyEvent = /SOS|EMERGENCY_DETECTED|CONTACT_(ALERTED|ON_THE_WAY|KEEP_CONTACT|CANNOT_HELP|MESSAGE|LOST)|HELP_CONFIRMED|SUPPORT_REVOKED|ROUTE_SELECTED|PLAN_REVISED|PLAN_INVALIDATED|ROUTE_ACCEPTED|COORDINATION_UPDATED|NAV_DIRECTIONS|ROAD_DARK|NAV_ARRIVED|STATEMENT_RECORDED|RECORDING_STARTED|EVIDENCE_SHARED|ESCALATION_OFFERED|HANDOFF|TRIP_(STARTED|ARRIVED|DEVIATED)/;
const tone = (type: string) =>
  /EMERGENCY|CONTACT_LOST/.test(type) ? "crit" : /INVALIDATED|REVOKED|ROAD_DARK|CANNOT/.test(type) ? "warn" : /CONFIRMED|ACCEPTED|ON_THE_WAY|ARRIVED|SHARED/.test(type) ? "ok" : "";

export function dossierHtml(i: Incident, integrity?: { valid: boolean; revisions: number; headHash: string }, audioBase?: string) {
  const place = (id: string) => i.places.find(p => p.id === id)?.name ?? id;
  const d = dossier(i), hash = digest(d);
  const section = (n: string, title: string, body: string) => (body ? `<section><h2><span>${n}</span>${esc(title)}</h2>${body}</section>` : "");
  const lost = i.events.find(e => e.type === "CONTACT_LOST");
  const confirmed = d.calls.filter(c => c.status === "CONFIRMED" || c.support?.decision === "ACCEPTED").length;
  const current = i.plans.find(p => !p.superseded);
  const firstWords = i.transcript.find(x => x.speaker === "Bạn")?.text;
  const minutes = (r: { chunks: number }) => Math.max(1, Math.round((r.chunks * RECORDING_CHUNK_SECONDS) / 60));
  const mapLink = (lat: number, lng: number) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;

  // 1. Plain-language account, assembled only from recorded facts.
  const story = [
    d.sosAt ? `Lúc ${hm(d.sosAt)} ngày ${day(d.sosAt)}, người dùng kích hoạt SOS${firstWords ? ` và nói: “${firstWords}”` : ""}.` : `Phiên bắt đầu lúc ${t(d.createdAt)}; chưa kích hoạt SOS.`,
    `Hệ thống đánh giá mức hỗ trợ ${d.riskLevel}/4${d.riskReasons[0] ? ` (${d.riskReasons[0]})` : ""}.`,
    d.emergency ? `Lúc ${hm(d.emergency.at)} phát hiện tình huống khẩn cấp: ${d.emergency.label}${d.emergency.medical ? ", có thương tích, cần cấp cứu 115" : ""} — người dùng nói “${d.emergency.text}”.` : "",
    d.contacts.length ? `Đã báo ${d.contacts.length} người thân: ${d.contacts.map(c => `${c.name} (${contactVi[c.status] ?? c.status}${c.arrivalMinutes != null ? `, tự báo ${c.arrivalMinutes} phút` : ""})`).join(", ")}.` : "",
    d.calls.length ? `Đã liên hệ ${d.calls.length} điểm hỗ trợ, ${confirmed} nơi đồng ý tiếp nhận.` : "",
    i.plans.length ? `Lập ${i.plans.length} phiên bản kế hoạch${current ? `; phương án hiện hành: ${place(current.selectedPlaceId)}` : "; hiện không có phương án hiệu lực"}.` : "",
    d.statements.length ? `Người dùng khai ${d.statements.length} chi tiết về sự việc (mục 3).` : "",
    lost ? `Lúc ${hm(lost.time)} mất liên lạc với điện thoại; vị trí cuối ghi nhận lúc ${hm(d.lastLocation.at)}${d.lastLocation.where ? ` tại ${d.lastLocation.where}` : ""}.` : "",
    d.recordings.length ? `Có ${d.recordings.length} bản ghi âm cuộc trò chuyện, tổng khoảng ${d.recordings.reduce((n, r) => n + minutes(r), 0)} phút.` : "",
    d.evidenceShare ? `Hồ sơ đã được niêm phong và gửi cho ${d.evidenceShare.to.join(", ")} lúc ${hm(d.evidenceShare.at)}.` : "",
  ].filter(Boolean).join(" ");

  const facts: [string, string, string?][] = [
    ["Thời điểm SOS", d.sosAt ? t(d.sosAt) : "Chưa kích hoạt"],
    ["Mức khẩn cấp", d.emergency ? `${d.riskLevel}/4 · ${d.emergency.label}` : `${d.riskLevel}/4`, d.emergency ? "crit" : ""],
    ["Tình trạng", statusVi[d.status] ?? d.status, lost ? "crit" : ""],
    ["Vị trí cuối", `${d.lastLocation.where ?? `${d.lastLocation.lat.toFixed(5)}, ${d.lastLocation.lng.toFixed(5)}`} · ${hm(d.lastLocation.at)}${d.lastLocation.stale ? " · đã mất tín hiệu" : ""}`],
    ["Người thân", d.contacts.map(c => `${c.name}: ${contactVi[c.status] ?? c.status}`).join(" · ") || "Chưa báo"],
    ["Nơi tiếp nhận", current ? `${place(current.selectedPlaceId)}${current.acceptedAt ? " · đã chấp nhận" : " · chờ chấp nhận"}` : "Chưa có"],
  ];
  // Repeated plan re-evaluations collapse into the latest one of a run.
  const timeline = i.events.filter(e => keyEvent.test(e.type) && !e.type.startsWith("SHOWCASE") && e.type !== "ROUTE_ACCEPTED")
    .filter((e, n, all) => !(all[n + 1] && all[n + 1].type === e.type && /COORDINATION|PLAN_REVISED|ROUTE_SELECTED|CONTACT_ON_THE_WAY/.test(e.type)))
    .filter((e, n, all) => n === 0 || brief(all[n - 1].summary) !== brief(e.summary));

  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Báo cáo sự cố ${esc(d.incident)}</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;600;700&display=swap" rel="stylesheet">
<style>
:root{--ink:#1b2550;--blue:#2a4cc0;--muted:#4a5378;--line:#c8ccd4;--soft:#f6f7f5;--crit:#d22f27;--warn:#a86200;--ok:#2a4cc0}
*{box-sizing:border-box}::selection{background:#2a4cc0;color:#fff}
body{font:14.5px/1.6 "Be Vietnam Pro","Segoe UI",system-ui,sans-serif;font-variant-numeric:tabular-nums;color:var(--ink);max-width:920px;margin:28px auto;padding:0 18px 40px;background:#fff}
a{color:var(--blue);text-underline-offset:3px}
header{padding-bottom:6px;margin-bottom:8px}
.form{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;font-size:12.5px}
.org b{display:block;font-size:13px;letter-spacing:.08em;text-transform:uppercase}.org span{color:var(--muted)}
.badges{text-align:right}
header .title{text-align:center;margin-top:22px}
h1{font-size:22px;letter-spacing:.06em;text-transform:uppercase;margin:0}
h1 small{display:block;font-size:15px;letter-spacing:0;text-transform:none;font-weight:600;margin-top:2px}
.title::after{content:"";display:block;width:120px;height:1px;background:var(--ink);margin:10px auto 0}
.meta{color:var(--muted);font-size:13px;margin-top:8px}
.badge{display:inline-block;padding:2px 8px;border:1px solid currentColor;border-radius:2px;font-size:11.5px;font-weight:700;margin:0 0 4px 6px}
.sim{color:var(--warn)}.crit-b{color:#fff;background:var(--crit);border-color:var(--crit)}.ok-b{color:var(--blue)}
.facts{display:grid;grid-template-columns:repeat(3,1fr);margin:18px 0;border-top:1px solid var(--ink);border-left:1px solid var(--line)}
.fact{border-right:1px solid var(--line);border-bottom:1px solid var(--line);padding:10px 12px}
.fact b{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}.fact span{font-weight:600}
.fact.crit span{color:var(--crit)}
section{margin-top:30px;break-inside:avoid-page}
h2{font-size:15px;margin:0 0 10px;padding-bottom:6px;border-bottom:1px solid var(--ink);display:flex;align-items:baseline;gap:10px;letter-spacing:.02em}
h2 span{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--blue);min-width:52px}
.story{font-size:15.5px;line-height:1.8;margin:0;max-width:72ch}
ol.tl{list-style:none;margin:0;padding:0}
ol.tl li{display:flex;gap:12px;padding:6px 0;border-bottom:1px solid var(--line)}
ol.tl li.crit{color:var(--crit);font-weight:600}ol.tl li.warn{color:#6e4100}
ol.tl time{color:var(--muted);font-size:12.5px;flex-shrink:0;min-width:58px}
.tw{overflow-x:auto;-webkit-overflow-scrolling:touch}table{border-collapse:collapse;width:100%;font-size:13px}
h1,.story,.fact span{overflow-wrap:anywhere}th,td{border-bottom:1px solid var(--line);padding:7px 8px;text-align:left;vertical-align:top}
th{border-bottom:1px solid var(--ink);font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.rec{border-top:1px solid var(--line);padding:10px 0;margin-bottom:4px}.rec audio{width:100%;margin-top:6px}
.callout{border:1px solid var(--crit);border-radius:2px;padding:12px 14px;white-space:pre-wrap;font-family:inherit;margin:0}
.hash{font-size:11.5px;word-break:break-all;color:var(--muted)}
.sealed{position:relative;padding-right:130px;min-height:120px}
.seal{position:absolute;right:4px;top:0;width:112px;height:112px;color:var(--crit);opacity:.9;transform:rotate(-11deg)}
.seal text{fill:currentColor;font-family:inherit}
details{margin-top:18px;border-top:1px solid var(--ink);padding:10px 0}summary{cursor:pointer;font-weight:600}
h3{font-size:14px;margin:16px 0 6px}.note{color:var(--muted);font-size:12.5px}
.print{position:fixed;top:14px;right:14px;padding:9px 15px;border:1px solid var(--ink);border-radius:2px;background:var(--ink);color:#fff;cursor:pointer;font:inherit;font-weight:600}
.print:hover{background:var(--blue);border-color:var(--blue)}
@media (max-width:640px){.facts{grid-template-columns:1fr 1fr}body{margin-top:56px}table{font-size:12px;min-width:520px}.form{flex-direction:column}.badges{text-align:left}.badge{margin:0 6px 4px 0}.sealed{padding-right:0;padding-top:110px}.seal{left:0;right:auto}}
@media print{.print{display:none}body{margin:0;max-width:none}details{border:0;padding:0}details>summary{display:none}audio{display:none}}
</style></head><body>
<button class="print" onclick="document.querySelectorAll('details').forEach(x=>x.open=true);print()">In / Lưu PDF</button>
<header>
<div class="form"><div class="org"><b>Guardian AI</b><span>Báo cáo sự cố an toàn · Số ${esc(d.incident)}</span></div>
<div class="badges">${d.simulated ? `<span class="badge sim">DỮ LIỆU MÔ PHỎNG</span>` : ""}${d.emergency ? `<span class="badge crit-b">KHẨN CẤP · ${esc(d.emergency.label)}</span>` : ""}${lost ? `<span class="badge crit-b">MẤT LIÊN LẠC</span>` : ""}${d.seals.length ? `<span class="badge ok-b">ĐÃ NIÊM PHONG ${d.seals.length} LẦN</span>` : ""}</div></div>
<div class="title"><h1>Hồ sơ bằng chứng<small>${esc(d.incident)}</small></h1>
<div class="meta">Lập lúc ${esc(t(new Date().toISOString()))} · Dữ liệu cập nhật ${esc(t(d.updatedAt))}</div></div>
</header>
<div class="facts">${facts.map(([k, v, c]) => `<div class="fact ${c ?? ""}"><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join("")}</div>

${section("1", "Tóm tắt sự việc", `<p class="story">${esc(story)}</p>`)}
${section("!", "Thông tin cho cơ quan chức năng (113 / 115)", d.escalation ? `<pre class="callout">${esc(d.escalation)}</pre><p class="note">Ứng dụng không tự gọi số khẩn cấp; bản tóm tắt này để người dùng hoặc người thân đọc khi gọi.</p>` : "")}
${section("2", "Diễn biến chính", timeline.length ? `<ol class="tl">${timeline.map(e => `<li class="${tone(e.type)}"><time>${esc(hm(e.time))}</time>${esc(brief(e.summary))}</li>`).join("")}</ol>` : "")}
${section("3", "Lời khai của người dùng", d.statements.length ? rows(["Thời điểm", "Nội dung", "Chi tiết"], d.statements.map(s => [hm(s.at), s.topic, s.text])) : "")}
${section("4", "Ghi âm cuộc trò chuyện", d.recordings.length ? d.recordings.map((r, n) => `<div class="rec"><b>Bản ghi ${n + 1}</b> · ${esc(hm(r.startedAt))} → ${esc(hm(r.updatedAt))} · khoảng ${minutes(r)} phút · ${(r.bytes / 1024).toFixed(0)} KB${audioBase ? `<audio controls preload="none" src="${esc(audioBase + r.session)}"></audio>` : ""}<div class="hash">SHA-256: ${esc(r.sha256)}</div></div>`).join("") + `<p class="note">Gồm giọng người dùng qua micro và giọng AI, lưu từng đoạn ${RECORDING_CHUNK_SECONDS} giây trong lúc nói chuyện nên vẫn còn khi điện thoại mất kết nối. Mã băm từng file nằm trong dữ liệu được niêm phong.</p>` : `<p class="note">Không có bản ghi âm (người dùng chưa dùng trò chuyện giọng nói, đã tắt ghi âm, hoặc đây là kịch bản mô phỏng không có micro).</p>`)}
${section("5", "Vị trí và đường đi", `<p>Vị trí cuối: <b>${esc(d.lastLocation.where ?? "")}</b> (${d.lastLocation.lat.toFixed(6)}, ${d.lastLocation.lng.toFixed(6)}) · ${esc(d.lastLocation.kind === "LIVE" ? "GPS thật" : "vị trí mô phỏng")} · lúc ${esc(t(d.lastLocation.at))}${d.lastLocation.stale ? " · <b>mất tín hiệu sau thời điểm này</b>" : ""} · <a href="${esc(mapLink(d.lastLocation.lat, d.lastLocation.lng))}" target="_blank" rel="noreferrer">Mở trên bản đồ</a></p>` +
  (d.track.length ? rows(["Thời điểm", "Vị trí", "Tọa độ"], d.track.filter((_, n, all) => all.length <= 25 || n % Math.ceil(all.length / 25) === 0 || n === all.length - 1).map(p => [hm(p.at), p.where ?? "", `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`])) : ""))}
${section("6", "Người được liên hệ", (d.contacts.length ? `<h3>Người thân</h3>` + rows(["Tên", "Phản hồi", "Lời dặn / đề xuất", "Báo lúc"], d.contacts.map(c => [c.name, `${contactVi[c.status] ?? c.status}${c.arrivalMinutes != null ? ` · tự báo ${c.arrivalMinutes} phút` : ""}`, [c.lastMessage, c.offer?.text].filter(Boolean).join(" · ") || "—", hm(c.alertedAt)])) : "") +
  (d.calls.length ? `<h3>Điểm hỗ trợ</h3>` + rows(["Nơi", "Kết quả", "Lời cuối của nơi đó", "Lý do không dùng (nếu có)"], d.calls.map(c => [c.place, callVi[c.status] ?? c.status, [...c.transcript].reverse().find(x => x.speaker !== "Guardian AI")?.text ?? "—", c.checks.slice(0, 2).join("; ") || "—"])) : ""))}
${section("7", "Các phương án đã lập", i.plans.length ? rows(["Phiên bản", "Nơi tiếp nhận", "Trạng thái", "Ai làm gì"], i.plans.map(p => [`v${p.revision} · ${hm(p.createdAt)}`, `${place(p.selectedPlaceId)} · ${p.route.distanceMeters ?? "?"} m`, p.superseded ? "Đã dừng (điều kiện thay đổi)" : p.acceptedAt ? `Đang thực hiện · chấp nhận ${hm(p.acceptedAt)}` : "Chờ chấp nhận", p.coordination ? p.coordination.assignments.filter(a => a.role !== "UNUSED").map(a => `${a.who} (${roleVi[a.role]}): ${a.instruction}`).join(" · ") : p.reasons[0] ?? ""])) : "")}
${section("8", "Hội thoại với AI đồng hành", d.transcript.length ? rows(["Thời điểm", "Người nói", "Nội dung"], d.transcript.map(x => [hm(x.time), x.speaker, x.text])) : "")}
${section("9", "Niêm phong và tính toàn vẹn", (d.seals.length ? `<div class="sealed"><svg class="seal" viewBox="0 0 100 100" role="img" aria-label="Đã niêm phong"><circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="50" cy="50" r="39" fill="none" stroke="currentColor" stroke-width="1.2"/><text x="50" y="40" text-anchor="middle" font-size="9.5" font-weight="700" letter-spacing="1.2">ĐÃ</text><text x="50" y="56" text-anchor="middle" font-size="11" font-weight="700" letter-spacing=".5">NIÊM PHONG</text><text x="50" y="70" text-anchor="middle" font-size="9.5" font-weight="600">${esc(hm(d.seals.at(-1)?.at ?? d.updatedAt))}</text></svg>` : "<div>") + rows(["Thời điểm", "Lý do niêm phong", "SHA-256 toàn bộ hồ sơ lúc đó"], d.seals.map(s => [t(s.at), s.reason, s.hash])) + "</div>" +
  `<p class="note">SHA-256 của bản đang xem: <span class="hash">${hash}</span><br>Mỗi lần niêm phong lưu mã băm của toàn bộ hồ sơ (kể cả mã băm file ghi âm). Nội dung bị sửa sau đó sẽ không khớp mã.${d.evidenceShare ? ` Hồ sơ đã gửi cho ${esc(d.evidenceShare.to.join(", "))} lúc ${esc(t(d.evidenceShare.at))} (lý do: ${esc(d.evidenceShare.reason)}).` : ""}</p>` +
  (integrity ? `<p class="note">Chuỗi phiên bản báo cáo: ${!integrity.revisions ? "chưa có bản lưu" : integrity.valid ? "kiểm tra khớp" : "<b>PHÁT HIỆN KHÔNG KHỚP</b>"} · ${integrity.revisions} phiên bản · <span class="hash">${esc(integrity.headHash)}</span><br>Chuỗi băm giúp đối chiếu; không phải chữ ký số hay dấu thời gian độc lập.</p>` : ""))}

<details><summary>Phụ lục kỹ thuật (hội thoại từng nơi, quyết định tuyến, lịch sử model, nhật ký đầy đủ)</summary>
<h3>A. Hội thoại với từng điểm hỗ trợ</h3>${d.calls.map(c => `<h3>${esc(c.place)} · ${esc(callVi[c.status] ?? c.status)}</h3>` + rows(["Thời điểm", "Người nói", "Nội dung"], c.transcript.map(x => [hm(x.time), x.speaker, x.text]))).join("") || "<p class=note>Không có.</p>"}
<h3>B. Quyết định điểm đến và tuyến</h3>${(d.routeDecisions.map(r => `<p><b>${esc(hm(r.createdAt))}</b> · ${esc(r.mode)}${r.discarded ? " · đã bỏ do dữ kiện đổi" : ""} · ${esc(r.reasons.join("; "))}</p>`).join("")) || "<p class=note>Không có.</p>"}
<h3>C. Lịch sử model AI</h3>${d.modelRuns.length ? rows(["Tác vụ", "Model", "Trạng thái", "Thời gian"], d.modelRuns.map(r => [r.task, r.model, r.status, `${hm(r.time)} · ${r.latencyMs} ms`])) : "<p class=note>Không dùng model.</p>"}
<h3>D. Nhật ký đầy đủ</h3>${rows(["Thời điểm", "Bộ phận", "Sự kiện", "Chi tiết"], d.timeline.map(e => [hm(e.time), e.agent, e.type, e.summary]))}
</details>
</body></html>`;
}
