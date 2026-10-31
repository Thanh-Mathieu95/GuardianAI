# Hosting Guardian AI

## Cấu hình được chọn

Cloudflare Worker là điểm truy cập HTTPS, chuyển tiếp trang, asset và API tới một dịch vụ Next.js/Node trên Render. Supabase PostgreSQL giữ sự cố, lịch sử, mạng lưới và hạn mức; Supabase Storage giữ các chunk ghi âm trong bucket private `guardianai-recordings`.

Người dùng chọn Render Free. Server có thể ngủ và tác vụ đang chạy có thể gián đoạn. Dữ liệu đã commit trong Supabase được giữ qua restart, nhưng bản demo không bảo đảm giám sát liên tục cho người thật. AI mặc định OFF; chưa cấu hình cuộc gọi số thật.

## Backend

- Build: `npm ci --include=dev && npm run build`.
- Start: `npm run start:host`, lắng nghe `0.0.0.0` và cổng `PORT` của dịch vụ.
- `/api/health` chỉ xác nhận HTTP process sống để Render có thể chuyển deployment trước khi instance cũ nhả khóa.
- `/api/readiness` chờ kết nối PostgreSQL, phục hồi cache và commit các cập nhật khởi động trước khi báo sẵn sàng.
- Chỉ chạy một instance. Khóa advisory qua session pooler chặn hai backend cùng nắm engine; không dùng transaction pooler cho kết nối giữ khóa.

## Biến môi trường

| Biến | Mục đích |
| --- | --- |
| `AI_PROVIDER` | `OFF` cho demo miễn phí |
| `GUARDIAN_DEMO_HOSTING` | `1` khi build và chạy để hiển thị giới hạn hosting |
| `PUBLIC_URL` | Origin HTTPS Cloudflare thực tế, không có đường dẫn |
| `GUARDIAN_POSTGRES_URL` | PostgreSQL session pooler, cổng 5432, tài khoản backend chỉ được DML trong schema `guardian_ai` |
| `GUARDIAN_SESSION_SECRET` | Khóa ngẫu nhiên ổn định qua restart; ký capability và mã hóa token người nhận |
| `GUARDIAN_SUPABASE_URL` | Origin HTTPS project Supabase |
| `GUARDIAN_SUPABASE_SERVICE_KEY` | Chỉ ở server, dùng truy cập bucket ghi âm private |
| `GUARDIAN_RECORDINGS_DIR` | Cache ghi âm tạm tại backend; nội dung được phục hồi từ Storage |

Không đưa secret, database hoặc ghi âm cá nhân vào source/build. Chứng chỉ `supabase/prod-ca-2021.crt` là CA công khai; kết nối PostgreSQL vẫn xác minh CA và hostname.

## Lưu trữ và quyền truy cập

Schema `guardian_ai` tách khỏi các bảng `public` của ứng dụng có sẵn. Các bảng đều bật RLS và không cấp quyền cho `anon`/`authenticated`. Backend có role riêng với quyền đọc/ghi schema này, không có quyền tạo bảng. Token người nhận được tra cứu qua hash và mã hóa khi lưu; không thay đổi khóa phiên tùy tiện nếu còn cần phục hồi token.

SQLite trong RAM chỉ là bộ nhớ làm việc cho interpreter hiện có, được dựng lại từ PostgreSQL khi khởi động. Incident, snapshot và report revision được commit cùng transaction; ghi có compare-and-swap revision. HTTP chờ commit và SSE nhận bản trạng thái đã chụp sau commit. Lỗi persistence trả 503 và không xác nhận thành công từ cache chưa lưu.

Ghi âm dùng object theo incident/session/seq và manifest checksum trong PostgreSQL. Retry khác nội dung bị từ chối; tải đi qua API kiểm tra quyền. Xóa transcript xử lý cả chunk Storage, manifest, replay và report dẫn xuất. Bucket không có policy cho client đọc công khai.

## Cloudflare

Worker ở `cloudflare/worker.mjs`; `BACKEND_ORIGIN` trỏ tới dịch vụ Render. Worker giữ Origin/cookie/body stream, thay header forwarding và không cache response phiên. Next.js vẫn render trên Node, không có engine/SQLite thứ hai trong Workers.

```sh
npm --prefix cloudflare ci
npm --prefix cloudflare test
npm --prefix cloudflare run check
npm --prefix cloudflare run deploy
```

Chọn đúng account Cloudflare trước khi deploy. Sau khi có URL Worker, đặt `PUBLIC_URL` cho backend và kiểm tra link người nhận dùng đúng origin này.

## Kiểm chứng

- `npm run typecheck`, `npm test`, `npm run build`.
- `scripts/verify-persistence.ts`: commit PostgreSQL thật, cô lập owner, conflict revision, hash chain và reconnect.
- `scripts/verify-runtime.ts write/read`: hai tiến trình độc lập kiểm tra phục hồi incident, network, token, settings và ghi âm private; chỉ dùng dữ liệu QA tự tạo.
- `tests/api.integration.ts` trên QA riêng với AI OFF, gateway tắt và Supabase thật.
- Kiểm tra HTTPS, browser, hai phiên độc lập, SSE/polling và liên kết người nhận sau khi deploy.

Các script cần khóa runtime độc quyền; không chạy kiểm tra trực tiếp vào cùng database khi backend production đang nắm khóa. Timer/tiến trình mô phỏng bị ngắt khi server ngủ; khởi động lại đánh dấu các cuộc gọi đang chạy là gián đoạn, không tự gọi lại số thật. Chưa có job runner nhiều instance hoặc khả năng chịu lỗi liên tục.
