# Xây dựng một ứng dụng giống Guardian AI — tài liệu và prompt

Tài liệu này mô tả đủ để một người (hoặc một AI lập trình) xây lại một sản phẩm tương tự Guardian AI từ con số 0. Phần 1 giải thích sản phẩm và các quyết định thiết kế. Phần 2 là prompt chi tiết, chia theo giai đoạn, để dán thẳng vào Claude Code / Cursor / ChatGPT.

> Lưu ý an toàn: đây là sản phẩm hỗ trợ, **không phải** dịch vụ cứu hộ. Ứng dụng **không bao giờ tự gọi 113/115**, chỉ chuẩn bị bản tóm tắt và mở trình quay số để người dùng tự bấm. Mọi dữ liệu địa điểm, giờ mở cửa, lịch sử sự cố trong bản demo là **mô phỏng** và phải được dán nhãn rõ.

---

## Phần 1 — Sản phẩm là gì

### 1.1. Một câu

Người đi một mình thấy không an toàn → nói với AI trên điện thoại → AI **gọi song song** nhiều điểm hỗ trợ (cửa hàng, khách sạn, bảo vệ…) và người thân → **mỗi người đề xuất một cách giúp** → AI **kết hợp các ý thành một kế hoạch** (đi đâu, ai làm gì) → vẽ đường an toàn trên bản đồ → theo dõi và **đổi kế hoạch khi điều kiện thay đổi** → nếu bị tấn công hoặc mất liên lạc thì **niêm phong hồ sơ bằng chứng** (lời khai, đường đi GPS, ghi âm) và gửi cho người thân.

### 1.2. Các vai

| Vai | Thiết bị | Làm gì |
|---|---|---|
| Người dùng (nạn nhân) | Điện thoại, trang `/demo/phone` hoặc cột trái của command center | Bấm SOS, nói chuyện với **AI đồng hành** (giọng nói 2 chiều), chấp nhận phương án, đi theo chỉ đường |
| Người thân | Điện thoại, trang `/r/<token>` | Nhận chuông, nói chuyện với **AI gọi người thân**, đề xuất cách giúp ("chị chạy xe qua, 10 phút"), dặn dò, nhận hồ sơ khi mất liên lạc |
| Điểm đối tác (cửa hàng, khách sạn) | Máy tính/điện thoại tại quầy, trang `/r/<token>` | Nhận chuông, trả lời **AI gọi đối tác**: đồng ý/từ chối, đề xuất cách giúp ("cho nhân viên ra đón") |
| Người trình diễn | Máy tính, `/demo/command-center` | Xem bản đồ, các nhánh gọi, phương án, hồ sơ; bấm **demo một nút** |

### 1.3. Kiến trúc tổng quát

```
Điện thoại người dùng ──WebRTC──► OpenAI Realtime (AI đồng hành)
        │  tool calls (SOS, chỉ đường, lời khai…), transcript, ghi âm 10 s/đoạn
        ▼
   Backend Next.js (route handler duy nhất /api/[...path])
   ├─ Engine điều phối (code quy tắc, KHÔNG phải LLM) ── SQLite (snapshot + event + chuỗi băm)
   │   ├─ Research: lọc địa điểm theo giờ mở cửa, chức năng, nhu cầu
   │   ├─ Calling: gọi song song N nhánh (app đối tác / mô phỏng / gateway)
   │   ├─ Interpreter: đọc lời đáp → dữ kiện có trích dẫn (GPT + bộ đọc quy tắc dự phòng)
   │   ├─ Admission: kiểm tra điều kiện bằng code trước khi planner được chọn
   │   ├─ Planner GPT: chọn nơi + phân vai từng đề xuất (chỉ trong danh sách đã qua kiểm tra)
   │   ├─ Route agent: tối đa 3 tuyến, GPT chọn 1; tránh đoạn tối, vắng, có sự cố
   │   ├─ Monitoring: GPS cũ, lệch tuyến, đường chặn, cam kết bị rút, mất liên lạc
   │   └─ Evidence: dossier JSON + HTML báo cáo, niêm phong SHA-256, chia sẻ
   └─ Event bus (EventEmitter) → SSE, tự chuyển sang polling 1,5 s khi proxy chặn SSE
        ▲
Điện thoại người thân / đối tác ──WebRTC──► OpenAI Realtime (AI gọi người thân / đối tác)
        transcript từng câu → backend phân tích ngay → cập nhật AI đồng hành
```

**Nguyên tắc quan trọng nhất:** các LLM là *các tác nhân ở rìa* (nói chuyện với người, trích xuất dữ kiện, chọn trong danh sách). **Bộ điều phối trung tâm là code có quy tắc** và giữ quyền quyết định cuối cùng. LLM không bao giờ tự xác nhận một nơi tiếp nhận, không bịa ETA, không dẫn người dùng tới nơi chưa đồng ý.

### 1.4. Công nghệ

- **Next.js 16 (App Router) + React 19 + TypeScript**, một route handler catch-all `app/api/[...path]/route.ts`.
- **Node.js 24** với `node:sqlite` (không cần DB server). WAL mode.
- **Zod 4** cho mọi input API và mọi output model (Structured Outputs `strict: true`).
- **OpenAI**:
  - Realtime (`gpt-realtime` hoặc `gpt-realtime-mini`) qua WebRTC, khóa tạm mint ở backend bằng `/v1/realtime/client_secrets`; chép lời `gpt-4o-mini-transcribe`, `language: "vi"`, `server_vad`.
  - Responses API (`gpt-4.1-mini`) cho ANALYZE / EXTRACT / FAMILY / PLAN / ROUTE_DECISION, `text.format = json_schema strict`.
- **MapLibre GL + OpenFreeMap** (không cần API key) cho bản đồ 3D; đồ thị đường đi bộ lấy từ **OpenStreetMap (Overpass)** một lần, lưu thành JSON để định tuyến offline.
- **lucide-react** cho icon. Không thêm thư viện UI.
- **Cloudflare quick tunnel** (`cloudflared`) để có HTTPS cho micro trên điện thoại thật.
- Test: `node:test` qua `tsx --test`, integration HTTP/SSE, QA trình duyệt bằng Playwright (script rời).

### 1.5. Mô hình dữ liệu (rút gọn)

```ts
Incident {
  id, owner, mode: "SIMULATION" | "TEST_LIVE", status, generation, createdAt, updatedAt,
  location { lat, lng, kind: "LIVE"|"SIMULATED", observedAt, stale }, track[],
  riskLevel 1..4, riskReasons[], needs { communication, canMove, maxWalkMeters, refusals[] },
  emergency? { kind, label, medical, text, at }, statements[] { topic, text, at },
  places[] Place, calls[] Call, contacts[] ContactAlert,
  plans[] Plan, routeDecisions[], freeRoute?, nav?, blockedEdges[], roadObservations[],
  transcript[], events[] AgentEvent, ai { enabled, consentAt, runs[] },
  seals[] { at, reason, hash }, evidenceShare?, recordings[] { session, mime, chunks, bytes, sha256 },
  showcase? { status, step, title, narration, focus: Point[] }
}
Place { id, name, lat, lng, profile { kind, goods, services, limitations, hours }, openingStatus,
        supportStatus: UNKNOWN|CONTACTED|CONFIRMED|DECLINED, evidenceRefs[] }
Call { id, placeId, providerMode: MOCK|APP|REAL_TEST, status, transcript[], generation,
       support { decision: UNKNOWN|CLARIFY|ACCEPTED|DECLINED|EXPIRED|REVOKED, supportTypes[],
                 entrance, conditions[], validUntil, discreet, viaAlley, missing[], evidenceRefs[] },
       offer? { text, quote, evidenceRef, source } }
ContactAlert { memberId, name, status: RINGING|ANSWERED|ON_THE_WAY|KEEP_CONTACT|CANNOT_HELP|MISSED,
               arrivalMinutes?, transcript[], response?, offer?, lastMessage? }
Plan { id, revision, selectedPlaceId, route, acceptedAt?, superseded, reasons[], evidenceRefs[],
       backupPlaceId?, coordination? { mode, summary, assignments[] { ref, who, role, instruction, reason } } }
AgentEvent { id, time, agent, type, summary, status, evidenceRefs[], sourceKind: LIVE|SIMULATED }
```

### 1.6. Luồng chính

1. **SOS**: lời người dùng → luật khẩn cấp chạy trước AI (bị đâm/chém/chảy máu/bắt cóc… → mức 4, có thương tích → gợi ý 115) → GPT ANALYZE (ý định, mức rủi ro, điều chưa biết) → trích nhu cầu ("không qua hẻm", "chỉ đi nổi 100 m").
2. **Research**: lấy địa điểm quanh vị trí; loại nơi đã đóng cửa theo giờ tình huống; loại nơi không đúng chức năng (ATM không có chỗ chờ).
3. **Gọi song song** tối đa 3 nhánh đối tác + toàn bộ người thân. Nghe máy ≠ đồng ý.
4. **Mỗi lời đáp** được trích thành dữ kiện **có trích dẫn nguyên văn** và một **đề xuất** (offer). Câu mơ hồ ("chắc được") → hỏi lại *một* lần. Câu mới làm thay đổi cam kết ("nhân viên vừa đi gấp") → hủy ngay kế hoạch dựa trên cam kết cũ.
5. **Admission** (code): quyết định ACCEPTED, có bằng chứng, đúng nhu cầu (kín đáo, tránh hẻm, quãng đi bộ), còn mở cửa, đối tác vẫn đang trực, điều kiện lạ thì chặn.
6. **Planner GPT** nhận danh sách đã lọc + mọi đề xuất → chọn nơi + phân vai: PRIMARY (đúng nơi được chọn), SUPPORT (người thân hẹn đón tại đó), BACKUP, UNUSED (kèm lý do). Backend kiểm tra lại, sai thì dùng phân vai theo quy tắc.
7. **Route agent**: tối đa 3 tuyến trên đồ thị phố, chi phí = độ dài × hệ số thiếu đèn × vắng × rủi ro sự cố; GPT chọn 1 kèm lý do; có `advisories` ("không đi tắt qua D6 vì tối, từng có giật đồ").
8. **Người dùng chấp nhận** → dẫn đường từng bước. Mọi thay đổi (đối tác rút, đường chặn/tối, lệch tuyến, GPS cũ, đối tác tắt trực) → hủy tuyến cũ, lập lại, **xin chấp nhận lại**; đề xuất mới chỉ đổi phân vai thì cập nhật tại chỗ, không bắt chấp nhận lại.
9. **Người thân**: mỗi câu được phân tích ngay (đang tới? mấy phút? dặn gì? đề xuất gì?) → AI đồng hành chuyển lời cho nạn nhân. Câu chép lời lỗi không được xóa cam kết đã có.
10. **Bàn giao hai chiều**: người dùng xác nhận đã gặp + nơi tiếp nhận xác nhận đã nhận người.
11. **Tấn công / mất liên lạc**: khẩn cấp mức 4, hướng dẫn sơ cứu ngắn, ghi lời khai; điện thoại im > 90 s → giữ vị trí cuối, báo mọi người, niêm phong và gửi hồ sơ cho người thân.

### 1.7. Những bài học phải giữ (đã trả giá mới biết)

- **Bộ đọc regex không đủ cho lời nói tự nhiên.** Chạy GPT để phân tích, nhưng *chỉ chấp nhận khi trích dẫn có thật trong lời gốc*; regex là dự phòng khi tắt AI.
- **Đừng để AI gọi điện hỏi lòng vòng.** Một lời "đồng ý" rõ ràng là đủ; cửa vào/điều kiện chỉ hỏi gộp một lần. Prompt Realtime phải có luật "xong trong 3–4 lượt, không xác nhận lần hai". Khi tool bị backend từ chối, thông báo lỗi trả về cho model **không được** bảo "hỏi lại" — nếu không model sẽ lặp vô hạn.
- **Câu chép lời rác** ("Đã hút", "Đã food") không được làm mất trạng thái "đang tới".
- **Hàng đợi cập nhật cho AI đồng hành gộp tin cũ** → thông tin (ví dụ ETA) bị mất. Luôn gửi kèm một dòng trạng thái dạng câu chữ cho từng người thân ("Mạnh: đang tới, khoảng 15 phút; dặn: …") để không mất khi gộp.
- **Không đẩy sự kiện dài vào AI hoặc lên bản đồ.** Cắt mỗi sự kiện ≤ 300 ký tự cho AI, toast trên bản đồ ≤ 140 ký tự.
- **Bỏ dấu khi so khớp từ khóa gây trùng nghĩa**: "đón"→"don" (đồn), "chỗ"→"cho" (chợ), "an toàn" chứa "an" (ăn). Phải có test chống nhầm.
- **Server production phải build lại và khởi động lại** sau khi sửa; rất nhiều lần "không chạy" chỉ vì đang test bản cũ.
- **Demo phải chạy qua engine thật.** Đạo diễn demo chỉ cung cấp *lời của các vai*; lời dẫn được tạo *sau* mỗi bước từ trạng thái thật — không bao giờ viết trước kết quả.

### 1.8. Bố trí giao diện

Tông tối, dịu mắt, dùng được cả trên máy chiếu. Ít chữ, chi tiết nằm trong mục thu gọn.

**Màu (CSS variables)**

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--bg` | `#080f18` | nền trang |
| `--panel` / `--panel2` | `#101b28` / `#142232` | thẻ, cột |
| `--border` | `#223142` | viền |
| `--text` / `--muted` | `#e5edf5` / `#8495a8` | chữ chính / phụ |
| `--cyan` | `#3be1bd` (nút chính `#72dfbd`) | màu nhấn, tuyến đã xác nhận, "đã nhận giúp" |
| `--blue` | `#7db7ff` | tuyến tự chọn (nét đứt), điểm tham khảo đang mở, người dùng |
| `--amber` | `#e9b66f` | danh sách hỗ trợ, cảnh báo, đoạn tối |
| `--red` | `#fa8d91` | SOS, khẩn cấp, sự cố, mất liên lạc |

Font hệ thống (Arial / Segoe UI), 14 px; số đếm dùng `tabular-nums`. Bo góc 8–10 px, icon lucide 14–18 px. Không dùng emoji trong UI, trừ biểu tượng bản đồ (◎ ⌂ ☾ ✕).

**Màn hình chính `/demo/command-center` (≥ 1100 px)**

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ ✦ DEMO THI ĐẤU  "Gọi 5 người cùng lúc" · 2/10 chặng   [Chạy lại][⏸][■][⏭][⌄]          │
│   Lời dẫn 1–2 câu ......................................................              │
│   (1)(2)(3)…(10) thanh chặng   ·  5 người góp ý · 3 nhánh · 2 phiên bản · 📄 Bằng chứng │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ ⌖ Khám phá 19 địa điểm · 22:15 giờ tình huống · ẩn 11 nơi đóng          [⌄ mở danh mục]│
├──────────────────────────────────────────────────────────────────────────────────────┤
│ ∿ Hoạt động agent [DEMO] · 3 nhánh · 1 xác nhận · Quán X v2              [Chi tiết ⌄]  │
├───────────────┬──────────────────────────────────────────────┬───────────────────────┤
│ ĐIỆN THOẠI    │ BẢN ĐỒ 3D                                     │ THÔNG TIN             │
│ 380 px        │ [● Vị trí mô phỏng]  [chú giải màu]  [3D]     │ 320 px                │
│ ┌───────────┐ │ ┌──────────────────────────────┐             │ Tên nơi tiếp nhận     │
│ │00:28  ▂▄▆ │ │ │ Rẽ phải vào Trần Bạch Đằng,  │ (banner chỉ │ ✓ Đã nhận · tuyến v2  │
│ │Guardian AI│ │ │ đi 12 m · còn 1251 m        │  đường xanh)│ ⚠ KHẨN CẤP · 115      │
│ │[SOS ›]    │ │ └──────────────────────────────┘             │ 📄 Hồ sơ · 2 niêm phong│
│ │   ( 🎙 )   │ │   ◎ điểm tự chọn   ✓ nơi đã nhận   ● bạn     │ NGƯỜI THÂN            │
│ │Chạm để nói│ │   ─── tuyến xác nhận  - - - tuyến tự chọn    │ [Chị Linh · đang đến] │
│ │[Cuộc gọi  │ │   vùng đỏ = sự cố mô phỏng                   │ [Anh Mạnh · giữ máy]  │
│ │   giả]    │ │ [‹]                                  [+][-][N]│ CUỘC GỌI              │
│ │chip người │ │ [Bạn · Danh sách hỗ trợ · Tham khảo · Đã nhận]│ ☎ Cửa hàng  CONFIRMED │
│ │thân       │ │ MÔ PHỎNG DI CHUYỂN [Đi theo tuyến][+40 m]     │ ☎ Khách sạn FAILED    │
│ └───────────┘ │ [Đi lệch][Đặt vị trí][Bị tấn công][Mất tín hiệu]│ DIỄN BIẾN (4 dòng)    │
├───────────────┴──────────────────────────────────────────────┴───────────────────────┤
│ DOCK: [● Đang hướng dẫn] ⏱00:42 [AI OFF] ...... [Mock Calls][Chặn đường][Đường tối]   │
│       [Kịch bản mới] | icon: mạng lưới · điều khiển · điện thoại · cuộc gọi · kiến trúc│
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- Lưới ba cột `380px | 1fr | 320px`, đổi `grid-template-columns` khi thu gọn (`0px | 1fr | 320px`…), có transition 0,35 s. Nút ‹ › ở mép bản đồ thu gọn cột trái/phải; nút ⤢ ẩn cả dock để chỉ còn bản đồ.
- Không có header: trạng thái, đồng hồ, nhãn AI, các nút demo và điều hướng trang nằm trong **dock mỏng dính đáy**.
- **Thẻ demo** ở trên cùng: dòng tiêu đề luôn hiện; phần thân (nhịp, giọng đọc, lời dẫn, thanh 10 chặng, số liệu) mở bằng nút ⌄.
- **Hoạt động agent** (thu gọn mặc định): tab Tổng quan / Cuộc gọi / Người thân / Lịch sử. Mỗi nhánh gọi là một thẻ có trạng thái, transcript, dữ kiện trích xuất, "còn thiếu". Thẻ kế hoạch: tên nơi, "Chờ chấp nhận / Đang hướng dẫn", dòng "Đón tại …", khung **"GPT kết hợp đề xuất của mọi người"** (mỗi người một dòng, viền trái màu theo vai: xanh = chính, lam = phối hợp, vàng = dự phòng, mờ = chưa dùng), "Dự phòng", rồi hai `<details>` "Lý do & so sánh" và "Hồ sơ và lịch sử quyết định", nút "Chấp nhận phương án".
- **Danh mục địa điểm** (chỉ sau SOS): lọc theo loại, chọn giờ tình huống, ô "hiện điểm đã đóng"; bấm một nơi mở thẻ chi tiết (giờ, hàng hóa, dịch vụ, giới hạn).

**Lớp trên bản đồ (từ dưới lên)**

1. Nền OpenFreeMap tối, nhà dựng khối (`fill-extrusion`), camera nghiêng ~50°.
2. Vùng nhiệt + đoạn phố phát sáng đỏ (lịch sử sự cố mô phỏng), chỉ hiện sau SOS.
3. Tuyến cũ đã hủy (xám mờ), tuyến hiện hành (xanh ngọc, hiệu ứng "vẽ dần" 1,4 s), tuyến tự chọn (lam, nét đứt).
4. Marker HTML: địa điểm (chấm + icon loại + tên khi chọn), vòng ping khi đang gọi, ✓ khi đã nhận; ◎ điểm tự chọn có nhãn tên; ⌂ nhà; ☾ đoạn tối; ✕ đường chặn; radar quét quanh người dùng khi đang tìm.
5. Lớp phủ: chip "Vị trí mô phỏng" (trái trên), chú giải màu (giữa trên), banner chỉ đường xanh (bước tiếp theo, còn bao xa), **toast** ngắn ≤ 140 ký tự cho mốc quan trọng (tự tắt sau 4,5 s), nút zoom/la bàn (phải), chú giải và thanh "Mô phỏng di chuyển" (dưới).
6. Camera: bay vào khi SOS; bám theo người dùng khi đang đi; khi có tuyến mới hoặc chặng demo mới thì `fitBounds` các điểm liên quan, giữ ~6 s rồi mới bám lại. Giữ pitch/bearing người xem đã chọn.

**Màn hình điện thoại người dùng (`/demo/phone`, cũng là cột trái)**

```
┌──────────────────────┐
│ 00:28          ▂▄▆ ▮ │
│ 🛡 Guardian AI [SIM] 👥│  ← 👥 mở Mạng lưới (người thân, đối tác, mật mã an toàn)
│ ┌──────────────────┐ │
│ │ ⚠ KHẨN CẤP · 115 │ │  ← chỉ khi phát hiện khẩn cấp: nút 115 + 113 (mở tel:, không tự gọi)
│ └──────────────────┘ │
│ [ SOS  Tôi cần hỗ trợ ›] │  ← đỏ
│                      │
│        (  🎙  )       │  ← orb xanh ngọc, nhịp theo âm lượng micro
│  Guardian đang nghe  │
│  Micro · 01:12 ·     │
│  ● Đang ghi âm…      │  ← ẩn khi SOS bí mật
│ [🔇][📞 Kết thúc]     │
│ [Cuộc gọi giả]       │
│ [Chị Linh · đang đến]│  ← chip người thân (bấm để gọi trực tiếp P2P)
│ Thẻ phương án:       │
│  Quán X · 72 m       │
│  [Chấp nhận]         │
└──────────────────────┘
```

- SOS bí mật: màn hình chuyển thành cuộc gọi giả (tên người quen, đồng hồ cuộc gọi), không hiện chữ "SOS", "ghi âm".
- Thẻ phương án trên điện thoại chỉ có: tên nơi, khoảng cách, cửa vào, nút chấp nhận; chi tiết nằm ở command center.

**App người thân / đối tác `/r/<token>`** (một cột, tối đa ~480 px)

```
┌──────────────────────────┐
│ Guardian · Người thân    │
│ Lan cần hỗ trợ · mức 3/4 │
│  ((( chuông )))          │  ← khi đổ chuông: [Nghe] [Từ chối]
│ ( 🎙 AI đang nói )        │  ← orb Realtime, 6–12 dòng hội thoại gần nhất
│ 📍 Trần Bạch Đằng · còn   │
│    1251 m tới Cửa hàng X │
│ 🛡 Đang tới Cửa hàng X     │
│ 🛡 Lan mất liên lạc ·     │  ← khi hồ sơ được gửi: link "Mở hồ sơ" + mã niêm phong
│    Mở hồ sơ · mã 639c…   │
│ [Tôi đang đến][Gọi Lan]  │
│ Diễn biến (8 dòng)       │
└──────────────────────────┘
```

Đối tác thấy: khoảng cách, mức hỗ trợ, mô tả ngắn; **vị trí chính xác và trang phục chỉ sau khi đồng ý**; nút "Đang trực" bật/tắt; phần việc được giao trong phương án.

**Hồ sơ bằng chứng (HTML in được)**: nền trắng, rộng tối đa 920 px; tiêu đề + nhãn; lưới 6 ô thông tin (3 cột, 2 cột trên điện thoại); các mục đánh số tròn đen; tóm tắt là đoạn văn trong khung xám có viền trái; diễn biến là timeline dọc có chấm màu; bảng trong khung cuộn ngang; phụ lục trong `<details>`; nút "In / Lưu PDF" cố định góc phải (ẩn khi in).

**Quy tắc chung**

- Điện thoại (< 600 px): không header, bản đồ lên đầu khi SOS, dock dính đáy chỉ icon và vuốt ngang được, thanh mô phỏng một hàng vuốt ngang, banner chỉ đường một dòng. Không được tràn ngang ở 390 px.
- Ưu tiên ít chữ: cột phải chỉ giữ tên nơi, dòng trạng thái, cảnh báo, 4 dòng diễn biến; mọi thứ khác vào mục thu gọn.
- Mọi thứ mô phỏng có nhãn; nút nguy hiểm (113/115) chỉ mở trình quay số.
- Truy cập: nút có `aria-label`, marker bấm được bằng bàn phím (Enter/Space), trạng thái đổi có `role="status"`.

---

## Phần 2 — Prompt để xây sản phẩm

Dán toàn bộ khối dưới đây cho AI lập trình. Nên làm **từng giai đoạn**, chạy test và xem trên trình duyệt sau mỗi giai đoạn rồi mới sang giai đoạn tiếp.

````text
Bạn là kỹ sư full-stack. Hãy xây "SafeWalk AI" (tên tạm) — ứng dụng web giúp người đi một mình
khi thấy không an toàn. Giao diện và mọi văn bản bằng tiếng Việt. Làm theo từng GIAI ĐOẠN bên dưới;
cuối mỗi giai đoạn: chạy typecheck + test, build production, mở trình duyệt kiểm tra, rồi báo kết quả
ngắn gọn (đã làm gì, đã kiểm chứng gì, còn gì chưa kiểm chứng). Không tuyên bố "chạy được" nếu chưa
chạy thật.

=== RÀNG BUỘC KHÔNG ĐƯỢC VI PHẠM ===
1. Không bao giờ tự gọi 113/115 hay số thật. Chỉ chuẩn bị bản tóm tắt và mở `tel:113` để người dùng tự bấm.
2. Bộ điều phối là CODE có quy tắc. LLM chỉ: nói chuyện, trích xuất dữ kiện có trích dẫn, chọn trong
   danh sách backend đã lọc. Mọi output LLM được validate bằng Zod và kiểm tra lại bằng code.
3. Chỉ dẫn đường tới nơi đã ĐỒNG Ý tiếp nhận và qua kiểm tra điều kiện (admission). Ngoại lệ duy nhất:
   nơi chính người dùng yêu cầu (ví dụ "đưa tôi tới đồn công an") — được vẽ và dẫn đường nhưng phải nói rõ
   "nơi này chưa xác nhận tiếp nhận".
4. Không bịa ETA, xác nhận, "cảnh sát đang tới", "đã gọi". ETA chỉ khi người đó tự nói số phút.
5. Dữ liệu mô phỏng (địa điểm, giờ mở cửa, độ sáng, lịch sử sự cố, các vai trong demo) luôn có nhãn
   SIMULATED / "mô phỏng" trên UI, sự kiện và hồ sơ.
6. Khóa API chỉ ở server (.env.local). Trình duyệt dùng khóa tạm Realtime do backend mint, hết hạn 120 s.
7. Mọi text người dùng/đối tác đưa vào HTML phải escape. Mọi request ghi phải kiểm tra Origin và phiên.
8. Dữ liệu giữa các phiên (cookie) cô lập: không đọc được sự cố của phiên khác bằng ID.

=== CÔNG NGHỆ ===
Next.js 16 App Router + React 19 + TypeScript strict; Node 24, `node:sqlite` (WAL); Zod 4; maplibre-gl +
OpenFreeMap; lucide-react. Một route handler `app/api/[...path]/route.ts`. Engine là class trong
`lib/engine.ts`, giữ cache incident trong bộ nhớ, lưu snapshot + event vào SQLite, phát qua EventEmitter.
Cập nhật realtime: SSE `/stream`; nếu 3 s không nhận dữ liệu thì client tự chuyển sang polling `/poll`
1,5 s (Cloudflare quick tunnel chặn SSE). Server bind 127.0.0.1; có script chạy `cloudflared` quick tunnel
và ghi URL công khai ra file để link mời dùng đúng địa chỉ HTTPS.

=== GIAI ĐOẠN 1 — Nền tảng, state machine, bản đồ mô phỏng ===
- Types: Incident, Place, Call, ContactAlert, Plan, Route, AgentEvent (xem mô hình dữ liệu). Mỗi
  incident có `generation`; mọi callback bất đồng bộ phải kiểm tra generation để bỏ kết quả muộn sau
  hủy/reset.
- Store SQLite: bảng incidents (snapshot), event_snapshots (replay không thực thi lại), report_revisions
  (mỗi lần lưu có previous_hash + hash SHA-256 → chuỗi băm kiểm tra toàn vẹn). Không tự xóa hồ sơ.
- Script tải đường phố thật một khu đô thị nhỏ từ OpenStreetMap (Overpass): giữ đường đi bộ, bỏ hầm/
  đường riêng, giữ thành phần liên thông lớn nhất, lưu `lib/city-data.json` (nodes, edges, landmarks).
- 30 địa điểm mô phỏng đặt sát lề phố thật, 12 loại (cửa hàng tiện lợi, khách sạn, nhà thuốc, cà phê,
  quán ăn, trạm xăng, ATM/ngân hàng, siêu thị, công an, phòng khám, khoa cấp cứu, bảo vệ), mỗi nơi có giờ
  mở cửa (kể cả ca qua nửa đêm), hàng hóa, dịch vụ (chỗ chờ, nhân viên, nước, sạc, sơ cứu…) và GIỚI HẠN
  ("ATM hoạt động không đồng nghĩa có người trực", "công an: giờ hành chính khác trực ban").
- Định tuyến Dijkstra trên đồ thị; chi phí = độ dài × (thiếu đèn ×1.8) × (vắng ×1.25) × (1 + rủi ro sự
  cố mô phỏng). Trả `steps`, `maneuvers`, `advisories` giải thích vì sao tránh lối tắt.
- Command center `/demo/command-center`: cột trái là điện thoại, giữa là bản đồ 3D (MapLibre, nhà dựng
  khối, camera nghiêng), phải là phương án/cuộc gọi/người thân/diễn biến. Dock mỏng ở đáy. Hai cột thu
  gọn được. Mobile: bản đồ lên đầu.
- Marker HTML: không gán lại `className` (sẽ xóa class của MapLibre làm marker trôi khi zoom) — dùng
  classList. Địa điểm chỉ hiện SAU khi SOS. Màu: vàng = danh sách hỗ trợ, lam = tham khảo đang mở, xanh
  lá = đã nhận giúp. Nơi đóng cửa ẩn mặc định, có ô "hiện điểm đã đóng".
- Thanh "Mô phỏng di chuyển": đi theo tuyến, +40 m, đi lệch, đặt vị trí, bị tấn công, mất tín hiệu.
- Test: định tuyến tránh đoạn tối, giờ qua đêm, lọc chức năng, cô lập phiên, callback muộn bị bỏ.

=== GIAI ĐOẠN 2 — SOS, gọi song song, trích xuất có trích dẫn, admission, planner ===
- Luật khẩn cấp (chạy trước AI, hiểu có dấu/không dấu, bỏ qua câu giả định "nếu bị đâm thì sao"):
  bị đâm/chém/bắn, chảy máu, ngất, xâm hại, bắt cóc, có dao/súng, bị đánh/cướp/giật, bám theo, kêu cứu.
  → mức 4, khung KHẨN CẤP, nút 115 nếu có thương tích, niêm phong hồ sơ.
- Trích nhu cầu từ lời người dùng: kín đáo, đi được hay không, giới hạn mét, điều từ chối (hẻm, về nhà).
  Hiểu cách nói tự nhiên ("chân em đau, chỉ đi nổi 100 mét, đừng dẫn em qua hẻm").
- Gọi song song tối đa 3 nhánh đối tác (Promise.all), mỗi nhánh có timeout, AbortController, transcript.
  Ba loại nhánh: APP (đối tác thật mở trang /r/<token>), MOCK (đối tác mô phỏng có hồ sơ ẩn chỉ server
  biết), REAL_TEST (gateway HTTPS, giới hạn allowlist E.164 và 3 cuộc/10 phút).
- Interpreter: GPT trả `facts[]` mỗi fact có `field`, `value`, `quote` nguyên văn, `turn`. Backend:
  quote phải nằm trong đúng lượt của đối tác (không phải lời AI); câu có "chắc/có lẽ/nếu" không được tính
  là đồng ý; câu mới "chưa nhận được / nhân viên vừa đi" phải chuyển thành DECLINED/REVOKED ngay. Có bộ
  đọc quy tắc dự phòng khi AI tắt/lỗi.
- Luật đồng ý: chỉ cần quyết định ACCEPTED rõ ràng; thiếu cửa vào/điều kiện KHÔNG chặn (ghi "chưa nêu");
  điều kiện lạ ("cần thẻ thành viên") thì chặn vì chưa xác minh người dùng đáp ứng.
- Admission (một hàm dùng ở mọi bước: lập kế hoạch, chấp nhận, giám sát, bàn giao): ACCEPTED + bằng chứng,
  đúng nhu cầu, còn mở/không sắp đóng, đúng chức năng, đối tác vẫn joined + onDuty, chưa hết hạn.
- Planner GPT: input là danh sách ELIGIBLE + OFFERS; output Zod strict {selectedPlaceId, reasons,
  evidenceRefs, assignments[{ref, role, instruction, reason}], summaryForUser}. Backend chặn nếu chọn
  ngoài danh sách, bằng chứng không thuộc nơi đó, ref không tồn tại, hoặc PRIMARY không phải nơi được
  chọn. Lỗi → phân vai theo quy tắc. Ổn định: phương án đã chấp nhận không đổi trừ khi mất hiệu lực;
  chưa chấp nhận chỉ đổi khi tốt hơn đáng kể.
- Route agent: tối đa 3 tuyến hợp lệ; GPT ROUTE_DECISION đánh giá từng tuyến đúng một lần và chọn 1.
- Mọi thay đổi làm mất hiệu lực kế hoạch → phát PLAN_INVALIDATED, dừng chỉ dẫn cũ, cần chấp nhận lại.
- Test regression: điều kiện chưa xác minh bị chặn; câu "bảo vệ chưa quay lại" làm mất đồng ý cũ; đối
  tác tắt trực làm hủy kế hoạch; planner trả ref sai bị chặn.

=== GIAI ĐOẠN 3 — Giọng nói Realtime và mạng lưới gọi trong app ===
- Backend mint khóa tạm `/v1/realtime/client_secrets` với instructions + tools + `audio.input.
  transcription { model: gpt-4o-mini-transcribe, language: "vi", prompt: các từ hay gặp như "đi đón,
  mấy phút, giữ liên lạc, đứng yên" }`, `server_vad` (threshold ~0.45, silence 700 ms), noise reduction.
- Client WebRTC: data channel "oai-events"; hàng đợi [CẬP NHẬT HỆ THỐNG] chỉ đẩy khi cả hai bên không
  nói; cập nhật làm mất hiệu lực tuyến thì được ngắt lời AI (response.cancel) nhưng không ngắt lời người.
- AI đồng hành (người dùng) có tools: trigger_sos, silent_sos (mật mã an toàn → SOS bí mật, màn hình giả
  cuộc gọi), get_location, get_status, get_directions, report_route_blocked, accept_route, checkin_ok,
  record_statement, get_area_safety, request_escalation. Giọng: điềm tĩnh, 1–2 câu, chỉ hỏi một điều.
- Mạng lưới: người thân và đối tác đăng ký bằng link mời /r/<token>, tự đồng ý tham gia, đối tác có nút
  "đang trực". SOS → app họ đổ chuông cùng lúc. Chống spam: tối đa N SOS/giờ gọi đối tác, đối tác báo
  động giả trừ uy tín, mỗi đối tác tối đa 5 chuông/giờ; người thân luôn được báo.
- AI gọi đối tác: mở đầu nêu khoảng cách, mức hỗ trợ; hỏi "bên bạn giúp được bằng cách nào"; đồng ý rõ
  thì gọi confirm_support NGAY; tool chỉ thành công khi transcript gốc đã lưu (hàng đợi transcript theo
  item_id). Đối tác chỉ thấy vị trí chính xác và mô tả trang phục SAU khi đồng ý.
- AI gọi người thân: hỏi họ muốn giúp thế nào; mỗi câu của người thân được POST về backend → phân tích
  ngay (GPT `family`: action ON_THE_WAY/KEEP_CONTACT/CANNOT_HELP, arrivalMinutes, conditions,
  messageForUser, offer, quote nguyên văn trong 2 lượt gần nhất; lấy số phút từ chính câu nói nếu model
  bỏ trống; "cử người khác tới đón" = ON_THE_WAY). Câu không rõ ý KHÔNG làm mất cam kết đã có.
- Luật nhịp gọi cho cả hai AI gọi điện: xong trong 3–4 lượt; đã rõ ý thì xác nhận một câu và gọi tool;
  không hỏi lại lần hai; câu nghe không rõ thì bỏ qua.
- Chuyển lời: sự kiện CONTACT_MESSAGE ("Mạnh nhắn bạn: …") luôn được gửi tới AI đồng hành, không bị cắt;
  bản tóm tắt điều phối luôn có dòng chữ `family: ["Mạnh: đang tới, khoảng 15 phút; dặn: …"]`.
- Gọi trực tiếp người thân ↔ người dùng: WebRTC P2P, tín hiệu qua hộp thư ngắn hạn trên server (để
  polling cũng nhận được). Ghi rõ giới hạn: STUN công khai, chưa có TURN.
- "Đi cùng tôi về nhà": quá giờ / dừng lâu / mất GPS → hỏi "Bạn ổn không?", 30 s không trả lời → tự SOS.
- Test: replay đúng các câu nói tự nhiên/chép lời lỗi của người thân và kiểm tra trạng thái + ETA +
  lời dặn tới được bản tóm tắt của AI đồng hành.

=== GIAI ĐOẠN 4 — Mỗi người một ý, AI tổng hợp, chỉ đường theo yêu cầu ===
- Offer: rút từ lời đối tác/người thân một câu "họ sẽ làm gì" (GPT field OFFER có quote; dự phòng: câu
  chứa động từ hành động, loại câu từ chối). `offersOf(incident)` trả danh sách {ref, kind, who, placeId,
  offer, state, arrivalMinutes, evidenceRef}.
- Khi có đề xuất mới, chạy lại planner kể cả khi kế hoạch hiện tại còn hợp lệ: cùng nơi → chỉ cập nhật
  `plan.coordination` tại chỗ (sự kiện COORDINATION_UPDATED, không bắt chấp nhận lại); nơi khác tốt hơn
  và chưa chấp nhận → tạo phương án mới.
- Đẩy phân vai tới: AI đồng hành (nói "ai làm gì"), AI người thân (sự kiện), AI đối tác (phần việc của
  nơi đó). UI: thẻ "GPT kết hợp đề xuất của mọi người" với vai Chính/Phối hợp/Dự phòng/Chưa dùng.
- get_directions(destination): hiểu tên riêng HOẶC loại nơi ("đồn cảnh sát", "bệnh viện", "nhà thuốc
  gần nhất", "về nhà"), so khớp không dấu với bảng từ khóa có test chống trùng nghĩa; chọn nơi gần nhất
  ĐANG MỞ; trả về distanceMeters, walkMinutes (≈75 m/phút), far (> 800 m hoặc giới hạn người dùng),
  options (nơi khác cùng loại + giờ mở), nearerStaffedPlaces (nơi có người trực gần hơn), sosPlan (so
  sánh với phương án đã xác nhận). Dùng được cả khi đang SOS. Bản đồ vẽ tuyến nét đứt, cờ ◎ có tên điểm
  đến, camera fitBounds toàn tuyến ~6 s rồi mới bám theo người dùng.
- Prompt AI đồng hành: trước khi đọc chỉ dẫn, cân nhắc 1–2 câu (xa/gần, mở/đóng, giờ hành chính khác
  trực ban, có nơi đã xác nhận gần hơn không) và để người dùng chọn.

=== GIAI ĐOẠN 5 — Hồ sơ bằng chứng, ghi âm, mất liên lạc ===
- dossier(incident): JSON đầy đủ (tóm tắt, lời khai, đường đi GPS, người thân, cuộc gọi, kế hoạch,
  quyết định tuyến, lịch sử model, mã băm file ghi âm, việc chia sẻ, timeline). digest = SHA-256 của JSON.
- Niêm phong tự động khi: SOS, phát hiện khẩn cấp, không trả lời check-in, mất liên lạc, kết thúc.
- Báo cáo HTML dạng văn bản (in/lưu PDF): tiêu đề + nhãn (mô phỏng/khẩn cấp/mất liên lạc/đã niêm
  phong), 6 ô thông tin, (1) tóm tắt sự việc bằng một đoạn văn ghép từ dữ kiện, (!) bản tóm tắt cho
  113/115, (2) diễn biến chính — mỗi mốc 1 câu, chấm màu, gộp các lần đánh giá lại liên tiếp, (3) lời
  khai, (4) ghi âm (audio player + SHA-256), (5) vị trí cuối + link bản đồ + đường đi rút gọn ≤ 25 dòng,
  (6) người thân & điểm hỗ trợ (trạng thái bằng tiếng Việt, lời cuối, lý do không dùng), (7) các phương
  án và "ai làm gì", (8) hội thoại với AI, (9) niêm phong + chuỗi băm; phụ lục kỹ thuật trong <details>.
  Bảng bọc trong khung cuộn ngang để không tràn trang trên điện thoại.
- Ghi âm: trong phiên Realtime của người dùng, trộn micro + giọng AI bằng AudioContext
  (MediaStreamDestination) → MediaRecorder (webm/opus, mp4 cho Safari) `start(10000)`; mỗi đoạn POST
  nhị phân `/api/incidents/:id/recording?session=&seq=` theo thứ tự (promise chain, retry). Server: kiểm
  tra session id, mime, ≤ 2 MB/đoạn, ≤ 80 MB/sự cố, seq phải liên tiếp (gửi lại đoạn cũ thì bỏ qua), ghi
  nối file, cập nhật SHA-256 cả file. Hiển thị "● Đang ghi âm vào hồ sơ" (ẩn khi SOS bí mật) và ô tắt ghi
  âm lưu ở localStorage. Xóa transcript thì xóa cả file ghi âm.
- Mất liên lạc: điện thoại im > 90 s trong SOS/đi về nhà → giữ vị trí cuối, đổ chuông người thân, chuẩn
  bị tóm tắt 113, niêm phong, `shareEvidence` → người thân thấy "đã mất liên lạc · Mở hồ sơ" trên
  /r/<token>; route `/api/r/<token>/evidence` và `/recordings/<session>` chỉ mở cho người thân của đúng
  sự cố, chỉ sau khi đã chia sẻ.
- Tấn công có thương tích → nơi không sơ cứu được bị admission loại → gợi ý đường tới khoa cấp cứu và
  khuyên gọi 115.

=== GIAI ĐOẠN 6 — Demo thi đấu một nút ===
- Nút "Chạy demo thi đấu" tạo incident SIMULATION riêng (không gọi thành viên thật), chạy ~10 chặng, có
  tạm dừng, chuyển bước, nhịp (nhanh/vừa/chậm), lời dẫn bằng speechSynthesis tiếng Việt, chờ đọc xong
  mới sang bước (có timeout để không treo).
- Đạo diễn chỉ cung cấp LỜI CỦA CÁC VAI; mọi quyết định đi qua engine thật; lời dẫn mỗi chặng (≤ 2 câu)
  được viết SAU khi engine xử lý, từ trạng thái thật. Nếu engine không đổi quyết định như kịch bản cần
  thì dừng demo với lỗi, không giả kết quả.
- Mỗi chặng có `focus: Point[]` để bản đồ tự flyTo/fitBounds tới đúng chỗ.
- Kịch bản gợi ý: (1) 22:15 có người bám theo; (2) SOS, loại N nơi đóng cửa, gọi cùng lúc 3 điểm + 2
  người thân; (3) mỗi người một ý — một nơi chỉ có cửa sau qua hẻm, một nơi "chắc được, để hỏi quản lý"
  rồi đồng ý, một nơi cho nhân viên ra đón; chị gái "chạy xe qua, mười phút", anh trai "giữ máy"; (4) AI
  tổng hợp + lý do loại; (5) người dùng hỏi đồn công an → vẽ đường, ngoài giờ hành chính, nơi đã xác
  nhận gần hơn → khuyên đi đó; (6) lên đường, chuyển lời dặn của người thân; (7) nơi được chọn rút lời →
  đổi nơi, báo người thân đổi điểm đón; (8) đoạn phía trước tối → đường vòng; (9) bị giật túi, chảy máu
  → khẩn cấp mức 4, 115, lời khai, đường tới cấp cứu; (10) mất liên lạc → niêm phong và gửi hồ sơ.
- Toast trên bản đồ cho các mốc chính, tối đa 140 ký tự.

=== GIAO DIỆN (áp dụng từ giai đoạn 1, hoàn thiện dần) ===
- Tông tối: --bg #080f18, --panel #101b28, --panel2 #142232, --border #223142, --text #e5edf5,
  --muted #8495a8, --cyan #3be1bd (nhấn/đã xác nhận), --blue #7db7ff (tự chọn/tham khảo/người dùng),
  --amber #e9b66f (danh sách hỗ trợ/cảnh báo), --red #fa8d91 (SOS/khẩn cấp). Font hệ thống 14 px,
  bo góc 8–10 px, icon lucide. Không emoji trong UI.
- Command center: KHÔNG header. Trên cùng là thẻ demo (dòng tiêu đề + nút; thân mở bằng ⌄), dưới là
  thanh "Khám phá N địa điểm" (chỉ sau SOS) và thanh "Hoạt động agent" thu gọn (tab Tổng quan / Cuộc gọi
  / Người thân / Lịch sử). Rồi lưới 3 cột 380px | 1fr | 320px: điện thoại | bản đồ 3D | thông tin
  (tên nơi tiếp nhận, khẩn cấp, link hồ sơ, chip người thân, danh sách cuộc gọi có chip trạng thái, 4
  dòng diễn biến). Hai cột bên thu gọn được (transition grid-template-columns 0,35 s), nút ⤢ ẩn hết chỉ
  còn bản đồ. Dock mỏng dính đáy chứa trạng thái, đồng hồ, nhãn AI, nút demo, icon chuyển trang.
- Bản đồ: chip "Vị trí mô phỏng" trái trên, chú giải màu giữa trên, banner chỉ đường xanh, toast ≤ 140
  ký tự tự tắt 4,5 s, zoom/la bàn bên phải, thanh "Mô phỏng di chuyển" ở đáy. Tuyến xác nhận xanh ngọc
  vẽ dần 1,4 s; tuyến cũ xám; tuyến tự chọn lam nét đứt + cờ ◎ có nhãn; ⌂ nhà, ☾ đoạn tối, ✕ đường chặn;
  radar quét quanh người dùng khi đang tìm; vùng đỏ sự cố chỉ hiện sau SOS.
- Điện thoại: app bar "Guardian AI" + nhãn SIMULATION + nút mạng lưới; khung KHẨN CẤP (115/113 mở tel:)
  khi có; nút SOS đỏ; orb micro xanh ngọc nhịp theo âm lượng; dòng trạng thái ("Guardian đang nghe",
  micro, thời lượng, "● Đang ghi âm vào hồ sơ"); nút tắt mic/kết thúc; "Cuộc gọi giả"; chip người thân;
  thẻ phương án gọn (tên nơi, khoảng cách, cửa vào, [Chấp nhận]). SOS bí mật: giả màn hình cuộc gọi,
  không hiện chữ SOS/ghi âm.
- Trang /r/<token>: một cột ≤ 480 px; chuông [Nghe]/[Từ chối]; orb AI + 6–12 dòng hội thoại; vị trí và
  điểm đến; khung "mất liên lạc · Mở hồ sơ · mã …" khi được chia sẻ; nút [Tôi đang đến] [Gọi trực tiếp];
  8 dòng diễn biến. Đối tác: nút "Đang trực", phần việc được giao, vị trí chính xác chỉ sau khi đồng ý.
- Responsive < 600 px: bản đồ lên đầu khi SOS, dock chỉ icon vuốt ngang, thanh mô phỏng một hàng vuốt
  ngang, không tràn ngang ở 390 px (kiểm tra bằng Playwright: scrollWidth ≤ innerWidth).
- Truy cập: aria-label cho nút icon, marker bấm được bằng bàn phím, vùng trạng thái role="status".

=== KIỂM THỬ BẮT BUỘC ===
- `npm test` (node:test) cho engine, admission, interpreter, planner validation, family analysis,
  offers/coordination, directions (kể cả chống trùng nghĩa), recordings, evidence HTML (escape, đủ mục),
  showcase chạy trọn và đạt các mốc.
- Integration HTTP/SSE trên server QA với DB `:memory:`, AI tắt: session, origin, cô lập phiên, replay,
  reset, callback muộn.
- Playwright: chạy demo một nút, chụp bản đồ từng chặng, kiểm tra không lỗi JS; mở hồ sơ ở 1440 px và
  390 px, kiểm tra không tràn ngang.
- Ghi rõ những gì CHƯA kiểm chứng (giọng nói thật với micro, P2P giữa hai điện thoại thật, nhà mạng).
````

---

## Phần 3 — Gợi ý khi giao cho người khác

- Gửi kèm file này và yêu cầu họ **làm lần lượt giai đoạn 1 → 6**, mỗi giai đoạn tự kiểm thử rồi mới đi tiếp. Một prompt quá lớn chạy một lần thường cho ra code trông đủ nhưng không chạy.
- Họ cần: Node.js 24+, một OpenAI API key (Realtime + Responses), `cloudflared` nếu muốn demo trên điện thoại thật.
- Mỗi phút Realtime có phí; dùng `gpt-realtime-mini` khi thử nhiều. Demo một nút mặc định không cần quota AI.
- Đổi khu bản đồ: chạy lại script tải OSM cho khu khác và đặt lại 30 điểm mô phỏng; mọi logic giữ nguyên.
- Trước khi dùng với người thật: cần app native + push để đổ chuông khi khóa màn hình, TURN server, mã hóa dữ liệu lúc lưu, chính sách quyền riêng tư cho ghi âm, và thỏa thuận với các điểm đối tác thật.
