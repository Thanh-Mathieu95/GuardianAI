import type { CallStatus, Place, Point, Route } from "./types";
import { fixturePlaces, fixtureRoute } from "./fixtures";
const now = () => new Date().toISOString();
export async function findPlaces(
  origin: Point,
  adapter: "FIXTURE" | "GOOGLE",
): Promise<Place[]> {
  if (adapter === "FIXTURE") return fixturePlaces(origin);
  if (!process.env.GOOGLE_MAPS_API_KEY)
    throw new Error("Chưa cấu hình GOOGLE_MAPS_API_KEY");
  const res = await fetch(
    "https://places.googleapis.com/v1/places:searchNearby",
    {
      method: "POST",
      signal: AbortSignal.timeout(10000),
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.location,places.currentOpeningHours",
      },
      body: JSON.stringify({
        includedTypes: ["hotel", "pharmacy", "convenience_store"],
        maxResultCount: 3,
        locationRestriction: {
          circle: {
            center: { latitude: origin.lat, longitude: origin.lng },
            radius: 1500,
          },
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`Google Places HTTP ${res.status}`);
  const data = await res.json();
  return (data.places ?? []).map(
    (p: {
      id: string;
      displayName: { text: string };
      formattedAddress: string;
      location: { latitude: number; longitude: number };
      currentOpeningHours?: { openNow: boolean };
    }) => ({
      id: p.id,
      name: p.displayName.text,
      category: "Google Places",
      address: p.formattedAddress,
      lat: p.location.latitude,
      lng: p.location.longitude,
      source: "Google Places API (New)",
      capturedAt: now(),
      openingStatus: p.currentOpeningHours?.openNow ? "OPEN" : "UNKNOWN",
      supportStatus: "UNKNOWN",
      verification: "PUBLIC_INFO_ONLY",
      contactEligibility: "NOT_ALLOWED",
      evidenceRefs: ["google-place:" + p.id],
    }),
  );
}
export async function getRoute(
  from: Point,
  to: Place,
  revision: number,
  blockedCount: number,
  adapter: "FIXTURE" | "GOOGLE",
): Promise<Route> {
  if (adapter === "FIXTURE")
    return fixtureRoute(from, to, revision, blockedCount);
  if (blockedCount)
    throw new Error(
      "Không thể áp đặt đoạn đường bị chặn tùy ý lên Google Routes. Chuyển fixture để demo đường chặn.",
    );
  if (!process.env.GOOGLE_MAPS_API_KEY)
    throw new Error("Chưa cấu hình GOOGLE_MAPS_API_KEY");
  const res = await fetch(
    "https://routes.googleapis.com/directions/v2:computeRoutes",
    {
      method: "POST",
      signal: AbortSignal.timeout(10000),
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask":
          "routes.duration,routes.distanceMeters,routes.polyline.geoJsonLinestring",
      },
      body: JSON.stringify({
        origin: {
          location: { latLng: { latitude: from.lat, longitude: from.lng } },
        },
        destination: {
          location: { latLng: { latitude: to.lat, longitude: to.lng } },
        },
        travelMode: "WALK",
        polylineEncoding: "GEO_JSON_LINESTRING",
      }),
    },
  );
  if (!res.ok) throw new Error(`Google Routes HTTP ${res.status}`);
  const data = await res.json(),
    r = data.routes?.[0];
  if (!r?.polyline?.geoJsonLinestring?.coordinates?.length)
    throw new Error("Không có tuyến đi bộ từ API");
  return {
    id: `route-${revision}`,
    source: "Google Routes API · walking",
    sourceKind: "LIVE",
    capturedAt: now(),
    points: r.polyline.geoJsonLinestring.coordinates.map(
      ([lng, lat]: number[]) => ({ lat, lng }),
    ),
    steps: [
      `Tham khảo tuyến đi bộ tới ${to.name}. Kiểm tra điều kiện thực địa.`,
    ],
    durationSeconds: parseFloat(r.duration),
    distanceMeters: r.distanceMeters,
    superseded: false,
    blocked: false,
  };
}
export async function gatewayCall(
  number: string,
  incidentId: string,
): Promise<{ status: CallStatus; reply: string }> {
  const url = process.env.CALL_GATEWAY_URL,
    token = process.env.CALL_GATEWAY_TOKEN;
  if (!url || !token)
    throw new Error(
      "Chưa cấu hình call gateway. Không có cuộc gọi nào được thực hiện.",
    );
  if (!url.startsWith("https://"))
    throw new Error("Call gateway phải dùng HTTPS");
  const res = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(45000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      number,
      incidentId,
      disclosure:
        "Tôi là trợ lý AI Guardian, đây là cuộc gọi thử nghiệm có sự đồng ý. Anh/chị có thể tiếp nhận người cần hỗ trợ không?",
      recordAudio: false,
    }),
  });
  if (!res.ok) throw new Error(`Call gateway HTTP ${res.status}`);
  const result = await res.json();
  if (
    !["CONFIRMED", "DECLINED", "NO_ANSWER", "FAILED"].includes(result.status) ||
    typeof result.reply !== "string" ||
    (result.status === "CONFIRMED" && result.humanConfirmed !== true)
  )
    throw new Error("Gateway chưa có quyết định xác nhận của người nhận");
  return { status: result.status, reply: result.reply.slice(0, 2000) };
}
