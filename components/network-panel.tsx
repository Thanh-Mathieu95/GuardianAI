"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Copy,
  ExternalLink,
  HeartHandshake,
  Share2,
  Plus,
  Smartphone,
  Store,
  Trash2,
  Users,
} from "lucide-react";
import type { Member, Settings } from "@/lib/network";
import { stores } from "@/lib/city";
import { post } from "./client";
import { rolePath } from "@/lib/links";
export default function NetworkPanel({
  onError,
  token,
}: {
  onError: (text: string) => void;
  token: string;
}) {
  const [members, setMembers] = useState<Member[]>([]),
    [settings, setSettings] = useState<Settings | null>(null),
    [role, setRole] = useState<"CONTACT" | "PARTNER">("CONTACT"),
    [name, setName] = useState(""),
    [category, setCategory] = useState(""),
    [slot, setSlot] = useState(""),
    [saved, setSaved] = useState(""),
    [pairLink, setPairLink] = useState(""),
    [publicUrl, setPublicUrl] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const d = await (await fetch("/api/network", { cache: "no-store" })).json();
      setMembers(d.members);
      setSettings(d.settings);
      setPublicUrl(d.publicUrl);
    } catch {
      onError("Không tải được mạng lưới.");
    }
  }, [onError]);
  useEffect(() => {
    void load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);
  async function run(fn: () => Promise<unknown>) {
    try {
      await fn();
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }
  // Links must open on a phone: use the tunnel when this page is on 127.0.0.1/localhost.
  const local = typeof window !== "undefined" && /^(127\.0\.0\.1|localhost|\[::1\])$/.test(window.location.hostname),
    base = !local && typeof window !== "undefined" ? window.location.origin : publicUrl || (typeof window !== "undefined" ? window.location.origin : ""),
    link = (m: Member) => `${base}${rolePath(m.token)}`;
  useEffect(() => { setPairLink(""); }, [base]);
  async function makePairLink() {
    try {
      const res = await fetch("/api/pair", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-operator-token": token },
          body: "{}",
        }),
        d = await res.json();
      if (!res.ok) throw new Error(d.error || "Không tạo được link");
      setPairLink(base + d.path);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }
  return (
    <section className="network-panel">
      <div className="section-title">
        <Users size={19} />
        <h2>Mạng lưới & an toàn</h2>
        <span className="pill">GỌI TRONG APP</span>
      </div>
      {local && !publicUrl && (
        <p className="tunnel-warning">
          Link bên dưới chỉ mở được trên máy này. Chạy <b>START-TUNNEL.cmd</b>, đợi dòng “LINK CÔNG KHAI”, rồi
          tạo lại link để mở trên điện thoại.
        </p>
      )}
      {publicUrl && <p className="tunnel-ok">Link qua tunnel: {publicUrl}</p>}
      <div className="pair-box">
        <Smartphone size={18} />
        <div>
          <b>Mở app người dùng trên điện thoại</b>
          <small>
            Điện thoại dùng chung sự cố với máy này: bấm SOS, nói chuyện với AI trên điện thoại,
            dashboard cập nhật theo. Link hết hạn sau 10 phút.
          </small>
          {pairLink && <code>{pairLink}</code>}
        </div>
        {pairLink ? (
          <button
            onClick={() =>
              void navigator.clipboard
                .writeText(pairLink)
                .then(() => onError("Đã sao chép link ghép điện thoại"))
                .catch(() => onError("Không sao chép được; chọn link để copy."))
            }
          >
            <Copy size={14} /> Sao chép
          </button>
        ) : (
          <button disabled={!token} onClick={() => void makePairLink()}>
            Tạo link
          </button>
        )}
      </div>
      {settings && (
        <div className="network-settings">
          <label>
            Tên của bạn
            <input
              value={settings.userName}
              onChange={(e) => setSettings({ ...settings, userName: e.target.value })}
            />
          </label>
          <label>
            Mật mã an toàn (nói câu này = SOS bí mật)
            <input
              value={settings.safePhrase}
              onChange={(e) => setSettings({ ...settings, safePhrase: e.target.value })}
            />
          </label>
          <label>
            Người gọi giả / vai khi SOS bí mật
            <input
              value={settings.fakeCaller}
              onChange={(e) => setSettings({ ...settings, fakeCaller: e.target.value })}
            />
          </label>
          <label>
            Thẻ nhận diện (gửi cho điểm tiếp nhận)
            <input
              placeholder="VD: áo khoác đỏ, balo đen"
              value={settings.appearance}
              onChange={(e) => setSettings({ ...settings, appearance: e.target.value })}
            />
          </label>
          <button
            onClick={() =>
              void run(async () => {
                const { reputation: _, ...patch } = settings;
                await post("/api/network/settings", patch);
                setSaved("Đã lưu · áp dụng cho phiên giọng nói tiếp theo");
              })
            }
          >
            Lưu cài đặt
          </button>
          <small>
            {saved || " "} Uy tín tài khoản: {settings.reputation} (báo động giả bị trừ điểm; ≤ −2
            thì chỉ báo người thân).
          </small>
        </div>
      )}
      <div className="member-list">
        {members.length === 0 && (
          <p className="fine-print">
            Chưa có thành viên. Thêm người thân và điểm đối tác, rồi mở link mời trên thiết bị
            khác.
          </p>
        )}
        {members.map((m) => (
          <div className="member" key={m.id}>
            {m.role === "PARTNER" ? <Store size={16} /> : <HeartHandshake size={16} />}
            <div>
              <b>{m.name}</b>
              <small>
                {m.role === "PARTNER" ? "Đối tác" : "Người thân"} · {m.category} ·{" "}
                {m.slot ? "đóng vai cửa hàng trên bản đồ · " : ""}
                {m.joined ? (m.role === "PARTNER" ? (m.onDuty ? "đang trực" : "nghỉ") : "đã tham gia") : "chờ mở link"}
              </small>
              <code>{link(m)}</code>
            </div>
            <a className="member-play" href={rolePath(m.token)} target="_blank" rel="noopener">
              <ExternalLink size={14} /> Vào vai
            </a>
            <button
              className="member-share"
              onClick={() => {
                const url = link(m);
                if (navigator.share)
                  void navigator
                    .share({ title: "Guardian AI", text: `Link vào vai ${m.name} trong Guardian AI`, url })
                    .catch(() => {});
                else
                  void navigator.clipboard
                    .writeText(url)
                    .then(() => onError("Đã sao chép link mời của " + m.name))
                    .catch(() => onError("Không sao chép được; chọn link để copy."));
              }}
            >
              <Share2 size={14} /> Gửi
            </button>
            <button
              aria-label="Sao chép link mời"
              onClick={() =>
                void navigator.clipboard
                  .writeText(link(m))
                  .then(() => onError("Đã sao chép link mời của " + m.name))
                  .catch(() => onError("Không sao chép được; chọn link để copy."))
              }
            >
              <Copy size={14} />
            </button>
            <button
              aria-label="Xóa thành viên"
              onClick={() => void run(() => post("/api/network/members/delete", { id: m.id }))}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      <div className="member-add">
        <select value={role} onChange={(e) => setRole(e.target.value as "CONTACT" | "PARTNER")}>
          <option value="CONTACT">Người thân</option>
          <option value="PARTNER">Điểm đối tác</option>
        </select>
        {role === "PARTNER" && (
          <select
            aria-label="Cửa hàng trên bản đồ"
            value={slot}
            onChange={(e) => {
              setSlot(e.target.value);
              const s = stores.find((x) => x.id === e.target.value);
              if (s) {
                setName(s.name);
                setCategory(s.category);
              }
            }}
          >
            <option value="">Vị trí mới trên bản đồ</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                Đóng vai: {s.name}
              </option>
            ))}
          </select>
        )}
        <input
          placeholder={role === "PARTNER" ? "VD: Khách sạn Hoa Sen" : "VD: Mẹ"}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          placeholder={role === "PARTNER" ? "Loại: lễ tân 24h" : "Quan hệ"}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
        <button
          className="primary"
          disabled={!name.trim()}
          onClick={() =>
            void run(async () => {
              await post("/api/network/members", {
                role,
                name,
                category,
                slot: role === "PARTNER" && slot ? slot : null,
              });
              setName("");
              setCategory("");
              setSlot("");
            })
          }
        >
          <Plus size={15} /> Thêm
        </button>
      </div>
      <p className="fine-print">
        Điện thoại cần HTTPS để dùng micro: chạy <code>START-TUNNEL.cmd</code>, link mời và link ghép
        sẽ tự dùng địa chỉ tunnel. Mỗi lần chạy lại tunnel, địa chỉ đổi, nên gửi lại link mới.
      </p>
    </section>
  );
}
