# Guardian AI — quy trình đưa bản thi lên Vercel

## Mục tiêu và trạng thái

Nhóm chọn Vercel cho link demo nộp thi. Kết quả cần đạt: giám khảo tự mở HTTPS, chạy demo một nút qua engine thật, xem tuyến/phân vai/hồ sơ, có thể chạy lại trong phiên độc lập. Bản nộp không cần máy cá nhân hay Cloudflare quick tunnel tiếp tục bật.

**Hiện trạng: đã xác định yêu cầu và blocker; chưa chuyển runtime, chưa deploy hoặc kiểm chứng Vercel.** Tài liệu này là hợp đồng triển khai tiếp theo, không phải hướng dẫn tuyên bố bản hiện tại đã sẵn sàng publish.

## Quyết định kiến trúc

**Đã chốt Supabase theo yêu cầu nhóm.** Đích triển khai: frontend Next.js/link demo trên Vercel → proxy `/api` cùng origin → backend Node.js 24 chạy liên tục trên Render, một instance cho bản thi → Supabase Postgres + private Storage. Backend này đồng thời chạy job runner cho engine; bản thi chưa cần thêm một worker service riêng. Gói và chi phí phải được xác nhận trước khi tạo dịch vụ trả phí. Xem hợp đồng đầy đủ trong `SUPABASE-ARCHITECTURE.md` và luồng giám khảo trong `COMPETITION-FLOW.md`.

Với Next.js dùng Vercel Functions, filesystem ứng dụng chỉ đọc; `/tmp` là vùng tạm, không phải kho hồ sơ lâu dài. Function và công việc `waitUntil` có thời gian chạy hữu hạn. Vì vậy SQLite/file local và ticker trong tiến trình hiện tại không tạo ra bản deploy ổn định. Tham khảo [runtime](https://vercel.com/docs/functions/runtimes) và [vòng đời waitUntil](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package).

Vercel frontend + backend Node qua [external rewrite](https://vercel.com/docs/routing/rewrites) là hướng thiết kế được chọn để giữ engine chạy liên tục. Phải kiểm tra proxy, cookie, Origin, streaming, timeout và toàn bộ link mời. Supabase Edge Functions không thay thế trực tiếp vòng giám sát thường trực; Postgres/Storage và Node backend có trách nhiệm khác nhau. API không chạy engine/SQLite thứ hai trên Vercel.

## Các phần cần chuyển

| Hiện có | Yêu cầu trên môi trường deploy | Bằng chứng hoàn thành |
|---|---|---|
| `lib/store.ts`: node:sqlite, snapshot/event/hash chain | Kho bền vững dùng chung; transaction và revision chống ghi đè | Cold start, nhiều request/instance, redeploy không mất hồ sơ |
| `lib/engine.ts`: Map/cache, EventEmitter, ticker/timer | Runtime không phụ thuộc instance; job idempotent, deadline và generation lưu bền vững | Reset chặn job cũ; request kết thúc/tab đóng vẫn giám sát đúng |
| `lib/recordings.ts`: append file cục bộ | Object storage riêng tư, metadata/chunk/hash nhất quán | Upload lặp/sai thứ tự; tải khác incident bị chặn; xóa dữ liệu dẫn xuất |
| API: secret/instanceId/mailbox/rate limit trong RAM | Secret ổn định ở server; mailbox và hạn mức dùng chung | Cookie/capability/signaling không hỏng khi đổi instance |
| `lib/links.ts`: so cùng instanceId | Xác minh public deployment/origin theo kiến trúc mới | Link mời đúng host; nhiều instance không bị hiểu là sai server |
| SSE và polling | Resume/cursor + snapshot từ persistence, không lệ thuộc bus local | Ngắt/reconnect không mất quyết định hoặc nhận sai incident |
| `.env.local` và cấu hình local | Biến môi trường riêng cho Preview/Production; khóa không vào client | Demo không key; AI live chỉ khi cấu hình/consent hợp lệ |

Không đổi DB sang `/tmp`, dùng `:memory:` trên Production hoặc tăng maxDuration rồi coi các blocker đã xong. Polling là cách truyền cập nhật, không thay thế persistence hay job runner.

## Quy trình triển khai

1. Theo kiến trúc Vercel + Node backend + Supabase và phạm vi `COMPETITION-FLOW.md`: one-button simulation mặc định; AI live tùy cấu hình, không gọi số thật.
2. Tạo adapter persistence/job/storage với contract rõ ràng; giữ đường local/mock phục vụ test. Chuyển từng lát cắt API → engine → event → UI, giữ policy/evidence.
3. Bổ sung regression cold start/concurrency/idempotency/access control. Tách dữ liệu Preview/Production; không cho Preview làm thay đổi bản nộp.
4. Chạy `npm ci`, typecheck, unit tests và production build ở môi trường sạch/Linux. Không commit `.env.local`, DB, recording thật hoặc thư mục `.impeccable` runtime.
5. Triển khai backend Node với health/readiness, biến PORT và host 0.0.0.0; kết nối Supabase qua credential server. Sau đó tạo Vercel project/Preview khi có quyền; dùng Next.js preset và proxy API tới đúng backend môi trường đó. Không cấu hình static export cho app có API/proxy, không bật engine local phía Vercel.
6. Thiết lập persistence/job/storage và biến môi trường. Các tên biến mới chỉ được ghi là dùng được sau khi code thực sự đọc chúng; không tạo cấu hình giả.
7. Chạy checklist Preview dưới đây, lưu commit, URL, thời điểm, kết quả và giới hạn. Kiểm tra thiết lập Deployment Protection bằng người dùng ngoài nhóm theo yêu cầu cuộc thi; không mặc định Preview mở công khai.
8. Khi được phép phát hành, promote/deploy Production rồi kiểm tra lại URL ổn định. Nộp link Production đã kiểm tra, kèm bước chạy demo và chế độ hoạt động.

## Checklist nghiệm thu trên link thật

- [ ] Mở `/` và vào demo từ cửa sổ riêng tư, không yêu cầu tài khoản developer; quyền truy cập đúng thể lệ cuộc thi.
- [ ] Chạy trọn demo qua engine: SOS → cam kết có quote → phân vai → chấp nhận → đổi tuyến/thu hồi → khẩn cấp → mất liên lạc → hồ sơ.
- [ ] Demo mặc định không cần API key của giám khảo; lỗi AI/quota có fallback có nhãn; không giả đã gọi thật.
- [ ] Refresh, reconnect, cold start và nhiều phiên đồng thời không trộn incident, mất trạng thái hoặc nhân đôi side effect.
- [ ] Mất liên lạc/timeout vẫn được xử lý khi tab người dùng đóng; không dùng client timer làm bảo đảm duy nhất.
- [ ] `/r/<token>` trên điện thoại khác nhận đúng vai và dữ liệu được phép; Origin/cookie hoạt động với domain thật.
- [ ] Hồ sơ/ghi âm giữ được sau redeploy; tải khác incident bị chặn; không có shared cache chứa dữ liệu riêng tư.
- [ ] HTTPS/micro permission denied/không có GPS/âm thanh bị chặn đều có UI phù hợp; live voice được ghi riêng là đã thử hoặc chưa thử.
- [ ] Desktop và 390 px không tràn ngang, không có lỗi JS; font/tile/asset tải đúng từ link thật; kiểm tra chất lượng bằng Impeccable theo `DESIGN-WORKFLOW.md`.
- [ ] Trạng thái SIMULATION rõ ràng; không hiển thị điểm mô phỏng thành nơi tiếp nhận thật.
- [ ] Có release/commit, URL ổn định, hướng dẫn demo, hạn mức chi phí, giới hạn và phiên bản rollback.

Rollback cần xét tương thích schema/dữ liệu. Quay về deployment cũ không tự đảo migration; luôn xác định cách giữ dữ liệu trước khi đổi schema.

## Nhật ký phát hành

Mỗi lần kiểm chứng ghi: môi trường (Preview/Production), commit, URL, thời điểm, dữ liệu/chế độ AI, kịch bản, PASS/FAIL/NOT RUN, giới hạn, bản rollback. Không ghi token hoặc secret. Chỉ cập nhật trạng thái đầu tài liệu khi đã có bằng chứng triển khai thực tế.
