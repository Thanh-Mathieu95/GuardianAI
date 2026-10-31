"use client";
import { useState } from "react";
import type { PartnerProfile } from "@/lib/coordination-types";
import { useLanguage } from "./language";
export function PartnerProfileForm({
  profile,
  save,
  busy,
}: {
  profile?: PartnerProfile;
  save: (value: Record<string, unknown>) => Promise<void>;
  busy: boolean;
}) {
  const { t } = useLanguage();
  const [kind, setKind] = useState(profile?.kind || "Café"),
    [address, setAddress] = useState(profile?.address || ""),
    [entrance, setEntrance] = useState(profile?.entrance || ""),
    [meeting, setMeeting] = useState(profile?.meeting || ""),
    [limitations, setLimitations] = useState(profile?.limitations || ""),
    [timezone, setTimezone] = useState(profile?.timezone || "Asia/Ho_Chi_Minh"),
    [open, setOpen] = useState("08:00"),
    [close, setClose] = useState("23:00"),
    [allDay, setAllDay] = useState(
      profile?.hours.some((h) => h.open === h.close) || false,
    ),
    [abilities, setAbilities] = useState({
      receiving: profile?.receiving ?? true,
      staffed: profile?.staffed ?? true,
      waiting: profile?.waiting ?? true,
      accessible: profile?.accessible ?? false,
    });
  const minute = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  return (
    <details className="partner-profile">
      <summary>
        {t("Hồ sơ điểm hỗ trợ & giờ mở cửa", "Venue profile & opening hours")}
      </summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save({
            action: "profile",
            kind,
            address,
            entrance,
            meeting,
            limitations,
            timezone,
            ...abilities,
            hours: [
              {
                days: [0, 1, 2, 3, 4, 5, 6],
                open: allDay ? 0 : minute(open),
                close: allDay ? 0 : minute(close),
              },
            ],
          });
        }}
      >
        <label>
          {t("Loại địa điểm", "Venue type")}
          <input
            required
            maxLength={60}
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          />
        </label>
        <label>
          {t("Địa chỉ", "Address")}
          <input
            required
            maxLength={250}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </label>
        <label>
          {t("Múi giờ", "Timezone")}
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          >
            <option>Asia/Ho_Chi_Minh</option>
            <option>Asia/Bangkok</option>
            <option>UTC</option>
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
          />
          {t("Mở cửa 24 giờ mỗi ngày", "Open 24 hours every day")}
        </label>
        {!allDay && (
          <div className="actions">
            <label>
              {t("Mở cửa mỗi ngày", "Daily opening")}
              <input
                type="time"
                required
                value={open}
                onChange={(e) => setOpen(e.target.value)}
              />
            </label>
            <label>
              {t("Đóng cửa (có thể qua đêm)", "Closing (may be overnight)")}
              <input
                type="time"
                required
                value={close}
                onChange={(e) => setClose(e.target.value)}
              />
            </label>
          </div>
        )}
        {(Object.keys(abilities) as (keyof typeof abilities)[]).map((key) => (
          <label className="check" key={key}>
            <input
              type="checkbox"
              checked={abilities[key]}
              onChange={(e) =>
                setAbilities({ ...abilities, [key]: e.target.checked })
              }
            />
            {key === "receiving"
              ? t("Có thể tiếp nhận tại chỗ", "Can receive someone on site")
              : key === "staffed"
                ? t("Có nhân viên", "Staff available")
                : key === "waiting"
                  ? t("Có nơi chờ người thân", "A place to wait for contacts")
                  : t("Tiếp cận cho người khó di chuyển", "Mobility access")}
          </label>
        ))}
        <label>
          {t("Lối vào", "Entrance")}
          <input
            maxLength={250}
            value={entrance}
            onChange={(e) => setEntrance(e.target.value)}
          />
        </label>
        <label>
          {t("Hướng dẫn gặp mặt", "Meeting instructions")}
          <textarea
            maxLength={500}
            value={meeting}
            onChange={(e) => setMeeting(e.target.value)}
          />
        </label>
        <label>
          {t("Điều kiện & giới hạn", "Conditions & limitations")}
          <textarea
            maxLength={500}
            value={limitations}
            onChange={(e) => setLimitations(e.target.value)}
          />
        </label>
        <p>
          {t(
            "Liên hệ được xác minh bằng quyền truy cập lời mời trong app; không xác minh số điện thoại. Hồ sơ tự khai không phải lời đồng ý tiếp nhận sự cố.",
            "Contact is verified through the in-app invitation; no phone number is verified. A self-reported profile is not acceptance of an incident.",
          )}
        </p>
        <button className="primary" disabled={busy}>
          {t("Lưu hồ sơ tự khai", "Save self-reported profile")}
        </button>
      </form>
    </details>
  );
}
