import type { Incident, Place } from "./types";
import { assessPlace } from "./place-context";

type MapState = Pick<Incident, "metrics" | "places" | "scenarioClock" | "updatedAt" | "transcript" | "emergency">;

export function mapPlaceAppearance(i: MapState, p: Place) {
  const assessment = assessPlace(i, p);
  const listed = p.id.startsWith("partner-") || p.contactEligibility === "ALLOWLIST";
  const outsideHours = assessment.hours?.status === "CLOSED" || (!p.profile && p.openingStatus === "CLOSED");
  // A police administrative schedule says nothing about current duty reception.
  const dutyUnknown = outsideHours && p.profile?.kind === "POLICE";
  const closed = outsideHours && !dutyUnknown;
  const availability = dutyUnknown ? "UNKNOWN" : closed ? "CLOSED" : assessment.hours?.status === "OPEN" || p.openingStatus === "OPEN" ? "OPEN" : "UNKNOWN";
  return {
    listed, closed, availability,
    group: listed ? "SUPPORT_LIST" as const : "REFERENCE" as const,
    groupLabel: listed ? "Trong danh sách hỗ trợ" : "Địa điểm tham khảo",
    availabilityLabel: dutyUnknown ? "Trực ban chưa xác minh" : availability === "CLOSED" ? "Đã đóng cửa" : availability === "OPEN" ? "Đang mở cửa" : "Giờ hoạt động chưa rõ",
    evidenceLabel: p.profile?.sourceKind === "SIMULATED" ? "Danh sách/giờ mô phỏng" : "Tiếp nhận cần xác nhận riêng",
  };
}

export function visibleMapPlaces(i: MapState, showClosed = false) {
  if (!i.metrics.sosAt) return [];
  return i.places.filter(p => showClosed || !mapPlaceAppearance(i, p).closed);
}

const codeLetter: Record<string, string> = { CAFE: "C", RESTAURANT: "Q", CONVENIENCE: "T", HOTEL: "K", PHARMACY: "N", POLICE: "A", HOSPITAL: "B", CLINIC: "B", SECURITY: "V", MARKET: "M", BANK: "G", PETROL: "X", HOME: "H" };
// Short catalogue code shared by the map labels and the coordination minute.
export function venueCode(places: { id: string; profile?: { kind: string } }[], placeId: string) {
  const n = places.findIndex(p => p.id === placeId);
  if (n < 0) return "";
  return `${codeLetter[places[n].profile?.kind ?? ""] ?? "D"}-${String(n + 1).padStart(2, "0")}`;
}
