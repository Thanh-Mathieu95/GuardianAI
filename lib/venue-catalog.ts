import type { VenueKind, VenueProfile } from "./place-context";

const functions: Record<VenueKind, Pick<VenueProfile, "goods" | "services" | "limitations">> = {
  CONVENIENCE: { goods: ["nước đóng chai", "đồ ăn nhanh", "vật dụng thiết yếu"], services: ["WAITING", "STAFF", "WATER"], limitations: ["Không phải cơ sở y tế; chỗ chờ phải được xác nhận riêng"] },
  HOTEL: { goods: ["lưu trú", "dịch vụ lễ tân"], services: ["WAITING", "STAFF", "WATER", "CHARGING"], limitations: ["Không mặc định cho người ngoài vào sảnh; cần lễ tân xác nhận"] },
  PHARMACY: { goods: ["thuốc", "băng gạc", "vật tư y tế"], services: ["WAITING", "STAFF", "MEDICINE"], limitations: ["Bán thuốc không đồng nghĩa có khả năng cấp cứu hay chẩn đoán"] },
  CAFE: { goods: ["cà phê", "đồ uống", "bánh"], services: ["WAITING", "STAFF", "WATER", "CHARGING"], limitations: ["Có thể đóng sớm; cần xác nhận chỗ chờ và ổ sạc"] },
  RESTAURANT: { goods: ["đồ ăn", "nước uống"], services: ["WAITING", "STAFF", "WATER"], limitations: ["Không tự giả định cửa bếp còn mở là có thể tiếp nhận"] },
  PETROL: { goods: ["xăng dầu", "nước uống"], services: ["WAITING", "STAFF", "WATER"], limitations: ["Chỉ chờ tại khu vực nhân viên chỉ định; không đứng ở khu bơm nhiên liệu"] },
  BANK: { goods: ["dịch vụ ngân hàng", "rút tiền ATM"], services: [], limitations: ["ATM hoạt động không đồng nghĩa có nhân viên trực hoặc chỗ chờ"] },
  MARKET: { goods: ["thực phẩm", "đồ gia dụng", "nước uống"], services: ["WAITING", "STAFF", "WATER"], limitations: ["Kiểm tra giờ đóng cửa và bộ phận bảo vệ"] },
  POLICE: { goods: [], services: ["STAFF", "REPORT_CRIME"], limitations: ["Giờ hành chính khác giờ trực ban; trực ban hiện tại chưa xác minh", "App không tự gọi cơ quan khẩn cấp"] },
  CLINIC: { goods: ["khám theo chuyên khoa"], services: ["WAITING", "STAFF", "FIRST_AID"], limitations: ["Không có khoa cấp cứu được xác minh; không thay bệnh viện/115"] },
  HOSPITAL: { goods: [], services: ["STAFF", "EMERGENCY_MEDICAL"], limitations: ["Chức năng cấp cứu trong hồ sơ mô phỏng; khả năng nhận bệnh nhân cần xác minh"] },
  SECURITY: { goods: [], services: ["WAITING", "STAFF", "CHARGING"], limitations: ["Bảo vệ chỉ hỗ trợ theo phạm vi được phép; cần xác nhận người trực"] },
};
type Entry = [string, string, VenueKind, string, number, number, string, string, boolean?];
// Businesses, hours, inventories, staffing and contact permission below are invented for the demo.
// Only the underlying street geometry comes from OSM. No real business is enrolled by this list.
const entries: Entry[] = [
  ["a", "Cửa hàng 24h Sao Mai", "CONVENIENCE", "Mai Chí Thọ", -250, -110, "00:00", "24:00", true],
  ["b", "Khách sạn Bình Minh", "HOTEL", "Trần Bạch Đằng", -530, -250, "00:00", "24:00", true],
  ["c", "Nhà thuốc Phúc An", "PHARMACY", "Mai Chí Thọ", 100, 10, "06:00", "23:00", true],
  ["police", "Công an phường An Khánh", "POLICE", "Tố Hữu", -230, -600, "07:30", "17:00"],
  ["clinic", "Trạm y tế phường", "CLINIC", "Hoàng Thế Thiện", 450, 120, "07:00", "17:00"],
  ["mart-river", "Siêu thị Bến Sông", "MARKET", "Trần Bạch Đằng", -650, -170, "07:00", "22:00", true],
  ["coffee-leaf", "Cà phê Tán Lá", "CAFE", "Trần Bạch Đằng", -610, -370, "06:30", "21:30", true],
  ["hotel-sala", "Khách sạn Ánh Dương", "HOTEL", "Trần Bạch Đằng", -440, -470, "00:00", "24:00", true],
  ["store-lotus", "Tiện lợi Sen Xanh", "CONVENIENCE", "Mai Chí Thọ", -80, -50, "00:00", "24:00", true],
  ["cafe-night", "Cà phê Đêm Nhẹ", "CAFE", "Tố Hữu", -340, -380, "18:00", "02:00", true],
  ["food-night", "Quán ăn Khuya", "RESTAURANT", "Tố Hữu", -150, -560, "16:00", "01:00", true],
  ["petrol-west", "Trạm nhiên liệu Bờ Tây", "PETROL", "Mai Chí Thọ", -450, -70, "00:00", "24:00", true],
  ["atm-sala", "ATM Khu Sala", "BANK", "Mai Chí Thọ", 240, -60, "00:00", "24:00"],
  ["bank-river", "Ngân hàng Bến Việt", "BANK", "Mai Chí Thọ", 360, 40, "08:00", "17:00"],
  ["pharmacy-east", "Nhà thuốc An Nhiên", "PHARMACY", "Hoàng Thế Thiện", 550, 200, "07:00", "21:00", true],
  ["cafe-sala", "Cà phê Góc Phố", "CAFE", "Đường N2", 480, -150, "07:00", "22:30", true],
  ["mart-east", "Siêu thị Mini Sala", "MARKET", "Đường N2", 650, -180, "06:00", "23:00", true],
  ["security-sala", "Bảo vệ khu dân cư Sala", "SECURITY", "Đường N2", 580, -240, "00:00", "24:00", true],
  ["security-river", "Bảo vệ tòa nhà Bến Sông", "SECURITY", "Trần Bạch Đằng", -700, -60, "00:00", "24:00", true],
  ["hospital-demo", "Khoa Cấp cứu Bến Việt", "HOSPITAL", "Hoàng Thế Thiện", 680, 80, "00:00", "24:00"],
  ["clinic-family", "Phòng khám Gia Đình", "CLINIC", "Đường N2", 760, -150, "08:00", "20:00"],
  ["food-east", "Bếp Nhà Sala", "RESTAURANT", "Đường N2", 810, -300, "10:00", "22:00", true],
  ["store-bridge", "Tiện lợi Đầu Cầu", "CONVENIENCE", "Mai Chí Thọ", 500, -30, "00:00", "24:00", true],
  ["coffee-bridge", "Cà phê Nắng Sớm", "CAFE", "Hoàng Thế Thiện", 300, 120, "06:00", "18:00", true],
  ["hotel-garden", "Khách sạn Vườn Xanh", "HOTEL", "Tố Hữu", -60, -420, "00:00", "24:00", true],
  ["pharmacy-west", "Nhà thuốc Hòa Bình", "PHARMACY", "Trần Bạch Đằng", -760, -280, "06:00", "22:00", true],
  ["food-west", "Quán Cháo Ấm", "RESTAURANT", "Trần Bạch Đằng", -800, -150, "17:00", "03:00", true],
  ["atm-west", "ATM Trần Bạch Đằng", "BANK", "Trần Bạch Đằng", -580, -100, "00:00", "24:00"],
  ["market-west", "Chợ mini Bờ Tây", "MARKET", "Tố Hữu", -480, -610, "06:00", "20:00"],
  ["security-east", "Chốt bảo vệ công viên", "SECURITY", "Hoàng Thế Thiện", 180, 150, "06:00", "22:00", true],
];
export const venueCatalog = entries.map(([id, name, kind, street, x, y, open, close, callable = false]) => ({
  id, name, kind, street, x, y, callable,
  profile: { kind, ...functions[kind], hours: { open, close: close === "24:00" ? "00:00" : close, allDay: open === "00:00" && close === "24:00", ...(kind === "POLICE" ? { note: "Giờ hành chính; trực ban phải xác minh riêng" } : {}) }, sourceKind: "SIMULATED" } satisfies VenueProfile,
}));
