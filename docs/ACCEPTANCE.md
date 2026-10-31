# Acceptance và kiểm chứng

Các kiểm thử engine/policy dùng SQLite in-memory; các kiểm thử API dùng server local và cookie riêng, không có cuộc gọi thật.

| ID | Cách kiểm tra | Phạm vi |
|---|---|---|
| T01 | Engine SOS / confirmation; API SOS | Text tự động; mic cần thử quyền / nhận giọng nói trên máy |
| T02 | Fixture seed, state / SSE shared | Backend tự động; marker UI kiểm tra trực quan |
| T03 | Nhấn Dùng GPS rồi từ chối quyền | Xử lý lỗi đã viết; cần kiểm tra quyền trình duyệt thủ công |
| T04 | 3 places, source, capturedAt, verification | Engine tự động |
| T05 | Wrong mode, consent, allowlist, rate limit | Policy tự động; số thật không quay |
| T06 | 3 lane RINGING trước kết quả | Engine tự động |
| T07 | CONFIRMED có transcript / evidence | Engine tự động |
| T08 | Chỉ plan tới nơi confirmed | Engine tự động |
| T09 | Block → revision + geometry khác | Engine tự động, API integration |
| T10 | All unavailable → NO_RESPONDERS | Engine tự động |
| T11 | Stale invalidates plan, giữ timestamp | Engine tự động |
| T12 | 113 SIM không tạo call | Engine tự động |
| T13 | Snapshot replay không chạy tác vụ | Engine tự động |
| T14 | Cancel/reset vô hiệu callback cũ, isolation | Engine và API tự động |
| T15 | Desktop / Presentation / Spotlight | Kiểm tra giao diện; khả năng đọc từ hàng ghế cuối cần máy chiếu thật |

Không coi các phần mic, GPS permission, provider live, điện thoại vật lý, độ đọc máy chiếu là đã kiểm thử chỉ dựa vào unit test.

Các trường hợp thêm: ambiguous voice, freeze/resume, support revoked rồi confirm lại, thiếu Google key, TEST_LIVE chặn inject / mock provider, HTTP cross-origin và operator protection, session ownership, SSE nhận thay đổi từ trang khác và sau reset.

GPT 1.1: request Responses API với structured output, consent, redaction lỗi, không gửi GPS/số điện thoại tự động, đề xuất có xác nhận, planner kiểm tra evidence, fallback khi lỗi/quota và abort khi đóng incident. Kiểm thử tự động dùng mock HTTP transport; kiểm tra GPT live riêng bằng nút Test AI sau khi nhập key.
