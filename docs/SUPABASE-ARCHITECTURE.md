# Guardian AI — hợp đồng Vercel, Node backend và Supabase

## Trạng thái và lựa chọn

Thiết kế đích, chưa nối database/bucket hoặc triển khai cloud trong đợt này. User đã chọn Supabase và cho biết đã có API key. Không tạo tài khoản/gói trả phí, không đọc/in key từ `.env.local`, không yêu cầu gửi key vào chat.

- **Vercel:** Next.js frontend, asset, domain HTTPS, proxy `/api` cùng origin tới backend của đúng môi trường.
- **Node.js 24 backend:** API và engine điều phối, admission/policy, SSE/polling, job runner trong một service. Mặc định Render một instance cho bản thi; chọn gói giữ hoạt động liên tục nếu cần sau khi nhóm xác nhận chi phí. Không hứa free tier không sleep.
- **Supabase Postgres:** incidents, snapshot/event/report history, network, job/deadline, signaling và hạn mức bền vững.
- **Supabase Storage:** bucket private cho chunk/recording; browser tải qua endpoint kiểm tra quyền hoặc signed URL sống ngắn do server cấp.
- **OpenAI:** Responses/Realtime theo cấu hình hiện có; key dài hạn ở backend, client chỉ dùng khóa tạm.

Supabase cung cấp [Postgres](https://supabase.com/docs/guides/database/overview); backend Node chọn direct/session pooler phù hợp mạng IPv4/IPv6 và connection budget theo [hướng dẫn kết nối](https://supabase.com/docs/guides/database/connecting-to-postgres). Không giữ transaction mở xuyên cuộc gọi model. [Edge Functions có giới hạn vòng đời](https://supabase.com/docs/guides/functions/limits), nên không chạy engine tick vô hạn ở đó.

## 1. Một đường ghi trạng thái

Browser → `/api` → Node API → engine → admission/policy → repository transaction → event stream → UI. Chỉ Node backend được ghi quyết định nghiệp vụ. Browser không được sửa plan/support/record hash trực tiếp qua Supabase SDK.

Một incident có `generation` và `revision`. Mutation đọc revision, kiểm tra owner/quyền và trạng thái, tính thay đổi, commit với điều kiện revision cũ. Xung đột phải reload và xử lý lại có giới hạn; không ghi đè snapshot mới. Mỗi mutation/job có idempotency key.

LLM request chạy ngoài transaction: đọc snapshot/revision → gọi model với timeout → kiểm tra generation và điều kiện hiện tại → validate → commit. Không khóa database trong thời gian chờ model.

Một Node instance có thể cache và phát event trong RAM cho demo, nhưng Postgres giữ nguồn sự thật và checkpoint. Không quảng bá hỗ trợ nhiều backend instance trước khi lease/lock/pubsub và concurrency tests đã đạt.

## 2. Mô hình dữ liệu đích

Các tên dưới đây là hợp đồng để tạo migration; chưa phải bảng đã tồn tại. Dùng khóa/ID tương thích dữ liệu hiện có, không đổi tất cả sang UUID nếu incident/member ID hiện tại không phải UUID.

| Bảng | Trường chính và ràng buộc |
|---|---|
| `guardian_sessions` | owner/session ID, created/expiry; không lưu capability token thô |
| `guardian_incidents` | id, owner, mode, status, generation, revision, payload JSONB, created/updated; index owner + updated |
| `guardian_events` | incident_id, seq, event_id, generation, source_kind, type, payload, at; unique incident+seq và event_id; cursor tăng ổn định |
| `guardian_event_snapshots` | incident_id, event_id, snapshot; replay không thực thi lại |
| `guardian_report_revisions` | incident_id, seq, payload_text, previous_hash, hash, at; unique incident+seq |
| `guardian_members` | id, owner, role, token_digest, joined, on_duty, profile; token_digest unique; token mời có entropy phù hợp |
| `guardian_settings` | owner, settings JSONB; mật mã/trang phục không nằm trong event public |
| `guardian_jobs` | id, incident_id, generation, type, dedupe_key, run_at, status, lease_owner/until, attempts, payload, error_code |
| `guardian_signal_mailbox` | owner/member scope, seq, expires_at, payload; không trộn kênh các vai |
| `guardian_recording_chunks` | incident_id, session, seq, object_key, bytes, mime, sha256, state; unique incident+session+seq |
| `guardian_evidence_shares` | incident_id, recipient_member_id, revision, shared_at, revoked_at; quyền kiểm tra tại mỗi lần tải |
| `guardian_rate_events` | actor/scope, kind, at, idempotency key; server kiểm tra hạn mức |

Commit incident phải nguyên tử với event/snapshot/report revision liên quan. Chuỗi băm hiện dùng `SHA256(previous_hash + "\n" + payload_text)`: giữ nguyên bytes UTF-8 của chuỗi payload đã hash; không tái serialize JSONB rồi giả hash cũ vẫn hợp lệ. Giữ `payload_text` cho report revision, JSONB chỉ là cấu trúc truy vấn bổ sung.

Không ghi recording binary/base64 vào incident JSON. Khi tách bảng, vẫn xuất dossier đầy đủ cùng nguồn/version; không làm mất traceability để đơn giản schema.

## 3. Quyền truy cập

- Bản thi dùng guest cookie phiên có HttpOnly/Secure/SameSite phù hợp; không cần Supabase Auth cho giám khảo. Phân biệt owner, người nhận và operator như nghiệp vụ hiện tại.
- Enable RLS mọi bảng phơi qua Data API; mặc định không có policy cho anon/authenticated đọc bảng incident/network/recording. Không tạo `using(true)` cho tiện demo.
- Backend dùng credential server riêng; secret/service-role có thể bypass RLS, vì vậy mọi API vẫn kiểm tra owner, capability, member role và evidence share trước khi truy vấn/trả dữ liệu.
- Publishable/anon key không cấp quyền quản trị. Secret/service-role, mật khẩu Postgres, OpenAI key và khóa ký phiên tuyệt đối không nằm trong NEXT_PUBLIC, bundle frontend hoặc response config.
- Khóa ký capability/session ổn định theo môi trường, đủ entropy, giữ qua restart. Preview và Production không dùng chung dữ liệu/secret mặc định.
- Token người nhận sống dài được hash khi lưu trong mô hình mới; thiết kế đường chuyển tiếp token hiện có để không đứt link trong migration.
- Origin public được cấu hình rõ. Không tin tùy ý header forwarded do client tự gửi; cơ chế proxy cần kiểm chứng và giới hạn nguồn truy cập backend phù hợp.
- Private bucket không có URL công khai. Quyền tải được kiểm tra mỗi request; signed URL chỉ là quyền ngắn hạn, không chứng minh người cầm URL là thành viên hợp lệ lâu dài.

## 4. Job runner và phục hồi

Không cần thêm Redis hoặc queue provider riêng cho bản thi. Postgres giữ bảng job; backend claim các job tới hạn bằng transaction + `FOR UPDATE SKIP LOCKED`, cấp lease và commit claim trước khi làm việc. Có thể dùng [Supabase Queues](https://supabase.com/docs/guides/queues/pgmq) khi đã có contract tương ứng; không chạy đồng thời hai cơ chế queue cho cùng loại job.

Các loại việc: nhánh gọi mô phỏng/app, timeout cuộc gọi, hết hạn cam kết, check-in/mất liên lạc, route monitor, showcase step và finalize recording. Job chứa deadline thật/đồng hồ demo cùng nhãn nguồn rõ, không serialize nguyên toàn bộ incident vào từng job.

Trước side effect: kiểm tra generation, status, dedupe key và quyền. Sau khi làm: commit kết quả với revision hợp lệ, đánh dấu job xong. Nếu worker chết giữa chừng, lease hết hạn cho phép phục hồi; retry giới hạn với backoff cho lỗi tạm thời. Job không thể phục hồi chuyển FAILED có event giải thích; không giả thành công.

Giao nhận job là ít nhất một lần; đạt hiệu ứng một lần bằng idempotency. Không tự retry cuộc gọi số thật có kết quả chưa rõ; đưa về cần xác minh. Tick/mất liên lạc hoạt động phía server khi browser đóng.

## 5. Ghi âm và bằng chứng

Mỗi chunk có key theo incident/session/seq và checksum. Upload là hai pha có metadata trạng thái: reserve seq/idempotency → upload object → commit checksum/bytes/manifest. Retry kiểm tra cùng nội dung, không append lại bytes. Xử lý orphan bằng job có thời gian đệm và audit; không tự xóa hồ sơ hợp lệ theo TTL tùy tiện.

Giữ giới hạn hiện tại 2 MB/chunk, 80 MB/incident và MIME được phép. Đối chiếu thứ tự/manifest khi finalize; lưu hash của chính artifact xuất ra. Hồ sơ có thể niêm phong tại các mốc trước khi recording kết thúc; mỗi niêm phong trỏ đúng revision/manifest, không chỉnh ngược hồ sơ cũ.

Xóa transcript theo thao tác được phép phải xóa/chặn truy cập cả report/replay/recording dẫn xuất; cập nhật job và object manifest nhất quán. Có retry cho object delete và không trả signed URL mới khi đã thu hồi quyền.

## 6. Sự kiện, signaling và link công khai

SSE/polling bản thi đọc revision/cursor từ Postgres. Không bắt buộc bật Supabase Realtime; nếu thêm sau, chỉ dùng làm notification cần đọc lại snapshot và kiểm tra quyền, không làm nguồn quyết định thứ hai.

Browser nối tới domain Vercel. API được forward sang backend của cùng môi trường, kèm cookie/Origin/body cần thiết và không cache dữ liệu riêng tư. Kiểm tra payload upload/proxy timeout bằng chunk ghi âm thực, không chỉ health.

`PUBLIC_URL` là domain Vercel đúng môi trường. Link mời giữ cùng origin đó. Probe “cùng instanceId” hiện tại cần đổi sang contract deployment/backend identity ổn định; health không được lộ token/connection string. readiness cần xác nhận DB/schema/storage/job runner sẵn sàng, không chỉ process đang sống.

## 7. Cấu hình phải chuẩn bị

Tên biến mới dưới đây là đề xuất cho đợt tích hợp, chưa được code hiện tại đọc nếu chưa triển khai adapter tương ứng:

| Nơi | Cấu hình đích |
|---|---|
| Vercel | Backend origin của đúng môi trường; cấu hình proxy/public origin, không giữ Supabase admin key |
| Node backend | PUBLIC_URL; PostgreSQL connection có TLS/pool size; Supabase URL và server secret; private bucket; session signing secret; PORT; AI_PROVIDER/model/OpenAI key |
| Supabase | Migration, RLS/privileges, bucket private, connection/network policy và backup phù hợp |

Chỉ thêm biến vào `.env.example` khi code thực sự dùng nó. Đưa giá trị thật vào dashboard hoặc file cấu hình máy được gitignore; runtime/health chỉ báo configured/ready và lỗi đã che thông tin.

## 8. Thứ tự chuyển đổi

1. Giới thiệu async repository contract; tách Store và Network khỏi `DatabaseSync` mà vẫn giữ SQLite adapter local/test.
2. Viết Postgres adapter/migration với save+event+hash transaction, owner scoping và compare-and-swap revision. Tránh bridge async bằng spawnSync hoặc blocking network call.
3. Chuyển engine/API sang await theo lát cắt. Không trả “đã lưu” trước durable commit. Viết test cả hai adapter với cùng acceptance contract.
4. Thêm job/deadline/lease và startup recovery; rồi chuyển recording sang private Storage.
5. Thêm deploy backend, proxy Vercel, signing secret ổn định, health/readiness và test external URL.
6. Chạy migration bằng credentials được cấp qua kênh cấu hình; import fixture/dữ liệu thử, không upload DB cá nhân lên Supabase mặc định.
7. Chạy checklist `DEPLOYMENT.md`, rồi phát hành và ghi release evidence.

Đợt thiết kế này chưa thực hiện các bước migration trên. API key có sẵn không có nghĩa database/bucket/schema đã sẵn sàng hoặc source đã dùng Supabase.
