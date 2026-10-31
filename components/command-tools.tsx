"use client";
import { useState } from "react";
import { places, isOpen, kinds } from "@/lib/city";
import type { Incident } from "@/lib/types";
import { useLanguage } from "./language";
export function CommandTools({
  incident: i,
  action,
}: {
  incident: Incident;
  action: (name: string, fields?: Record<string, unknown>) => Promise<unknown>;
}) {
  const { t, locale } = useLanguage(),
    [kind, setKind] = useState("all"),
    [closed, setClosed] = useState(false),
    [hour, setHour] = useState("22:15"),
    [tab, setTab] = useState("overview");
  const minute = Number(hour.slice(0, 2)) * 60 + Number(hour.slice(3)),
    open = places.filter((p) => isOpen(p, minute));
  const list = places.filter(
    (p) =>
      (kind === "all" || p.kind === Number(kind)) &&
      (closed || isOpen(p, minute)),
  );
  return (
    <div className="command-tools">
      {i.sosAt && (
        <details className="exploration">
          <summary>
            {t(
              `Khám phá ${places.length} địa điểm · ${hour} giờ tình huống · ẩn ${places.length - open.length} nơi đóng`,
              `Explore ${places.length} places · ${hour} scenario time · ${places.length - open.length} closed hidden`,
            )}{" "}
            <span>SIMULATED</span>
          </summary>
          <div className="catalog-filters">
            <label>
              {t("Loại nơi", "Place type")}
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="all">{t("Tất cả", "All")}</option>
                {kinds.map((k, n) => (
                  <option value={n} key={n}>
                    {k[locale === "vi" ? 0 : 1]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("Giờ tình huống", "Scenario time")}
              <input
                type="time"
                value={hour}
                onChange={(e) => setHour(e.target.value)}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={closed}
                onChange={(e) => setClosed(e.target.checked)}
              />
              {t("Hiện nơi đã đóng", "Show closed places")}
            </label>
          </div>
          <div className="place-catalog">
            {list.map((p) => (
              <details key={p.id}>
                <summary>
                  {p.name} · {p.hours} ·{" "}
                  {isOpen(p, minute) ? t("Mở", "Open") : t("Đóng", "Closed")}
                </summary>
                <p>
                  {kinds[p.kind][locale === "vi" ? 0 : 1]} ·{" "}
                  {p.waiting
                    ? t("Có chỗ chờ mô phỏng", "Simulated waiting area")
                    : t("Không có chỗ chờ", "No waiting area")}{" "}
                  ·{" "}
                  {p.firstAid
                    ? t("Có sơ cứu mô phỏng", "Simulated first aid")
                    : t("Chưa xác minh sơ cứu", "First aid unverified")}
                </p>
                <p>
                  {p.kind === 6
                    ? t(
                        "ATM hoạt động không đồng nghĩa có người trực.",
                        "An operating ATM does not imply staff are present.",
                      )
                    : p.kind === 8
                      ? t(
                          "Giờ hành chính khác trực ban; cần xác nhận tiếp nhận.",
                          "Office hours differ from duty coverage; reception must be confirmed.",
                        )
                      : t(
                          "Giờ và khả năng hỗ trợ là dữ liệu giả định; chưa phải lời đồng ý.",
                          "Hours and support capabilities are synthetic; they are not consent.",
                        )}
                </p>
                <button
                  disabled={!isOpen(p, minute)}
                  onClick={() => void action("directions", { placeId: p.id })}
                >
                  {t("Xem tuyến tham khảo", "Show reference route")}
                </button>
              </details>
            ))}
          </div>
        </details>
      )}
      <details className="agent-activity">
        <summary>
          {t("Hoạt động agent", "Agent activity")} · {i.mode} ·{" "}
          {i.replies.filter((r) => r.role === "PARTNER").length}{" "}
          {t("nhánh", "branches")} ·{" "}
          {i.replies.filter((r) => r.state === "ACCEPTED").length}{" "}
          {t("xác nhận", "confirmed")}
        </summary>
        <div className="actions">
          {["overview", "calls", "family", "history"].map((key) => (
            <button
              key={key}
              aria-pressed={tab === key}
              onClick={() => setTab(key)}
            >
              {
                {
                  overview: t("Tổng quan", "Overview"),
                  calls: t("Cuộc gọi", "Calls"),
                  family: t("Người thân", "Family"),
                  history: t("Lịch sử", "History"),
                }[key]
              }
            </button>
          ))}
        </div>
        {tab === "overview" ? (
          <p>
            {t(
              "Lời đồng ý có nguồn → kiểm tra điều kiện → so sánh phương án → người dùng chấp nhận.",
              "Sourced consent → admission checks → plan comparison → user acceptance.",
            )}
          </p>
        ) : tab === "history" ? (
          i.events
            .slice(-12)
            .reverse()
            .map((e) => (
              <p key={e.id}>
                {new Date(e.at).toLocaleTimeString(locale)} ·{" "}
                {e.message[locale === "vi" ? 0 : 1]}
              </p>
            ))
        ) : (
          i.replies
            .filter(
              (r) => r.role === (tab === "family" ? "CONTACT" : "PARTNER"),
            )
            .map((r) => (
              <article key={r.id}>
                <b>
                  {r.name} · {r.state}
                </b>
                <blockquote>
                  {r.quote || t("Chưa có lời phản hồi", "No reply yet")}
                </blockquote>
                <p>
                  {r.minutes !== null
                    ? `${r.minutes} ${t("phút tự báo", "self-reported minutes")}`
                    : t("Chưa nêu thời gian", "No ETA provided")}{" "}
                  · {r.simulated ? "SIMULATED" : "APP"}
                </p>
              </article>
            ))
        )}
      </details>
    </div>
  );
}
