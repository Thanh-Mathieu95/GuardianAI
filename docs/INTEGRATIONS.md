# Tích hợp tùy chọn

## Những gì cần cung cấp để bật live

Chỉ cung cấp **tên dịch vụ** trong cuộc trao đổi. Secret nên điền trực tiếp vào `.env.local` ở máy. Không đưa key vào client component / NEXT_PUBLIC_ variable / source control.

### Google Places / Routes

```dotenv
GOOGLE_MAPS_API_KEY=your-server-key
```

Bật Places API (New) và Routes API trong Google Cloud project của bạn; cấu hình billing và giới hạn key cho API cần dùng. Trong Control chọn adapter GOOGLE rồi Start Scenario. Dùng vị trí seed hoặc tự cấp quyền GPS. Các request Places nhận vị trí hiện tại của incident; chỉ chọn GOOGLE khi đồng ý dùng API bên ngoài.

Places trả tối đa 3 ứng viên, `PUBLIC_INFO_ONLY`, `NOT_ALLOWED` mặc định. Nơi xuất hiện trên Maps không có nghĩa đồng ý nhận cuộc gọi hay đồng ý hỗ trợ. Cấu hình các số test thuộc nhóm trong TEST_LIVE là test lane; không quay số kết quả công khai.

Routes trả walking geometry / distance / duration; UI chỉ hiển thị ETA khi có API. Sơ đồ nền vẫn là schematic, kể cả khi overlay route LIVE. Không cung cấp map tile đường phố thật trong bản này. Các giới hạn định tuyến đi bộ của provider cần được giải thích khi demo.

Google Routes không nhận ràng buộc đoạn chặn tùy ý trong adapter hiện tại. Vì vậy road-block demo dùng FIXTURE; không giả vờ live routing đã tránh một đoạn chưa được provider xác minh.

Tài liệu: [Nearby Search New](https://developers.google.com/maps/documentation/places/web-service/nearby-search), [Compute Routes](https://developers.google.com/maps/documentation/routes/compute_route_directions).

### Gọi điện test thật

```dotenv
CALL_GATEWAY_URL=https://your-controlled-service.example/test-calls
CALL_GATEWAY_TOKEN=server-secret
TEST_CALL_ALLOWLIST=+84XXXXXXXXX,+84YYYYYYYYY,+84ZZZZZZZZZ
OPERATOR_PASSWORD=choose-a-local-password
```

Gateway này là giao diện tích hợp cho dịch vụ thoại bạn sở hữu, **không phải một nhà mạng đã được cấu hình sẵn**. Cần chọn nhà cung cấp và xác minh hỗ trợ số Việt Nam / consent trước khi viết adapter nhà cung cấp cụ thể. Bản demo không gửi cuộc gọi thật trong quá trình phát triển / test.

Server gọi gateway bằng HTTPS với `Authorization: Bearer ...`. Body:

```json
{
  "number": "+84XXXXXXXXX",
  "incidentId": "INC-XXXXXXXX",
  "disclosure": "Tôi là trợ lý AI Guardian...",
  "recordAudio": false
}
```

Gateway phải tự giới thiệu là AI, kiểm soát số đích, thời lượng và không ghi âm mặc định. Kết thúc trong 45 giây và trả kết quả cuối đã xác minh, ví dụ:

```json
{
  "status": "CONFIRMED",
  "reply": "Người nhận đồng ý tham gia tiếp nhận trong bài test.",
  "humanConfirmed": true
}
```

Các status hỗ trợ: `CONFIRMED`, `DECLINED`, `NO_ANSWER`, `FAILED`. Chỉ `CONFIRMED` có `humanConfirmed: true` được chấp nhận. Một response HTTP thành công không tự tạo xác nhận. Không có webhook streaming / audio recording của nhà cung cấp trong bản MVP; giao diện giữ RINGING khi đang đợi gateway. Cần test thực tế để xác nhận cuộc gọi và transcript từ provider của nhóm.

Trong UI chọn TEST_LIVE; nhập một số test riêng cho mỗi lane và tick consent. Không cho mock calls chạy dưới nhãn TEST_LIVE, và không cho inject trong TEST_LIVE. Không có route `tel:113` hay PSTN emergency trong ứng dụng.

### Voice / AI

MVP dùng Web Speech API (`vi-VN`) và speechSynthesis; khả năng / độ tự nhiên phụ thuộc trình duyệt và giọng cài trên máy. Không có key speech server. Text fallback dùng cùng pipeline.

Risk / Coordinator đã có GPT qua OpenAI Responses API. Chạy `SETUP-AI.cmd` để nhập key tại máy, kiểm tra AI và bật AI cho phiên. Đầu ra model được validate thành proposal; mọi side effect vẫn đi qua PolicyGate. Không để model tự quay số hay khẳng định cảnh sát đang đến. Xem [hướng dẫn GPT](AI.md).

## Vận hành local và deploy

`npm start` chỉ bind 127.0.0.1. Không tự publish dữ liệu của bạn. Deploy container / VM Node 24 cần persistent volume cho SQLite, HTTPS, `OPERATOR_PASSWORD`, single replica. Bổ sung xác thực người dùng và room pairing trước khi dùng nhiều thiết bị hoặc công khai Internet.
