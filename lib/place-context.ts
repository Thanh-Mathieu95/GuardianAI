import type { Incident, Place } from "./types";
import { meters } from "./geo";

export type VenueKind = "CONVENIENCE" | "HOTEL" | "PHARMACY" | "CAFE" | "RESTAURANT" | "PETROL" | "BANK" | "MARKET" | "POLICE" | "CLINIC" | "HOSPITAL" | "SECURITY";
export type VenueService = "WAITING" | "STAFF" | "WATER" | "CHARGING" | "FIRST_AID" | "MEDICINE" | "REPORT_CRIME" | "EMERGENCY_MEDICAL";
export type VenueProfile = {
  kind: VenueKind;
  goods: string[];
  services: VenueService[];
  hours: { open: string; close: string; allDay?: boolean; note?: string };
  limitations: string[];
  sourceKind: "SIMULATED";
};
export const venueLabels: Record<VenueKind, string> = {
  CONVENIENCE: "Cửa hàng tiện lợi", HOTEL: "Khách sạn", PHARMACY: "Nhà thuốc", CAFE: "Cà phê", RESTAURANT: "Quán ăn", PETROL: "Trạm xăng", BANK: "Ngân hàng / ATM", MARKET: "Siêu thị", POLICE: "Công an", CLINIC: "Phòng khám", HOSPITAL: "Cấp cứu bệnh viện", SECURITY: "Chốt bảo vệ",
};
export const serviceLabels: Record<VenueService, string> = {
  WAITING: "chỗ ngồi chờ", STAFF: "có nhân viên", WATER: "nước uống", CHARGING: "sạc điện thoại", FIRST_AID: "sơ cứu cơ bản", MEDICINE: "bán thuốc", REPORT_CRIME: "tiếp nhận trình báo", EMERGENCY_MEDICAL: "cấp cứu y tế",
};
const minute = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
export function venueHours(profile: VenueProfile, at: string) {
  const { hours } = profile;
  const local = new Date(Date.parse(at) + 7 * 3600000);
  if (!Number.isFinite(local.getTime())) return { status: "UNKNOWN" as const, label: "Giờ chưa xác định", closesIn: null };
  if (hours.allDay) return { status: "OPEN" as const, label: "24/24 · lịch mô phỏng", closesIn: null };
  const now = local.getUTCHours() * 60 + local.getUTCMinutes(), start = minute(hours.open), end = minute(hours.close);
  const open = start < end ? now >= start && now < end : now >= start || now < end;
  const closesIn = open ? (end - now + 1440) % 1440 : null;
  return { status: open ? "OPEN" as const : "CLOSED" as const, label: `${hours.open}–${hours.close} · giờ Việt Nam, mô phỏng`, closesIn };
}
export function assessmentTime(i: Pick<Incident, "scenarioClock" | "updatedAt">) { return i.scenarioClock ?? i.updatedAt; }

/** Domain knowledge guides research; it never manufactures incident-specific consent. */
export function assessPlace(i: Pick<Incident, "scenarioClock" | "updatedAt" | "transcript" | "emergency">, p: Place) {
  const profile = p.profile;
  const reasons: string[] = [], blockers: string[] = [];
  const publicService = !!profile && ["POLICE", "HOSPITAL", "CLINIC"].includes(profile.kind);
  if (!profile) return { score: 50, reasons: ["Chức năng và lịch hoạt động chưa được cung cấp; cần xác minh riêng"], blockers, hours: null, publicService: false, evidenceRefs: p.evidenceRefs };
  const hours = venueHours(profile, assessmentTime(i));
  const userText = i.transcript.filter(t => !["Guardian AI", "Hệ thống"].includes(t.speaker)).slice(-8).map(t => t.text).join(" ").toLocaleLowerCase("vi");
  const medical = !!i.emergency?.medical;
  const threat = /theo|đe dọa|đe doạ|tấn công|cướp|trình báo|công an/.test(userText);
  const water = /khát|mua nước|cần nước uống/.test(userText);
  const charging = /sạc|hết pin|pin yếu/.test(userText);
  let score = ({ HOTEL: 90, CONVENIENCE: 80, SECURITY: 75, MARKET: 65, CAFE: 60, RESTAURANT: 55, PETROL: 50, PHARMACY: 45, POLICE: 65, CLINIC: 35, HOSPITAL: 40, BANK: 10 })[profile.kind];
  reasons.push(`${venueLabels[profile.kind]}: ${profile.services.map(s => serviceLabels[s]).join(", ") || "chưa có dịch vụ hỗ trợ được mô tả"}`);
  if (profile.goods.length) reasons.push(`Cung cấp: ${profile.goods.join(", ")}`);
  if (hours.status === "CLOSED") {
    if (profile.kind === "POLICE") reasons.push("Ngoài giờ hành chính; tình trạng trực ban cần xác minh, không suy ra không có người trực");
    else blockers.push("Đã đóng cửa theo lịch mô phỏng; không chọn chỉ vì ở gần");
  }
  if (hours.closesIn !== null && hours.closesIn <= 15) blockers.push(`Còn ${hours.closesIn} phút đóng cửa; chưa xác nhận đủ thời gian tiếp nhận`);
  if (hours.status === "OPEN") reasons.push(`Đang trong giờ hoạt động: ${hours.label}`);
  if (medical) {
    if (profile.services.includes("EMERGENCY_MEDICAL")) { score += 100; reasons.push("Có chức năng cấp cứu y tế, phù hợp hơn nơi chỉ bán thuốc"); }
    else blockers.push("Không có chức năng cấp cứu y tế được mô tả; không thay bệnh viện hoặc 115");
  }
  if (threat && profile.kind === "POLICE") { score += 70; reasons.push("Phù hợp việc trình báo/nhờ hỗ trợ về đe dọa; chưa xác nhận tiếp nhận sự cố này"); }
  if (water) {
    if (profile.services.includes("WATER")) { score += 20; reasons.push("Có nước uống theo nhu cầu đã nêu"); }
    else blockers.push("Chưa có dịch vụ nước uống theo nhu cầu");
  }
  if (charging) {
    if (profile.services.includes("CHARGING")) { score += 25; reasons.push("Có hỗ trợ sạc theo mô tả; vẫn cần hỏi xác nhận"); }
    else blockers.push("Chưa xác minh hỗ trợ sạc điện thoại");
  }
  if (!publicService && !profile.services.includes("WAITING")) blockers.push("Không có chỗ chờ được mô tả");
  if (publicService) reasons.push("Cơ sở công khai: không tự gọi, không coi chức năng địa điểm là cam kết tiếp nhận");
  return { score, reasons, blockers, hours, publicService, evidenceRefs: [...p.evidenceRefs, `venue:${p.id}`] };
}

export function researchCandidates(i: Incident, places: Place[], count = 3) {
  if (count <= 0) return [];
  const ranked = places.map((p, order) => ({ p, order, a: assessPlace(i, p) }))
    .filter(({ p, a }) => p.contactEligibility === "ALLOWLIST" && !a.blockers.length)
    .sort((a, b) => !a.p.profile && !b.p.profile ? a.order - b.order : (b.a.score - meters(i.location, b.p) / 15) - (a.a.score - meters(i.location, a.p) / 15) || a.order - b.order);
  const selected: Place[] = [], kinds = new Set<string>();
  // Diversity prevents three identical shops from consuming every contact lane.
  for (const { p } of ranked) {
    const kind = p.profile?.kind ?? p.id;
    if (kinds.has(kind)) continue;
    selected.push(p); kinds.add(kind);
    if (selected.length === count) return selected;
  }
  for (const { p } of ranked) if (!selected.includes(p) && selected.length < count) selected.push(p);
  return selected;
}
