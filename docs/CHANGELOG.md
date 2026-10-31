# Guardian AI · Nhật ký thay đổi (v1.1 → v1.3)

Tài liệu này tóm tắt những gì đã được làm thêm trên bản MVP v1.1 (SOS → Research → Mock Calls → Plan → Replan, GPT qua Responses API).

---

## Tổng quan nhanh

| Hạng mục | Trước (v1.1) | Bây giờ (v1.3) |
|---|---|---|
| Giọng nói | Web Speech → GPT chữ → giọng đọc trình duyệt | **GPT Realtime** (WebRTC), nói chuyện liên tục, AI vừa nói vừa xử lý phía sau |
| Liên hệ người khác | 3 cuộc gọi mô phỏng theo kịch bản | **Gọi trong app** tới người thân và cửa hàng đối tác đã đăng ký, đổ chuông song song |
| Bản đồ | Sơ đồ trang trí, 3 điểm hư cấu | **Guardian City**: thành phố mô phỏng có tên phố, phố sáng/tối, hồ, công viên |
| Chỉ đường | Đường gấp khúc giả | **Chỉ đường từng bước**, ưu tiên phố sáng đèn, theo dõi liên tục, phát hiện đi lệch |
| Giao diện | Nhiều khối chữ, bản đồ nhỏ | Điện thoại + bản đồ to, thông tin cửa hàng hiện khi bấm |
| Điện thoại thật | Không | Tunnel HTTPS, link ghép phiên, giao diện toàn màn hình |
| Test | 30 | **46** unit test + test tích hợp API |

---

## 1. GPT Realtime: trò chuyện liên tục

- Backend cấp **khóa tạm** (`/v1/realtime/client_secrets`); trình duyệt nối thẳng tới OpenAI qua WebRTC. Key thật không rời máy chủ.
- Model mặc định `gpt-realtime` (đổi bằng `AI_REALTIME_MODEL`, ví dụ `gpt-realtime-mini` cho rẻ hơn).
- AI **gọi công cụ chạy nền** và tiếp tục nói chuyện trong lúc chờ kết quả:

| Công cụ | Việc làm |
|---|---|
| `trigger_sos` | Bật SOS: báo người thân + gọi cửa hàng đối tác |
| `silent_sos` | SOS bí mật khi nói mật mã an toàn |
| `share_with_contacts` | Báo người thân, chia sẻ vị trí, **không** bật SOS |
| `start_location_tracking` | Bật GPS điện thoại (bản đồ thật) |
| `get_location` | Đọc vị trí: phố, ngã tư, độ sáng/vắng, điểm gần nhất kèm khoảng cách và hướng |
| `get_directions` | Chỉ đường từng bước tới địa điểm hoặc "Nhà" |
| `get_status` | Trạng thái sự cố, cuộc gọi, người thân |
| `set_appearance` | Lưu thẻ nhận diện (trang phục) cho điểm tiếp nhận |
| `accept_route` / `report_route_blocked` | Đồng ý tuyến / báo đường bị chặn |
| `request_escalation` | Chuẩn bị tóm tắt + nút `tel:113` (người dùng tự bấm) |
| `checkin_ok` | Trả lời kiểm tra an toàn |
| `propose_cancel` / `propose_arrived` | Đề xuất hủy / đã tới, **cần bấm xác nhận trên màn hình** |

- Mỗi sự kiện backend quan trọng (đối tác đồng ý, người thân đang đến, chỉ dẫn tiếp theo, đi lệch, tới nơi…) được **đẩy vào hội thoại** để AI tự thông báo, đợi lúc không ai đang nói.
- **Thanh đo âm lượng micro**, trạng thái "Bạn đang nói…", **chọn micro**; app tự bỏ qua micro ảo (Voice Changer, Stereo Mix, VB-Cable…). Lỗi "AI không trả lời" lần đầu là do Chrome lấy micro ảo.

## 2. Tính năng an toàn mới

- **Mật mã an toàn**: nói câu cài sẵn (mặc định *"tối nay nấu canh chua nhé"*), SOS bật âm thầm; AI tiếp tục đóng vai người thân, truyền đạt cập nhật kín đáo; màn hình điện thoại giả làm cuộc gọi.
- **Cuộc gọi giả**: AI gọi đến, đóng vai người quen để răn đe người bám theo.
- **Đồng hành về nhà** (dead man's switch): quá giờ, dừng lâu, mất GPS hoặc đi lệch tuyến → *"Bạn ổn không?"*; 30 giây không trả lời → tự SOS. Về tới nơi → người thân thấy "đã an toàn".
- **Thẻ nhận diện**: mô tả trang phục chỉ gửi cho đối tác **sau khi** họ đồng ý tiếp nhận.
- **113**: chỉ mở trình quay số kèm tóm tắt; app không bao giờ tự gọi số khẩn cấp.

## 3. Mạng lưới gọi trong app (người thân + cửa hàng đối tác)

- Panel **Mạng lưới**: thêm người thân / đối tác, mỗi người có **link mời riêng** `/r/<token>`.
- Người nhận mở link trên điện thoại → **Đồng ý tham gia** → giữ trang mở.
- Khi SOS: **đổ chuông song song** trên tất cả app.
  - **Cửa hàng**: bấm Nghe → AI (Realtime) hỏi có tiếp nhận không → AI tự ghi nhận Đồng ý / Từ chối (hoặc bấm nút). Sau khi đồng ý mới thấy vị trí chính xác + thẻ nhận diện; AI tiếp tục báo *"người đó còn 200 m, đang ở Phố…"*. Có nút **Không thể tiếp nhận nữa** → hệ thống lập kế hoạch lại.
  - **Người thân**: bấm Nghe → AI tóm tắt và **cập nhật liên tục**; nút **Tôi đang đến**; **gọi trực tiếp cho người dùng** (WebRTC P2P).
- Cửa hàng mô phỏng chạy kèm **không bao giờ tự xác nhận thay** cửa hàng thật.
- **Đối tác đóng vai cửa hàng trên bản đồ**: khi thêm đối tác, chọn "Đóng vai: Khách sạn Bình Minh / Sao Mai / Phúc An"; cửa hàng đó trên bản đồ do người thật trả lời.
- **Người điều khiển đóng vai cửa hàng**: bấm cửa hàng trên bản đồ → **Đồng ý tiếp nhận / Từ chối** (cửa hàng mô phỏng đổ chuông ~6 giây để kịp bấm).

### Chống spam
- Tối đa `SOS_PER_HOUR` (mặc định 3) SOS/giờ được gọi tới đối tác; người thân **luôn** được báo.
- Đối tác báo **"báo động giả"** → trừ uy tín; uy tín ≤ −2 → chỉ báo người thân.
- Mỗi đối tác tối đa 5 cuộc chuông/giờ, có công tắc **Đang trực**.
- Giới hạn tạo phiên Realtime: 12 phiên / 10 phút / người.

## 4. Bản đồ mô phỏng Guardian City

- 9 phố có tên + **Ngõ Tối**; phố **thiếu sáng / vắng** vẽ nét đứt; **Hồ Trăng**, **Công viên Gió**, Chợ đêm.
- 5 địa điểm công khai (Cửa hàng 24h Sao Mai, Khách sạn Bình Minh, Nhà thuốc Phúc An, Công an phường, Trạm y tế) + 3 vị trí đối tác + **Nhà**.
- **Định vị**: *"Phố Liễu Rủ, cách ngã tư Phố Bàng Lăng 150 m · vắng người"*.
- **Tìm đường an toàn**: phố tối tính đắt hơn ×1.8, phố vắng ×1.25 → tuyến ưu tiên phố sáng, đông người.
- **Chỉ dẫn từng bước**: *"Đi theo Phố Liễu Rủ về phía đông 450 m → Rẽ trái vào Phố Ngọc Lan, đi 150 m → Đến Khách sạn Bình Minh"*.
- **Theo dõi liên tục**: chỉ dẫn tiếp theo hiện trên bản đồ + điện thoại và được AI đọc; lệch > 40 m → cảnh báo + tự lập tuyến mới; còn < 25 m → "Đã tới".
- **Chặn đường** đóng đúng đoạn phố phía trước; tuyến mới đi vòng.
- Thanh **MÔ PHỎNG DI CHUYỂN**: 🚶 Đi theo tuyến · +40 m · ↪ Đi lệch · 📍 Chạm để đặt vị trí.
- Mặc định mọi kịch bản mới dùng bản đồ này (vẫn chọn được Offline fixtures / Google trong Điều khiển).

## 5. Giao diện mới

- Trang chính chỉ còn: **điện thoại (cao hết màn hình) · bản đồ (lớn nhất) · cột tình hình** + thanh dưới mỏng.
- Bỏ tiêu đề lớn, menu, chân trang, khối sự kiện, danh sách cửa hàng dài, 6 thẻ agent to.
- Cửa hàng trên bản đồ là chấm tròn có chữ cái; **bấm vào mới hiện thẻ thông tin** (khoảng cách, trạng thái, cuộc gọi, câu trả lời gần nhất, nguồn); thẻ tự mở ở phía đối diện để không che điểm.
- Cột phải: hàng nhãn agent, quyết định điều phối, người thân, liên hệ song song, 7 diễn biến gần nhất.
- Điện thoại: bỏ quả cầu giọng nói, ô chữ ẩn sau **Nhập chữ**, vị trí thu vào mục **Vị trí**.
- Lỗi hiển thị dạng thông báo nổi; tự co giãn cho màn hình nhỏ.

## 6. Chạy trên điện thoại thật

- `START-TUNNEL.cmd`: Cloudflare quick tunnel (miễn phí) → link `https://…trycloudflare.com` (micro điện thoại bắt buộc HTTPS).
- Kiểm tra Origin/Cookie hỗ trợ tunnel (`x-forwarded-host`, `x-forwarded-proto`).
- **Link ghép điện thoại** (Mạng lưới → *Mở app người dùng trên điện thoại*): điện thoại dùng chung sự cố với laptop; link hết hạn sau 10 phút, cần quyền điều khiển.
- `/demo/phone` trên màn hình nhỏ hiển thị **toàn màn hình**, không khung điện thoại.

---

## File chính

| File | Nội dung |
|---|---|
| `lib/realtime.ts` | Cấp khóa Realtime, prompt + công cụ cho người dùng / đối tác / người thân, mô tả vị trí |
| `lib/city.ts` | Bản đồ Guardian City: phố, địa điểm, định vị, tìm đường, tiến độ, đi lệch |
| `lib/network.ts` | Người thân / đối tác, cài đặt an toàn, chống spam (SQLite) |
| `lib/receiver.ts` | Dữ liệu tối thiểu người thân / đối tác được xem |
| `lib/geo.ts` | Tính khoảng cách |
| `lib/engine.ts` | Thêm: gọi đối tác trong app, người thân, chuyến đi, điều hướng, mô phỏng di chuyển, đóng vai cửa hàng |
| `app/api/[...path]/route.ts` | Thêm API: mạng lưới, receiver, realtime, tool, trip, signal, pair, sim/move, place/decide |
| `components/client.ts` | WebRTC tới OpenAI, gọi P2P, nhạc chuông, đo micro |
| `components/companion.tsx` | Đồng hành giọng nói, cuộc gọi giả, đi về nhà, chỉ dẫn trên điện thoại |
| `components/receiver.tsx` | Trang `/r/<token>` cho người thân / đối tác |
| `components/network-panel.tsx` | Quản lý mạng lưới, mật mã, link ghép điện thoại |
| `components/dashboard.tsx` | Bố cục mới, bản đồ thành phố, thẻ cửa hàng, thanh mô phỏng |
| `app/voice.css`, `app/command.css` | Giao diện mới |
| `tests/network.test.ts`, `tests/city.test.ts` | Test mạng lưới, chống spam, chuyến đi, bản đồ, chỉ đường |
| `START-TUNNEL.cmd`, `docs/DEMO.md` | Tunnel HTTPS, kịch bản demo |

Biến môi trường mới trong `.env.local`: `AI_REALTIME_MODEL`, `SOS_PER_HOUR`.

## Kiểm chứng

- `npm test`: **46/46 pass**; `npm run typecheck` sạch; `npm run build` thành công.
- Test tích hợp API cũ (`tests/api.integration.ts`) pass với bản đồ mới.
- Chạy end-to-end qua HTTP thật: cấp phiên Realtime thật cho người dùng, đối tác, người thân; SOS → đổ chuông → đối tác đồng ý → **planner GPT thật** chọn đúng đối tác → người thân "đang đến" → chặn đường → v2 → 113 → đóng sự cố → báo động giả.
- Kiểm tra trên Chrome: bản đồ thành phố, thẻ cửa hàng, đi theo tuyến, đi lệch → tự lập kế hoạch v2.

## Chưa kiểm chứng / giới hạn

- Hội thoại giọng nói Realtime thực tế với micro thật và các công cụ bản đồ mới (cần người dùng thử).
- Gọi P2P giữa hai điện thoại thật; không có TURN server nên mạng chặn UDP có thể không nối được.
- App web chỉ đổ chuông khi trang người nhận đang mở; muốn chuông khi khóa màn hình cần app native + push.
- Bản đồ là thành phố mô phỏng; chưa có bản đồ đường phố thật. GPS thật trên laptop có thể lệch vài trăm mét.
- Mỗi phút Realtime tốn phí OpenAI.
- Event bus một tiến trình Node; scale nhiều máy chủ cần pub/sub chung.
