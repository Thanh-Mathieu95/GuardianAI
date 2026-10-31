# Audit Adaptive Multi-Agent Coordination — 28/10/2026

Kết luận: GuardianAI đã có nền tảng điều phối thích ứng chạy thực tế trong code, vượt khỏi workflow chỉ chọn nhánh Có/Không. Tuy nhiên, chưa đáp ứng đầy đủ yêu cầu được gửi: còn khoảng hở trong xác minh điều kiện, cập nhật khả năng tiếp nhận, kiểm tra trạng thái mạng lưới liên tục và bằng chứng người thân.

Phạm vi lần này theo yêu cầu cuối “đọc hết kiểm tra dự án đã như này chưa”: đọc mã nguồn, đối chiếu tài liệu, chạy kiểm thử và các phép thử bổ sung; không sửa implementation hoặc triển khai đè server chính. Yêu cầu được gửi dừng ở mục 6, dòng “Sự phù h…”, nên không đánh giá phần chưa được cung cấp. Không đọc/hiển thị nội dung `.env.local`. Working tree đã có nhiều thay đổi trước audit; giữ nguyên các thay đổi đó.

## Căn cứ kiểm tra

- README, package.json, next.config.ts, tài liệu PROJECT_SPEC, ACCEPTANCE, VERIFICATION, AGENT-DEMO, AI-MEDIATED-CALLS; đối chiếu thêm AI, INTEGRATIONS, ROUTE-AGENT-REPORT.
- Backend: engine, support, ai, realtime, route-agent, policy, network, receiver, store, types, coordination; API catch-all trong `app/api/[...path]/route.ts`.
- Frontend: luồng người nhận trong receiver, kết nối trong client; các thành phần companion, dashboard, agent-workbench và network-panel theo cấu trúc/điểm nối hiện có.
- Tests engine/policy, support, AI, coordination, network, multi-device, route-decision, city, emergency và HTTP/SSE integration.
- Đây không phải kết quả đánh giá mọi dòng CSS, tập dữ liệu bản đồ hoặc tài liệu Word. Không dùng tài liệu cũ làm bằng chứng implementation đã hoàn tất.

## Bảng trước khi sửa implementation

IMPLEMENTED = có code thực tế; PARTIAL = có nhưng thiếu; MOCK_ONLY = riêng khả năng đó chỉ được mô phỏng; MISSING = chưa có trong luồng kiểm tra; UNVERIFIED = chưa kiểm chứng thực thi tương ứng. Một thành phần có thể có implementation nhưng phần live vẫn UNVERIFIED.

| Thành phần | File hiện tại | Đã có | Thiếu | Hướng xử lý |
|---|---|---|---|---|
| Nền tảng frontend/backend — IMPLEMENTED | `package.json`, `app/`, `components/`, `app/api/[...path]/route.ts` | Next.js 16, React 19, TS, Node SQLite, Zod; UI và backend dùng trạng thái chung | Chưa có E2E trình duyệt tái chạy bằng npm script trong repo | Thêm bài E2E chạy được từ clean checkout cho demo 10 phút |
| User Agent — PARTIAL | `lib/ai.ts`, `lib/realtime.ts`, `lib/support.ts`, `lib/engine.ts`, `components/companion.tsx` | Text/SOS, voice/WebRTC, risk/unknowns; location kind/observedAt; SOS không cần đủ mọi câu trả lời | Structured analysis chưa có needs/constraints; `statedNeeds` chủ yếu regex, bỏ sót cách nói tự nhiên | Trích xuất nhu cầu có bằng chứng, chuẩn hóa và kiểm tra trước khi cập nhật |
| Coordinator — PARTIAL | `lib/engine.ts`, `lib/types.ts` | Promise.all cho các nhánh; trạng thái call; generation; abort/deadline; queue replanning; chống callback sau đóng; event dashboard | Không thấy retry tự động có attempt/backoff; `state()` chỉ gán status, chưa có bảng chuyển trạng thái được cưỡng chế | Tách quản lý task/transition, retry lỗi tạm thời có giới hạn; giữ các guard đang có |
| Partner Agent — PARTIAL | `lib/engine.ts: partnerReply/simulatedDialogue`, `lib/realtime.ts`, `components/receiver.tsx` | Hội thoại nhiều lượt, hỏi lại tối đa, timeout, transcript, đổi cửa/thu hồi, nhánh APP độc lập | Hiểu phủ định/thay đổi tự nhiên chưa đầy đủ; thiếu xác minh người trực cụ thể | Chuẩn hóa phát biểu mới thành cập nhật có version và invalidation trước khi dùng lại cam kết |
| Đối tác mô phỏng — MOCK_ONLY | `lib/support.ts: partnerProfile/scriptedReply`, `lib/engine.ts: simulatedDialogue` | 10 demo case, profile server-only, fallback có nhãn, cùng checkSupport/planner | Profile vẫn xác định trước khả năng và lời đáp fallback | Dùng cho demo; chứng minh thích ứng bằng phản hồi nhập mới, không coi kịch bản cố định là AI live |
| Family Agent — PARTIAL | `lib/types.ts: ContactAlert`, `lib/engine.ts: contactAction`, `components/receiver.tsx`, `lib/realtime.ts: contactTools` | ANSWERED khác ON_THE_WAY; giữ liên lạc/đi đón/không giúp; ETA có trường riêng và không tự gán mặc định | Không có transcript gốc/evidence cho cam kết; chưa có conditions/missing/expiry; backend tin args của tool | Cho phản hồi người thân đi qua schema + bằng chứng tương tự đối tác; kiểm tra ETA so với câu gốc |
| Response Interpreter — PARTIAL | `lib/support.ts`, `lib/ai.ts: extract/generate`, `lib/types.ts: Call` | Structured Outputs strict + Zod; quote/turn validation; transcript gốc; evidenceRefs; cập nhật timestamp | Điều kiện tự nhiên/availableFrom/người trực chưa được chuẩn hóa đầy đủ; dữ kiện cũ có thể còn hiệu lực sau câu mới chưa hiểu | Facts có trạng thái xác minh, phạm vi incident/task/actor và hiệu lực; câu mới chưa rõ phải tạm ngưng cam kết liên quan |
| Verification & Policy — PARTIAL | `lib/support.ts: checkSupport`, `lib/policy.ts`, `lib/engine.ts: checkCall/replan/acceptRoute`, API duty | Kiểm tra tham gia/đang trực khi dispatch APP; kiểm tra transcript, loại hỗ trợ, cửa, GPS, quãng đường, thời hạn/ETA | Điều kiện chỉ cần tồn tại trong mảng; không kiểm tra thỏa mãn điều kiện bất kỳ; không kiểm tra lại joined/onDuty khi lập/chấp nhận/giám sát kế hoạch | Một hàm admission backend dùng ở mọi bước; unresolved condition phải chặn; thay đổi duty/remove phát invalidation |
| Decision Layer/Planner — IMPLEMENTED trong phạm vi hợp đồng hiện có | `lib/engine.ts: replan`, `lib/ai.ts: plan/decideRoute`, `lib/route-agent.ts` | Lọc trước LLM; so sánh ứng viên; route options; reasons/evidence; giữ phương án ổn định; từ chối kết quả snapshot cũ | Độ đúng còn phụ thuộc admission chưa đầy đủ; người thân mới là tóm tắt, chưa thành kế hoạch giao nhiệm vụ phối hợp | Mở rộng feasibility và các nhiệm vụ người thân, không viết lại planner |
| User Approval — IMPLEMENTED | `lib/engine.ts: acceptRoute`, API `route/accept`, tool `accept_route` | Kiểm tra plan ID; thay đổi cửa làm invalidation; phương án mới cần đồng ý lại | Thừa hưởng khoảng hở kiểm tra duty/conditions | Dùng admission chung khi chấp nhận |
| Monitoring/Replanning — PARTIAL | `lib/engine.ts: tickSignal/tickRouteAgent`, `lib/route-agent.ts`, `lib/coordination.ts` | GPS stale, expiry, blocked/off-route, đổi support; dừng chỉ dẫn cũ và thông báo companion | Không theo dõi đầy đủ trạng thái thành viên; hiểu thay đổi ngôn ngữ còn thiếu | Trigger từ thay đổi network và response; kiểm tra định kỳ các điều kiện có hiệu lực |
| Event bus/SSE/polling — IMPLEMENTED | `lib/engine.ts`, API `sse/poll`, `components/client.ts`, `lib/live-updates.ts` | EventEmitter; SSE, polling, cập nhật các màn hình; loại cập nhật kế hoạch cũ | In-process, một replica; chưa có pub/sub/job queue dùng chung | Đủ demo một backend; ghi rõ giới hạn triển khai |
| Incident History/SQLite — IMPLEMENTED | `lib/store.ts`, `lib/evidence.ts`, API report/replay | Snapshot/event history; report revisions có chuỗi băm; transaction; replay không thực thi tác vụ; xóa có chủ đích | Hash chain cục bộ không phải chữ ký độc lập chống người có quyền DB viết lại toàn bộ | Đủ audit trail demo; không mô tả là bằng chứng chống sửa tuyệt đối |
| Realtime/WebRTC — IMPLEMENTED, live UNVERIFIED | `lib/realtime.ts`, `components/client.ts`, `components/receiver.tsx`, `lib/transcript-queue.ts` | Tool calling, mint session, hàng đợi transcript phía đối tác; P2P tùy chọn | Chưa thử live trong audit này; bằng chứng family chưa đối xứng; P2P STUN không có TURN | Kiểm thử mic thật/multi-device riêng; sửa evidence trước khi tuyên bố toàn bộ hội thoại đã được xác minh |
| Unit/integration/E2E — PARTIAL | `tests/*.test.ts`, `tests/api.integration.ts`, `package.json` | 84 tests PASS; HTTP/SSE integration PASS | Tests hiện tại chưa bao phủ các lỗi bên dưới; không có npm E2E browser suite; live chưa xác minh | Bổ sung regression cho ba lỗi tái hiện và E2E chạy kịch bản có thay đổi phản hồi |

## Các khoảng hở đã tái hiện

### 1. Điều kiện chưa được xác minh vẫn qua admission — ưu tiên cao

Chạy `extractSupport` và `checkSupport` với phát biểu đối tác:

> Đồng ý tiếp nhận, có chỗ chờ. Cửa vào: cửa chính. Điều kiện: cần xuất trình thẻ thành viên.

Kết quả: `decision=ACCEPTED`, `conditions=["cần xuất trình thẻ thành viên"]`, `failedChecks=[]`, dù không có thông tin người dùng có thẻ. `checkSupport` kiểm tra mảng conditions có dữ liệu nhưng chưa đánh giá điều kiện này đã đáp ứng chưa. Đây là thiếu sót backend, không chỉ là chất lượng prompt.

### 2. Câu mới báo chưa nhận được vẫn giữ ACCEPTED — ưu tiên cao

Thêm lượt đối tác sau câu trên:

> Bảo vệ chưa quay lại, tạm thời chưa nhận được.

Kết quả vẫn `ACCEPTED`, `failedChecks=[]` trong extractor/fallback. Các pattern từ chối/thu hồi hiện có không nhận ra câu này, nên giữ quyết định cũ. Đường `partnerReply` dùng extractor này và đánh giá lại kế hoạch trước semantic extraction tùy chọn; vì vậy không thể dựa hoàn toàn vào model để khắc phục.

### 3. Đối tác tắt trực vẫn giữ kế hoạch — ưu tiên cao

Phép thử in-memory: tạo member PARTNER đã joined, thêm call APP gắn member, gửi phản hồi đầy đủ để tạo plan. Sau đó cập nhật `onDuty=false` và gọi `replan`.

Kết quả: plan vẫn tồn tại và giữ nguyên ID. API duty chỉ cập nhật network và phát sự kiện member; replan/monitor/acceptRoute không đối chiếu lại trạng thái member. Policy khi bắt đầu gọi không đủ để chứng minh đối tác vẫn đang trực lúc thực thi.

### 4. Cam kết và ETA người thân chưa có backend grounding — xác nhận qua code

`components/receiver.tsx` chỉ lưu transcript qua API khi là `partnerInc`. Nhánh `report_contact_capability` gửi trực tiếp `action/arrivalMinutes`; API và `contactAction` kiểm tra kiểu/trạng thái nhưng không đối chiếu câu nói gốc. Prompt nói “không đoán ETA” là ràng buộc mềm; chưa có bằng chứng backend thực thi điều đó. `ContactAlert` cũng chưa có trường điều kiện hoặc nguồn chứng cứ.

### 5. Nhu cầu tự nhiên bị bỏ sót — tái hiện

`statedNeeds("Chân em đau, em chỉ đi nổi 100 mét, đừng dẫn em qua hẻm.")` trả toàn bộ nhu cầu chưa biết và refusals rỗng. Bộ regex hiện hỗ trợ một số mẫu “Tôi đi bộ tối đa…”/“không vào ngõ”, chưa đáp ứng hiểu ràng buộc tự nhiên tổng quát. `analysisSchema` của AI hiện cũng chưa trả needs để bù khoảng hở này.

### 6. Coordinator chưa có retry/transition guard đầy đủ — xác nhận qua code

Có timeout, generation, abort, request budget và fallback; chưa tìm thấy cơ chế retry lỗi tạm thời có attempt/backoff trong tác vụ agent. `state(i,status)` gán trực tiếp; nhiều chỗ gán `i.status`. Kiểu union giúp giới hạn tên trạng thái nhưng chưa cưỡng chế các chuyển trạng thái hợp lệ.

## Bằng chứng đã có tính thích ứng

- `tests/support.test.ts`: phản hồi mơ hồ dẫn đến hỏi lại; ứng viên gần không thỏa ràng buộc bị loại; thời hạn ngắn không được dùng ETA bịa; đổi cửa làm hủy plan đã chấp nhận; thu hồi chuyển sang ứng viên khác; không ứng viên thì không tạo plan.
- `tests/multi-device.test.ts`: mock transport kiểm tra ba nhánh APP độc lập, phản hồi tự nhiên và thu hồi tác động tới phương án.
- `tests/coordination.test.ts`: phản hồi mới cập nhật companion và tuyến trên bản đồ; không phát tiếp hướng dẫn kế hoạch cũ sau invalidation.
- `tests/route-decision.test.ts`: lựa chọn tuyến từ tập ứng viên hợp lệ, evidence validation, loại kết quả model đến muộn và lưu lịch sử.

Các bằng chứng này xác nhận hành vi thích ứng trong phạm vi đã kiểm thử. Chúng không chứng minh model hiểu đúng mọi câu tự nhiên hoặc hội thoại giọng nói live đã hoạt động trên thiết bị thật.

## Kiểm thử chạy trong audit này

| Kiểm tra | Kết quả | Giới hạn |
|---|---|---|
| `npm test` | 84/84 PASS, 0 fail/skip | Source hiện tại; SQLite in-memory, model transport giả lập |
| `npm run typecheck` | PASS | Source hiện tại |
| Phép thử điều kiện/khả năng/duty/needs bổ sung | Tái hiện các khoảng hở 1, 2, 3, 5 | AI OFF; dữ liệu tự tạo trong bộ nhớ; không sửa tests hiện tại |
| `npm run test:api` với `GUARDIAN_TEST_URL=http://127.0.0.1:3119` | PASS | Server QA riêng, AI OFF, DB `:memory:`; dùng production build sẵn có, chưa rebuild source trong audit |
| Production build mới | UNVERIFIED trong đợt này | Không thay `.next` đang phục vụ server chính |
| Browser E2E/microphone/GPS permission/OpenAI/Google live | UNVERIFIED trong đợt này | Không lấy kết quả tài liệu cũ làm kết quả kiểm thử mới |

Lần gọi API đầu chạy trước khi server báo Ready nên ECONNREFUSED; chạy lại sau Ready thì PASS. Server QA chỉ dùng dữ liệu test và được dừng sau kiểm thử. Không gọi inference hoặc viễn thông thật.

## Thứ tự nâng cấp đề xuất từ audit

1. Admission dùng chung và trạng thái điều kiện SATISFIED/UNRESOLVED/FAILED; chặn điều kiện chưa biết và invalidation ngay khi có phát biểu làm thay đổi khả năng.
2. Đối chiếu member joined/onDuty tại response, replan, accept và monitor; phát sự kiện invalidation khi đổi duty/remove.
3. Response Interpreter cho family có transcript gốc, evidence, conditions, ETA tự khai và version guard.
4. Structured extraction nhu cầu người dùng có dẫn chứng; dữ kiện chưa biết giữ unknown; không trì hoãn SOS.
5. Task lifecycle/retry giới hạn và transition guard, mở rộng engine hiện tại.
6. Regression các lỗi trên và một E2E demo 10 phút: mơ hồ → hỏi lại → đủ điều kiện → chấp nhận → thay điều kiện → dừng tuyến cũ → phương án mới → bàn giao.

Chưa có phần sửa implementation trong lần audit này. Không nên tuyên bố “đã hoàn tất toàn bộ Adaptive Multi-Agent System” trước khi khắc phục và kiểm thử lại các khoảng hở ưu tiên cao.
