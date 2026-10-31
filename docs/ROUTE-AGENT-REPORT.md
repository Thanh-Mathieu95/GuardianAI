# Agent điều phối, quyết định tuyến và báo cáo liên tục

Cập nhật: 28/10/2026. Triển khai trên kiến trúc hiện có, không đổi framework, không gọi số điện thoại thật. Đợt này không gửi inference, âm thanh hoặc request Google trả phí. Chất lượng AI live và thử giọng nói nhiều máy để kiểm chứng sau khi có quota.

## Bản chạy hiện tại và bật lại sau

Đã build và cập nhật server cổng **3000**, đang chạy với **AI_PROVIDER=OFF ở môi trường tiến trình** để không dùng quota của người dùng. Không sửa hoặc in key/cấu hình trong `.env.local`; database/thành viên hiện có được giữ. Trang command center và health local trả thành công. Server QA 3108 đã dừng. Tải lại trang để nhận bản giao diện mới.

Khi có quota, mở **PowerShell mới**, kiểm tra/dừng đúng server Guardian đang ở cổng 3000, rồi chạy lại bằng cấu hình bình thường:

```powershell
cd 'C:\Users\MSI PC\Documents\GuardianAI'
$guardianListener = Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue
if ($guardianListener) {
  $guardianProcessId = $guardianListener.OwningProcess | Select-Object -Unique
  $guardianProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $guardianProcessId"
  if ($guardianProcess.CommandLine -notlike '*GuardianAI*next*start*') {
    throw 'Cổng 3000 không khớp server GuardianAI; không tự dừng.'
  }
  Stop-Process -Id $guardianProcessId
}
.\START-GUARDIAN.cmd
```

Lệnh trên chỉ dừng server đúng dự án, không xóa dữ liệu. Cần bảo đảm `.env.local` có `AI_PROVIDER=OPENAI` và key hợp lệ theo cấu hình sẵn có; nếu chính file đang đặt OFF thì giữ OFF cho đến khi chủ động đổi. Sau khi khởi động lại, bật AI/consent cho phiên và mở AI đồng hành. Nút bật AI trên giao diện không thể ghi đè AI_PROVIDER=OFF của tiến trình.

## Luồng đã nối trong code

1. Người dùng trao đổi với AI đồng hành. AI dùng tool kích hoạt SOS; backend tạo nhiệm vụ và gọi các nhánh trong ứng dụng song song.
2. Mỗi bên trao đổi với AI riêng. Transcript gốc được lưu; phản hồi mơ hồ cần làm rõ; backend kiểm tra dữ kiện có bằng chứng trước khi đưa vào ứng viên.
3. Planner GPT chọn điểm tiếp nhận từ các nơi đủ điều kiện. Agent tuyến tạo các tuyến có nguồn tới nơi đó, kiểm tra giới hạn người dùng/điều kiện/thời hạn cho từng tuyến.
4. Khi có nhiều tuyến hợp lệ và AI được bật, task GPT `ROUTE_DECISION` phân loại **từng tuyến**, chọn một `selectedRouteId` và trả lý do/bằng chứng. Backend chặn ID lạ, bằng chứng chéo tuyến hoặc đánh giá trùng/thiếu tuyến.
5. Kế hoạch chứa điểm đến, tuyến được chọn, `routeDecisionId`, lý do chọn nơi và chọn tuyến. AI đồng hành nhận tóm tắt realtime từ cùng trạng thái backend với bản đồ.
6. Người dùng chấp nhận đúng phiên bản kế hoạch trước khi hướng dẫn. Agent tuyến được gọi theo ticker backend 2 giây, theo dõi giới hạn, dữ kiện tiếp nhận, vị trí cũ và các đoạn bị chặn. Chỉ thay đổi liên quan mới kích hoạt đánh giá lại; không gọi GPT mỗi 2 giây.
7. Mọi lần lưu trạng thái đều tạo phiên bản báo cáo nếu nội dung đổi, kể cả cập nhật transcript không tạo timeline event. Báo cáo giữ lịch sử kế hoạch, quyết định, nguồn/bằng chứng và bàn giao hai chiều.

AI đồng hành là giao diện điều phối bằng hội thoại. Backend giữ quyền thực thi và kiểm tra. Agent tuyến là worker có vòng theo dõi và công cụ định tuyến, kết hợp task quyết định GPT khi cần; không giả vờ mỗi tick theo dõi đều là một lượt suy luận model.

## Các tuyến đến từ đâu

- **CITY:** tối đa 3 tuyến hình học khác nhau trên đồ thị đường đang có. Lấy tuyến cơ sở và thử loại từng cạnh để tìm tuyến khác, tối đa 12 lần thử. Cạnh bị loại để tìm phương án khác không được coi là một báo cáo đường nguy hiểm/bị chặn. Các đoạn thực sự đang bị chặn vẫn được loại trong mọi phương án.
- **FIXTURE / GOOGLE hiện tại:** adapter chỉ trả một tuyến thì giữ một tuyến; không tự tạo tuyến thứ hai để trình diễn. Chưa mở rộng Google alternatives trong đợt này.
- Mỗi tuyến có ID phân biệt cả phiên bản và điểm đến, nguồn, thời điểm lấy, geometry, quãng đường, bước hướng dẫn và dữ liệu cảnh báo nếu có.
- ETA chỉ đưa cho model/hiển thị báo cáo như dữ liệu đáng tin khi nguồn LIVE có thời gian. Tuyến CITY vẫn mang nhãn SIMULATED; thời gian tính từ tốc độ giả định không được dùng thay ETA live.
- Model không tạo geometry, không tự biết cửa mới ở tọa độ nào, không tuyên bố tuyến an toàn nhất.

## Quyết định GPT và chi phí

Dùng cấu hình server sẵn có `OPENAI_API_KEY`, `AI_MODEL`, `AI_PROVIDER`; gọi Responses API với JSON Schema strict. Đây là task quyết định tuyến trong dự án, không phải tích hợp một endpoint Decisions API riêng hoặc tạo một loại API key mới.

Một lần lập kế hoạch mới có thể có một request `PLAN` để chọn nơi và thêm tối đa một request `ROUTE_DECISION` nếu có nhiều tuyến hợp lệ tới nơi đã chọn. Task mới dùng **chung** giới hạn 40 request phân tích/lập kế hoạch cho incident và deadline tối đa 12 giây/lượt (hoặc cấu hình thấp hơn); không có retry vô hạn. Budget hội thoại/trích xuất 30 request riêng và các giới hạn nhánh cũ vẫn giữ. Chi phí phiên Realtime giọng nói vẫn phụ thuộc thời lượng như trước.

Kế hoạch đã chấp nhận và còn hợp lệ được giữ ổn định. Thêm nơi đồng ý không tự đổi điểm đến; dữ kiện mất hiệu lực/đường bị chặn khiến đánh giá lại và yêu cầu chấp nhận kế hoạch mới. Kết quả model đến muộn sau hủy không được tạo kế hoạch hoặc kích hoạt thêm trích xuất.

Các nhãn được lưu và hiển thị trong **Chi tiết hoạt động agent → Theo dõi → Lý do & so sánh**:

| Nhãn | Ý nghĩa |
|---|---|
| AI_LIVE | Model đã trả quyết định tuyến hợp lệ; đây không biến dữ liệu bản đồ mô phỏng thành dữ liệu live. |
| RULES_FALLBACK | AI tắt/lỗi/hết budget; dùng tuyến cơ sở đã kiểm tra, kèm lý do dự phòng. |
| SINGLE_OPTION | Chỉ có một tuyến hợp lệ từ nguồn, không cần giả lập việc model so sánh nhiều tuyến. |
| KEPT_CURRENT | Đánh giá cập nhật nhưng giữ kế hoạch hiện hành còn hợp lệ. |

Lý do do GPT viết là bản đánh giá của model, không phải dữ kiện bên ngoài đã được chứng thực độc lập. Backend kiểm tra điều kiện, ID và tham chiếu nguồn; không coi việc đúng schema là đảm bảo model suy luận đúng.

## Báo cáo và lưu trữ

- Bỏ cơ chế tự xóa sự cố sau 24 giờ khi mở database. Không khôi phục được dữ liệu đã bị phiên bản trước xóa.
- Bảng SQLite `report_revisions` lưu từng phiên bản thay đổi của trạng thái, số thứ tự, thời điểm lưu, băm bản trước và băm hiện tại. Lưu trùng nội dung không sinh thêm phiên bản. Snapshot xuất không chứa owner/cookie/API key.
- `GET /api/incidents/:id/evidence`: báo cáo HTML để đọc/in/lưu PDF. Thêm `?format=json` để lấy hồ sơ có cấu trúc cùng tình trạng kiểm tra chuỗi.
- `GET /api/incidents/:id/report-history`: toàn bộ phiên bản, dữ liệu snapshot và kết quả kiểm tra chuỗi. Endpoint yêu cầu đúng quyền phiên sở hữu, như endpoint sự cố hiện có.
- Báo cáo schema 2 gồm nhu cầu, transcript từng nhánh, dữ kiện trích xuất, câu hỏi thiếu, tất cả kế hoạch, mọi quyết định tuyến và ứng viên, nguồn/ETA, model/task/request ID, timeline có evidenceRefs, lời khai, hành trình và bàn giao hai chiều.
- Bản HTML là ảnh chụp dữ liệu ở lúc tải. Cần tải lại để xem cập nhật mới. Database và lịch sử báo cáo được ghi theo từng thay đổi; chưa có màn hình báo cáo riêng tự làm mới.
- Link nằm trong mục thu gọn **Hồ sơ và lịch sử quyết định** của phương án; đường dẫn API vẫn dùng được khi không có phương án hợp lệ.
- Chức năng xóa transcript khi kết thúc incident vẫn được giữ: xóa cả lịch sử báo cáo/replay chứa nội dung và các lý do/quyết định dẫn xuất mới; bắt đầu một chuỗi mới từ trạng thái đã xóa nội dung.

Chuỗi băm giúp phát hiện thay đổi nội dung khi đối chiếu với bản đã lưu. Không phải chữ ký số, dấu thời gian độc lập hoặc kho bất biến trước người quản trị database. Cần giữ bản xuất/head hash ở nơi riêng để đối chiếu; chưa tích hợp dịch vụ lưu trữ ngoài máy. Dữ liệu tích lũy cần được người vận hành quản lý và sao lưu; không tự gửi toàn bộ báo cáo cho đối tác/người thân hoặc model.

## Cách thử sau khi có quota — 3–5 phút

1. Khởi động server bằng cấu hình bình thường, bật AI và đồng ý cho phiên. Dùng luồng **Nhiều máy · người trong mạng lưới** để có bản đồ CITY; gửi link HTTPS cùng backend cho các bên. Mở AI đồng hành trên máy nhân vật sau khi tạo/reset phiên.
2. Một đối tác nói mơ hồ rồi làm rõ quyết định, chỗ chờ, cửa và điều kiện. Xem từng transcript/bằng chứng. Chưa đủ điều kiện thì không có kế hoạch tiếp nhận.
3. Khi có nơi phù hợp, xem **Lý do & so sánh**: trên CITY có thể có nhiều tuyến; khi model thành công xuất hiện task ROUTE_DECISION và nhãn GPT đã đánh giá tuyến. Xem lý do riêng từng tuyến và nguồn mô phỏng/live. Đồ thị không có tuyến khác thì chỉ có SINGLE_OPTION là đúng.
4. Nhân vật chấp nhận, sau đó thử đối tác thu hồi hoặc thao tác đường bị chặn hiện có. AI đồng hành thông báo; map gỡ hiệu lực tuyến cũ, trình bày phương án mới và chờ chấp nhận lại. Không có nơi/tuyến hợp lệ thì không hướng dẫn tiếp nhận.
5. Mở báo cáo: kiểm tra lịch sử kế hoạch, tuyến, điều kiện, nguồn, bằng chứng và task model; tải JSON lịch sử và ghi lại head hash. Hoàn thành xác nhận bàn giao hai chiều để thấy trạng thái cuối được lưu.

Demo một máy **Kịch bản** mặc định dùng FIXTURE: vẫn kiểm tra hội thoại/điều kiện nhưng có thể chỉ có một tuyến. Để kiểm tra nhiều tuyến mà không dùng thêm người, dùng luồng CITY + Mock Calls hiện có trong điều khiển; khi AI OFF, phải thấy RULES_FALLBACK chứ không phải GPT live.

## Kiểm chứng trong đợt triển khai này

- `npm test`: 84/84 PASS; AI_PROVIDER=OFF cho môi trường test. Những bài kiểm tra model dùng mock transport, không request model thật.
- Typecheck và build PASS. HTTP/SSE integration chạy trên server riêng in-memory, AI OFF; có kiểm tra quyền báo cáo, chuỗi lịch sử và xóa dữ liệu dẫn xuất.
- Thêm test cho tuyến thay thế từ đồ thị, GPT chọn tuyến khác qua mock, ID/bằng chứng/đánh giá thiếu hoặc trùng bị chặn, vòng theo dõi đường bị chặn, callback model muộn bị bỏ, lưu qua mở lại, cập nhật ngoài event và phát hiện sửa payload.
- Chưa đánh giá chất lượng model live, micro nhiều máy, Google live, thao tác thủ công trên giao diện mới hoặc khả năng sử dụng báo cáo như hồ sơ được một bên thứ ba chứng thực.

Tham khảo cơ chế schema: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs). Hướng dẫn hội thoại nhiều máy: [AI-MEDIATED-CALLS.md](AI-MEDIATED-CALLS.md).
