<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Guardian AI — hướng dẫn cho agent phát triển

## 1. Mục tiêu và phạm vi

Guardian AI giúp người đi một mình phối hợp với người thân và điểm hỗ trợ: SOS → đánh giá nhu cầu → tìm nơi → gọi song song → xác minh cam kết → tổng hợp phương án → người dùng chấp nhận → dẫn đường và giám sát → bàn giao hoặc chia sẻ hồ sơ khi mất liên lạc.

File này quy định cách agent phát triển, kiểm chứng và bàn giao sản phẩm. Các vai AI trong ứng dụng là thành phần runtime, không mặc nhiên là các agent lập trình độc lập. Những kiểm soát dưới đây phải được thực thi bằng code và test; một chỉ dẫn Markdown không thay thế được chúng.

Sản phẩm hiện phục vụ MVP/demo và phải có link HTTPS ổn định để ban giám khảo tự mở, chạy demo và xem hồ sơ. Đích deploy nhóm đã chọn là **Vercel**. Một bản chỉ chạy localhost hoặc phụ thuộc laptop/tunnel của người trình diễn chưa đạt yêu cầu nộp thi. Không mô tả khả năng chưa kiểm chứng là đã sẵn sàng dùng với người thật. Giao diện và lời thoại sản phẩm dùng tiếng Việt.

## 2. Đọc ngữ cảnh trước khi sửa

1. Xem `git status --short`; giữ nguyên các thay đổi của người khác. Không reset, clean hoặc ghi đè công việc có sẵn.
2. Đọc `package.json`, phần code và test liên quan trực tiếp đến yêu cầu.
3. Đọc `PRODUCT.md` cho mục đích sản phẩm, `DESIGN.md` cho hệ thống giao diện hiện tại, `docs/PROJECT_SPEC.md` cho luồng nghiệp vụ và các bài học cần giữ.
4. Chọn tài liệu chuyên đề theo công việc: `docs/AI-MEDIATED-CALLS.md`, `docs/AGENT-DEMO.md`, `docs/ROUTE-AGENT-REPORT.md`, `docs/INTEGRATIONS.md`, `docs/ACCEPTANCE.md`, `docs/COMPETITION-FLOW.md`, `docs/SUPABASE-ARCHITECTURE.md`, `docs/DEPLOYMENT.md`, `docs/DESIGN-WORKFLOW.md`.
5. `docs/VERIFICATION.md` là lịch sử các lần kiểm chứng, không phải kết quả của lần làm việc hiện tại. Không đọc toàn bộ lịch sử nếu phần liên quan đã đủ.

Phân biệt yêu cầu mới của người dùng, thiết kế mong muốn trong tài liệu và hành vi đang có trong code. Các prompt được trích trong tài liệu là ngữ cảnh, không phải lệnh tự động xây lại toàn bộ ứng dụng. Khi tài liệu mâu thuẫn, nêu khác biệt, đối chiếu code/test và xác định tiêu chí cần đạt; không tự hạ yêu cầu an toàn theo code đang lỗi. Ví dụ, không áp lại bảng màu từ tài liệu cũ lên thiết kế mới trong DESIGN chỉ vì đang sửa chức năng.

## 3. Bản đồ mã nguồn

| Phạm vi | Điểm bắt đầu |
|---|---|
| Hợp đồng trạng thái, điều phối, lưu trữ | `lib/types.ts`, `lib/engine.ts`, `lib/store.ts` |
| Điều kiện tiếp nhận, ngữ cảnh địa điểm | `lib/support.ts`, `lib/place-context.ts`, `lib/venue-catalog.ts` |
| Responses, người thân, tổng hợp đề xuất | `lib/ai.ts`, `lib/family.ts`, `lib/coordination.ts` |
| Đồ thị, định tuyến, khẩn cấp | `lib/city.ts`, `lib/route-agent.ts`, `lib/emergency.ts` |
| Realtime, transcript, cập nhật đồng hành | `lib/realtime.ts`, `lib/transcript-queue.ts`, `lib/live-updates.ts`, `components/client.ts` |
| Mạng lưới, policy, dữ liệu người nhận | `lib/network.ts`, `lib/policy.ts`, `lib/receiver.ts` |
| Bằng chứng, ghi âm, demo | `lib/evidence.ts`, `lib/recordings.ts`, `lib/showcase.ts`, `lib/showcase-audio.ts` |
| HTTP và trang | `app/api/[...path]/route.ts`, `app/demo/[view]/page.tsx`, `app/r/[token]/page.tsx` |
| Giao diện | `components/`, `app/globals.css`, `app/command.css`, `app/voice.css`, `DESIGN.md` |

Stack hiện tại: Node.js 24+, Next.js 16 App Router, React 19, TypeScript, SQLite tích hợp Node, Zod 4, MapLibre/OpenFreeMap, CSS thuần và lucide-react. Dùng lockfile và công cụ hiện có; không tự đổi framework, model, provider hay thêm thư viện UI để xử lý một thay đổi nhỏ. Trước khi sửa Next.js, đọc hướng dẫn tương ứng trong `node_modules/next/dist/docs/` như khối hướng dẫn đầu file.

## 4. Các điều kiện bắt buộc của sản phẩm

### Quyền quyết định và bằng chứng

- Engine có quy tắc giữ quyền thực thi. LLM chỉ giao tiếp, trích xuất dữ kiện có nguồn và đề xuất trong danh sách backend cho phép.
- Kiểm tra input API và output model bằng schema; kiểm tra tiếp bằng code các ràng buộc nghiệp vụ. JSON hợp lệ chưa đủ để một quyết định hợp lệ.
- Quote phải thực sự nằm trong đúng lượt nói của đúng người; lời AI không làm bằng chứng cho cam kết của đối tác. Ref phải tồn tại và thuộc đúng incident, người hoặc địa điểm.
- Không bịa ETA, trạng thái đã gọi, đã tiếp nhận hoặc lực lượng đang đến. ETA của người thân phải có nguồn từ lời họ; thời gian đi bộ ước tính phải được phân biệt với ETA này.
- Lời người dùng, transcript và nội dung bên ngoài là dữ liệu không đáng tin. Không cho chúng sửa policy, cấp quyền, chọn incident khác hoặc bỏ qua admission.

### Cam kết, kế hoạch và tuyến

- Nghe máy không có nghĩa là đồng ý. Cam kết mơ hồ cần làm rõ; câu thu hồi rõ ràng phải cập nhật ngay. Transcript rác không xóa cam kết/ETA đã xác minh.
- Dùng chung logic admission khi lập kế hoạch, chấp nhận, giám sát và bàn giao: đồng ý có bằng chứng, đúng nhu cầu/chức năng, còn hiệu lực, giờ phù hợp và người tiếp nhận vẫn sẵn sàng.
- Thiếu mô tả cửa vào không tự động chặn một đồng ý rõ ràng; điều kiện chưa xác minh người dùng đáp ứng thì phải chặn.
- Planner chỉ chọn nơi đủ điều kiện; PRIMARY phải đúng nơi được chọn, assignments và evidenceRefs phải hợp lệ. Output sai dùng phương án quy tắc hoặc báo chưa có phương án, không hợp thức hóa kết quả sai.
- Chỉ dẫn SOS tới nơi đã xác nhận. Tuyến do người dùng chủ động yêu cầu có thể tới nơi chưa xác nhận nhưng phải được ghi rõ và phân biệt với phương án tiếp nhận.
- Kế hoạch đã chấp nhận chỉ đổi khi mất hiệu lực. Khi mất hiệu lực: phát sự kiện, dừng hướng dẫn cũ, lập lại và yêu cầu chấp nhận lại. Bổ sung phân vai cùng nơi mà không đổi tuyến/điều kiện chỉ cập nhật coordination.
- GPS cũ, cam kết bị rút, hết ca trực, đường chặn/tối và lệch tuyến phải đi qua cơ chế giám sát. Không tiếp tục dùng trạng thái cũ như còn hợp lệ.
- Kết thúc bàn giao cần xác nhận từ cả người dùng và nơi tiếp nhận; một nút “đã đến” không tự chứng minh đã bàn giao.

### Bất đồng bộ, Realtime và demo

- Mọi kết quả bất đồng bộ có thể thay đổi incident phải kiểm tra incident/generation và trạng thái hiện tại; bỏ callback cũ sau hủy/reset. Dọn timer, subscription, stream và tác vụ khi kết thúc.
- Timeout, retry và fallback phải có giới hạn. Chỉ retry khi phân loại được lỗi tạm thời và thao tác có thể lặp an toàn; không tự gọi lại người thật khi restart/replay.
- Cập nhật làm mất hiệu lực tuyến có thể ngắt phản hồi AI cũ, không ngắt lời người dùng. Gộp thông báo vẫn giữ trạng thái/ETA/lời dặn của từng người thân.
- AI gọi điện kết thúc khi đã rõ ý, mục tiêu 3–4 lượt; không hỏi xác nhận lặp. Tool bị từ chối không được tạo vòng hỏi vô hạn.
- SSE và polling phản ánh cùng trạng thái. Replay chỉ dựng lại lịch sử, không chạy lại side effect.
- SIMULATION tách khỏi TEST_LIVE. Demo một nút không gọi thành viên thật; chỉ đưa lời các vai vào engine thật và tạo lời dẫn từ trạng thái sau xử lý. Sai mốc phải báo lỗi, không viết thẳng trạng thái để giả demo thành công.
- Dữ liệu địa điểm, ánh sáng, sự cố và cuộc gọi mô phỏng phải có nhãn xuyên suốt UI, event và báo cáo. Không diễn đạt tuyến chấm điểm tốt hơn là bảo đảm an toàn thực tế.

### Quyền truy cập và hồ sơ

- Không tự gọi số khẩn cấp; 113/115 chỉ có bản tóm tắt và liên kết mở trình quay số để người dùng tự thao tác. Gọi test ra ngoài phải qua policy, consent, allowlist và giới hạn hiện có.
- Khóa dài hạn chỉ ở server; trình duyệt nhận khóa tạm theo cơ chế Realtime. Không đọc/in `.env.local`, token, ghi âm, GPS hay transcript thật vào log/chat. Dùng fixture và dữ liệu đã che khi kiểm tra.
- Request ghi kiểm tra phiên, Origin và capability tương ứng. ID/token không cho phép đọc dữ liệu của incident khác. Kiểm tra quyền ở server, kể cả API tải file ghi âm.
- Đối tác chỉ thấy vị trí chính xác/trang phục sau khi đồng ý. Hồ sơ chia sẻ chỉ mở cho đúng người thân của incident sau khi có trạng thái chia sẻ hợp lệ.
- Escape dữ liệu khi xuất HTML. Ghi âm kiểm tra session, thứ tự chunk, gửi lặp, MIME, kích thước và hash; không cho client chọn đường dẫn file tùy ý.
- Giữ lịch sử quyết định và chuỗi băm; xác minh được sai lệch khi dữ liệu bị sửa. Hash chứng minh tính toàn vẹn theo cơ chế đã thiết kế, không tự chứng minh lời khai là sự thật.
- Không tự đặt hạn xóa hồ sơ. Xóa transcript theo thao tác được phép phải xử lý cả ghi âm và dữ liệu dẫn xuất liên quan, không để replay khôi phục nội dung đã xóa.

## 5. Vòng làm việc bắt buộc

1. **Tiếp nhận:** diễn đạt kết quả cần đạt, phạm vi, ví dụ đầu vào/đầu ra và điều kiện nghiệm thu. Hỏi khi thiếu thông tin ảnh hưởng nghiệp vụ hoặc hành động không thể hoàn tác; tự xử lý lựa chọn nhỏ, có thể đảo ngược.
2. **Khảo sát:** tìm đường đi từ UI/API → engine → persistence → event → UI. Ghi nhận lỗi có sẵn và thay đổi chưa commit; không suy ra “đã chạy được” từ tài liệu cũ.
3. **Lập kế hoạch:** với thay đổi nhiều bước, ghi các bước, rủi ro, test và cách quay lại. Tính tác động deploy Vercel từ đầu. Với UI, xác định surface và thực hiện luồng Impeccable tại mục 10 trước khi sửa. Thay đổi nhỏ có thể giữ kế hoạch ngắn trong trao đổi. Không tạo thêm hệ thống tài liệu cho mỗi chỉnh sửa nhỏ.
4. **Triển khai:** sửa theo lát cắt chạy được; giữ hợp đồng trạng thái rõ ràng. Khi sửa lỗi nghiệp vụ, thêm regression tái hiện nguyên nhân. Không bỏ validation hoặc nới điều kiện test để đạt xanh.
5. **Kiểm chứng:** chạy test liên quan trước, sau đó các cổng phù hợp ở mục 6. Kiểm tra cả kết quả và việc side effect sai không xảy ra. Khi lỗi, phân loại nguyên nhân rồi sửa; không lặp nguyên thao tác không tạo thêm thông tin.
6. **Tự rà soát:** xem diff, quyền truy cập, trạng thái lỗi, race condition, dữ liệu nhạy cảm, cập nhật tài liệu và ảnh hưởng tới các phần nhóm đang sửa.
7. **Preview và bàn giao:** thay đổi phục vụ bản nộp thi cần kiểm chứng trên Vercel Preview rồi mới đề xuất Production. Báo thay đổi, bằng chứng vừa chạy, phần chưa kiểm chứng, rủi ro còn lại và bước tiếp theo nếu có. Không coi thiếu công cụ/credentials là PASS. Luồng đầy đủ: yêu cầu → thiết kế → triển khai → kiểm thử local → Preview → kiểm tra link thật → Production được cho phép → kiểm tra lại → nộp link.

Với công việc dài, lưu checkpoint ngắn trong `work/` tại checkout nếu chưa có cơ chế khác: mục tiêu, file đã sửa, quyết định, lệnh/kết quả, blocker và bước tiếp theo. Không ghi dữ liệu thật hoặc bí mật. Khi tiếp tục, đọc checkpoint rồi xác minh lại trạng thái repo và tiến trình; không chạy lại side effect từ lịch sử.

## 6. Kiểm chứng theo tác động

Các lệnh đã có trong `package.json`:

```powershell
npm run typecheck
npm test
npm run build
npm run test:api
```

`test:api` cần server riêng đang chạy. Script nhận URL qua `GUARDIAN_TEST_URL`; mặc định trỏ cổng 3000, vì vậy luôn chỉ định URL QA để tránh tác động phiên demo đang dùng. Không giả định có script lint, Playwright hoặc CI nếu chưa tìm thấy.

Ví dụ khởi động QA cục bộ ở terminal riêng, sau khi build; chỉ áp dụng biến môi trường cho tiến trình QA, không sửa `.env.local`:

```powershell
$env:AI_PROVIDER = 'OFF'
$env:GUARDIAN_DB_PATH = ':memory:'
$env:GUARDIAN_RECORDINGS_DIR = Join-Path $env:TEMP ('guardian-qa-' + [guid]::NewGuid())
Remove-Item Env:OPERATOR_PASSWORD -ErrorAction SilentlyContinue
npm start -- --port 3120
```

Terminal chạy integration:

```powershell
$env:GUARDIAN_TEST_URL = 'http://127.0.0.1:3120'
npm run test:api
```

QA mặc định dùng AI OFF, mock transport và đối tác mô phỏng; không kích hoạt gateway live. Khi xong chỉ dừng tiến trình QA mình tạo. Không tắt server demo hoặc tự xóa thư mục nếu chưa xác minh đúng đường dẫn. Không build đè `.next` mà server production đang phục vụ; dùng checkout QA riêng hoặc phối hợp lịch build/restart.

| Loại thay đổi | Bằng chứng cần có |
|---|---|
| Chỉ tài liệu | Đường dẫn/lệnh tồn tại, không mâu thuẫn policy; không cần build ứng dụng |
| Engine, admission, planner, policy | Regression đúng lỗi, unit tests, typecheck, build; API integration khi ảnh hưởng hợp đồng/state |
| API, store, quyền truy cập | Unit + HTTP/SSE; kiểm tra phiên khác, Origin/capability sai, replay/reset/callback muộn |
| UI và bản đồ | Typecheck/build; trình duyệt desktop và 390 px, lỗi JS, luồng bấm thực, ảnh đã xem, không tràn ngang |
| Realtime và coordination | Transcript fixture, thứ tự event/tool, callback cũ, giữ ETA/lời dặn; tách mock khỏi micro/WebRTC thật |
| Hồ sơ và ghi âm | Quyền tải, HTML escape, hash, chunk sai/lặp/quá giới hạn, xóa dữ liệu dẫn xuất; báo cáo desktop/mobile |
| Demo xuyên suốt | Chạy engine trọn kịch bản, kiểm tra từng mốc và pause/stop/reset; chạy UI khi thay đổi trải nghiệm demo |
| Deploy và hạ tầng | Build sạch trên Linux, biến môi trường đúng scope, persistence qua cold start/redeploy, nhiều phiên đồng thời, URL mời trên HTTPS và smoke test Preview/Production |

Với thay đổi xuyên suốt, chạy typecheck, toàn bộ `npm test`, production build và API integration. Nếu thiếu trình duyệt, thiết bị hoặc quota, ghi rõ cổng chưa chạy. Kết quả mock không xác nhận giọng nói live, P2P hai điện thoại, TURN, nhà mạng hay cuộc gọi khẩn cấp thực tế.

Các regression đặc thù cần giữ: điều kiện lạ chưa xác minh; thu hồi cam kết; tắt trực; planner ref sai; câu “Đã food” không mất ETA; so khớp “đón/đồn”, “chỗ/chợ”, “an toàn/ăn”; giờ qua nửa đêm; giới hạn đi bộ/tránh hẻm; callback sau reset; quyền hồ sơ khác incident. Chọn đúng nhóm test trong `tests/`, không yêu cầu sửa tất cả nhóm cho mọi task.

## 7. Giao diện và quan sát hệ thống

- Theo `DESIGN.md` và component hiện hành. Người dùng cần biết bước tiếp theo, nơi đến và ai hỗ trợ; chi tiết kỹ thuật nằm trong phần thu gọn.
- Giữ SOS bí mật kín đáo. Không để indicator hoặc thông báo mới làm lộ SOS/ghi âm.
- Nút icon có aria-label, thao tác chính dùng được bằng bàn phím, trạng thái quan trọng có thông báo truy cập phù hợp. Kiểm tra `scrollWidth <= innerWidth` ở 390 px.
- Bảo toàn class và transform MapLibre quản lý; dùng classList cho trạng thái marker. Khi sửa bản đồ, kiểm tra neo marker sau zoom/xoay/resize và camera sau đổi tuyến.
- Event phục vụ truy vết cần nối được incident, generation, call/plan/revision, nguồn LIVE/SIMULATED và evidenceRef tương ứng. Log lỗi đủ chẩn đoán nhưng không chứa bí mật hay dữ liệu cá nhân thô.
- Bản tóm tắt sự kiện cho AI tối đa 300 ký tự; toast bản đồ tối đa 140 ký tự. Lời dặn người thân cần được bảo toàn trong đường chuyển lời riêng, không bị mất do cắt/gộp tóm tắt.

## 8. Hoàn tất, phục hồi và bàn giao

Task hoàn tất khi hành vi đạt tiêu chí, các cổng liên quan đã chạy hoặc được báo rõ là chưa chạy, diff đúng phạm vi và người tiếp theo có thể tái hiện kết quả. Không ghi số test PASS từ đợt trước cho thay đổi mới.

Khi kiểm thử thất bại: giữ bằng chứng đã che dữ liệu, xác định lỗi mới hay có sẵn, sửa phần thuộc phạm vi và chạy lại đúng cổng bị ảnh hưởng. Nếu bị chặn, báo nguyên nhân cụ thể và phần còn làm được; không giả fallback là kết quả live thành công.

Thay đổi dữ liệu/schema cần xem ảnh hưởng tới snapshot, replay, hash và khả năng đọc hồ sơ cũ. Nếu cần migration/rollback, chuẩn bị cách làm và kiểm chứng trên DB thử trước. Không tự sửa hoặc xóa DB đang dùng để chữa test.

Build, restart, publish và mở tunnel là các hành động riêng. Chỉ cập nhật tiến trình đang dùng hoặc công khai dịch vụ khi nằm trong yêu cầu đã được cho phép. Bản production cần build mới và restart để nhận code; kiểm tra đúng host/port/instance trước khi báo đã cập nhật.

Mẫu bàn giao ngắn:

```text
Kết quả: hành vi đã thay đổi và tiêu chí đạt được.
Kiểm chứng: lệnh/kịch bản, môi trường, kết quả thực tế và nơi lưu bằng chứng.
Chưa kiểm chứng: phần chưa chạy, nguyên nhân và ảnh hưởng.
Rủi ro/bước tiếp: chỉ ghi khi còn việc cụ thể; phân biệt đã sửa code với đã triển khai.
```

## 9. Harness deploy Vercel và bản nộp thi

Đọc `docs/DEPLOYMENT.md` trước khi sửa hạ tầng. Đây là yêu cầu đích, không phải tuyên bố code hiện đã tương thích Vercel. Không chỉ thêm `vercel.json` rồi đánh dấu hoàn thành.

**Kiến trúc đã chốt:** Vercel cung cấp frontend/link HTTPS; backend Node.js 24 chạy liên tục trên một dịch vụ container riêng (mặc định thiết kế là Render, một instance cho bản thi); Supabase Postgres là nguồn trạng thái bền vững, Supabase Storage giữ ghi âm riêng tư. Node xử lý API, policy, engine và job runner; browser gọi cùng origin `/api` qua proxy. Supabase được nhóm chọn; không chuyển sang Firebase hoặc thêm provider tương đương khi chưa có yêu cầu mới. Đọc `docs/SUPABASE-ARCHITECTURE.md` cho hợp đồng migration; chưa tự tạo dịch vụ trả phí.

Giữ guest session cho giám khảo, không bắt đăng ký tài khoản để xem demo. Supabase Auth dành cho quản trị/thành viên thật ở giai đoạn sau nếu cần. Bản thi dùng SSE/polling qua backend làm kênh cập nhật; không thêm Supabase Realtime như nguồn trạng thái thứ hai khi chưa cần. Secrets ở backend; Vercel chỉ nhận cấu hình frontend/proxy cần thiết. Nhóm đã có key, nhưng agent vẫn phải kiểm tra cấu hình hoạt động qua health/readiness đã che thông tin; không yêu cầu dán key vào chat.

- Với Next.js trên Vercel Functions, không dùng SQLite trong thư mục ứng dụng hoặc `/tmp` làm kho hồ sơ lâu dài. Chọn persistence dùng chung cho incidents/events/hash chain/network; ghi âm dùng object storage có kiểm soát quyền truy cập.
- Không dựa vào singleton `globalThis`, Map, EventEmitter hoặc bộ đếm trong RAM để bảo đảm trạng thái xuyên request/instance. Chuyển mailbox, revision, capability signing secret và rate limit sang cơ chế dùng chung phù hợp; bảo toàn phân quyền và cô lập incident.
- Timer giám sát, điều phối cuộc gọi và showcase cần cơ chế thực thi bền vững, có idempotency, generation và khả năng phục hồi. Không giữ function mở vô hạn hoặc coi `after`/`waitUntil` là worker thường trực. Mất liên lạc không được phụ thuộc tab trình duyệt còn mở.
- SSE có reconnect/resume và polling từ nguồn trạng thái bền vững; polling không sửa được việc state chỉ có trong RAM. API, hồ sơ và recording riêng tư không được cache chia sẻ.
- Backend một instance được dùng cache/EventEmitter để tăng tốc nhưng trạng thái cần phục hồi, deadline, job và event cursor phải được lưu trong Supabase. Sau restart phải tái dựng hoặc đánh dấu gián đoạn rõ ràng; không tự phát lại cuộc gọi thật. Không scale nhiều instance trước khi có lock/lease và kiểm thử tương ứng.
- Cookie/session và capability phải dùng được qua nhiều instance, đúng HTTPS/domain và Preview/Production. Chỉ tin forwarded headers từ hạ tầng được kiểm soát, kiểm tra Origin theo public origin cấu hình; không bỏ kiểm tra để chữa lỗi proxy.
- Link `/r/<token>`, link hồ sơ và chia sẻ dùng public origin của đúng môi trường. Cơ chế so instanceId hiện tại phải được thiết kế lại cho nhiều instance; không phát link localhost hoặc nhầm Preview với Production.
- Demo ban giám khảo có nút bắt đầu rõ ràng, trạng thái loading/lỗi/thử lại, SIMULATION mặc định, không cần nhập API key và không phát sinh cuộc gọi thật. Thử nhiều browser/phiên độc lập, không dùng một global incident cho tất cả khách.
- Khi bật AI live, giữ khóa ở server, consent và hạn mức chi phí theo phiên/toàn demo. Thiếu quota hoặc quyền micro vẫn phải có luồng demo/text fallback có nhãn đúng.
- Không tự mua dịch vụ, đổi gói trả phí, nối domain hay công khai dữ liệu thật. Việc chuẩn bị code và Preview thuộc phạm vi phát triển; hành động phát hành phải theo quyền người dùng đã cấp.

Cổng nộp thi: typecheck/test/build đạt; các blocker runtime đã xử lý; Preview chạy hết kịch bản trên HTTPS; dữ liệu/phiên độc lập; giám khảo mở link bằng cửa sổ riêng tư được theo chính sách cuộc thi; Production được kiểm tra sau phát hành; có release/commit, URL, giới hạn, hướng dẫn ngắn và cách rollback. Build xanh hoặc trang chủ trả 200 chưa đủ.

## 10. Harness thiết kế với Impeccable

Skill được ghép ở `.agents/skills/impeccable/SKILL.md`, nguồn `https://github.com/pbakaus/impeccable`; phiên bản được ghi trong `docs/DESIGN-WORKFLOW.md`. Đọc SKILL.md khi làm UI. Impeccable là phương pháp thiết kế/rà soát; nhận diện riêng của Guardian AI nằm trong `PRODUCT.md`, `DESIGN.md` và `.impeccable/design.json` hiện có.

1. **Ngữ cảnh:** theo hướng dẫn skill, chạy launcher `context` một lần mỗi phiên từ root dự án và đọc playbook đúng mục tiêu. Windows dùng `.agents/skills/impeccable/scripts/impeccable.cmd`. Nếu launcher lỗi, báo rõ và đọc context hiện có để tiếp tục; không tự tạo lại PRODUCT/DESIGN.
2. **Phân loại surface:** landing giới thiệu/nộp thi = Persuade; điện thoại, command center và receiver = Operate; báo cáo bằng chứng/hướng dẫn = Read. Chọn theo tác vụ người dùng trên từng màn hình.
3. **Thiết kế trước code:** với luồng mới, dùng `shape`; với màn hình có sẵn, `critique` để chỉ ra vấn đề. Chốt thứ bậc nội dung, tương tác, các trạng thái và tiêu chí thành công; giữ bố cục/nhận diện ngoài phạm vi thay đổi.
4. **Triển khai:** đọc `reference/craft-floor.md` ngay trước khi sửa UI. Dùng token/component hiện có, kiểm soát typography, khoảng trắng, màu ngữ nghĩa và tương tác. Thiết kế đủ loading/empty/error/permission denied/offline/AI unavailable, không chỉ trạng thái đẹp nhất.
5. **Hoàn thiện:** chọn `adapt`, `clarify`, `harden`, `optimize` theo lỗi thực tế; `polish` trước bàn giao. Không chạy toàn bộ lệnh cho mọi thay đổi nhỏ.
6. **Rà soát:** `audit` và xem giao diện render trên laptop/máy chiếu, mobile 390 px, bàn phím và cửa sổ riêng tư; lặp lại trên Preview khi chuẩn bị release. Đóng lỗi nghiêm trọng về khả năng thao tác, responsive, contrast, focus và trạng thái SOS trước phát hành.
7. **Lưu quyết định:** khi thực sự đổi hệ thống thiết kế, cập nhật `DESIGN.md` và sidecar liên quan theo skill; ghi phát hiện/tiêu chí đã xác minh. Không sửa drift hoặc đổi nhận diện như tác dụng phụ của task backend.

Ví dụ gọi trong Codex: `$impeccable shape luồng mở link demo`, `$impeccable critique command center`, `$impeccable adapt màn hình điện thoại`, `$impeccable audit bản Preview`, `$impeccable polish thẻ phương án`.

Ở màn hình SOS, ưu tiên đọc nhanh, một bước tiếp theo và thao tác một tay. Giữ màu/trạng thái mô phỏng, tham khảo và tiếp nhận phân biệt rõ. Motion tôn trọng reduced-motion; tránh hiệu ứng trang trí che chỉ dẫn hoặc làm chậm bản đồ. Landing có thể giàu nhận diện hơn nhưng không thêm người dùng, lời chứng thực, số liệu hay cam kết cứu hộ chưa có bằng chứng.

Không đưa engine, launcher, detector, live overlay hay secret của skill vào bundle trình duyệt. Không chạy live overlay trên Production hoặc nới CSP để cho phép nó. Bản cài thủ công bằng helper không tự bật design hook; không tuyên bố audit tự động đã hoạt động khi chưa cấu hình và kiểm chứng riêng.

## Repository publication
Never commit private build prompts, copies of prompts, conversation checkpoints, local credentials, runtime data or scratch logs.
