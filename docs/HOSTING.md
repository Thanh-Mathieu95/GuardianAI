# Chuẩn bị host Guardian AI

## Bản demo miễn phí được chọn

Người dùng chọn Render Free và chấp nhận server ngủ/gián đoạn. Bản đầu chạy AI OFF, SQLite và ghi âm tạm trên filesystem của service, không gắn disk trả phí. Đặt `GUARDIAN_DEMO_HOSTING=1` cả khi build và chạy để hiển thị giới hạn dữ liệu. Dữ liệu có thể mất khi restart/redeploy; chỉ dùng dữ liệu mô phỏng. Đây chưa phải bản runtime Supabase bền vững hoặc dịch vụ bảo vệ người thật.

## Trạng thái

Đã bổ sung lệnh khởi động cho môi trường hosting và ví dụ cấu hình server. Chưa tạo dịch vụ cloud hoặc xác nhận một URL công khai hoạt động. Kiến trúc đích Vercel + Node backend + Supabase vẫn được mô tả trong [DEPLOYMENT.md](DEPLOYMENT.md).

Người dùng chọn Cloudflare làm điểm truy cập frontend thay cho Vercel. Bước chuẩn bị có Worker tại `cloudflare/worker.mjs`, chuyển tiếp trang, asset và API về cùng backend Node để giữ một origin cho cookie, link mời và SSE. Next.js vẫn render trên Node; đây không phải một engine thứ hai trên Workers.

Trước khi deploy Worker, đặt `BACKEND_ORIGIN` trong cấu hình runtime thành origin HTTPS của backend đã kiểm chứng và chọn đúng Cloudflare account. Worker trả 503 khi thiếu cấu hình, không dùng URL giả. Từ root, chạy `npm --prefix cloudflare ci`, `npm --prefix cloudflare run check`, rồi `npm --prefix cloudflare run deploy` sau khi có quyền Cloudflare và backend sẵn sàng. `workers.dev` chưa được tạo trong bước chuẩn bị. Kiểm tra proxy cục bộ bằng `npm --prefix cloudflare test`.

Supabase chưa thay thế Store/Network SQLite trong runtime. Chưa công bố bản triển khai hoàn chỉnh hoặc deploy backend không có lưu trữ bền vững. Cần tài khoản/project được xác định và hoàn tất migration theo `SUPABASE-ARCHITECTURE.md` trước khi xác nhận đích Cloudflare + Render + Supabase đã hoạt động.

## Runtime hiện tại

Ứng dụng cần Node.js 24, một tiến trình chạy liên tục, SQLite và thư mục ghi âm có thể ghi. Không triển khai engine hiện tại như static site hoặc trên filesystem serverless tạm thời rồi coi là đã lưu dữ liệu bền vững.

- Cài và build: `npm ci && npm run build`.
- Khởi động: `npm run start:host`.
- Lệnh hosting lắng nghe `0.0.0.0`; Next.js đọc cổng từ biến `PORT` do dịch vụ cung cấp. Lệnh `npm start` vẫn dành cho localhost.
- Health check: `/api/health`.
- Chạy một instance; chưa bật autoscaling.

## Biến môi trường hosting

| Biến | Cách cấu hình |
| --- | --- |
| `NODE_ENV` | `production` |
| `AI_PROVIDER` | `OFF` cho lần kiểm tra mô phỏng đầu tiên |
| `PUBLIC_URL` | Origin HTTPS của deployment thực tế, không chứa đường dẫn |
| `GUARDIAN_SESSION_SECRET` | Giá trị ngẫu nhiên dài, ổn định qua các lần restart, lưu trong secret của dịch vụ |
| `GUARDIAN_DB_PATH` | File SQLite trong volume bền vững nếu dùng runtime SQLite |
| `GUARDIAN_RECORDINGS_DIR` | Thư mục trong cùng volume bền vững nếu dùng ghi âm cục bộ |

Không chép `.env.local`, database hay ghi âm trên máy lên bản build. Chưa bật gateway gọi điện hoặc AI live trong lần kiểm tra đầu. Các khóa tích hợp chỉ nhập bằng cơ chế secret của nhà cung cấp khi cần bật chức năng tương ứng.

## Phương án demo một dịch vụ Node

Nếu chọn host bản hiện tại trước khi chuyển Supabase, Render hỗ trợ Next.js dưới dạng Node web service. SQLite và ghi âm phải đặt trên persistent disk, ví dụ mount `/var/data`, database `/var/data/guardian.sqlite`, ghi âm `/var/data/recordings`.

Đây là phương án chuyển tiếp cần người dùng chọn, không thay thế hợp đồng migration Supabase. Persistent disk yêu cầu dịch vụ trả phí; chưa tạo hoặc mua dịch vụ trong bước chuẩn bị. Dịch vụ một instance vẫn có gián đoạn khi restart/redeploy và không bảo đảm khôi phục tác vụ đang chạy như một job runner bền vững.

## Kiểm tra trước khi bàn giao URL

1. Build sạch trên Linux và kiểm tra server nhận cổng do dịch vụ cấp.
2. Mở trang chính, command center, điện thoại và health trên HTTPS.
3. Chạy toàn bộ demo qua engine với AI OFF; không gọi số thật.
4. Thử hai phiên riêng tư, xác nhận dữ liệu và quyền truy cập không bị trộn.
5. Mở liên kết người nhận trên thiết bị khác; kiểm tra cookie, Origin, SSE và polling.
6. Restart/redeploy rồi kiểm tra hồ sơ còn trong kho lưu trữ; ghi nhận tác vụ bị gián đoạn.
7. Kiểm tra micro/GPS khi được cấp quyền và khi bị từ chối, rồi mới bật tích hợp live có kiểm soát.

Tài liệu nhà cung cấp: [Next.js trên Render](https://render.com/docs/deploy-nextjs-app), [persistent disks](https://render.com/docs/disks), [giới hạn free tier](https://render.com/docs/free).
