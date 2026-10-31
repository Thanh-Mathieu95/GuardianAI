import type { Pair } from "./types";
export const states: Record<string, Pair> = {
  READY: ["Sẵn sàng đồng hành", "Ready when you are"],
  CONTACTING: ["Đang chờ phản hồi", "Waiting for responses"],
  REVIEW: ["Có phương án để bạn xem", "A plan for you to review"],
  GUIDING: ["Đang theo phương án", "Following your plan"],
  NO_SUPPORT: ["Chưa có tuyến tiếp nhận", "No confirmed route yet"],
  CHECK_IN: ["Bạn vẫn ổn chứ?", "Are you OK?"],
  SIGNAL_LOST: ["Mất cập nhật vị trí", "Location updates lost"],
  COMPLETE: ["Hai bên đã gặp nhau", "Handoff confirmed"],
  CANCELLED: ["Phiên đã kết thúc", "Session ended"],
  RINGING: ["Đang báo trong app", "Alerting in the app"],
  ACCEPTED: ["Đã đồng ý", "Confirmed"],
  DECLINED: ["Không thể giúp", "Cannot help"],
  CLARIFY: ["Cần làm rõ", "Needs clarification"],
  REVOKED: ["Đã rút cam kết", "Commitment withdrawn"],
  ON_THE_WAY: ["Đang đến", "On the way"],
  KEEP_CONTACT: ["Giữ liên lạc", "Staying in touch"],
};
export const stages: Pair[] = [
  ["Một mình lúc khuya", "Walking alone at night"],
  ["Cùng tìm người giúp", "Reaching out together"],
  ["Mỗi người một lời đề nghị", "Different offers of help"],
  ["Một phương án có căn cứ", "One evidence-based plan"],
  ["Vì sao chọn nơi này?", "Why this destination?"],
  ["Bạn chọn lên đường", "The user chooses to go"],
  ["Khi cam kết thay đổi", "When a commitment changes"],
  ["Tránh đoạn đường tối", "Avoiding a dark segment"],
  ["Khi cần hỗ trợ khẩn cấp", "When urgent help is needed"],
  ["Mất liên lạc, giữ lại hồ sơ", "Contact lost, record preserved"],
];
export const errors: Record<string, Pair> = {
  CURRENT_LOCATION_REQUIRED: [
    "Cần vị trí GPS mới. Bật chia sẻ vị trí rồi thử lại.",
    "A current GPS location is required. Enable location and retry.",
  ],
  JOINED_CONTACT_REQUIRED: [
    "Mời ít nhất một người thân và đợi họ tham gia.",
    "Invite at least one contact and wait for them to join.",
  ],
  AI_NOT_CONFIGURED: [
    "Máy chủ chưa cấu hình AI. Bạn vẫn có thể dùng demo và SOS.",
    "AI is not configured. You can still use the demo and SOS.",
  ],
  AI_CONSENT_REQUIRED: [
    "Bật AI và đồng ý gửi nội dung trước.",
    "Enable AI and consent to sharing content first.",
  ],
  PLAN_CHANGED: [
    "Phương án đã thay đổi. Đọc phương án mới trước khi chấp nhận.",
    "The plan has changed. Review the new plan before accepting.",
  ],
  RATE_LIMIT: [
    "Đã đạt giới hạn thử. Đợi một lát rồi thử lại.",
    "Trial rate limit reached. Wait a little and retry.",
  ],
  SESSION_ENDED: [
    "Phiên đã kết thúc. Tạo phiên mới để tiếp tục.",
    "This session ended. Create a new one to continue.",
  ],
  NOT_FOUND: [
    "Link không còn hợp lệ. Xin link mời mới từ người gửi.",
    "This link is not valid. Ask the sender for a new invitation.",
  ],
  MICROPHONE_REQUIRES_HTTPS: [
    "Micro cần HTTPS. Mở link HTTPS trên điện thoại.",
    "Microphone needs HTTPS. Open the HTTPS link on your phone.",
  ],
  STATE_CONFLICT: [
    "Phiên vừa được cập nhật. Hãy thử lại thao tác.",
    "The session was updated. Please retry the action.",
  ],
  OPENAI_HTTP_429: [
    "API đã chạm quota hoặc giới hạn tần suất. SOS vẫn dùng được.",
    "The API reached its quota or rate limit. SOS still works.",
  ],
  OPENAI_HTTP_401: [
    "API key không được chấp nhận. Kiểm tra cấu hình máy chủ.",
    "The API key was not accepted. Check server configuration.",
  ],
};
