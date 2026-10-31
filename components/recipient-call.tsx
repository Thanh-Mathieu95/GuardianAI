"use client";
import { useEffect, useState } from "react";
import { PhoneCall, PhoneOff, MessageSquare, Send } from "lucide-react";
import type { AppCall } from "@/lib/coordination-types";
import { callLabels } from "@/lib/call-labels";
import { useLanguage } from "./language";
export function RecipientCall({
  call: c,
  api,
  busy,
}: {
  call: AppCall;
  api: (body: unknown) => Promise<boolean | void>;
  busy: boolean;
}) {
  const { locale, t } = useLanguage();
  const [text, setText] = useState("");
  const incoming = ["CALLING", "RINGING"].includes(c.state),
    connected = ["CONNECTED", "CONVERSING"].includes(c.state);
  const event = (kind: string) =>
    api({
      action: "call-event",
      incidentId: c.incidentId,
      callId: c.id,
      attempt: c.attempt,
      seq: c.seq,
      eventId: crypto.randomUUID(),
      kind,
    });
  useEffect(() => {
    if (c.state === "CALLING") void event("ringing");
  }, [c.id, c.attempt, c.state]);
  return (
    <section
      className="recipient-call"
      aria-label={t("Cuộc gọi riêng với Guardian", "Private Guardian call")}
    >
      <PhoneCall size={28} />
      <h2>
        {incoming
          ? t("Guardian đang gọi trong app", "Guardian is calling in the app")
          : t(
              "Hội thoại riêng với Guardian AI",
              "Private Guardian AI conversation",
            )}
      </h2>
      <p role="status">{callLabels[c.state][locale === "vi" ? 0 : 1]}</p>
      <small>
        {c.purpose === "INQUIRY"
          ? t(
              "Hỏi khả năng hỗ trợ · không phải giao nhiệm vụ",
              "Support inquiry · no task assigned yet",
            )
          : t(
              "Thông báo nhiệm vụ sau khi người dùng chấp nhận",
              "Task notification after user acceptance",
            )}
      </small>
      {c.task && <p>{c.task[locale === "vi" ? 0 : 1]}</p>}
      {incoming && (
        <div className="actions">
          <button
            className="primary"
            disabled={busy}
            onClick={() => void event("answer")}
          >
            <PhoneCall size={18} />
            {t("Nhận cuộc gọi", "Answer call")}
          </button>
          <button disabled={busy} onClick={() => void event("busy")}>
            {t("Đang bận", "Busy")}
          </button>
          <button disabled={busy} onClick={() => void event("decline")}>
            <PhoneOff size={17} />
            {t("Từ chối", "Decline")}
          </button>
        </div>
      )}
      <ol className="call-conversation">
        {c.turns.map((turn) => (
          <li
            key={turn.id}
            className={turn.who === "AI" ? "ai-turn" : "recipient-turn"}
          >
            <span>
              <MessageSquare size={13} />
              {turn.who === "AI" ? "Guardian AI" : t("Bạn", "You")}
            </span>
            <p>{turn.text}</p>
          </li>
        ))}
      </ol>
      {connected && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const message = text.trim();
            if (!message) return;
            void api({
              action: "call-message",
              incidentId: c.incidentId,
              callId: c.id,
              attempt: c.attempt,
              messageId: crypto.randomUUID(),
              text: message,
            }).then((success) => {
              if (success !== false) setText("");
            });
          }}
        >
          <label>
            {t("Trả lời AI trong cuộc gọi", "Reply to AI in this call")}
            <textarea
              required
              maxLength={2000}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <div className="actions">
            <button className="primary" disabled={busy || !text.trim()}>
              <Send size={16} />
              {t("Gửi lời cam kết", "Send your commitment")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void event("end")}
            >
              <PhoneOff size={16} />
              {t("Kết thúc cuộc gọi", "End call")}
            </button>
          </div>
        </form>
      )}
      <p>
        {t(
          "Chỉ cuộc trò chuyện của bạn hiển thị ở đây. Lời nói được gửi về bộ điều phối; AI không tự xác nhận bạn đã giúp xong.",
          "Only your conversation appears here. Statements go to the coordinator; AI cannot assume support is complete.",
        )}
      </p>
    </section>
  );
}
