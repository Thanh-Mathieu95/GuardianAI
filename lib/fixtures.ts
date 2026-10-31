import type { Place, Point, Route } from "./types";
export const seeds = {
  HANOI: { lat: 21.0285, lng: 105.8542 },
  HCM: { lat: 10.7769, lng: 106.7009 },
};
export function fixturePlaces(origin: Point): Place[] {
  return [
    ["a", "Cửa hàng A", "Cửa hàng tiện lợi", 0.0018, -0.0024],
    ["b", "Khách sạn B", "Lễ tân trực", 0.0028, 0.0038],
    ["c", "Nhà thuốc C", "Nhà thuốc", -0.0024, 0.0022],
  ].map(([id, name, category, dy, dx]) => ({
    id: String(id),
    name: String(name),
    category: String(category),
    lat: origin.lat + Number(dy),
    lng: origin.lng + Number(dx),
    address: "Khu vực demo · địa điểm giả lập",
    source: "Guardian offline fixture v1 · địa điểm hư cấu",
    capturedAt: new Date().toISOString(),
    openingStatus: "UNKNOWN",
    supportStatus: "UNKNOWN",
    contactEligibility: "ALLOWLIST",
    verification: "PUBLIC_INFO_ONLY",
    evidenceRefs: ["fixture:v1:" + id],
  }));
}
export function fixtureRoute(
  from: Point,
  to: Place,
  revision: number,
  blockedCount: number,
): Route {
  const detour = blockedCount % 2 === 1 ? -0.0018 : 0.0015;
  const points = blockedCount
    ? [
        from,
        { lat: from.lat + detour, lng: from.lng },
        { lat: from.lat + detour, lng: to.lng + 0.001 },
        { lat: to.lat, lng: to.lng + 0.001 },
        to,
      ]
    : [
        from,
        { lat: from.lat, lng: from.lng + 0.001 },
        { lat: to.lat, lng: from.lng + 0.001 },
        to,
      ];
  return {
    id: `route-${revision}`,
    source: "Offline route fixture · không phải chỉ dẫn thực địa",
    sourceKind: "SIMULATED",
    capturedAt: new Date().toISOString(),
    points,
    steps: [
      blockedCount
        ? "Theo tuyến mô phỏng thay thế, tránh đoạn bị chặn."
        : "Theo tuyến được chọn trên sơ đồ mô phỏng.",
      `Đích đến: ${to.name}. Xác nhận tại quầy khi đến nơi.`,
    ],
    superseded: false,
    blocked: false,
  };
}
