# Kiểm chứng persistence Supabase

- TypeScript và 117 unit tests: PASS.
- PostgreSQL thật: transaction incident/event/report, owner isolation, revision conflict và hash chain: PASS.
- Hai tiến trình độc lập: phục hồi incident, network, token người nhận đã mã hóa, settings và recording private: PASS.
- HTTP/SSE API integration trên QA riêng dùng PostgreSQL/Storage thật, AI OFF, gateway tắt: PASS.
- Production build: PASS; còn cảnh báo tracing filesystem của recording cache.
- Cloud HTTPS và browser: chờ kiểm chứng deployment. Không dùng kết quả local để tuyên bố đã deploy.

# Kết quả kiểm chứng tại máy phát triển

## Local source import verification · 31/10/2026

Imported the local GuardianAI source snapshot on a branch based on the existing GitHub main history. This replaces the previous 2.0.0 implementation with the local 1.2.0 implementation; previous code remains recoverable through Git history. No application deployment was performed.

- Fixed a missing JSX closing brace in `components/product-experience.tsx`.
- Updated the TEST_LIVE test to assert rejection without GPS, then supply a test location before checking the simulation gates. Production safety checks are unchanged.
- `npm ci`, `npm run typecheck`, all 115 unit tests, and `npm run build`: PASS in the isolated checkout.
- `npm run test:api`: PASS on port 3127 with AI OFF, an in-memory database and external gateways unset. No external calls.
- HTTP smoke checks: homepage, command-center demo, phone demo and health endpoint returned 200. Visual browser behavior and live AI/device calls were not tested in this import.
- Build still reports the existing dynamic filesystem tracing warnings in `lib/recordings.ts`; cloud deployment readiness is not claimed.
- Publication excludes local environment files, runtime data, scratch files, mock design logs and private build prompts. Pattern scanning of selected source and DOCX XML found no recognized provider credentials or private keys; this is not a complete security audit.

## Harness nộp thi, Vercel, Supabase và Impeccable · 31/10/2026

Đợt này hoàn thiện AGENTS, luồng giám khảo/storyboard, kiến trúc Vercel + Node backend + Supabase, quy trình deploy và tích hợp Impeccable theo commit cố định. Chưa thay runtime SQLite sang Supabase, chưa tạo schema/bucket hay triển khai cloud. Các kết quả dưới đây kiểm tra baseline ứng dụng hiện tại, không chứng minh migration đã hoàn thành.

- `npm test`: 115/115 PASS; `npm run typecheck`: PASS.
- `npm run build`: PASS. Còn 4 cảnh báo Turbopack tracing filesystem động trong `lib/recordings.ts`; cần xử lý khi chuyển recording/deploy packaging, không coi bản build hiện tại là đã sẵn sàng lên serverless.
- `npm run test:api`: PASS trên QA riêng cổng 3120, AI OFF, SQLite in-memory, gateway tắt; kiểm tra HTTP/SSE, policy/operator, Origin, cô lập phiên, revision/replay/reset, callback cũ, family và bàn giao hai chiều. Không gọi bên ngoài.
- Impeccable cài vào `.agents/skills/impeccable`, SKILL 4.8.0 tại commit `df3a4abe7d0840d5f60324812c432e00b66a4e75`; launcher `context` chạy thành công và đọc được PRODUCT/DESIGN/surface context. Design hook chưa bật.
- Kiểm tra các file hướng dẫn tồn tại, AGENTS dưới 32 KiB, phần Next.js được giữ và nội dung UTF-8 hợp lệ. Không chỉnh UI nên không chạy detector/QA visual cho một giao diện mới.

Chưa kiểm chứng: Supabase live, Vercel/Render Preview hoặc Production, micro/WebRTC thật, nhiều thiết bị và quyền truy cập cloud. Impeccable báo DESIGN.md mới hơn sidecar design.json và chưa đặt buildPath; đây là drift được ghi nhận, chưa tự đồng bộ như tác dụng phụ của task harness. Có thể dùng `document` để đồng bộ sidecar và chọn buildPath trong đợt thiết kế UI tiếp theo.

## Chỉ khám phá địa điểm sau SOS, màu và giờ mở cửa · 28/10/2026

Kịch bản CITY mới ẩn marker địa điểm và danh mục trước SOS, giữ vị trí người dùng và nền 3D. Sau SOS chỉ hiện điểm chưa đóng theo giờ tình huống, có tùy chọn xem cả nơi đã đóng; dữ liệu đầy đủ vẫn được giữ cho research/lịch sử. Vàng là danh sách hỗ trợ, lam là điểm tham khảo đang mở, xanh lá chỉ dành cho xác nhận nhận giúp. Trực ban công an ngoài giờ hành chính được ghi chưa xác minh, không suy thành đã đóng.

- Unit test **104/104 PASS**, typecheck và production build PASS. Hai test mới kiểm tra cổng SOS, lọc giờ/đổi giờ/reset, giữ catalogue, phân biệt affiliation với consent và trực ban chưa rõ.
- API integration PASS: HTTP/SSE, revision, replay/reset, timeout callback cũ, policy, family, handoff và năm trang; không gọi bên ngoài.
- Chrome headless UI PASS ở desktop 1440×1050 và mobile 390×844: **0 điểm trước SOS → 19 điểm sau SOS lúc 22:15 → 30 điểm khi bật xem đã đóng**. Đổi 14:30/22:15 cập nhật trạng thái, lọc loại/chọn điểm hoạt động, không tràn ngang hoặc lỗi JavaScript. Màu viền thực đo vàng `rgb(233,182,111)` và lam `rgb(121,182,239)`. Đã xem ảnh desktop trước/sau SOS và sửa checkbox chú giải bị xuống dòng.
- Regression 3D: sai số neo lớn nhất 0,69 px khi zoom/zoom lại/xoay, camera được giữ qua SOS và lập kế hoạch. Chạy/dừng demo bằng UI vẫn hoạt động.

QA dùng AI OFF, database in-memory, không liên hệ thật; chưa kiểm tra inference hay giọng nói live trong đợt thay đổi hiển thị này. Script cục bộ `data/check-city-context-ui.cjs`, kết quả `data/sos-discovery-ui-result.log`, ảnh `data/city-before-sos-*` và `data/city-sos-open-*`. Bản production cổng 3000 đã cập nhật.

## Giữ 3D và sửa lỗi marker trôi khi cuộn chuột · 28/10/2026

Người dùng xác nhận muốn giữ 3D; phương án khóa 2D bên dưới đã được thay thế. Lỗi thực tế: update marker gán toàn bộ `className`, xóa `maplibregl-marker`/lớp anchor do MapLibre thêm; CSS `.gm-place { position: relative }` khiến marker tham gia normal flow. Tọa độ không đổi nhưng gốc bố trí DOM bị lệch khi map chiếu lại sau zoom.

Sửa bằng classList cho các trạng thái của app, bảo toàn lớp thư viện; cưỡng chế marker dùng absolute positioning tại gốc container; không can thiệp transform do MapLibre tính. Giữ offset bằng 0 và icon hướng viewport. Khôi phục camera 3D, thao tác xoay/nghiêng, compass và building extrusion từ nền bản đồ; không khôi phục khối cửa hàng giả. Follow camera giữ pitch/bearing người xem đã chọn.

Typecheck/build PASS. Chrome headless desktop/mobile PASS: 30 marker, chọn điểm/đổi giờ/SSE/demo/dừng, không lỗi JS hoặc tràn ngang. Đo tâm DOM của tất cả marker so với `map.project(marker.getLngLat())`: sai lệch lớn nhất ban đầu **0.61 px**, zoom vào **0.59 px**, zoom ra **0.61 px**, sau xoay/nghiêng **0.65 px** trong lượt cuối. Test dùng mouse wheel thật của Playwright và kéo chuột phải, xác nhận camera thực sự đổi zoom/bearing rồi mới so sánh; sau SOS/kế hoạch marker vẫn neo và pitch giữ lựa chọn của người xem. Ảnh desktop 3D được xem trực tiếp. QA AI OFF, dữ liệu in-memory; không đánh giá inference/voice live.

Script cục bộ `data/check-city-context-ui.cjs` đã cập nhật regression đo độ lệch, bảo toàn lớp thư viện và camera 3D. Bản cổng 3000 được cập nhật, QA dừng sau kiểm tra.

## Bản đồ phẳng, marker neo tại tọa độ · 28/10/2026

Đổi renderer sang 2D bắc hướng lên: pitch/bearing luôn 0 kể cả SOS/follow/resize; tắt xoay và nghiêng bằng cử chỉ, bỏ lớp nhà và cửa hàng extrusion, bỏ offset nâng marker 26 px. Marker nhỏ, không bóng nổi, hiển thị tên điểm chính; có nút zoom. Giữ dữ liệu địa điểm/giờ/chức năng, thao tác chọn điểm và tuyến đường hiện có.

Typecheck và build production PASS. Chrome headless QA PASS desktop 1440×1050 và mobile 390×844: 30 marker, pitch/bearing thực tế bằng 0, vẫn bằng 0 sau SOS/lập kế hoạch, lọc/đổi giờ/chọn điểm/dừng demo hoạt động, không tràn ngang và không lỗi JavaScript. Đã xem ảnh desktop của bản đồ 2D. Dùng script QA và các ảnh `city-context-*` như mục dưới. Thay đổi chỉ ở renderer, CSS và nhãn giao diện; không coi điểm dựng cho demo là tọa độ cửa hàng thật đã được xác minh.

## Địa điểm có ngữ cảnh, tuyến tránh tối và nhịp vừa · 28/10/2026

Catalogue CITY tăng từ 5 lên 30 điểm với 12 loại chức năng, hàng hóa/dịch vụ, ca qua nửa đêm, giờ đóng cửa, giới hạn hỗ trợ và nguồn SIMULATED. Research xét nhu cầu, giờ, chức năng, khoảng cách và đa dạng loại điểm; admission chặn nơi đóng/sắp đóng hoặc không phù hợp chức năng dù có transcript đồng ý. Planner nhận cùng metadata và so sánh chi phí tuyến ưu tiên sáng đèn với mức phù hợp; không xác nhận công an/bệnh viện chỉ dựa vào loại địa điểm. Tình huống mặc định 22:15, có điều khiển đổi giờ.

Mặc định demo chuyển sang BALANCED, khoảng 2 phút tùy lời đọc/model, tối thiểu 8 giây mỗi bước và vẫn chờ audio kết thúc. QUICK tối thiểu 4 giây, PRESENTATION 18 giây. Lời dẫn ngắn hơn, kịch bản có nhu cầu nước uống và tự trình diễn báo đoạn tối. Nút Đường tối ghi đoạn có đường tránh trên đồ thị, hiển thị màu vàng, hủy tuyến cũ, tính geometry mới và xin chấp nhận lại; không phải nhận diện ánh sáng bằng cảm biến. Chặn đường vẫn có điều khiển riêng.

- `npm test`: **102/102 PASS**. Sáu test mới kiểm tra catalogue, giờ qua đêm, chức năng/nước uống/ATM, công an và cấp cứu, mất hiệu lực vì giờ đóng cửa, đổi geometry vì đoạn tối.
- Typecheck/build production: PASS. HTTP/SSE integration PASS trên QA `3120`, SQLite in-memory, AI OFF; thêm kiểm tra đổi giờ, authorization và slot địa điểm mở rộng.
- Chrome headless: PASS ở **1440×1050** và **390×844**. Đủ 30 DOM marker, lọc ngân hàng/cà phê, xem giới hạn ATM, đổi 14:30/22:15 làm đổi trạng thái quán, không tràn ngang và không lỗi JavaScript. Ảnh được xem để sửa tiêu đề và thẻ điểm trên mobile bị ép hẹp; chạy lại có kiểm tra chiều rộng phần mô tả và chiều cao tiêu đề.
- Nút demo được bấm trên UI desktop, xác nhận mặc định BALANCED, tiến đến phương án có ngữ cảnh và dừng qua UI. Bài này tắt lời dẫn; không thay kết quả chất lượng giọng đọc hoặc GPT live.
- Script QA cục bộ: `data/check-city-context-ui.cjs`, chạy bằng `npm exec --yes --package=playwright@1.56.1 -- node data/check-city-context-ui.cjs` với `GUARDIAN_TEST_URL` trỏ QA AI OFF. Ảnh: `data/city-context-map-1440.png`, `data/city-context-directory-390.png` và các kích thước tương ứng. Nền bản đồ được tải trong QA; không gọi inference, Google Routes hoặc viễn thông thật.

Bản production cổng 3000 được cập nhật; QA được dừng sau kiểm tra, dữ liệu chính và `.env.local` giữ nguyên. Bấm Chạy lại demo để tạo tình huống mới có catalogue và nhịp mới; hồ sơ cũ không bị viết lại để giả thành dữ liệu mới.

## Lời dẫn tiếng Việt và nhịp thuyết trình · 28/10/2026

Demo một nút mặc định có lời dẫn trình duyệt và nhịp thuyết trình khoảng 3–5 phút. Backend chờ tối thiểu 18 giây mỗi bước (5 giây ở nhịp nhanh), đồng thời chờ tín hiệu audio kết thúc khi bật tiếng; không chuyển bước chỉ vì timer cũ đã hết. Có watchdog phía trình duyệt và timeout phía server, phụ đề khi không phát được tiếng, pause/resume, đọc lại, chuyển bước và chọn giọng Việt của thiết bị. Chỉ tab khởi chạy tự phát lời dẫn; các tab xem cùng incident không tự phát chồng tiếng.

96/96 unit/integration tests PASS; typecheck và production build PASS. Trong đó 6 test mới kiểm tra audio completion, giọng bị chặn/treo, cancellation, replay/skip, tín hiệu cũ và thời gian đọc tối thiểu. HTTP/SSE integration PASS trên server QA riêng AI OFF, SQLite in-memory; thêm kiểm tra operator, narration token, đổi nhịp, pause/skip và callback sau khi dừng. Test âm thanh dùng đối tượng SpeechSynthesis giả lập: chứng minh đồng bộ và xử lý lỗi, chưa chứng minh chất lượng giọng hay âm lượng loa thực tế. Không gọi OpenAI/Google/viễn thông thật trong đợt kiểm tra này.

Hướng dẫn: [AGENT-DEMO.md](AGENT-DEMO.md). `.env.local` không được đọc/hiển thị hay sửa bằng công cụ trong quá trình triển khai; Next.js sử dụng cấu hình tại chỗ như bình thường.

## Agent tuyến và lịch sử báo cáo · 28/10/2026

Đợt triển khai không gọi inference/voice/Google live vì người dùng hết quota và sẽ thử live sau. **84/84 tests PASS**, typecheck/build PASS; tests model dùng mock transport. HTTP/SSE integration trên server QA riêng, AI OFF, gồm quyền truy cập báo cáo, các phiên bản có chuỗi băm và việc xóa transcript xóa cả lịch sử báo cáo dẫn xuất. Chưa kiểm chứng live hay thao tác thủ công phần UI bổ sung. Kiến trúc, giới hạn, chi phí và kịch bản thử: [ROUTE-AGENT-REPORT.md](ROUTE-AGENT-REPORT.md). Các kết quả cũ bên dưới thuộc các đợt trước.

Bản build đã cập nhật ở cổng 3000, AI_PROVIDER=OFF chỉ trong tiến trình server; giữ nguyên `.env.local` và dữ liệu. Health/trang local trả thành công, server QA đã dừng. Hướng dẫn bật lại khi có quota nằm trong tài liệu liên kết.

## AI đồng hành nhận quyết định realtime và đồng bộ bản đồ · 27/10/2026

`npm test`: **78/78 PASS**; typecheck/build PASS. HTTP/SSE integration PASS, gồm snapshot điều phối từ `get_status` và tool chấp nhận bắt buộc đúng plan ID. Chrome headless kiểm tra HTTP transcript → backend kiểm tra/lập kế hoạch → SSE → thông điệp Realtime của AI đồng hành: mơ hồ chưa chọn, B được chọn/chấp nhận, B thu hồi → A với geometry khác và cần chấp nhận lại; có lệnh ngắt phản hồi/âm thanh cũ; cập nhật khả năng/ETA tự cung cấp của người thân. Test dùng model/WebRTC/micro giả lập, chặn request external; chưa kiểm chứng giọng nói live nhiều thiết bị. Script/ảnh QA cục bộ và cách thử: [AI-MEDIATED-CALLS.md](AI-MEDIATED-CALLS.md).

## Cập nhật hội thoại AI nhiều máy · 27/10/2026

Xem [AI-MEDIATED-CALLS.md](AI-MEDIATED-CALLS.md) để phân biệt hội thoại riêng với AI và gọi trực tiếp, cùng trạng thái sửa link/voice mới nhất. Đã ghi nhận **74/74 tests PASS**, typecheck, build và HTTP/SSE integration PASS (server kiểm thử in-memory riêng, AI OFF). Chrome headless với HTTP/micro giả lập kiểm tra người thân/đối tác nhận qua AI, lỗi hiển thị/thử lại, không tự chuyển P2P, gọi trực tiếp thu gọn và mobile không tràn ngang. Đã cập nhật server cổng 3000; health local và tunnel cùng instance. **Chưa kiểm chứng giọng nói AI live trên nhiều thiết bị**; tests mock/UI không thay thế kiểm chứng đó. Chi tiết và ảnh QA cục bộ được ghi trong tài liệu liên kết.

## Luồng agent demo · 27/10/2026

Cập nhật giao diện gọn: đã kiểm tra bằng Chrome headless trên server dev local riêng, ở **1440×1000** và **390×844**, với dữ liệu mô phỏng và AI tắt. Thanh agent mặc định thu gọn (≤50 px); mở chi tiết không thay đổi kích thước/vị trí command center. Đã thao tác đổi mục, chạy kịch bản, chọn nhánh, mở transcript, Escape/hoàn trả focus và bàn giao hai chiều; không tràn ngang trên mobile, không có lỗi JavaScript runtime. Đã xem ảnh chụp desktop/mobile trong `data/agent-ui-*.png`. Chặn request ngoài localhost khi kiểm tra nên bản đồ nền không được kiểm chứng trong lượt này. Không thay đổi backend hay bản đồ trong đợt chỉnh giao diện này.

- `npm test`: **68/68 PASS**, SQLite in-memory; gồm trích xuất/quote/schema, nhu cầu chưa biết, hỏi lại, điều kiện người dùng, thời hạn/ETA, so sánh, giữ kế hoạch khi lặp dữ kiện, cập nhật/thu hồi, hai chiều bàn giao, hủy/reset/callback muộn và transport treo. Mười kịch bản yêu cầu được bao phủ trong `tests/support.test.ts`.
- `npm run typecheck`: PASS. `npm run build`: PASS, production Next.js.
- `npm run test:api`: PASS trên server production local riêng tại `127.0.0.1:3107`, database `data/agent-qa.sqlite`, `AI_PROVIDER=OFF`. Kiểm tra HTTP/SSE, owner/operator/origin, validation, replay/reset, hỏi lại trong demo, planId cũ, callback generation cũ, người thân và bàn giao hai chiều. Không gửi inference hay cuộc gọi external.
- Tests AI dùng HTTP transport giả lập, có kiểm tra dữ liệu từng vai nhận được, schema thật và bằng chứng nguyên văn. Đây là kiểm thử orchestration/contract, **không phải đánh giá chất lượng AI live**.
- Lần triển khai backend trước chưa kiểm tra được giao diện bằng computer-use do công cụ không xác định chắc chắn URL Windows. Đợt chỉnh giao diện tiếp theo đã kiểm tra trình duyệt headless và ảnh desktop/mobile như ghi ở đầu mục; chưa kiểm tra thao tác thủ công trên cửa sổ trình duyệt của người dùng.
- Chưa xác minh OpenAI live, mic/WebRTC, Google Routes live, điện thoại thật. Giữ toàn bộ dữ liệu test/demo trong ứng dụng; không gọi cửa hàng, số thật hoặc cơ quan khẩn cấp.

Hướng dẫn chạy, thao tác 3–5 phút, kết quả cần thấy và giới hạn: [AGENT-DEMO.md](AGENT-DEMO.md). Các kết quả ngày 24/10 bên dưới là lịch sử, không thay thế phạm vi kiểm chứng của đợt này.

Ngày: 24/10/2026. Môi trường Windows, Node.js 24.12.0.

- `npm run build`: PASS, build production Next.js 16.4.3 và TypeScript.
- `npm test`: 30/30 PASS, engine/policy và GPT, SQLite in-memory. Các bài kiểm thử GPT dùng HTTP transport mô phỏng, không phải kết quả suy luận live của OpenAI.
- `npm run test:api`: PASS với Origin header giống trình duyệt; kiểm tra flow SOS → research → calls → plan → blocked → revision → replay → reset, SSE theo incident mới, ownership, operator, validation, chống cross-origin và closed-incident mutation.
- `npm audit --omit=dev`: không có vulnerability được npm báo tại thời điểm kiểm tra.
- Edge native UI: trang render, sơ đồ offline, khung điện thoại, bố cục 3 cột desktop, responsive ở cửa sổ hẹp, Presentation. Thử trực tiếp SOS → 3 ứng viên → Start Mock Calls → A DECLINED / B CONFIRMED / C NO_ANSWER → plan v1 → Chặn tuyến đường → phone và dashboard cùng hiển thị plan v2. Nút SOS được đưa lên vùng sticky sau kiểm tra trực quan.

Lỗi origin do Next.js canonicalize URL nội bộ thành localhost đã được sửa bằng cách kiểm tra Origin với Host HTTP thực tế; thêm Origin thật vào integration test để tránh tái phát.

Phiên bản 1.1: đã kiểm tra giao diện AI settings trong Edge, hiển thị đúng thiếu OPENAI_API_KEY, các nút gọi/bật AI bị khóa khi thiếu cấu hình. API tests kiểm tra consent, không lộ key, chặn message khi chưa bật AI và trả lỗi cấu hình thay vì tạo kết quả live giả. Luồng GPT và planner được kiểm tra qua mock transport với schema thật của Responses API.

Chưa có OpenAI API key trong lần kiểm tra này nên chưa gửi inference thật đến OpenAI. Chưa kiểm chứng bằng dịch vụ/thiết bị thật: Google API, telephony gateway, mic nhận giọng nói tiếng Việt, quyền GPS, smartphone ghép phiên, độ đọc từ hàng ghế cuối của máy chiếu. Không thực hiện bất kỳ cuộc gọi điện thoại hay thông báo cứu hộ thật nào trong quá trình kiểm thử.
