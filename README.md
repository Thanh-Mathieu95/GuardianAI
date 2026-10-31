# Guardian AI

**Bản nộp thi:** thiết kế đã chọn Vercel + backend Node chạy liên tục + Supabase Postgres/Storage. Xem [luồng giám khảo và storyboard](docs/COMPETITION-FLOW.md), [kiến trúc Supabase](docs/SUPABASE-ARCHITECTURE.md) và [quy trình deploy](docs/DEPLOYMENT.md). Hiện chưa hoàn tất migration/deploy cloud. Thiết kế dùng [Impeccable cùng PRODUCT/DESIGN hiện có](docs/DESIGN-WORKFLOW.md), được nối trong `AGENTS.md`.

**Địa điểm chỉ xuất hiện sau SOS:** kịch bản mới giữ bản đồ 3D gọn, chưa hiện quán. Sau SOS: vàng = danh sách hỗ trợ, lam = tham khảo đang mở, xanh lá = đã nhận giúp. Quán đóng cửa mặc định được ẩn; có tùy chọn xem lại.

**Demo thi đấu có tiếng:** mở `/demo/command-center` → **Chạy demo thi đấu**. Nhịp mặc định khoảng 2 phút, lời dẫn ngắn và chờ đọc xong. Bản đồ có 30 điểm với giờ mở cửa, hàng hóa, chức năng và giới hạn hỗ trợ; mở **Khám phá địa điểm** để lọc và thử đổi giờ tình huống. Nút **Đường tối** thực sự tính lại đường tránh và yêu cầu chấp nhận lại. Không cần quota AI để chạy mặc định. Xem [hướng dẫn và giới hạn dữ liệu mô phỏng](docs/AGENT-DEMO.md).

## Cập nhật agent tuyến và báo cáo · 28/10/2026

Agent tuyến tạo tối đa ba lựa chọn từ đồ thị CITY, backend lọc điều kiện và task GPT ROUTE_DECISION phân loại/chọn tuyến khi AI bật. Vòng theo dõi tuyến dùng ticker hiện có, không gọi model mỗi vòng. Hồ sơ lưu từng lần cập nhật có chuỗi băm, đầy đủ lịch sử quyết định/kế hoạch và không tự xóa sau 24 giờ. Giao diện chính được giữ; thông tin mới nằm trong các mục thu gọn. Xem [cách chạy, chi phí, cách test sau và giới hạn](docs/ROUTE-AGENT-REPORT.md). Đợt triển khai chỉ kiểm tra local/mock, không dùng quota API thật.

## Cập nhật luồng agent demo · 27/10/2026

Demo một máy tại `/demo/calls` và command center: hội thoại đối tác song song, hỏi lại, kết quả có cấu trúc và bằng chứng, backend lọc điều kiện trước planner, cập nhật kế hoạch, người thân và bàn giao hai chiều. Có mười kịch bản reset/replay; AI text thật tùy consent/cấu hình, đối tác luôn là mô phỏng trong luồng này và fallback có nhãn. Không cần micro hay số điện thoại thật.

Đọc **[hướng dẫn demo 3–5 phút và giới hạn](docs/AGENT-DEMO.md)**. Hướng dẫn mới thay thế các bước A luôn từ chối/B luôn thắng và “đã đến” tự đóng sự cố ở phần cũ bên dưới. Những phần bản đồ, mạng lưới, SSE/polling và Realtime hiện có vẫn được giữ.

Luồng người thật: từng đối tác/người thân **trả lời bằng AI**, AI hỏi và chuyển thông tin cho bộ điều phối đề xuất phương án cho nhân vật chính. AI không tự nối máy tới nhân vật. Gọi trực tiếp được giữ trong mục tùy chọn. Xem [cơ chế, cách test nhiều máy và trạng thái kiểm chứng](docs/AI-MEDIATED-CALLS.md).

AI đồng hành đang mở trên máy nhân vật nhận bản tóm tắt điều phối cập nhật từ cùng trạng thái với bản đồ: điều kiện/bằng chứng, thông tin thiếu, người thân, điểm được chọn và dự phòng. Thu hồi/thay đổi làm mất hiệu lực tuyến cũ và yêu cầu chấp nhận lại phương án mới; không cần nối máy trực tiếp để truyền thông tin.

Ứng dụng web MVP theo `Guardian_AI_Full_Project_and_Demo_Spec.md`. Next.js 16 + React 19 + TypeScript, backend Node.js 24, SQLite, SSE, giao diện tiếng Việt.

## Mới trong v1.2: một lời cầu cứu, nhiều người cùng nhận

- **Trò chuyện liên tục với GPT Realtime** (WebRTC, giọng nói hai chiều). AI vừa nói chuyện vừa gọi công cụ chạy nền: `trigger_sos`, `silent_sos`, `set_appearance`, `report_route_blocked`, `request_escalation`, `checkin_ok`… Mỗi sự kiện backend (đối tác đồng ý, người thân đang đến, đổi tuyến) được đẩy vào cuộc hội thoại để AI tự thông báo.
- **Mật mã an toàn**: nói một câu bình thường đã cài sẵn → SOS bí mật; AI tiếp tục đóng vai người thân, truyền đạt cập nhật kín đáo; màn hình điện thoại giả làm cuộc gọi.
- **Cuộc gọi giả**: AI gọi đến, đóng vai người quen để răn đe người bám theo.
- **Mạng lưới gọi trong app** (`/r/<token>`): người thân và điểm đối tác đăng ký bằng link mời, đồng ý tham gia. Khi SOS, app của họ **đổ chuông cùng lúc**. AI (Realtime) nói chuyện với lễ tân và tự ghi nhận đồng ý/từ chối; người thân nghe AI tóm tắt, bấm "Tôi đang đến", hoặc **gọi trực tiếp cho người dùng** (WebRTC P2P).
- **Chỉ dẫn tới nơi đã đồng ý**: đối tác thật luôn được ưu tiên; điểm mô phỏng chạy kèm không bao giờ tự xác nhận thay. Đối tác rút lại đồng ý → kế hoạch bị hủy và lập lại.
- **Đi cùng tôi về nhà**: quá giờ, dừng lâu, mất GPS → "Bạn ổn không?"; không trả lời 30 giây → tự SOS. Về tới nơi → người thân thấy "đã an toàn".
- **Thẻ nhận diện**: đối tác chỉ thấy vị trí chính xác và mô tả trang phục **sau khi** đồng ý tiếp nhận.
- **Chống spam**: tối đa `SOS_PER_HOUR` (mặc định 3) SOS/giờ được gọi đối tác; đối tác báo "báo động giả" trừ uy tín, uy tín ≤ −2 chỉ còn báo người thân; mỗi đối tác tối đa 5 cuộc chuông/giờ, có nút bật/tắt "đang trực". Người thân luôn được báo.
- **113**: AI chuẩn bị tóm tắt, app mở trình quay số `tel:113`; người dùng tự bấm gọi. App không bao giờ tự gọi số khẩn cấp.

Demo trên nhiều điện thoại: chạy `START-GUARDIAN.cmd`, rồi `START-TUNNEL.cmd` (Cloudflare quick tunnel, miễn phí, không cần tài khoản) để có HTTPS, vì micro trên điện thoại bắt buộc HTTPS. Kịch bản sân khấu: [docs/DEMO.md](docs/DEMO.md).

## Chạy ngay trên Windows

Máy hiện tại đã cài dependencies và build. Mở PowerShell:

```powershell
cd 'C:\Users\MSI PC\Documents\GuardianAI'
npm start
```

Mở **http://127.0.0.1:3000/demo/command-center**. Nếu cổng 3000 đang chạy sẵn, chỉ cần mở URL. Có thể chạy `npm start -- --port 3001` để chọn cổng khác.

Hoặc nhấp đúp `START-GUARDIAN.cmd`. Cửa sổ server phải tiếp tục mở; Ctrl+C để dừng.

Cài mới / phát triển:

```powershell
npm ci
npm run dev
# Trước khi trình diễn / chạy bản production:
npm run build
npm start
```

Yêu cầu Node.js **24 trở lên**. SQLite có sẵn trong Node; không phải cài database server. Warning `SQLite is an experimental feature` của Node 24 không phải lỗi ứng dụng.

## Demo trong 2 phút

1. Nhấn **Start Scenario** hoặc dùng incident tự khởi tạo khi mở trang.
2. Nhấn **Gửi SOS**, nút SOS, hoặc **Nói với AI** trên điện thoại. Lời mơ hồ qua microphone sẽ yêu cầu xác nhận.
3. Chờ Research trả 3 ứng viên có nguồn / timestamp / chính sách liên hệ.
4. Nhấn **Mock Calls**: 3 adapter tasks chạy song song. A từ chối, B xác nhận, C không bắt máy. Mở Calls để xem transcript từng lane.
5. Coordinator chỉ chọn B sau xác nhận, hiển thị lý do và bằng chứng. Điện thoại có nút chấp nhận tuyến.
6. Nhấn **Block Route**: tuyến v1 bị hủy hiệu lực, tuyến v2 thay đổi geometry, timeline ghi lý do.
7. **Demo Controls** có: Hotel Accepts, điểm từ chối, timeout, mất GPS, freeze, replay, reset, chuyển seed Hà Nội / HCM và 5 scenario.
8. **113 SIM** chỉ chuẩn bị tóm tắt, không gọi số thật.
9. **Tôi đã đến nơi** đóng incident, hiển thị KPI đo từ backend; tải audit JSON hoặc xóa transcript thử nghiệm.

Nhấn biểu tượng phóng lớn trên thanh đầu để bật Presentation. Spotlight Voice / Calls / Decision cho phần trình bày cần chữ lớn.

## Các trang

| Trang | Chức năng |
|---|---|
| `/demo/command-center` | Phone + map + agent operations + feed |
| `/demo/phone` | Màn hình người dùng độc lập |
| `/demo/control` | Scenario, adapter, inject, replay, freeze, audit |
| `/demo/calls` | Call pool và transcript |
| `/demo/architecture` | Kiến trúc và giới hạn |
| `/r/<token>` | App người thân / điểm đối tác: tham gia, trực, nhận cuộc gọi, AI, vị trí |

Các tab **cùng trình duyệt, cùng host và cookie phiên** tự đồng bộ qua SSE, kể cả sau tạo kịch bản mới / reset. Không trộn `localhost` và `127.0.0.1` vì chúng có cookie khác nhau. Browser khác / điện thoại khác là phiên độc lập; bản này chưa có room pairing qua thiết bị. Server mặc định bind loopback để demo local. Muốn demo trên điện thoại vật lý cần triển khai HTTPS và bổ sung cơ chế ghép phiên có xác thực.

## Đã triển khai

- Incident state machine với typed contracts, kiểm tra trạng thái và chặn callback muộn sau hủy/reset.
- SQLite lưu snapshot và lịch sử từng event; replay không thực thi lại hành động.
- 6 agent tiles từ event backend; Coordinator, Monitoring, Contact và Policy có audit riêng.
- GPT qua OpenAI Responses API: hiểu hội thoại tiếng Việt, phân loại ý định, đề xuất mức hỗ trợ và lý do, phản hồi theo ngữ cảnh, đề xuất điểm tiếp nhận từ danh sách đã xác nhận. Đầu ra JSON được validate bằng Zod; logic thực thi vẫn có PolicyGate.
- Mock call provider concurrent, độc lập, không nhầm CONNECTED với CONFIRMED; timeout không có transcript người nghe.
- PolicyGate phân biệt SIMULATION / TEST_LIVE, consent, allowlist E.164, giới hạn 3 real calls / incident / 10 phút, tối đa 3 lane.
- Route chỉ tới điểm có xác nhận; thu hồi hỗ trợ làm mất hiệu lực kế hoạch; GPS cũ không tiếp tục đề xuất tuyến.
- Microphone bằng Web Speech API + giọng đọc speechSynthesis + text fallback + geolocation khi người dùng yêu cầu.
- Adapter Google Places và Google Routes tùy chọn, khóa nằm server; adapter lỗi hiển thị lỗi, không giả kết quả live.
- Adapter HTTPS call gateway cho hệ thống thoại do nhóm cung cấp. Chưa tích hợp trực tiếp nhà cung cấp viễn thông.
- Quyền điều khiển bằng capability theo phiên; có thể yêu cầu mật khẩu operator. Request khác origin bị chặn. Dữ liệu phiên khác không đọc được bằng incident ID.
- Không CDN/font/map tile bên ngoài trong luồng fixture; cài và build một lần rồi chạy không Internet. Web Speech nhận giọng nói tùy trình duyệt có thể cần Internet: dùng text khi offline.

## Cấu hình live

Sao chép `.env.example` thành `.env.local`, điền cấu hình **tại máy**, rồi khởi động lại server. Đọc [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md). Không gửi key lên chat, không commit `.env.local`.

**Bật GPT thật:** chạy `SETUP-AI.cmd`, nhập model (mặc định `gpt-4.1-mini`) và OpenAI API key vào cửa sổ riêng. Khởi động lại server, mở nhãn AI → **Kiểm tra AI thật** → đồng ý gửi hội thoại → **Bật AI cho phiên này**. Trên phone, dùng **Gửi cho AI** hoặc **Nói với AI**, và bật giọng đọc nếu muốn nghe phản hồi. Key chỉ nằm trong `.env.local` và request HTTPS từ backend tới OpenAI.

GPT là kết nối độc lập với Maps/Calls: nhãn **AI LIVE** chỉ xuất hiện khi model trả kết quả hợp lệ; **SIMULATION** vẫn áp dụng cho địa điểm/cuộc gọi/tuyến fixture. Thiếu key, hết quota, lỗi schema hoặc timeout hiển thị đúng lỗi; SOS vẫn có luồng dự phòng và không giả là GPT đã trả lời. Chỉ dùng OpenAI API, không tự kết nối Ollama hay dịch vụ AI khác. Xem [docs/AI.md](docs/AI.md).

Chưa có key / số test vẫn chạy demo offline. Voice hiện dùng microphone → Web Speech → GPT → speechSynthesis, chưa phải Realtime audio của OpenAI. Đây không phải sản phẩm cứu hộ production; P2 (app chạy nền, mạng lưới đối tác, chứng nhận và tích hợp cơ quan khẩn cấp) nằm ngoài MVP.

## Kiểm thử

```powershell
npm test
npm run typecheck
npm run build
# Khi server đang chạy:
npm run test:api
```

Xem [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md) để biết phạm vi tự động và những phần phải thử trên thiết bị / máy chiếu thật. API live chưa được xác thực bằng credentials thật.

## Cấu trúc

```text
app/                  Next.js pages và API route handler
components/           UI command center / phone / calls / controls
lib/types.ts          Incident, events, plans, proposals
lib/engine.ts         Coordinator, task pool, replanning, event bus
lib/policy.ts         Boundary kiểm soát gọi ra ngoài
lib/adapters.ts       Google Places / Routes và HTTPS call gateway
lib/ai.ts             OpenAI Responses API, schemas, prompt, context minimization
lib/realtime.ts       GPT Realtime: cấp khóa tạm, prompt/công cụ cho người dùng, đối tác, người thân
lib/network.ts        Người thân / đối tác, cài đặt an toàn, giới hạn chống spam (SQLite)
lib/receiver.ts       Dữ liệu tối thiểu mà người thân / đối tác được xem
components/client.ts  WebRTC tới OpenAI Realtime, gọi P2P, nhạc chuông
components/companion.tsx  Đồng hành giọng nói, cuộc gọi giả, đi về nhà trên điện thoại
components/receiver.tsx   Trang /r/<token>
components/network-panel.tsx  Quản lý mạng lưới và mật mã an toàn
lib/fixtures.ts       Offline places và route geometry
lib/store.ts          SQLite snapshots + event history
tests/                Engine/policy và HTTP/SSE integration tests
scripts/setup-ai.mjs  Nhập OpenAI API key tại máy, che ký tự nhập
docs/                 Acceptance, tích hợp, kịch bản demo
data/                 SQLite local (gitignored)
```

Data local chứa vị trí/transcript; nằm ở `data/guardian.sqlite`, giữ tối đa 24h và dọn khi khởi tạo Store. Xóa transcript qua UI sau khi đóng cũng xóa replay snapshot chứa nội dung. Reset chỉ kết thúc phiên hiện tại và tạo incident mới, giữ audit lịch sử; không xóa dữ liệu phiên người khác. SQLite local chưa mã hóa at rest, không dùng lưu dữ liệu nhạy cảm production.

Giới hạn v1.2: app web chỉ đổ chuông khi trang người nhận đang mở (muốn chuông như cuộc gọi thật khi khóa màn hình cần app native + push); gọi P2P dùng STUN công khai, không có TURN nên mạng chặn UDP có thể không nối được; điểm đến "về nhà" đang là điểm demo cách ~600 m. Mỗi phút Realtime tốn phí OpenAI; đặt `AI_REALTIME_MODEL=gpt-realtime-mini` để rẻ hơn.

Backend hiện dùng event bus trong một tiến trình Node, cần một replica cho demo. Muốn scale nhiều replica phải chuyển pub/sub sang hạ tầng dùng chung và bổ sung job runner. Restart backend hủy tác vụ chưa hoàn tất, đánh dấu FAILED và yêu cầu operator chạy lại; không tự quay số lại.

Tài liệu nền tảng: [Next.js Route Handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route), [Node.js SQLite](https://nodejs.org/api/sqlite.html).
