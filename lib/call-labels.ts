import type { CallState } from "./coordination-types";
import type { Pair } from "./types";
export const callLabels: Record<CallState, Pair> = {
  QUEUED: ["Đang chờ kết nối", "Queued"],
  CALLING: ["Đã gửi cuộc gọi trong app", "Call delivered in app"],
  RINGING: ["Đang đổ chuông trong app", "Ringing in app"],
  CONNECTED: ["Đã kết nối", "Connected"],
  CONVERSING: ["Đang hội thoại riêng", "Private conversation"],
  COMPLETED: ["Cuộc gọi hoàn tất", "Call completed"],
  NO_ANSWER: ["Không trả lời", "No answer"],
  BUSY: ["Đang bận", "Busy"],
  DECLINED: ["Từ chối cuộc gọi", "Call declined"],
  ERROR: ["Chưa thể gọi", "Call unavailable"],
  CANCELLED: ["Đã hủy cuộc gọi", "Call cancelled"],
};
