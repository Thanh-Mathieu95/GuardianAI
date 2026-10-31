"use client";
import { useEffect, useState } from "react";
import { Copy, ExternalLink, Users, UserPlus } from "lucide-react";
import type { PublicAccount } from "@/lib/types";
import { useLanguage } from "./language";
export function TeamLobby({
  data,
  api,
  busy,
}: {
  data: PublicAccount;
  api: (url: string, body: unknown) => Promise<unknown>;
  busy: boolean;
}) {
  const { locale, t } = useLanguage();
  const [name, setName] = useState(""),
    [inviting, setInviting] = useState(false),
    [role, setRole] = useState("CONTACT"),
    [links, setLinks] = useState<{ name: string; url: string }[]>([]),
    [error, setError] = useState(""),
    [copied, setCopied] = useState("");
  useEffect(() => {
    try {
      setLinks(
        JSON.parse(
          sessionStorage.getItem("guardian-team-links-" + data.id) || "[]",
        ),
      );
    } catch {}
  }, [data.id]);
  async function invite() {
    if (inviting) return;
    setInviting(true);
    setError("");
    try {
      const result = (await api("members", { name, role })) as {
        token: string;
      };
      const next = [
        ...links,
        { name, url: `${location.origin}/join/${result.token}?lang=${locale}` },
      ];
      setLinks(next);
      setName("");
      try {
        sessionStorage.setItem(
          "guardian-team-links-" + data.id,
          JSON.stringify(next),
        );
      } catch {}
    } catch {
      setError(
        t(
          "Chưa tạo được lời mời. Hãy thử lại.",
          "Invitation could not be created. Please retry.",
        ),
      );
    } finally {
      setInviting(false);
    }
  }
  return (
    <section
      className="team-lobby"
      aria-label={t("Hồ sơ hỗ trợ", "Support profiles")}
    >
      <div className="team-heading">
        <Users size={24} />
        <div>
          <h1>{t("Hồ sơ hỗ trợ", "Support profiles")}</h1>
          <p>
            {t(
              "Bạn đóng vai người cần giúp. Mời người thân và điểm hỗ trợ; SOS chỉ gọi những thành viên này. Vị trí được mô phỏng, lời phản hồi do từng người tự gửi.",
              "You play the person needing help. Invite contacts and support venues; SOS calls only these members. Locations are simulated; each person sends their own response.",
            )}
          </p>
        </div>
      </div>
      <form
        className="team-invite-form"
        onSubmit={(e) => {
          e.preventDefault();
          void invite();
        }}
      >
        <label>
          {t("Tên thành viên", "Team member name")}
          <input
            value={name}
            required
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("Ví dụ: Dũng", "For example: Dung")}
          />
        </label>
        <label>
          {t("Vai nhập vai", "Role to play")}
          <select
            aria-label={t("Vai nhập vai", "Role to play")}
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="CONTACT">
              {t("Người thân / bạn bè", "Contact / friend")}
            </option>
            <option value="PARTNER">
              {t("Điểm tiếp nhận hỗ trợ", "Receiving venue")}
            </option>
          </select>
        </label>
        <button className="primary" disabled={busy || inviting || !name.trim()}>
          <UserPlus size={17} />
          {t("Tạo link nhập vai", "Create role link")}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {links.length > 0 && (
        <div className="team-invite-links">
          {links.map((link, n) => (
            <div key={n}>
              <b>{link.name}</b>
              <input
                readOnly
                aria-label={t(
                  `Link nhập vai của ${link.name}`,
                  `Role link for ${link.name}`,
                )}
                value={link.url}
                onFocus={(e) => e.target.select()}
              />
              <button
                onClick={() => {
                  void navigator.clipboard
                    .writeText(link.url)
                    .then(() => setCopied(link.url));
                }}
              >
                <Copy size={16} />
                {copied === link.url
                  ? t("Đã chép", "Copied")
                  : t("Chép link", "Copy link")}
              </button>
              <a
                className="button"
                href={link.url}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={16} />
                {t("Mở vai", "Open role")}
              </a>
            </div>
          ))}
        </div>
      )}
      <div className="team-readiness" aria-live="polite">
        {!data.members.length && (
          <p>
            {t(
              "Chưa có thành viên. Tạo link ở trên rồi gửi cho team.",
              "No members yet. Create a role link above and share it with your team.",
            )}
          </p>
        )}
        {data.members.map((m) => {
          const online =
            !!m.lastSeenAt && Date.now() - Date.parse(m.lastSeenAt) < 20000;
          const ready =
            m.joined &&
            m.callConsentAt &&
            online &&
            (m.role === "CONTACT" || (m.onDuty && m.location && m.profile));
          return (
            <div
              key={m.id}
              className={ready ? "team-member ready" : "team-member"}
            >
              <b>{m.name}</b>
              <span>
                {m.role === "CONTACT"
                  ? t("Người thân", "Contact")
                  : t("Điểm hỗ trợ", "Venue")}
              </span>
              <span>
                {!m.joined
                  ? t("Chờ mở link và tham gia", "Waiting to join")
                  : !m.callConsentAt
                    ? t("Chờ cho phép cuộc gọi", "Call permission needed")
                    : !online
                      ? t(
                          "Cần giữ trang vai đang mở",
                          "Keep the role page open",
                        )
                      : m.role === "PARTNER" &&
                          (!m.onDuty || !m.location || !m.profile)
                        ? t(
                            "Chọn điểm nhập vai để sẵn sàng",
                            "Choose a roleplay venue",
                          )
                        : t("Sẵn sàng nhận cuộc gọi", "Ready to receive calls")}
              </span>
            </div>
          );
        })}
      </div>
      <p className="subtle">
        {t(
          "Mỗi người mở link riêng, tham gia và giữ trang mở. Người vào sau SOS vẫn được đưa vào hàng đợi khi sẵn sàng. Chạy demo tự động dùng phòng dữ liệu khác.",
          "Each person opens their own link, joins and keeps it open. Late arrivals join the call queue when ready. The automatic demo uses a separate data room.",
        )}
      </p>
    </section>
  );
}
