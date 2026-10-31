# Trình diễn Guardian AI trên máy

## Demo cuộc gọi để thi

1. Mở **GuardianAI - Mở demo** trên Desktop hoặc `http://localhost:3131/demo/command-center`. Chọn VI/EN.
2. Bấm **Demo gọi song song / Parallel-call demo**. Ba cuộc gọi mô phỏng bắt đầu, hai cuộc chờ lượt. Không cần micro hoặc cấu hình nhà cung cấp điện thoại.
3. Mở một hàng trong **Cuộc gọi trong app** để xem AI hỏi riêng, lời người nhận và nhật ký kết nối. Nút **Nghe lời thoại mô phỏng** dùng giọng đọc trình duyệt.
4. Chỉ ra một nơi qua hẻm bị loại. Một lời đồng ý đủ điều kiện tạo phương án trong khi các cuộc khác vẫn tiếp tục. Lời đồng ý luôn có nguồn.
5. Trong màn hình điện thoại, bấm **Chấp nhận phương án**. Quan sát các cuộc gọi **Thông báo nhiệm vụ** gắn với phương án đã chọn.
6. Bấm **Tôi đã gặp người giúp**, sau đó **Mô phỏng: điểm tiếp nhận xác nhận gặp**. Hai xác nhận mới hoàn tất sự cố; cuộc gọi kết thúc không tự đồng nghĩa đã cứu giúp xong.
7. Mở **Hồ sơ**, xuất HTML/JSON. Phần **Tổng hợp có dẫn nguồn** dẫn tới lời nói và cuộc gọi gốc.
8. Bấm **Tạo phiên mới** để thử lại. Dùng **Chạy demo** cho kịch bản mười chặng có rút cam kết và mất liên lạc.

## Trình diễn luồng người nhận thật trong hai tab

Mở `http://localhost:3131/phone` hoặc nút **GuardianAI - Điện thoại**. Bật GPS, mời người nhận, sao chép link và mở trong tab thứ hai. Tab người nhận bấm **Đồng ý tham gia**, bật **Đồng ý nhận cuộc gọi AI trong app khi trang đang mở**. Đối tác cần tự lưu hồ sơ, đặt vị trí và bật đang trực. Quay lại tab người đi bộ và gửi SOS: người nhận thật bấm **Nhận cuộc gọi**, trả lời bằng chữ hoặc dùng micro khi cả hai phía đã đồng ý dùng AI. Cam kết quay về bộ điều phối. Luồng này không dùng câu trả lời giả từ kịch bản demo.

Demo và LIVE dùng phiên riêng. Muốn bật AI thật, chọn đồng ý xử lý nội dung rồi bật AI trong phần cài đặt thoại. API key chỉ nằm trên máy chủ. Chưa kiểm thử cuộc nói chuyện bằng micro thật; có thể trình diễn chữ trước và thử micro riêng trước giờ thi.

## Chuẩn bị

1. Giữ cửa sổ máy chủ đang chạy. Mở `http://localhost:3131/demo/command-center`.
2. Chọn VI hoặc EN. Dữ liệu tình huống là mô phỏng; thông tin gốc được giữ theo ngôn ngữ lúc tạo.
3. Tùy chọn mở **Nói chuyện với AI thật**, chọn đồng ý gửi nội dung tới OpenAI, bật AI. Có thể chạy toàn bộ demo khi AI tắt.
4. Bấm **Chạy demo**. Không bật micro nếu chỉ trình diễn luồng tự động.

## Câu chuyện khoảng hai phút

| Chặng | Điều cần chỉ ra |
| --- | --- |
| 1–2 | Người đi bộ cảm thấy bị theo dõi; 5 người nhận giả định được tạo trong engine. |
| 3 | Lời hứa mơ hồ chưa được nhận; địa điểm qua hẻm bị loại; ETA 10 phút là lời người thân tự báo. |
| 4–5 | Lời đồng ý rõ tạo phương án có nguồn. AI chỉ chọn trong những đề nghị đã qua kiểm tra. |
| 6 | Tình huống mô phỏng chấp nhận phương án và bắt đầu theo tuyến minh họa. |
| 7 | Điểm đang nhận rút cam kết: tuyến cũ mất hiệu lực, phương án thay thế cần chấp nhận lại. |
| 8 | Báo đoạn đường không phù hợp: tuyến minh họa thay đổi. |
| 9–10 | Ghi nhận thương tích, mất liên lạc, lưu hồ sơ. Ứng dụng không tự gọi khẩn cấp. |

Mở tab **Hồ sơ** để xem 3 phiên bản phương án, lời nói gốc, các lần niêm phong; mở báo cáo HTML và dùng Print / Save PDF. Bấm **Chạy lại** để trình diễn lại. Lời dẫn dùng giọng đọc của trình duyệt, không phải bằng chứng AI Realtime đã hoạt động.

## Thử thoại thật

Mở phần **Nói chuyện với AI thật**, chọn đồng ý, bấm **Bắt đầu thoại** và cho phép micro. Nói “Tôi đang đi bộ về nhà, tôi hơi lo”. Nội dung được gửi tới OpenAI. Ghi âm chỉ lưu nếu bạn chọn trước khi bắt đầu. Nút SOS luôn là quyết định riêng của người dùng. Thoại tự dừng sau 10 phút để giới hạn phiên demo.

## Thử hai vai trên cùng máy

Mở `/walk`, tạo phiên thật, bật GPS khi bạn muốn thử chia sẻ vị trí. Trong **Người đồng hành**, thêm người nhận, sao chép link mời và mở ở cửa sổ riêng. Người nhận phải đồng ý tham gia; điểm hỗ trợ cần khai báo vị trí và bật đang trực. Người dùng bấm SOS rồi người nhận trả lời. Khi chưa có Google Routes API, hệ thống giữ phản hồi nhưng chưa đưa ra tuyến thật.

Link `localhost` chỉ hoạt động trên chính máy này. Muốn thử trên điện thoại cần triển khai HTTPS sau; địa chỉ mạng LAN qua HTTP không đủ cho micro/GPS trên phần lớn trình duyệt.

## English walkthrough

Open `/demo`, select **EN**, optionally enable real AI with consent, then choose **Run demo**. Show the ambiguous offer, excluded alley entrance, confirmed destination, user acceptance, withdrawn commitment, route change and preserved record. Use **Pause**, **Next step** and **Run again** to control pacing. Open **Record** to inspect original statements and plan history.

For real voice, expand **Talk with live AI**, consent, then **Start voice** and grant microphone access. For a two-person device trial, open `/walk`, create a live session and invite a recipient through their private link. No notifications are delivered outside the app. Hosted HTTPS and a Routes API key are needed for a phone navigation trial.
