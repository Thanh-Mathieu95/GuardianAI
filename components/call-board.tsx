"use client";
import {
  PhoneCall,
  PhoneOff,
  Radio,
  MessageSquare,
  Volume2,
} from "lucide-react";
import type { Incident } from "@/lib/types";
import { callLabels } from "@/lib/call-labels";
import { useLanguage } from "./language";
export function CallBoard({
  incident: i,
  cancel,
}: {
  incident: Incident;
  cancel?: (id: string) => void;
}) {
  const { locale, t } = useLanguage();
  const s = i.coordination;
  if (!s?.calls.length) return null;
  const active = s.calls.filter((c) =>
    ["CALLING", "RINGING", "CONNECTED", "CONVERSING"].includes(c.state),
  ).length;
  return (
    <section
      className="call-board"
      aria-label={t("Bộ điều phối cuộc gọi", "Call coordinator")}
    >
      <div className="call-board-title">
        <PhoneCall size={19} />
        <h2>{t("Cuộc gọi trong app", "In-app calls")}</h2>
        <span className="source">
          {i.mode === "TEAM"
            ? "TEAM"
            : i.mode === "DEMO"
              ? "SIMULATED"
              : "LIVE"}
        </span>
      </div>
      <p className="call-overview" role="status">
        <Radio size={14} />
        {active}/{s.limits.concurrency} {t("đang kết nối", "active")} ·{" "}
        {s.calls.filter((c) => c.state === "COMPLETED").length}{" "}
        {t("hoàn tất", "completed")}
      </p>
      <p className="subtle">
        {t(
          "Mỗi người một hội thoại riêng. Cam kết được kiểm tra tại bộ điều phối.",
          "Separate conversations. Commitments are checked centrally.",
        )}
      </p>
      <div className="call-list">
        {s.calls.map((c) => (
          <details
            key={c.id}
            className={`call-row call-${c.state.toLowerCase()}`}
            data-call-state={c.state}
          >
            <summary>
              <span className="call-person">
                <PhoneCall size={17} />
                <b>{c.name}</b>
              </span>
              <span>{callLabels[c.state][locale === "vi" ? 0 : 1]}</span>
              <small>
                {c.purpose === "INQUIRY"
                  ? t("Hỏi khả năng hỗ trợ", "Support inquiry")
                  : t("Thông báo nhiệm vụ", "Task notification")}
              </small>
            </summary>
            {i.mode === "DEMO" && c.turns.length > 0 && (
              <button
                onClick={() => {
                  speechSynthesis.cancel();
                  const speech = new SpeechSynthesisUtterance(
                    c.turns.map((turn) => turn.text).join(". "),
                  );
                  speech.lang = locale === "vi" ? "vi-VN" : "en-US";
                  speechSynthesis.speak(speech);
                }}
              >
                <Volume2 size={15} />
                {t(
                  "Nghe lời thoại mô phỏng",
                  "Listen to scripted conversation",
                )}
              </button>
            )}
            <div className="call-meta">
              {t("Lần thử", "Attempt")} {c.attempt} ·{" "}
              {c.adapter === "SIMULATED"
                ? t("Cuộc gọi mô phỏng", "Simulated call")
                : t("Kênh trong app", "In-app channel")}
            </div>
            {c.task && <p>{c.task[locale === "vi" ? 0 : 1]}</p>}
            {c.reason &&
              ["NO_ANSWER", "BUSY", "ERROR", "CANCELLED"].includes(c.state) && (
                <small className="call-reason">
                  {c.reason === "INCIDENT_BUDGET_REACHED"
                    ? t(
                        "Đã đạt giới hạn thời lượng của sự cố.",
                        "The incident duration budget has been reached.",
                      )
                    : c.reason === "RECIPIENT_OFFLINE_OR_QUEUE_TIMEOUT"
                      ? t(
                          "Người nhận chưa mở trang hoặc hàng đợi đã hết thời gian.",
                          "The recipient is offline or the queue timed out.",
                        )
                      : c.reason === "CONSENT_OR_DUTY_REVOKED" ||
                          c.reason === "CONSENT_REVOKED"
                        ? t(
                            "Người nhận đã ngừng nhận cuộc gọi.",
                            "The recipient stopped accepting calls.",
                          )
                        : c.reason === "PLAN_CHANGED"
                          ? t(
                              "Phương án đã đổi; dừng nhiệm vụ cũ.",
                              "The plan changed; the previous task was stopped.",
                            )
                          : t(
                              "Cuộc gọi đã dừng; xem nhật ký kết nối.",
                              "The call stopped; see connection history.",
                            )}
                </small>
              )}
            {!c.turns.length && (
              <p>
                {t(
                  "Chưa có hội thoại. Chưa có cam kết.",
                  "No conversation or commitment yet.",
                )}
              </p>
            )}
            <ol className="call-conversation">
              {c.turns.map((turn) => (
                <li
                  id={`evidence-${turn.id}`}
                  key={turn.id}
                  className={turn.who === "AI" ? "ai-turn" : "recipient-turn"}
                >
                  <span>
                    <MessageSquare size={13} />
                    {turn.who === "AI" ? "Guardian AI" : c.name} ·{" "}
                    {new Date(turn.at).toLocaleTimeString(locale)}
                  </span>
                  <p>{turn.text}</p>
                  <small>
                    {turn.source === "SIMULATED"
                      ? t("Lời thoại mô phỏng", "Scripted statement")
                      : turn.source === "RECIPIENT"
                        ? t(
                            "Lời người nhận · giữ nguyên văn",
                            "Recipient statement · preserved verbatim",
                          )
                        : t("Lời trợ lý AI", "AI assistant statement")}
                  </small>
                </li>
              ))}
            </ol>
            <details className="call-history">
              <summary>{t("Nhật ký kết nối", "Connection history")}</summary>
              {c.history.map((h, n) => (
                <p key={n}>
                  {new Date(h.at).toLocaleTimeString(locale)} ·{" "}
                  {callLabels[h.state][locale === "vi" ? 0 : 1]}
                </p>
              ))}
            </details>
            {cancel &&
              [
                "QUEUED",
                "CALLING",
                "RINGING",
                "CONNECTED",
                "CONVERSING",
              ].includes(c.state) && (
                <button onClick={() => cancel(c.id)}>
                  <PhoneOff size={15} />
                  {t("Hủy cuộc gọi này", "Cancel this call")}
                </button>
              )}
          </details>
        ))}
      </div>
      <details className="call-budget">
        <summary>
          {t("Giới hạn & nguồn tìm kiếm", "Limits & discovery sources")}
        </summary>
        <p>
          {s.reservedSeconds}/{s.limits.budgetSeconds}{" "}
          {t("giây ngân sách thời lượng", "seconds reserved duration budget")} ·{" "}
          {s.limits.durationSeconds}s/{t("cuộc", "call")} · {s.limits.retries}{" "}
          {t("lần thử lại tối đa", "maximum retry")}
        </p>
        <p>
          {t("Tìm kiếm mở rộng", "Expanding search")}:{" "}
          {s.discovery?.radii.join(" → ")} m. {t("Tối đa", "Up to")}{" "}
          {s.limits.maxPartners} {t("đối tác", "partners")}.
        </p>
        {s.discovery?.candidates.map((c) => (
          <p key={c.memberId}>
            <b>{c.name}</b> · {c.meters ?? "?"} m ·{" "}
            {c.eligible
              ? t("Đủ điều kiện liên hệ", "Eligible to contact")
              : c.group === "UNLINKED"
                ? t("Chưa liên kết", "Unlinked")
                : t("Chưa đủ điều kiện", "Not eligible")}{" "}
            {c.reasons.length > 0 && <small>{c.reasons.join(" · ")}</small>}
          </p>
        ))}
        <p>
          {t(
            "Đang mở cửa chưa phải đồng ý tiếp nhận. App không gọi số điện thoại hay cửa hàng công khai chưa tham gia.",
            "Open hours are not consent to receive someone. The app does not dial phone numbers or unlinked public businesses.",
          )}
        </p>
      </details>
    </section>
  );
}
