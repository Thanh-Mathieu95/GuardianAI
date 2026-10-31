# Guardian AI × Impeccable

## Bộ skill và nguồn

- Upstream: [pbakaus/impeccable](https://github.com/pbakaus/impeccable).
- Bản ghép theo commit `df3a4abe7d0840d5f60324812c432e00b66a4e75`; SKILL.md khai báo `4.8.0`.
- Vị trí trong dự án: `.agents/skills/impeccable/`; đọc `SKILL.md` trước khi dùng.
- Cài bằng helper Skill Installer với nguồn `.agents/skills/impeccable` và commit cố định. Giữ bộ reference/scripts và thông tin giấy phép đi kèm. Đổi phiên bản bằng một thay đổi có thể review, không tự kéo main mỗi lần làm UI.
- Skill có thể được nhận ở lượt tiếp theo; mở lại phiên làm việc nếu công cụ chưa nạp danh mục mới. Đây là bản cài skill; design hook không được cài/bật tự động bằng thao tác copy này.

Impeccable cung cấp phương pháp và từ vựng để thiết kế, không quy định một palette duy nhất. Guardian AI đã có `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json` và surface briefs; dùng chúng làm ngữ cảnh hiện có. Không khởi tạo lại hoặc đổi toàn bộ nhận diện chỉ để “trông giống Impeccable”.

## Phân loại các màn hình

| Màn hình | Mode | Tiêu chí chính |
|---|---|---|
| Landing và lối vào demo cho giám khảo | Persuade | Hiểu giá trị, thấy nhãn demo, biết cách bắt đầu trong viewport đầu |
| Command center | Operate | Đọc nhanh kế hoạch, nguồn xác nhận, phân vai và thay đổi; trình chiếu được |
| Điện thoại người dùng | Operate | Một tay, ít chữ, bước tiếp theo rõ, SOS bí mật kín đáo |
| Receiver người thân/đối tác | Operate | Nghe/trả lời, cam kết và phần việc rõ; quyền xem đúng thời điểm |
| Hồ sơ bằng chứng | Read | Timeline, nguồn và niêm phong dễ đọc, in được, không tràn trên điện thoại |

## Quy trình áp dụng

1. **Nạp context:** từ root dự án, chạy `.agents/skills/impeccable/scripts/impeccable.cmd context` trên Windows theo SKILL.md. Launcher có thể tải engine ở lần đầu. Chạy một lần mỗi phiên; nếu lỗi, báo rõ và đọc PRODUCT/DESIGN/surface liên quan để tiếp tục.
2. **Lập ý đồ:** dùng `$impeccable shape <luồng>` khi thêm luồng mới; dùng `$impeccable critique <màn hình>` để đánh giá UI hiện tại. Chọn mục tiêu cụ thể, tránh đổi toàn bộ app cho một lỗi nhỏ.
3. **Đặc tả:** xác định người dùng, nhiệm vụ, nội dung cần thấy trước, hành động chính và các trạng thái loading/empty/error/success/permission/offline. Ghi tiêu chí đo được và ảnh hưởng tới deploy.
4. **Thực hiện:** đọc playbook tương ứng và craft-floor trước khi sửa UI. Theo token/typography/component hiện có; giữ nghiệp vụ và quyền truy cập của AGENTS.
5. **Cải thiện có mục tiêu:** `adapt` cho mobile, `clarify` cho câu chữ, `harden` cho trường hợp lỗi, `optimize` cho hiệu năng, `polish` cho hoàn thiện. Không biến checklist thành bắt buộc chạy tất cả lệnh.
6. **Kiểm chứng:** xem bản render thật trên desktop và 390 px, keyboard/focus/reduced-motion, bản đồ và báo cáo. `audit` nhận diện vấn đề kỹ thuật; `critique` đánh giá UX. Ghi cái đã nhìn/chạy, không suy ra chất lượng chỉ từ source.
7. **Link Preview:** kiểm tra lại trên Vercel, gồm font/asset, mạng chậm, cookie, link mời, microphone permission và cửa sổ riêng tư. Đóng phát hiện nghiêm trọng trước phát hành; ghi rõ hạn chế còn lại.

Ví dụ cho agent:

```text
$impeccable shape luồng giám khảo mở link và chạy demo một nút
$impeccable critique command center khi trình chiếu
$impeccable harden receiver khi mất mạng hoặc quyền micro bị từ chối
$impeccable adapt hồ sơ bằng chứng ở 390px
$impeccable polish thẻ phương án trước khi nộp thi
$impeccable audit bản Vercel Preview
```

Đây là lệnh gọi skill trong hội thoại Codex, không phải lệnh PowerShell. Nếu thêm detector/hook sau này, kiểm tra cách cài và phiên bản upstream trước; không ghi là đã có kiểm tra tự động khi chưa thử thực tế.

## Đặc trưng cần giữ

- Thế giới thị giác hiện có: giấy/hồ sơ, mực xanh và dấu niêm phong đỏ; phần vận hành ban đêm có token riêng trong DESIGN. Dùng nhất quán theo từng surface.
- Phương án đã xác nhận, tuyến tham khảo và dữ liệu mô phỏng phải phân biệt được bằng cả nhãn và dấu hiệu thị giác; màu không phải tín hiệu duy nhất.
- Trên điện thoại SOS, ưu tiên nhiệm vụ và độ rõ; hiệu ứng trang trí không được che chỉ dẫn, giảm hiệu năng bản đồ hay làm lộ trạng thái bí mật.
- Landing được thể hiện nhận diện rõ hơn nhưng chỉ dùng thông tin có bằng chứng. Không thêm người dùng, lời chứng thực hoặc cam kết cứu hộ chưa có.
- Không ship live overlay, launcher, engine hoặc detector của skill vào frontend. Không chạy live overlay trên Production.

Giữ PRODUCT/DESIGN/design.json/surface briefs trong version control; screenshot, cache, review runtime và câu hỏi tạm không trở thành dependency deploy. Bản cài skill phải được chuyển cùng source để thành viên khác có cùng playbook.
