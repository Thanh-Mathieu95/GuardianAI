"use client";
import { useState } from "react";
import { Clock, MapPin, Search } from "lucide-react";
import type { Incident } from "@/lib/types";
import { assessPlace, assessmentTime, venueLabels } from "@/lib/place-context";
import { mapPlaceAppearance, visibleMapPlaces } from "@/lib/map-places";

export default function PlaceDirectory({ state, act, disabled, onSelect, showClosed, onShowClosed }: {
  state: Omit<Incident, "owner">; act: (action: string, body?: object) => Promise<void>; disabled: boolean; onSelect: (id: string) => void;
  showClosed: boolean; onShowClosed: (value: boolean) => void;
}) {
  const [filter, setFilter] = useState("");
  const [time, setTime] = useState("22:15");
  if (state.placesAdapter !== "CITY" || !state.metrics.sosAt) return null;
  const at = new Date(Date.parse(assessmentTime(state)) + 7 * 3600000).toISOString().slice(11, 16);
  const places = visibleMapPlaces(state, showClosed).map(p => ({ p, a: assessPlace(state, p), appearance: mapPlaceAppearance(state, p) }));
  const closedCount = state.places.filter(p => mapPlaceAppearance(state, p).closed).length;
  const visible = places.filter(({ p }) => !filter || p.profile?.kind === filter).sort((a, b) => Number(!!a.a.blockers.length) - Number(!!b.a.blockers.length) || b.a.score - a.a.score);
  return <details className="venue-directory">
    <summary><MapPin size={16} /><b>Khám phá {places.length} địa điểm</b><span>{at} · giờ tình huống</span><span>{showClosed ? "Đang xem cả nơi đã đóng" : `Ẩn ${closedCount} điểm đã đóng`}</span><span>Danh sách hỗ trợ · tham khảo đang mở</span></summary>
    <div className="venue-toolbar"><label><Search size={14} /> Loại điểm<select aria-label="Lọc loại địa điểm" value={filter} onChange={e => setFilter(e.target.value)}><option value="">Tất cả loại địa điểm</option>{Object.entries(venueLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
      <label className="venue-closed-toggle"><input type="checkbox" checked={showClosed} onChange={e => onShowClosed(e.target.checked)} />Hiện điểm đã đóng cửa</label>
      {state.mode === "SIMULATION" && <label><Clock size={14} /> Giờ mô phỏng<input aria-label="Giờ tình huống" type="time" value={time} onChange={e => setTime(e.target.value)} /><button disabled={disabled || !time || ["CLOSED", "USER_CANCELLED"].includes(state.status)} onClick={() => act("world/time", { time })}>Áp dụng giờ</button></label>}
    </div>
    <p className="venue-note">Địa điểm, giờ và dịch vụ là dữ liệu dựng cho demo trên đường phố OSM. Biết chức năng địa điểm không đồng nghĩa đã xác nhận người trực hoặc cam kết hỗ trợ.</p>
    <div className="venue-grid">{visible.map(({ p, a, appearance }) => <button key={p.id} className={`venue-item ${appearance.listed ? "is-support-listed" : "is-reference"}`} onClick={() => onSelect(p.id)}>
      <div><b>{p.name}</b><span className={appearance.closed ? "is-closed" : "is-open"}>{appearance.availabilityLabel}{a.hours?.closesIn !== null && a.hours?.closesIn !== undefined && a.hours.closesIn <= 30 ? ` · còn ${a.hours.closesIn} phút` : ""}</span></div>
      <span className="venue-affiliation">{appearance.groupLabel}</span>
      <small>{p.profile ? venueLabels[p.profile.kind] : p.category} · {a.hours?.label ?? "Chưa có lịch"}</small>
      <p>{a.reasons[0]}</p><p className={a.blockers.length ? "venue-warning" : ""}>{a.blockers[0] ?? (a.publicService ? "Phù hợp chức năng; cần người dùng liên hệ và xác minh" : "Có thể hỏi khả năng hỗ trợ; chưa mặc định đã đồng ý")}</p>
    </button>)}{!visible.length && <p className="venue-note">Không có điểm đang mở thuộc loại này. Có thể bật xem điểm đã đóng để kiểm tra giờ.</p>}</div>
  </details>;
}
