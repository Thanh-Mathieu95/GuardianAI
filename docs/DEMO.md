# Kịch bản demo v1.2 (khoảng 5 phút)

> **Cập nhật 27/10/2026:** dùng [demo hội thoại agent một máy 3–5 phút](AGENT-DEMO.md) cho phần trình diễn mới. Các bước dưới là luồng nhiều thiết bị cũ; xác nhận tiếp nhận hiện cần cửa vào/loại hỗ trợ/điều kiện, và kết thúc demo cần xác nhận bàn giao hai chiều. Không thực hiện cuộc gọi số thật.

## Chuẩn bị (trước giờ thi 15 phút)

1. `START-GUARDIAN.cmd` (server) rồi `START-TUNNEL.cmd` (HTTPS). Lấy link `https://….trycloudflare.com`.
2. Laptop trình chiếu mở `https://….trycloudflare.com/demo/command-center`. **Mọi thao tác sau dùng link https này**, không trộn với `127.0.0.1` (cookie khác nhau).
3. Bấm **Mạng lưới**: đặt tên (VD "Lan"), thẻ nhận diện ("áo khoác đỏ, balo đen"), mật mã an toàn, người gọi giả ("Mẹ"). Lưu.
4. Thêm thành viên: **Mẹ** (người thân), **Khách sạn Hoa Sen** và **Circle K Hàng Bông** (đối tác). Copy từng link, gửi sang điện thoại của bạn trong nhóm, mở link, bấm **Đồng ý tham gia** (bước này cũng bật chuông). Giữ màn hình sáng, trang mở.
5. Đeo tai nghe có micro cho người đóng vai người dùng; kiểm tra quyền micro trên cả laptop lẫn điện thoại.

## Trên sân khấu

| Bước | Thao tác | Khán giả thấy |
|---|---|---|
| 1 | Bấm **Đồng hành về nhà** → Bắt đầu | Mẹ thấy "Lan đang được Guardian đồng hành" |
| 2 | Bấm **Trò chuyện với Guardian**, nói chuyện bình thường | AI nói liên tục, transcript chạy |
| 3 | Nói **mật mã an toàn** ("tối nay nấu canh chua nhé") | AI vẫn đóng vai Mẹ đáp tự nhiên; màn hình điện thoại chuyển sang cuộc gọi giả; dashboard SOS bí mật |
| 4 | — (tự động) | **Điện thoại Mẹ + 2 đối tác cùng đổ chuông**. Mock lanes chỉ từ chối / không nghe |
| 5 | Đối tác Circle K bấm **Từ chối**; Khách sạn bấm **Nghe** | AI nói với lễ tân: "có người cách 350 m, áo khoác đỏ…"; lễ tân nói "Được" → AI tự `confirm_support` |
| 6 | — | GPT planner chọn Khách sạn (lý do + bằng chứng), plan v1; AI trong tai nói kín đáo "Mẹ nhờ cô lễ tân khách sạn Hoa Sen ra đón con" |
| 7 | Mẹ bấm **Nghe** → AI tóm tắt → Mẹ nói "mẹ đang tới" | Chip "Mẹ · đang đến"; AI báo lại cho Lan |
| 8 | Giám khảo bấm **Block Route** | Plan v2, AI: "đường đó bị chặn, mình đổi tuyến" |
| 9 | Lễ tân bấm **Không thể tiếp nhận nữa** (tùy chọn) | Kế hoạch bị hủy và lập lại: chính con người làm thay đổi plan |
| 10 | Người dùng nói "tới nơi rồi" → bấm Xác nhận | CLOSED, KPI, Mẹ thấy "đã an toàn", đối tác có nút báo động giả |

Phương án nhanh không cần mật mã: ở bước 2 nói thẳng "có người đi theo tôi, giúp tôi" → AI gọi `trigger_sos`.

Demo "Đi cùng tôi về nhà": trong **Demo Controls** bấm **Đi về: dừng bất thường** → điện thoại hỏi "Bạn ổn không?", đếm 30 giây; không trả lời → tự động SOS.

## Dự phòng

- Mất mạng / OpenAI lỗi: dùng nút **SOS** và **Mock Calls** như bản cũ (offline hoàn toàn).
- Đối tác không nghe máy: sau 45 giây lane thành NO_ANSWER; **Hotel xác nhận** trong Demo Controls vẫn dùng được với điểm mô phỏng.
- Điện thoại không đổ chuông: kiểm tra đã bấm "Đồng ý tham gia" / "Bật chuông", trang còn mở, chấm xanh ở góc phải (đã kết nối).
- Giới hạn chống spam: 3 SOS/giờ/người dùng mới gọi đối tác; tập nhiều lần trong 1 giờ thì đối tác sẽ không đổ chuông (người thân vẫn được báo). Khi tập, đặt `SOS_PER_HOUR=50` trong `.env.local`; trả về 3 trước giờ thi nếu muốn trình diễn chống spam.
- 113: chỉ mở trình quay số kèm tóm tắt; **không bấm gọi** khi demo.

## Bản đồ 3D Thủ Thiêm + lịch sử sự cố (v1.4)

Mặc định mọi kịch bản mới chạy trên **phố thật** của Khu đô thị mới Thủ Thiêm (TP. Thủ Đức), lấy từ OpenStreetMap (`scripts/fetch-city.mjs` → `lib/city-data.json`, đã commit nên định tuyến chạy offline). Bản đồ nền 3D là MapLibre + OpenFreeMap (miễn phí, không cần key; cần mạng để tải tile): nhà dựng khối, camera nghiêng, tự bay tới người dùng khi SOS.

- **Cửa hàng tự dựng**: 5 điểm hỗ trợ + 3 vị trí đối tác đặt bên lề phố thật, hiện thành khối 3D đổi màu theo trạng thái.
- **Lịch sử sự cố (DỮ LIỆU MÔ PHỎNG)**: giật đồ, bám theo, quấy rối, đèn hỏng… hiện thành vùng nhiệt đỏ; bấm chấm đỏ để xem chi tiết. Đoạn phố có sự cố phát sáng đỏ.
- **Định tuyến an toàn**: chi phí = độ dài × thiếu đèn × vắng người × rủi ro sự cố. Mỗi tuyến có `advisories`, VD *"Không đi lối tắt qua Đường D6 (ngắn hơn 59 m): từng có 2 vụ giật đồ, 1 vụ bám theo… thiếu đèn; vắng người."*
- **AI hiểu ngữ cảnh**: `get_directions` trả kèm lý do; tool mới `get_area_safety` tra sự cố quanh vị trí hoặc theo tên phố; `get_location` có `incidentsNearby`.
- Thử: Kịch bản mới → nói "đưa tôi về nhà" / "đi tắt qua đường D6 được không?".

Thanh **MÔ PHỎNG DI CHUYỂN** dưới bản đồ:
- **Đi theo tuyến**: tự đi 40 m mỗi 1,6 giây; AI đọc chỉ dẫn tiếp theo ("50 m nữa rẽ trái vào…").
- **+40 m**: đi từng bước.
- **Đi lệch**: rẽ sai vào phố không thuộc tuyến (ưu tiên phố tối); AI cảnh báo, hệ thống lập tuyến mới từ vị trí hiện tại. Nếu đang "Đồng hành về nhà" thì app hỏi "Bạn ổn không?".
- **Chạm để đặt vị trí**: bấm vào bản đồ để chuyển bạn tới đó (tự bám vào phố gần nhất).

Câu nói gợi ý: "Tôi đang ở đâu?", "Chỉ đường cho tôi tới công an phường", "Đưa tôi về nhà", "Phố này có an toàn không?", "Có người đi theo tôi".
