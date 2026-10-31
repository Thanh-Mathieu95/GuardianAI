# GPT qua OpenAI API

> Cập nhật 27/10/2026: [luồng agent demo](AGENT-DEMO.md) bổ sung vai CONTACT/PARTNER text độc lập và trích xuất có quote. Planner nhận kết quả có cấu trúc và route đã kiểm tra, không chỉ `CONFIRMED`. Mỗi nhánh tối đa 3 lượt/9 request, tổng 30 request hội thoại/trích xuất/incident; deadline nhánh 18 giây, ANALYZE/PLAN tối đa 12 giây (hoặc `AI_TIMEOUT_MS` nếu thấp hơn). Bộ đếm 40 request ANALYZE/PLAN sẵn có vẫn giữ riêng. Hai giới hạn được ghi rõ, không có retry vô hạn.

Phiên bản 1.1 tích hợp mô hình GPT bằng OpenAI Responses API, không gọi Ollama hoặc dịch vụ AI khác. Model mặc định là `gpt-4.1-mini`; có thể đổi tên model được tài khoản của bạn hỗ trợ trong `AI_MODEL`.

## Kết nối

1. Chạy `SETUP-AI.cmd` trong thư mục GuardianAI.
2. Enter để dùng model mặc định, rồi nhập OpenAI API key vào ô nhập che ký tự. Không gửi key qua chat.
3. Dừng server cũ bằng Ctrl+C, chạy `START-GUARDIAN.cmd`, tải lại trang.
4. Nhấn nhãn **AI CHƯA KẾT NỐI / AI OFF** trên thanh đầu hoặc **Kết nối AI thật** trong điện thoại.
5. Nhấn **Kiểm tra AI thật**. Đây là một request tới OpenAI với câu kiểm tra cố định, không gửi hội thoại của bạn.
6. Tick đồng ý gửi hội thoại, nhấn **Bật AI cho phiên này**.
7. Nhập câu mới rồi **Gửi cho AI**, hoặc **Nói với AI**. Bật biểu tượng loa để nghe giọng đọc trình duyệt.

Thiết lập thủ công trong `.env.local`:

```dotenv
AI_PROVIDER=OPENAI
AI_MODEL=gpt-4.1-mini
OPENAI_API_KEY=your-key-here
AI_TIMEOUT_MS=25000
```

Không đặt key vào biến `NEXT_PUBLIC_...`, code frontend hoặc git. Không cần cấu hình API key cho luồng demo dự phòng, nhưng thiếu key thì không thể có phản hồi GPT live. Model/credits/quyền truy cập phụ thuộc OpenAI project của bạn.

## GPT làm gì?

- Hiểu ý định từ tiếng Việt: trò chuyện, yêu cầu SOS, báo tuyến không đi được, muốn hủy, đã đến nơi, cần hỗ trợ khẩn cấp, câu mơ hồ.
- Đề xuất mức hỗ trợ 1–4, lý do và những gì chưa biết. Confidence là tự ước lượng của mô hình, chưa được hiệu chuẩn, không phải độ chính xác đã chứng minh.
- Trả lời theo trạng thái sự cố, nguồn dữ liệu, GPS stale và xác nhận tiếp nhận hiện có.
- Planner chỉ được chọn trong các điểm đã có `CONFIRMED`, với evidenceRefs thật của điểm đó. Model không được tạo địa điểm hay tuyến đường mới.
- Sau khi người dùng xác nhận báo đường chặn, Coordinator tính lại route và gọi planner cho kế hoạch mới.

Hủy SOS, báo đường chặn, xác nhận đến nơi và chuẩn bị tóm tắt cần bấm xác nhận trên UI; model không tự thực hiện. SOS rõ ràng, confidence ≥0.75 có thể khởi động pipeline theo yêu cầu người dùng; trường hợp confidence thấp chờ xác nhận. Không có quyền gọi điện hoặc tạo thông báo external được cấp cho model.

## Dữ liệu gửi OpenAI

Chỉ gửi nội dung người dùng tự nhập/nói, tối đa 8 lượt hội thoại gần nhất và các trường ngữ cảnh được chọn: chế độ demo, trạng thái, khu vực seed, độ cũ GPS, tên/loại/nguồn/trạng thái xác minh điểm, kết quả call, kế hoạch và evidence refs. Không tự đính kèm tọa độ GPS chính xác, số điện thoại, cookie phiên, owner ID, địa chỉ chi tiết hoặc transcript người nhận cuộc gọi. Nếu bạn tự nhập thông tin nhạy cảm vào lời nhắn thì nội dung đó vẫn được gửi.

Request dùng `store:false`; đây là cờ lưu response của API, không phải cam kết về toàn bộ chính sách lưu dữ liệu của nhà cung cấp. Dữ liệu local vẫn lưu trong SQLite theo chính sách demo. Key chỉ gửi trong Authorization header từ backend tới `https://api.openai.com/v1/responses`.

## Trạng thái minh bạch

| Nhãn | Ý nghĩa |
|---|---|
| OFF | Chưa bật AI cho incident |
| READY | Có cấu hình / consent, chưa chứng minh đã có phản hồi thành công |
| THINKING | Đang đợi OpenAI API |
| LIVE | OpenAI đã trả đầu ra đúng schema cho yêu cầu gần nhất |
| FALLBACK | AI lỗi / hết quota / timeout / output không hợp lệ; app dùng logic dự phòng khi có thể |

**AI LIVE và SIMULATION là hai thông tin khác nhau.** GPT có thể chạy thật trong khi địa điểm, call và route còn là fixture. Key GPT không tự bật Google Maps hay cuộc gọi điện thoại thật.

Xem **Lịch sử gọi model** để kiểm tra task, model, latency, request ID và status. Không lưu chain-of-thought. Tối đa 40 lần gọi model cho mỗi incident; nút Test AI bị giới hạn 15 giây/lần. Mỗi cuộc hội thoại và planner có thể tạo request riêng. Tắt AI hoặc đóng incident sẽ abort inference đang chờ; response đến muộn không được hồi sinh incident.

## Xử lý lỗi

- 401/403: kiểm tra key và quyền model của OpenAI project.
- 404: kiểm tra tên `AI_MODEL` được tài khoản hỗ trợ.
- 429: kiểm tra quota / giới hạn của API project.
- Timeout / mạng: kiểm tra Internet; SOS vẫn có fallback được gắn nhãn.
- Output không đúng schema: không thực thi đề xuất, ghi lỗi; không giả kết quả live.

Voice hiện là STT trình duyệt → GPT text → TTS trình duyệt. Chưa tích hợp Realtime audio, streaming audio hoặc cuộc gọi thoại từ GPT.

## Kiểm chứng

Tests dùng mock HTTP transport để kiểm tra request OpenAI, xử lý schema, consent, fallback, hủy inference và plan evidence. Các tests không chứng minh chất lượng suy luận thực tế của GPT. Kiểm tra live yêu cầu API key thật và được thực hiện riêng bằng nút Test AI. Không dùng status LIVE để thay cho đánh giá an toàn thực địa.

Nguồn triển khai: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [OpenAI Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create), [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini).
