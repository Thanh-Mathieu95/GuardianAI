# Guardian AI · Nhật ký thay đổi (v1.3 → v1.5)

Tiếp nối [CHANGELOG.md](CHANGELOG.md) (v1.1 → v1.3). Đợt này tập trung vào: **bản đồ 3D phố thật**, **AI hiểu ngữ cảnh an toàn**, **nhận diện khẩn cấp tức thì**, **hồ sơ bằng chứng**, **gọn giao diện**, và **chạy được trên điện thoại thật qua tunnel**.

---

## Tổng quan nhanh

| Hạng mục | Trước (v1.3) | Bây giờ (v1.5) |
|---|---|---|
| Bản đồ | Guardian City tự vẽ (SVG phẳng) | **Bản đồ 3D phố thật Thủ Thiêm** (OSM + MapLibre/OpenFreeMap), nhà dựng khối, camera nghiêng, tự bay theo người dùng |
| Chọn tuyến | Ưu tiên phố sáng/đông | Thêm **né nơi từng có sự cố**, kèm lý do (`advisories`) |
| Hiểu ngữ cảnh | Chỉ đọc vị trí | AI tra **lịch sử sự cố** quanh vị trí / theo tên phố |
| Khẩn cấp | SOS chung chung | **Nhận diện tức thì** "bị đâm / tấn công…" → SOS mức 4 + 115, không chờ AI |
| Bằng chứng | Chỉ transcript | **Hồ sơ bằng chứng** tự niêm phong (SHA-256), xuất PDF |
| Mất liên lạc | Chỉ check-in | Giữ vị trí cuối, báo người thân, niêm phong hồ sơ |
| Giao diện | Có header + 3 cột cố định | **Bỏ header → dock đáy**, 2 cột **đóng/mở được**, ít chữ, chế độ ẩn hết chrome |
| Điện thoại thật | Link theo địa chỉ trang | Link **tự dùng địa chỉ tunnel**; **SSE tự chuyển sang polling** khi tunnel chặn SSE |
| Test | 46 | **49** unit test + test tích hợp |

---

## 1. Bản đồ 3D phố thật (Thủ Thiêm)

- Thay thành phố tự vẽ bằng **phố thật** của Khu đô thị mới Thủ Thiêm (TP. Thủ Đức), lấy từ **OpenStreetMap** qua Overpass.
  - `scripts/fetch-city.mjs`: tải đường (lọc hầm/đường riêng), tách thành đồ thị đi bộ, giữ thành phần liên thông lớn nhất, kèm landmark (công viên, chung cư Sarimi, nhà thờ…). Kết quả lưu `lib/city-data.json` (đã commit → chạy định tuyến **offline**).
- Nền 3D: **MapLibre GL + OpenFreeMap** (miễn phí, không cần API key; cần mạng để tải tile nền). Nhà thật dựng khối (`fill-extrusion`), camera nghiêng, bay vào vị trí người dùng khi SOS, bám theo khi đang điều hướng.
- **Cửa hàng tự dựng**: 5 điểm hỗ trợ + 3 vị trí đối tác đặt sát lề phố thật, hiện thành khối 3D đổi màu theo trạng thái (chưa liên hệ / đang gọi / đã nhận / từ chối), vòng ping khi chưa xác nhận.
- Giữ nguyên logic cũ: định vị, tìm đường an toàn, chỉ dẫn từng bước, theo dõi lệch tuyến, chặn đường, "đi lệch" mô phỏng (viết lại để đi theo polyline phố thật).
- File: `components/map3d.tsx` (mới), `lib/city.ts` (viết lại), `lib/city-data.json` (mới).

## 2. AI hiểu ngữ cảnh an toàn (lịch sử sự cố)

- **Lịch sử sự cố mô phỏng** (DỮ LIỆU GIẢ cho demo, không phải thống kê thật): giật đồ, bám theo, quấy rối, đèn đường hỏng… gắn trên tên phố thật, kèm tháng/giờ/mức độ.
- Hiển thị trên bản đồ: **vùng nhiệt đỏ**, đoạn phố nguy hiểm **phát sáng đỏ**, bấm chấm đỏ xem chi tiết từng vụ. (Màu đỏ-hồng tách khỏi màu nhấn của app.)
- **Định tuyến né rủi ro**: chi phí = độ dài × (thiếu đèn ×1.8) × (vắng ×1.25) × (1 + rủi ro sự cố). Mỗi tuyến có `advisories` giải thích, ví dụ: *"Không đi lối tắt qua Đường D6 (ngắn hơn 59 m): từng có 2 vụ giật đồ, 1 vụ bám theo (21h–23h, 6 tháng qua); thiếu đèn; vắng người."*
- Công cụ AI mới **`get_area_safety`**: tra sự cố quanh vị trí hoặc theo tên phố (khi người dùng hỏi "đường này có an toàn không").
- `get_location` thêm `incidentsNearby`; `get_directions` trả kèm `advisories`; AI được dặn giải thích ngắn gọn, nói rõ "theo dữ liệu khu vực" chứ không khẳng định như tin thật.
- File: `lib/city.ts` (`incidents`, `safetyReport`, `edgeRisk`, `advise`), `lib/realtime.ts`, `app/api/[...path]/route.ts`.

## 3. Nhận diện khẩn cấp tức thì

- `lib/emergency.ts`: bộ **luật chạy trước AI** (không cần chờ mô hình), áp dụng cho mọi câu nói/gõ kể cả khi SOS đang chạy.
  - Bắt: bị đâm/chém, bị bắn, chảy máu, ngất/khó thở, xâm hại, bắt cóc/kéo lên xe, có dao/súng, bị đánh/tấn công, bị cướp/giật, bị đe dọa/bám theo, kêu cứu. Hiểu **có dấu lẫn không dấu**.
  - Bỏ qua câu nói **về** nguy hiểm: "nếu bị đâm thì sao", "tôi không bị thương", "xem phim có cảnh bị bắn".
- Khi phát hiện: **SOS mức 4/4 ngay**, báo người thân, khung đỏ **KHẨN CẤP** ở đầu màn hình điện thoại, có nút **115** (nếu có thương tích) cạnh nút 113. App vẫn **không tự gọi** — người dùng tự bấm.
- AI được dặn: hướng dẫn sơ cứu thật ngắn ("Gọi 115. Ấn chặt vết thương. Đừng rút vật nhọn ra"), nếu chưa bị thương thì bảo chạy ra chỗ sáng; sau đó **lấy lời khai** từng câu (người lạ, xe, biển số, hướng chạy) qua công cụ mới **`record_statement`**.
- File: `lib/emergency.ts` (mới), `lib/engine.ts` (`checkEmergency`, `emergency`), `lib/realtime.ts`, `components/dashboard.tsx`.

## 4. Hồ sơ bằng chứng

- `lib/evidence.ts`: gom toàn bộ sự cố thành một tài liệu **in / lưu PDF** tại `GET /api/incidents/:id/evidence` (thêm `?format=json`).
- Nội dung: tóm tắt, câu nói gốc, **lời khai**, **đường đi GPS** (từng điểm, kèm mô tả vị trí), người thân đã báo, cuộc gọi, tóm tắt cho 113, hội thoại, dòng thời gian, **niêm phong**.
- **Niêm phong (SHA-256)** tự động khi: phát hiện khẩn cấp, bật SOS, mất liên lạc, không trả lời check-in, kết thúc sự cố. Nội dung bị sửa sau đó không khớp mã băm.
- Mọi text người dùng được **escape** chống injection trong HTML.
- Link "Hồ sơ bằng chứng" hiện ở cột phải và trong khung khẩn cấp trên điện thoại.
- File: `lib/evidence.ts` (mới), `lib/engine.ts` (`sealEvidence`, `recordStatement`, lưu `track`), `lib/types.ts` (`emergency`, `track`, `statements`, `seals`).

## 5. Mất liên lạc

- Điện thoại thật ngừng gửi vị trí > 90 giây trong lúc SOS hoặc đồng hành → `signalLost`: giữ vị trí cuối, đổ chuông người thân, chuẩn bị tóm tắt 113, niêm phong hồ sơ.
- Nút mô phỏng **Mất tín hiệu** và **Bị tấn công** trên thanh MÔ PHỎNG DI CHUYỂN.
- File: `lib/engine.ts` (`signalLost`, `tickSignal`, `simMove` thêm `lost`/`attack`).

## 6. Giao diện gọn hơn

- **Đổi màu**: đã thử tông navy + cam nhưng **hoàn nguyên về tông cũ** (xanh đen + xanh ngọc) theo yêu cầu.
- **Bỏ header** ở trang Tổng quan → gom mọi thứ (trạng thái, đồng hồ, AI, Mock Calls, Kịch bản mới, các trang) vào **dock mỏng ở đáy**; bỏ logo/mã sự cố/dòng sự kiện trùng. Bản đồ + 2 cột cao thêm.
- **2 cột đóng/mở được**: nút ở mép trái/phải bản đồ thu gọn cột điện thoại hoặc cột thông tin, bản đồ giãn ra.
- **Chế độ ẩn hết chrome** (nút ⤢): ẩn cả dock để chỉ còn bản đồ.
- **Ít chữ hơn** ở cột phải: bỏ dải chip agent + "COORDINATOR DECISION"; chỉ còn tên nơi tiếp nhận, dòng "đã nhận", ô cảnh báo tuyến; cuộc gọi bỏ dòng phụ; diễn biến còn 4 dòng, mỗi dòng 2 hàng.
- **Mobile**: không header; bản đồ lên đầu khi SOS; dock dính đáy, nút chỉ icon, vuốt ngang; nút mô phỏng một hàng vuốt ngang; banner chỉ đường một dòng.
- Thanh **MÔ PHỎNG DI CHUYỂN** bỏ hết emoji, chỉ còn chữ: Đi theo tuyến · +40 m · Đi lệch · Đặt vị trí · Bị tấn công · Mất tín hiệu.
- **Nút Mạng lưới trên app điện thoại** (icon người ở app bar) để mở mạng lưới mà không cần header.
- File: `components/dashboard.tsx`, `components/network-panel.tsx`, `app/command.css`.

## 7. Chạy trên điện thoại thật (sửa link + SSE)

- **Link tự dùng địa chỉ tunnel**: `scripts/tunnel.mjs` chạy Cloudflare quick tunnel và ghi địa chỉ công khai ra `data/tunnel-url.txt`; API `/api/network` trả `publicUrl`; trang Mạng lưới dựng mọi link mời / ghép điện thoại theo địa chỉ đó (ưu tiên biến `PUBLIC_URL` nếu đặt). Trước đây link ghép theo địa chỉ trang đang mở nên mở bằng `127.0.0.1` thì điện thoại không vào được.
- Mỗi hàng thành viên có nút **Vào vai** (mở app người đó ở tab mới) và **Gửi** (Web Share / copy).
- **SSE → polling tự động**: tunnel miễn phí Cloudflare **không chuyển SSE** (giữ luồng, không đẩy) → trang người thân / điện thoại kẹt "Đang kết nối Guardian…". Thêm `subscribe()` trong `components/client.ts`: thử SSE trước, 3 giây không có dữ liệu thì chuyển sang **hỏi server mỗi 1,5 giây** (`/poll`). Tín hiệu gọi P2P đi qua **hộp thư ngắn hạn** trên server để polling lấy được. Máy tính (`127.0.0.1`) vẫn dùng SSE.
- File: `scripts/tunnel.mjs` (mới), `START-TUNNEL.cmd`, `components/client.ts` (`subscribe`), `components/receiver.tsx`, `components/dashboard.tsx`, `app/api/[...path]/route.ts` (hộp thư + `/poll`).

---

## Kiểm chứng

- `npm test`: **49/49 pass** (thêm `tests/emergency.test.ts`); `npm run typecheck` sạch; `npm run build` thành công.
- Kiểm tra trên Chrome: bản đồ 3D, camera bay vào khi SOS, cửa hàng 3D đổi màu, vùng nhiệt sự cố, tuyến né lối tắt + advisories; nhận diện "bị tấn công" → khung khẩn cấp + 115; hồ sơ bằng chứng mở ra đủ mục; "Mất tín hiệu" niêm phong hồ sơ.
- Chạy thật qua tunnel: trang người thân (qua Cloudflare) nhận SOS, đổ chuông, hiện "Nghe / Từ chối" bằng cơ chế polling.

## Chưa kiểm chứng / giới hạn

- Hội thoại giọng nói thật (sơ cứu, lấy lời khai, AI phía người thân) — cần người dùng thử với micro.
- **AI phía người dùng chưa nghe được lời người thân nói**: hiện chỉ có tín hiệu "đã nghe" / "đang đến"; chưa chuyển nội dung lời người thân sang AI. (Đã đề xuất công cụ `send_to_user`, chưa làm.)
- **Ghi âm**: app mới lưu transcript chữ, **chưa lưu file âm thanh**. (Đã đề xuất ghi + tải lên server theo đoạn, chưa làm.)
- Lịch sử sự cố là **dữ liệu mô phỏng**, cần nói rõ khi demo để không hiểu nhầm là thống kê tội phạm thật.
- Nền bản đồ 3D cần mạng (tile OpenFreeMap); định tuyến thì offline được.
- Tunnel `trycloudflare.com` đổi địa chỉ mỗi lần chạy lại → phải gửi lại link mới; polling trễ tối đa ~1,5 giây.
- Web vẫn chỉ đổ chuông khi trang người nhận đang mở; chuông khi khóa màn hình cần app native + push.
- Thẻ nhận diện trong hồ sơ lấy từ cài đặt cũ (còn nhắc tên phố bản đồ cũ) — sửa trong mục Mạng lưới.

## Biến môi trường mới

- `PUBLIC_URL` (tùy chọn): địa chỉ công khai cố định cho link mời/ghép (nếu dùng tên miền riêng thay tunnel tạm).

## File mới trong đợt này

| File | Nội dung |
|---|---|
| `components/map3d.tsx` | Bản đồ 3D MapLibre: nền phố thật, cửa hàng khối 3D, sự cố, tuyến, camera |
| `lib/city-data.json` | Đồ thị phố Thủ Thiêm từ OSM (đã commit, chạy offline) |
| `lib/emergency.ts` | Luật nhận diện khẩn cấp từ lời người dùng |
| `lib/evidence.ts` | Lập + niêm phong + xuất PDF hồ sơ bằng chứng |
| `scripts/fetch-city.mjs` | Tải/đóng gói dữ liệu phố từ OpenStreetMap |
| `scripts/tunnel.mjs` | Chạy tunnel và ghi địa chỉ công khai cho link trong app |
| `tests/emergency.test.ts` | Test nhận diện khẩn cấp, hồ sơ, mất liên lạc |
