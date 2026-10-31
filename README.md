# Guardian AI

Một người đồng hành khi đi bộ ban đêm: kiểm tra tình trạng, kết nối người thân và điểm hỗ trợ đã tham gia, ghi lại lời đồng ý và để người dùng quyết định phương án. Giao diện tiếng Việt / English. Bản viết mới bắt đầu ngày **31/10/2026**, độc lập với lịch sử dự án cũ.

## Demo trên máy

Yêu cầu Node.js 24 trở lên. API key chỉ nằm trong `.env.local`, không nằm trong Git hay trình duyệt. Máy của chủ dự án đã được cấu hình key riêng.

```powershell
npm ci
# Chỉ với máy mới: sao chép .env.example thành .env.local và điền cấu hình.
npm run build
npm run demo
```

Mở **http://localhost:3131/demo** rồi bấm **Chạy demo**. Chuyển **VI / EN** ở đầu trang. Mỗi chặng chạy sau khoảng 12 giây; có tạm dừng, bước tiếp, chạy lại và lời dẫn tùy chọn. [Kịch bản trình diễn](docs/LOCAL-DEMO.md).

Để thử AI thật, mở **Nói chuyện với AI thật**, đồng ý gửi nội dung tới OpenAI, rồi bật AI hoặc bắt đầu thoại. Bật AI trước khi chạy demo để phần phân tích lời đáp và lựa chọn phương án dùng API thật. Thoại cần quyền micro; ghi âm là lựa chọn riêng, mặc định tắt.

## Có gì hoạt động

- `/demo`: 10 chặng thực sự chạy qua engine — chờ phản hồi, loại lời hứa mơ hồ / lối qua hẻm, đề xuất tuyến, chấp nhận, rút cam kết, đổi phương án, báo đường không phù hợp, tình huống thương tích và mất liên lạc.
- `/walk`: phiên thiết bị thật, GPS có đồng ý, hẹn giờ kiểm tra, SOS do người dùng chọn, chat / thoại OpenAI Realtime, chế độ kín đáo.
- `/join/<token>`: người thân hoặc đối tác tham gia qua link riêng; khai báo trực, vị trí điểm tiếp nhận, phản hồi bằng chữ hoặc giọng nói, xác nhận đã gặp. Người dùng tự gửi link mời.
- Bộ lọc điều kiện bằng code chạy trước AI planner. Chỉ chọn trong lời đồng ý có nguồn; đổi tuyến cần chấp nhận lại. Không dùng tuyến mô phỏng cho LIVE.
- SQLite lưu trạng thái, phiên bản, transcript và các đoạn ghi âm. Kiểm tra băm SHA-256, xuất JSON / HTML để in PDF. PostgreSQL có adapter, chưa được thử với một dịch vụ cloud thật.

## Phạm vi bản demo

Địa điểm và con người trong demo là giả định. Các thông báo tới người nhận là **trong app**, cần trang mở; chưa có gọi điện PSTN, SMS hay thông báo nền. Trình duyệt có thể ngừng cập nhật GPS khi khóa màn hình. Ứng dụng không phải dịch vụ cứu hộ và không tự gọi số khẩn cấp.

LIVE có thể chia sẻ vị trí và phối hợp phản hồi. Chỉ đường đi bộ thật cần `GOOGLE_MAPS_API_KEY` với Routes API; nếu thiếu, ứng dụng không dựng tuyến thay thế. Tuyến do Google trả về cũng không xác minh ánh sáng hoặc bảo đảm an toàn.

Đây là bản local để trình diễn và thử nghiệm có giám sát. Chưa công bố URL internet. Chưa xác minh giao diện trực tiếp / thoại micro trên trình duyệt trong lượt kiểm tra tự động vì công cụ điều khiển trình duyệt trên Windows bị dừng.

## Kiểm thử

```powershell
npm run typecheck
npm test
npm run build
npm run test:api
# Tùy chọn: 4 yêu cầu API thật, có chi phí; không dùng micro hoặc vị trí cá nhân.
npm run test:ai
```

Kiểm thử HTTP tự tạo máy chủ với cơ sở dữ liệu trong bộ nhớ, tắt AI và không gửi thông báo ngoài. Kiểm tra quyền sở hữu, Origin, dữ liệu cũ, riêng tư của người nhận, 10 chặng demo, ghi âm và báo cáo. [Kiến trúc và giới hạn triển khai](docs/ARCHITECTURE.md).

## English

Guardian AI is a bilingual night-walk coordination prototype. The new implementation and Git history begin on October 31, 2026.

Run `npm ci`, configure `.env.local`, then `npm run build` and `npm run demo`. Open **http://localhost:3131/demo**, select **EN**, and press **Run demo**. The ten-stage simulation exercises the actual coordination engine. Enable AI with consent to use real Responses and Realtime APIs; microphone access is optional and recording requires separate consent.

Live device sessions use actual GPS and consenting recipients. There is no background notification or telephone gateway. Real walking directions require a Google Routes API key. Simulated venues and routes never become live navigation. This local preview has backend and API checks; visual browser and microphone verification remain pending. See [the demo walkthrough](docs/LOCAL-DEMO.md).
