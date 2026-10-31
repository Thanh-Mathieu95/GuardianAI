"use client";
import { placeProfile, kinds, places } from "@/lib/city";
import { useLanguage } from "./language";
import { VenueSymbol } from "./venue-symbol";
import {
  Clock,
  Users,
  Armchair,
  HeartPulse,
  AlertTriangle,
  Package,
} from "lucide-react";
export function PlaceDetails({
  place,
  minute,
}: {
  place: (typeof places)[number];
  minute?: number;
}) {
  const { t, locale } = useLanguage(),
    profile = placeProfile(place, minute),
    pick = (p: [string, string]) => p[locale === "vi" ? 0 : 1];
  return (
    <div className="place-profile" data-place-id={place.id}>
      <div className="place-profile-type">
        <VenueSymbol kind={place.kind} />
        <span>{pick(kinds[place.kind])}</span>
        <small>SIMULATED</small>
      </div>
      <div className="place-hours">
        <Clock size={16} />
        <b>{place.hours}</b>
        <span
          className={
            profile.openingStatus === "OPEN" ? "place-open" : "place-closed"
          }
        >
          {profile.openingStatus === "OPEN"
            ? t("Đang mở", "Open now")
            : t("Đã đóng", "Closed")}
        </span>
      </div>
      <div className="place-capabilities">
        <span>
          <Users size={15} />
          {place.staffed
            ? t("Có nhân viên", "Staffed")
            : t("Không có nhân viên", "Unstaffed")}
        </span>
        <span>
          <Armchair size={15} />
          {place.waiting
            ? t("Có chỗ chờ", "Waiting area")
            : t("Không có chỗ chờ", "No waiting area")}
        </span>
        <span>
          <HeartPulse size={15} />
          {place.firstAid
            ? t("Sơ cứu cơ bản", "Basic first aid")
            : t("Chưa xác minh sơ cứu", "First aid unverified")}
        </span>
      </div>
      <h4>{t("Có thể hỗ trợ gì?", "Available capabilities")}</h4>
      <ul>
        {profile.services.map((x, n) => (
          <li key={n}>{pick(x)}</li>
        ))}
      </ul>
      {!!profile.goods.length && (
        <>
          <h4>
            <Package size={14} />
            {t("Hàng hóa", "Goods")}
          </h4>
          <p>{profile.goods.map(pick).join(" · ")}</p>
        </>
      )}
      <div className="place-limitations">
        <h4>
          <AlertTriangle size={14} />
          {t("Điều cần xác nhận", "Needs confirmation")}
        </h4>
        {profile.limitations.map((x, n) => (
          <p key={n}>{pick(x)}</p>
        ))}
      </div>
      <p className="place-source">
        {t(
          "Giờ, dịch vụ và khả năng hỗ trợ là hồ sơ mô phỏng, không phải cam kết tiếp nhận.",
          "Hours, services and capabilities are synthetic profiles, not a commitment to receive you.",
        )}
      </p>
    </div>
  );
}
