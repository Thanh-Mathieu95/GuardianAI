# Guardian AI

Guardian AI là ứng dụng web hỗ trợ người đi một mình khi cảm thấy không an toàn. Ứng dụng tiếp nhận SOS, phối hợp với người thân và điểm hỗ trợ, kiểm tra lời đồng ý tiếp nhận, đề xuất phương án di chuyển và lưu hồ sơ diễn biến.

AI hỗ trợ hội thoại, trích xuất thông tin và đề xuất phương án. Backend kiểm tra bằng chứng, điều kiện tiếp nhận và quyền thực thi; người dùng chấp nhận phương án trước khi được hướng dẫn tới nơi hỗ trợ.

Đây là bản thử nghiệm phục vụ phát triển và trình diễn, chưa phải hệ thống cứu hộ được chứng nhận. Địa điểm, người tham gia và tình huống trong demo có nhãn mô phỏng.

## Luồng hoạt động

1. **Chuẩn bị:** thêm người thân hoặc đối tác và gửi liên kết mời tham gia.
2. **Gửi SOS:** nhập nhu cầu bằng chữ hoặc dùng giọng nói khi đã cấu hình và đồng ý sử dụng AI.
3. **Phối hợp hỗ trợ:** thu thập phản hồi từ nhiều đầu mối, làm rõ điều kiện, khả năng giúp đỡ và thời gian người thân tự xác nhận.
4. **Chọn phương án:** backend chỉ cho phép điểm tiếp nhận đáp ứng nhu cầu và có lời đồng ý hợp lệ; AI đề xuất trong phạm vi này.
5. **Chấp nhận và theo dõi:** người dùng chấp nhận phương án. Nếu cam kết bị rút, điều kiện thay đổi hoặc tuyến mất hiệu lực, hướng dẫn cũ dừng và phương án mới cần được chấp nhận lại.
6. **Bàn giao và hồ sơ:** bàn giao hoàn tất khi người dùng và nơi tiếp nhận cùng xác nhận; hồ sơ giữ các quyết định, bằng chứng và diễn biến liên quan.

## Chức năng chính

- **Demo qua engine thật:** kịch bản một nút đưa lời các vai mô phỏng qua logic điều phối, thay đổi phương án và kiểm tra bàn giao; không gọi số điện thoại thật.
- **Đồng hành bằng AI:** OpenAI Responses phục vụ hội thoại và phân tích có cấu trúc; OpenAI Realtime phục vụ giọng nói hai chiều qua WebRTC khi cấu hình cho phép.
- **Mạng lưới hỗ trợ:** người thân và đối tác tham gia qua liên kết riêng, nhận yêu cầu trong ứng dụng và phản hồi theo vai trò.
- **Bản đồ và tuyến đường:** hiển thị điểm hỗ trợ, so sánh tuyến, theo dõi thay đổi và phân biệt dữ liệu mô phỏng với tích hợp bên ngoài.
- **Hẹn giờ chuyến đi:** theo dõi thời gian dự kiến và yêu cầu check-in. Chức năng hẹn giờ không tự đồng nghĩa với chỉ đường về nhà.
- **Hồ sơ sự cố:** lưu transcript, vị trí, phản hồi và lịch sử phương án theo quyền truy cập. Chuỗi băm hỗ trợ phát hiện thay đổi nội dung, không chứng minh lời khai là sự thật.
- **Cập nhật đồng bộ:** các màn hình cùng phiên nhận trạng thái qua SSE và polling dự phòng.
- **Ngôn ngữ:** trang giới thiệu và trải nghiệm chính hỗ trợ tiếng Việt/English; bàn điều khiển nâng cao dùng tiếng Việt.

## Chạy tại máy

Yêu cầu **Node.js 24 trở lên** và npm. SQLite được sử dụng qua module tích hợp của Node.js.

```sh
git clone https://github.com/Thanh-Mathieu95/GuardianAI.git
cd GuardianAI
npm ci
npm run dev
```

Mở [http://127.0.0.1:3000](http://127.0.0.1:3000). Để chạy bản build production tại máy:

```sh
npm run build
npm start
```

Trên Windows, `START-GUARDIAN.cmd` cài dependency và build nếu chưa có, sau đó khởi động server. Sau khi thay đổi code, chạy lại build trước khi dùng `npm start`.

## Thử demo

1. Mở `/demo/command-center` và chọn **Chạy demo**.
2. Theo dõi tình huống SOS, phản hồi hỗ trợ và phương án trên bản đồ.
3. Quan sát việc kiểm tra lại phương án khi tình huống thay đổi và bước xác nhận bàn giao.
4. Mở mục **Hồ sơ** để xem diễn biến và kiểm tra tính toàn vẹn.

Demo mặc định không yêu cầu đăng nhập, microphone hay API key. Lời dẫn mặc định tắt và có thể bật trên giao diện. Mô phỏng và thử trên thiết bị là hai luồng riêng; bật AI không biến vai hoặc địa điểm mô phỏng thành người và nơi tiếp nhận thật.

## Các màn hình

| Đường dẫn | Mục đích |
| --- | --- |
| `/` | Giới thiệu dự án và mở trải nghiệm |
| `/demo/command-center` | Trải nghiệm chính: demo, bản đồ, người hỗ trợ và hồ sơ |
| `/demo/phone` | Trải nghiệm đồng hành trên màn hình điện thoại |
| `/demo/advanced` | Bàn điều khiển nâng cao và quan sát engine |
| `/demo/control` | Điều khiển kịch bản, adapter và công cụ kiểm thử |
| `/demo/calls` | Quan sát cuộc gọi, hội thoại và phản hồi |
| `/demo/architecture` | Kiến trúc và giới hạn hệ thống |
| `/r/<token>` | Liên kết tham gia dành cho người thân hoặc đối tác |

Các tab cùng trình duyệt cần dùng cùng host và cookie để chia sẻ phiên. Không trộn `localhost` với `127.0.0.1`. Thiết bị khác tham gia bằng liên kết mời đúng vai, không tự chia sẻ phiên người dùng chính.

## Cấu hình tích hợp

Sao chép `.env.example` thành `.env.local`, nhập cấu hình tại máy và khởi động lại server. Không đưa khóa thật hoặc `.env.local` lên Git.

| Biến | Vai trò |
| --- | --- |
| `GUARDIAN_DB_PATH` | Đường dẫn SQLite local; mặc định `./data/guardian.sqlite` |
| `GUARDIAN_POSTGRES_URL` | Kết nối PostgreSQL session pooler cho bản host, dùng schema riêng `guardian_ai` |
| `GUARDIAN_SESSION_SECRET` | Khóa phiên ổn định; bản PostgreSQL cũng dùng để bảo vệ token người nhận khi lưu |
| `GUARDIAN_SUPABASE_URL`, `GUARDIAN_SUPABASE_SERVICE_KEY` | Cấu hình server để truy cập bucket ghi âm riêng tư |
| `AI_PROVIDER` | `OPENAI` để dùng AI khi có khóa; `OFF` để tắt model |
| `OPENAI_API_KEY` | Khóa OpenAI phía server |
| `AI_MODEL`, `AI_REALTIME_MODEL` | Model phân tích/hội thoại và model giọng nói |
| `AI_TIMEOUT_MS` | Giới hạn thời gian chờ AI |
| `GOOGLE_MAPS_API_KEY` | Google Places/Routes khi chọn adapter tương ứng |
| `CALL_GATEWAY_URL`, `CALL_GATEWAY_TOKEN` | Gateway thoại HTTPS tùy chọn do nhóm cung cấp |
| `TEST_CALL_ALLOWLIST` | Danh sách số được phép cho nhánh gọi thử có kiểm soát |
| `OPERATOR_PASSWORD` | Mật khẩu operator tùy chọn |
| `SOS_PER_HOUR` | Hạn mức SOS có thể làm đổ chuông đối tác |

Có thể dùng `SETUP-AI.cmd` trên Windows để nhập cấu hình AI tại máy. AI cần sự đồng ý trong phiên; API thật có thể phát sinh chi phí. Demo mô phỏng vẫn dùng được khi AI tắt hoặc không có khóa.

Microphone và vị trí trên điện thoại cần quyền trình duyệt và ngữ cảnh an toàn, thường là HTTPS. Server mặc định chỉ lắng nghe loopback. `START-TUNNEL.cmd` phục vụ thử nghiệm qua tunnel theo [hướng dẫn tích hợp](docs/INTEGRATIONS.md); tunnel vẫn phụ thuộc máy đang chạy.

## Kiến trúc mã nguồn

Ứng dụng dùng Next.js App Router, React, TypeScript, Zod và MapLibre. Backend là một tiến trình Node.js giữ engine, timer giám sát và kênh sự kiện. Bản local mặc định dùng SQLite; khi có `GUARDIAN_POSTGRES_URL`, PostgreSQL giữ dữ liệu bền vững, còn SQLite trong RAM là bộ nhớ làm việc được phục hồi từ database.

| Thành phần | Trách nhiệm |
| --- | --- |
| `app/`, `components/` | Trang và giao diện cho người dùng, người hỗ trợ |
| `app/api/[...path]/route.ts` | HTTP API, phiên, capability và sự kiện |
| `lib/engine.ts`, `lib/types.ts` | Trạng thái sự cố, điều phối và hợp đồng dữ liệu |
| `lib/support.ts`, `lib/coordination.ts` | Điều kiện tiếp nhận, bằng chứng và phân vai |
| `lib/ai.ts`, `lib/realtime.ts` | Tích hợp AI, công cụ và ngữ cảnh hội thoại |
| `lib/city.ts`, `lib/route-agent.ts` | Đồ thị đường đi, lựa chọn tuyến và đánh giá lại |
| `lib/network.ts`, `lib/receiver.ts` | Người hỗ trợ và dữ liệu được phép xem |
| `lib/store.ts`, `lib/recordings.ts`, `lib/evidence.ts` | Lưu trữ, ghi âm và xuất hồ sơ |
| `lib/database.ts`, `lib/persistent-store.ts`, `lib/runtime-persistence.ts` | Transaction PostgreSQL, kiểm tra revision, phục hồi và xác nhận ghi trước khi trả HTTP/SSE |
| `lib/remote-recordings.ts`, `supabase/` | Chunk ghi âm riêng tư, migration và chứng chỉ CA công khai |
| `lib/showcase.ts` | Điều khiển demo qua các quyết định của engine |
| `tests/` | Kiểm thử nghiệp vụ, quyền truy cập và API |

## Kiểm tra khi phát triển

```sh
npm run typecheck
npm test
npm run build
```

Kiểm thử API cần server QA riêng. Sau khi build, chạy trong PowerShell:

```powershell
$env:AI_PROVIDER = 'OFF'
$env:GUARDIAN_DB_PATH = ':memory:'
$env:GUARDIAN_RECORDINGS_DIR = Join-Path $env:TEMP ('guardian-qa-' + [guid]::NewGuid())
Remove-Item Env:OPERATOR_PASSWORD, Env:CALL_GATEWAY_URL, Env:CALL_GATEWAY_TOKEN -ErrorAction SilentlyContinue
npm start -- --port 3120
```

Trong terminal thứ hai:

```powershell
$env:GUARDIAN_TEST_URL = 'http://127.0.0.1:3120'
npm run test:api
```

Chỉ chạy bộ kiểm thử này với dữ liệu QA. Kết quả mock không xác nhận micro, WebRTC giữa thiết bị thật, nhà mạng hay tích hợp cloud.

## Dữ liệu và giới hạn vận hành

- Khóa dài hạn ở server; vị trí, transcript và ghi âm được kiểm soát theo quyền phiên và người nhận.
- Khi chạy local không có PostgreSQL, SQLite và ghi âm được lưu cục bộ. Bản host có thể lưu sự cố, mạng lưới và lịch sử trong PostgreSQL, các đoạn ghi âm trong Supabase Storage riêng tư. Hồ sơ không tự hết hạn sau một khoảng thời gian cố định.
- Người nhận cần giữ trang mở để nhận chuông trong app. Bản web không bảo đảm cuộc gọi nền như ứng dụng điện thoại native.
- Gọi P2P phụ thuộc kết nối mạng; cấu hình hiện có chưa cung cấp TURN cho mọi trường hợp.
- Bản đồ và tuyến mô phỏng không xác nhận tình trạng đường hay mức an toàn ngoài thực tế.
- Ứng dụng không tự quay số khẩn cấp. Liên kết 113/115 để người dùng chủ động mở trình quay số.
- Runtime vẫn dùng một tiến trình Node và timer cục bộ. PostgreSQL có khóa để tránh hai backend cùng chạy engine; chưa hỗ trợ autoscaling hoặc job runner nhiều instance. Cuộc gọi đang chạy khi backend dừng được đánh dấu gián đoạn, không tự quay số lại.

Hướng hosting được chọn là **Cloudflare làm điểm truy cập HTTPS, Render chạy Next.js/API và Supabase giữ dữ liệu/ghi âm**. Worker chuyển tiếp về cùng backend để giữ cookie, link mời và API cùng origin. Gói Render miễn phí có thể ngủ hoặc gián đoạn; đây là bản demo, chưa có bảo đảm giám sát liên tục cho tình huống thực tế. Xem [cấu hình hosting](docs/HOSTING.md).

## Tài liệu dự án

- [Đặc tả sản phẩm](docs/PROJECT_SPEC.md)
- [Kịch bản demo và giới hạn mô phỏng](docs/AGENT-DEMO.md)
- [Cấu hình tích hợp](docs/INTEGRATIONS.md)
- [Hội thoại AI với người thân và đối tác](docs/AI-MEDIATED-CALLS.md)
- [Agent tuyến và hồ sơ](docs/ROUTE-AGENT-REPORT.md)
- [Luồng trình diễn](docs/COMPETITION-FLOW.md)
- [Kiến trúc Supabase](docs/SUPABASE-ARCHITECTURE.md)
- [Triển khai](docs/DEPLOYMENT.md)
- [Tiêu chí nghiệm thu](docs/ACCEPTANCE.md)
