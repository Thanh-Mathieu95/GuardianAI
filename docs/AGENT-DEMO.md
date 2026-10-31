# Demo hội thoại nhiều bên · 27/10/2026

## Nút demo thi đấu có lời dẫn · cập nhật 28/10/2026

Trên `/demo/command-center`, bấm **Chạy demo thi đấu**. Mặc định bật lời dẫn tiếng Việt và nhịp **Vừa · khoảng 2 phút**, tối thiểu 8 giây mỗi bước rồi chờ đọc xong; lời dẫn được rút ngắn. Có thể chọn Chậm (18 giây tối thiểu, khoảng 3–5 phút) hoặc Nhanh (4 giây tối thiểu, dưới một phút khi tắt tiếng). Thời gian thực tế phụ thuộc giọng đọc, model nếu bật và thao tác tạm dừng. Backend tự chọn/đổi phương án từ dữ kiện, không dùng tên điểm đến được đạo diễn đặt sẵn.

## Bản đồ 30 địa điểm có ngữ cảnh

**Kịch bản mới chưa bật SOS:** chỉ hiện vị trí người dùng và bản đồ, chưa hiện địa điểm hay danh mục quán. Bật **SOS** mới hiển thị các điểm: **vàng** là danh sách hỗ trợ, **lam** là điểm tham khảo đang mở, **xanh lá** là đã xác nhận nhận giúp cho sự cố. Mặc định ẩn các quán đã đóng theo giờ tình huống; bật **Hiện điểm đã đóng cửa** để xem lại toàn bộ. Đổi giờ sẽ cập nhật bộ lọc ngay. Trực ban công an chưa xác minh có nhãn riêng; giờ hành chính không đủ để kết luận trực ban đã đóng. Danh sách hỗ trợ và giờ mở cửa không thay cho xác nhận tiếp nhận. Tải lại một sự cố đã bật SOS vẫn giữ trạng thái; dùng **Kịch bản mới** để bắt đầu lại.

Bản đồ giữ **3D**, có thể zoom bằng con lăn, xoay/nghiêng và xem nhà từ dữ liệu bản đồ. Marker neo theo tọa độ địa lý, giữ nguyên lớp định vị của MapLibre và không được nâng bằng offset cố định; zoom không làm điểm trôi khỏi vị trí trên bản đồ. SOS/lập kế hoạch giữ góc nghiêng và hướng xoay hiện tại của người xem. Bấm điểm để xem chức năng/giờ; dùng +/− hoặc con lăn để zoom.

Catalogue dựng cho demo gồm cửa hàng tiện lợi, khách sạn, nhà thuốc, cà phê, quán ăn, trạm xăng, ngân hàng/ATM, siêu thị, bảo vệ, công an, phòng khám và cấp cứu bệnh viện. Mỗi điểm có mặt hàng/dịch vụ, giờ hoạt động theo giờ Việt Nam, giới hạn hỗ trợ và nhãn nguồn mô phỏng. Cửa hàng, giờ, khả năng hỗ trợ và độ sáng không phải dữ liệu live hay thông tin doanh nghiệp đã được kiểm chứng; hình học đường phố lấy từ OSM.

Đồng hồ tình huống mặc định **22:15**. Mở **Khám phá địa điểm** để lọc theo loại hoặc đổi giờ, ví dụ 14:30, 22:15, 23:30. Kế hoạch đến nhà thuốc sẽ mất hiệu lực nếu đổi sang giờ đã đóng; nơi còn tối đa 15 phút đóng cửa bị chặn nếu chưa xác minh tiếp nhận đủ lâu. Quán có ca qua nửa đêm được tính đúng khoảng mở cửa. Lịch mở cửa không thay lời xác nhận riêng cho incident.

Research xếp các nơi phù hợp theo chức năng, giờ, nhu cầu rõ ràng và khoảng cách tham khảo; chọn nhiều loại điểm để hỏi song song. Planner chỉ chọn trong các điểm có cam kết và qua admission, rồi so sánh mức phù hợp cùng chi phí tuyến ưu tiên sáng đèn/đông người. Điểm bán thuốc không được coi là khoa cấp cứu; ATM không được coi là có nhân viên/chỗ chờ. Công an được nhận diện có chức năng tiếp nhận trình báo nhưng giờ hành chính khác giờ trực ban: app không tự xác nhận đang trực, không tự gọi hay giả lập họ đã nhận giúp.

Nút **Đường tối** ở thanh điều khiển bản đồ, hoặc công cụ giọng nói `report_dark_road`, tạo báo thiếu sáng cho đoạn phía trước trong CITY mô phỏng. Backend chỉ dùng đoạn có đường tránh thật trên đồ thị; đánh dấu màu vàng, vô hiệu tuyến cũ, tính geometry khác, ghi nguồn và xin đồng ý lại. Nút **Chặn đường** vẫn có riêng. Nếu không có đường tránh thì báo chưa có phương án thay vì giả tuyến. Kịch bản một nút tự trình diễn thay đổi vì đoạn tối; không phải cảm biến tự phát hiện ánh sáng.

Mở chi tiết ở mũi tên cạnh nút để chọn giọng tiếng Việt, bật/tắt tiếng, đọc lại bước hiện tại hoặc chuyển sang nhịp nhanh. Thanh điều khiển có tạm dừng/tiếp tục, dừng và chuyển bước thủ công. Khi tạm dừng, lời đọc dừng; tiếp tục sẽ đọc lại lời dẫn của bước hiện tại. Nút chuyển bước chỉ có hiệu lực sau khi tác vụ đang chạy đã xử lý xong.

Đây là lời dẫn bằng `speechSynthesis`, không phải cuộc hội thoại GPT Realtime trực tiếp; giọng đọc có thể cần giọng tiếng Việt hoặc kết nối mạng của thiết bị. Nếu âm thanh bị chặn/lỗi, giao diện báo rõ và dùng phụ đề; frontend có watchdog và backend có hạn chờ để tránh treo demo. Tín hiệu đọc xong của bước cũ hoặc incident cũ không được dùng cho bước mới.

Mặc định không cần quota AI và không liên hệ thành viên thật. Các vai người dùng/đối tác/người thân, kể cả việc đồng ý phương án, được mô phỏng và gắn nhãn. Muốn sử dụng model thật cho các nhánh thì bật AI/consent của phiên rồi chọn **Dùng model thật**; phần lời dẫn vẫn là giọng trình duyệt. Với phần thi khoảng 10 phút, dành khoảng 2 phút chạy demo, phần còn lại mở catalogue/transcript/bằng chứng, đổi giờ, giải thích vì sao một nơi bị loại và thử phản hồi mới.

Luồng **người tham gia nói riêng với AI → AI lọc thông tin → bộ điều phối đề xuất cho nhân vật** và trạng thái kiểm chứng nhiều máy được làm rõ tại [AI-MEDIATED-CALLS.md](AI-MEDIATED-CALLS.md). Hướng dẫn bên dưới tập trung vào demo đối tác mô phỏng trên một máy.

Tài liệu này thay thế các bước Mock Calls A/B/C và đóng sự cố bằng nút “đã đến” trong hướng dẫn cũ. Không cần micro, tunnel hoặc điện thoại khác. Không gọi số điện thoại thật hay cơ quan khẩn cấp.

## Chạy

```powershell
cd 'C:\Users\MSI PC\Documents\GuardianAI'
npm run build
npm start
```

Mở http://127.0.0.1:3000/demo/calls hoặc `/demo/command-center`. **Hoạt động agent** là thanh trạng thái gọn phía trên, mặc định thu gọn để giữ bố cục điện thoại/bản đồ. Bấm **Chi tiết** để mở bảng: **Theo dõi** xem từng nhánh và phương án; **Kịch bản** nhập tình huống/giới hạn và chạy demo; **Cập nhật** đổi điều kiện, người thân và xem lịch sử. Hội thoại/bằng chứng chỉ mở khi cần. Bấm ra ngoài, nút đóng hoặc Escape để trở về bản đồ. Nếu đã có server cũ, khởi động lại sau build. Dependencies hiện đã có; máy mới dùng `npm ci` và Node 24+.

Mặc định AI tắt, mọi nhánh dùng kịch bản cố định có nhãn **Phản hồi dùng kịch bản dự phòng**. Muốn thử AI thật: dùng cấu hình OpenAI hiện có và màn hình AI để đồng ý/bật AI cho phiên trước khi bấm chạy. Phiên demo mới kế thừa lựa chọn đó. Nhãn **AI đang chạy thật** chỉ xuất hiện ở nhánh đã nhận phản hồi model hợp lệ. Trạng thái model ở thanh cũ thuộc hội thoại/planner; xem nhãn từng nhánh và audit để phân biệt. Không cần đổi `.env.local` để chạy offline.

## Trình diễn 3–5 phút

| Thời gian | Thao tác | Kết quả cần thấy |
|---|---|---|
| 0:00–0:30 | Mở **Chi tiết → Kịch bản**, chọn **2 · Mơ hồ rồi hỏi lại**. Nhập tình huống; chọn “Cần kín đáo”, điền “Không đi vào ngõ” ở giới hạn. Bấm **Reset & chạy kịch bản**. | Tạo phiên mới, tự chuyển sang Theo dõi. Ba nhánh chạy cùng lúc. Các trường chưa cung cấp giữ `null`, không đoán từ tình huống. |
| 0:30–1:30 | Mở transcript từng nhánh. | “Chắc được, chỉ nhận ở cửa sau” → CLARIFY → agent hỏi lại → đối tác xác nhận rõ cửa/điều kiện. Bằng chứng có dạng `callId:chỉ-số-lượt`. Nhánh im lặng không có transcript giả; phương án tạm thời xuất hiện khi nhánh đủ điều kiện, không chờ hết nhóm. |
| 1:30–2:00 | Xem **Quyết định có căn cứ**, lý do không chọn và dự phòng; bấm **Chấp nhận phương án này**. | Chỉ phương án đã qua kiểm tra backend có tuyến; ETA chưa biết khi thiếu dữ liệu live. Không có tuyên bố tuyến an toàn nhất. |
| 2:00–3:00 | Bấm **Gửi thay đổi cửa / điều kiện** với phản hồi mẫu đổi cửa sau, hoặc sửa nội dung rồi gửi. | Kế hoạch cũ mất hiệu lực, lịch sử giữ v1. Đề xuất mới cần chấp nhận lại; không tự tiếp tục dẫn theo điều kiện cũ. Thử **Thu hồi tiếp nhận** để xem đổi sang dự phòng hoặc không có nơi tiếp nhận. |
| 3:00–3:30 | Người thân mô phỏng: **Có thể giữ liên lạc** → nhập 6 phút → **Có thể đi đón** → **Không thể giúp**. | Tóm tắt khả năng thay đổi; thời gian đến chỉ tồn tại khi người thân tự cung cấp, được xóa khi không thể giúp. Không chuyển toàn bộ hội thoại người thân. |
| 3:30–4:30 | Với kế hoạch hợp lệ đã chấp nhận: bấm **Tôi đã gặp nhân viên**, rồi **Đối tác mô phỏng xác nhận tiếp nhận**. | Sau một bên: chưa CLOSED. Sau cả hai bên của cùng kế hoạch hiện hành: ghi hoàn thành bàn giao demo và CLOSED. Tọa độ gần điểm đến không thay thế xác nhận. |
| 4:30–5:00 | Xem timeline/replay ở điều khiển, hoặc reset chạy **6 · Không nơi nào đủ điều kiện**. | Replay chỉ đọc snapshot. Không có nơi hợp lệ thì không tạo kế hoạch tiếp nhận. |

Nếu chỉ có 3 phút: dùng kịch bản 2, xem hỏi lại, chấp nhận, đổi cửa, chấp nhận lại và bàn giao. Biểu mẫu cho phép xác nhận mọi giới hạn được hỗ trợ. Bộ đọc nhu cầu còn nhận các câu ngôi thứ nhất rõ ràng như “Tôi cần kín đáo”, “Tôi không thể tiếp tục di chuyển”, “Tôi đi bộ tối đa 200 m”, “Tôi không đi vào ngõ”; câu giả định hoặc về người khác không tự thành nhu cầu.

## Mười kịch bản reset/replay

| Kịch bản | Dữ kiện thay đổi / cách thử |
|---|---|
| 1 · BASIC | Một từ chối, một đồng ý rõ, một im lặng. Đây là fixture cơ bản, không phải quy tắc cố định của planner. |
| 2 · CLARIFY | Hai hồ sơ phản hồi mơ hồ lượt đầu, làm rõ lượt sau; cả A và B đều có thể đủ điều kiện. |
| 3 · CONSTRAINT | A yêu cầu cửa sau qua ngõ, không kín đáo. **Chọn kín đáo hoặc nhập “Không đi vào ngõ”** để thấy A bị loại, B phù hợp. Không tự thêm giới hạn vào người dùng. |
| 4 · TWO_OPTIONS | Hai nơi đồng ý; A chỉ còn 5 phút. Fixture không có ETA đáng tin nên A bị loại về thời hạn, B có thể được chọn. |
| 5 · CHANGE | Hai nơi có thể đồng ý. Sau chấp nhận, gửi đổi cửa hoặc thu hồi bằng phản hồi mới; kiểm tra v1 mất hiệu lực. |
| 6 · NONE | Từ chối/im lặng, không có kế hoạch tiếp nhận. |
| 7 · MODEL_FAILURE | Chủ động giả lập model không khả dụng; phản hồi có nhãn kịch bản dự phòng. Test timeout thật của transport dùng mock treo độc lập. |
| 8 · CANCEL | Bấm hủy hoặc chạy reset ngay khi các nhánh đang chạy. Phiên trước giữ USER_CANCELLED, kết quả muộn không ghi kế hoạch vào phiên mới. |
| 9 · FAMILY | Dùng nút thay khả năng người thân như bảng trên. Luồng báo người thân web cũ vẫn được giữ. |
| 10 · HANDOFF | Chấp nhận phương án, hai bên xác nhận cùng planId. Chỉ một bên hoặc planId cũ đều không hoàn tất. |

Kịch bản 5/8/9/10 cung cấp điểm xuất phát và nút thao tác; các thay đổi xảy ra do người trình diễn gửi, không tự diễn theo kết quả mong muốn. Reset tạo incident mới; replay hiện có giữ audit của incident cũ, không gọi lại model.

## Kiến trúc và ranh giới

- `lib/support.ts`: Zod schemas, dữ kiện chưa biết, trích xuất bảo thủ, kiểm tra bằng chứng nguyên văn và điều kiện tiếp nhận. Kết quả gồm UNKNOWN/CLARIFY/ACCEPTED/DECLINED/EXPIRED/REVOKED, loại hỗ trợ, điểm gặp, điều kiện, thời hạn, phần thiếu, thời điểm và evidence refs.
- `lib/engine.ts`: quản lý tối đa ba nhánh; tối đa ba lượt/nhánh, chín request model/nhánh và ba mươi request hội thoại/trích xuất/incident. Deadline model của nhánh là 18 giây; khi hết hạn dùng kịch bản có nhãn. Timeout đổ chuông web giữ giới hạn sẵn có. ANALYZE/PLAN có budget riêng 40 request và deadline tối đa 12 giây mỗi request (hoặc cấu hình thấp hơn); transport bỏ qua abort cũng không chặn điều phối vô hạn. Planner không có quyền thực thi.
- Hồ sơ đối tác chỉ nằm server. Transport mô phỏng nhận PROFILE riêng + HISTORY riêng; agent liên hệ chỉ nhận NEEDS + HISTORY của nhánh. Trích xuất chỉ nhận transcript nhánh. Không gửi hồ sơ bên khác, kết quả mong muốn, cookie, owner ID, số điện thoại hoặc vị trí chính xác cho hai vai text này. Model không đọc trực tiếp hồ sơ ẩn để tạo kết quả hỗ trợ.
- AI trích xuất phải dẫn nguyên văn phản hồi đối tác; backend kiểm tra turn, speaker, quote và giá trị. Lời agent/công cụ AI không phải bằng chứng đối tác. Câu mơ hồ không thành xác nhận chỉ nhờ confidence. Thiếu dữ kiện thì CLARIFY/UNKNOWN; hết lượt vẫn chưa đủ điều kiện.
- Planner nhận nhu cầu, tóm tắt hỗ trợ/kiểm tra, bằng chứng, trạng thái người thân và dữ liệu tuyến có nguồn/timestamp. Backend tính/kiểm tra route cho từng ứng viên trước, chặn quãng đi bộ chưa biết/vượt mức hoặc không thể kiểm tra hạn nhận. Không bịa ETA từ khoảng cách đường chim bay. Khoảng cách fixture/city luôn là mô phỏng.
- Trước chấp nhận chỉ đổi đề xuất khi có cải thiện quãng đường đáng kể (ít nhất 50 m từ nguồn định tuyến), hoặc điều kiện cũ mất hiệu lực. Sau chấp nhận giữ nơi đến hợp lệ; thay đổi xác nhận/giới hạn làm mất hiệu lực kế hoạch và yêu cầu xác nhận lại. Backend tái kiểm tra sau các await để tránh dữ kiện cũ quay lại.
- Web đối tác có nhập phản hồi và câu hỏi còn thiếu, dùng cùng extractor/validator; xác nhận bàn giao bằng token đối tác đúng nơi. Nút đóng giả lập đối tác ở màn hình operator chỉ dùng trong incident `simulatorOnly`. Quyền owner/operator/origin và token người nhận vẫn do backend giữ.
- Hủy/reset tăng generation, abort request text, chặn transcript/callback và planId cũ. SSE/polling, SQLite audit và replay được tái sử dụng. Không thêm framework hoặc nền tảng agent.

## Giới hạn còn lại

- Chưa đánh giá chất lượng hội thoại AI live, micro, WebRTC, Google Routes live hoặc điện thoại thật. Kiểm thử model dùng HTTP transport giả lập; không chứng minh độ chính xác ngôn ngữ tự nhiên ngoài đời.
- Bộ đọc fallback chỉ hiểu một tập câu bảo thủ. UI đưa ví dụ các trường cần xác nhận; câu không hiểu giữ chưa biết. Extractor AI cũng có bộ kiểm tra bảo thủ nên có thể bỏ sót xác nhận hợp lệ, ưu tiên hỏi lại.
- Giới hạn người dùng được nhập/xác nhận qua biểu mẫu hoặc API, hoặc từ tập câu ngôi thứ nhất rõ ràng trong text/transcript; chưa tự trích xuất mọi giới hạn từ lời nói tự do. Giới hạn từ chối chưa hỗ trợ sẽ chặn phương án để kiểm tra thủ công. Không có dữ liệu tuyến để xác nhận giới hạn đi bộ thì không tạo phương án đó.
- Không có ETA live thì phương án có hạn nhận ngắn vẫn chưa đủ điều kiện. Chưa có luồng nhân viên tới vị trí hiện tại được định tuyến đầy đủ; “không thể tiếp tục di chuyển” thường dẫn tới chưa có phương án hợp lệ trong bộ hồ sơ demo hiện tại.
- Cửa vào là dữ kiện tiếp nhận dạng text; tọa độ cửa riêng chưa được geocode. Dữ liệu mô phỏng không chứng minh toàn bộ tuyến thực địa đáp ứng giới hạn ngõ, ánh sáng hay độ an toàn.
- Các tác vụ chạy trong một tiến trình; backend restart vẫn cần operator chạy lại theo cơ chế hiện có. Không phải hệ thống cứu hộ production.

## Kiểm tra tự động

```powershell
npm test
npm run typecheck
npm run build
# Server riêng để test; không dùng số thật:
$env:GUARDIAN_DB_PATH='./data/agent-qa.sqlite'
$env:AI_PROVIDER='OFF'
npm start -- --port 3107
# Terminal khác:
$env:GUARDIAN_TEST_URL='http://127.0.0.1:3107'
npm run test:api
```

Xem [VERIFICATION.md](VERIFICATION.md) để phân biệt kết quả tự động, UI và live.
