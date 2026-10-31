import type { Incident } from "./types";
export const statusCopy: Record<string, [string, string]> = {
  ACTIVE_TRIP: ["Sẵn sàng đồng hành", "Ready when you are"], SOS_RECEIVED: ["Đã nhận SOS", "SOS received"], TRIAGE: ["Đang xem xét nhu cầu", "Checking your needs"], SEARCHING: ["Đang tìm nơi hỗ trợ", "Looking for support"], CONTACTING: ["Đang chờ phản hồi", "Waiting for responses"], ROUTE_PROPOSED: ["Có phương án để bạn xem", "A plan for you to review"], GUIDING: ["Đang theo phương án", "Following your plan"], REPLANNING: ["Phương án đang thay đổi", "Revising the plan"], NO_RESPONDERS: ["Chưa có nơi nhận giúp", "No confirmed destination yet"], LOCATION_UNAVAILABLE: ["Cần cập nhật vị trí", "Location update needed"], CLOSED: ["Phiên đã kết thúc", "Session ended"], USER_CANCELLED: ["Đã dừng phiên", "Session stopped"], AWAITING_CONFIRMATION: ["Chờ bạn xác nhận", "Waiting for your confirmation"],
  RINGING: ["Đang báo trong app", "Alerting in the app"], ANSWERED: ["Đã trả lời", "Answered"], ON_THE_WAY: ["Đang đến", "On the way"], KEEP_CONTACT: ["Giữ liên lạc", "Staying in touch"], CANNOT_HELP: ["Không thể giúp lúc này", "Cannot help right now"], MISSED: ["Chưa trả lời", "No answer yet"], CONFIRMED: ["Đã đồng ý", "Confirmed"], DECLINED: ["Đã từ chối", "Declined"], CONNECTED: ["Đã nghe · chưa xác nhận", "Answered · not confirmed"], QUEUED: ["Đang chờ", "Queued"], NO_ANSWER: ["Không trả lời", "No answer"], FAILED: ["Không kết nối được", "Connection failed"],
};
export const demoSteps: [string, string][] = [["Một mình lúc khuya", "Walking alone at night"],["Liên hệ song song", "Reaching out together"],["Mỗi người một ý", "Different offers of help"],["Một phương án có căn cứ", "One evidence-based plan"],["Cân nhắc điểm đến", "Considering a destination"],["Người dùng chấp nhận", "The user accepts"],["Cam kết bị rút", "A commitment is withdrawn"],["Đường phía trước tối", "A dark road ahead"],["Tình huống khẩn cấp", "An emergency"],["Mất liên lạc, giữ hồ sơ", "Contact lost, record preserved"]];
export function demoSummary(i: Omit<Incident, "owner">, locale: "vi" | "en") {
  if (!i.showcase) return "";
  if (locale === "vi") return i.showcase.narration;
  if (i.showcase.status === "FAILED") return "The scenario stopped because an engine check failed. Review the original error in the record and restart.";
  const p = i.plans.find(p => !p.superseded), place = i.places.find(x => x.id === p?.selectedPlaceId);
  const facts = [`${i.calls.length} call branches; ${i.contacts.length} contacts.`, p ? `${place?.name}: plan revision ${p.revision}, ${p.acceptedAt ? "accepted" : "awaiting acceptance"}.` : "No active confirmed plan yet."];
  if (i.plans.some(p=>p.superseded)) facts.push(`${i.plans.filter(p=>p.superseded).length} previous plans invalidated.`);
  if (i.location.stale) facts.push("Contact is lost; the last reported location is retained.");
  if (i.evidenceShare) facts.push(`The sealed record is available to ${i.evidenceShare.to.length} designated contacts.`);
  return facts.join(" ");
}
