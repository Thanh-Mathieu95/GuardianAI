"use client";
import type { Incident } from "@/lib/types";
import { venueCode } from "@/lib/map-places";
type State = Omit<Incident, "owner">;

type Clause = { code?: string; key: string; role: string; who: string; text: string; quote?: string; state: "sealed" | "ok" | "pending" | "struck"; status: string; at?: string };

const roleLabel = { PRIMARY: "Nơi đến", SUPPORT: "Hỗ trợ", BACKUP: "Dự phòng", UNUSED: "Chưa dùng" } as const;
const hhmm = (t?: string) => (t ? new Date(t).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : "");

function clauses(s: State): Clause[] {
  const plan = s.plans.find(p => !p.superseded);
  const roles = new Map(plan?.coordination?.assignments.map(a => [a.ref, a]) ?? []);
  const out: Clause[] = [];
  for (const c of s.calls) {
    if (c.status === "QUEUED") continue;
    const ref = "call:" + c.id, a = roles.get(ref), place = s.places.find(p => p.id === c.placeId);
    const revoked = c.status === "DECLINED" || c.status === "FAILED" || c.status === "NO_ANSWER" || c.support?.decision === "DECLINED";
    const chosen = plan?.selectedPlaceId === c.placeId && !revoked;
    out.push({
      key: ref, who: place?.name ?? c.placeId, code: venueCode(s.places, c.placeId),
      role: chosen ? roleLabel.PRIMARY : a ? roleLabel[a.role] : revoked ? "Không nhận" : c.status === "CONFIRMED" ? "Sẵn sàng nhận" : "Đang gọi",
      status: revoked ? ({ DECLINED: "Rút lại", NO_ANSWER: "Không nghe", FAILED: "Lỗi gọi" } as Record<string, string>)[c.status] ?? "Rút lại" : c.status === "CONFIRMED" || chosen ? "Đã nhận" : "Đang gọi",
      text: a?.instruction || c.offer?.text || (revoked ? "Không thể tiếp nhận." : c.status === "CONFIRMED" ? "Đồng ý tiếp nhận." : "Chờ trả lời."),
      quote: c.offer?.quote,
      state: revoked ? "struck" : chosen && plan?.acceptedAt ? "sealed" : chosen || c.status === "CONFIRMED" ? "ok" : "pending",
      at: plan?.acceptedAt,
    });
  }
  for (const c of s.contacts) {
    const ref = "contact:" + c.memberId, a = roles.get(ref);
    const struck = c.status === "CANNOT_HELP" || c.status === "MISSED";
    const base = (a?.instruction || c.offer?.text || "").replace(/[.s]+$/, "");
    const eta = c.status === "ON_THE_WAY" && c.arrivalMinutes && !/phút/.test(base) ? `, khoảng ${c.arrivalMinutes} phút` : "";
    out.push({
      key: ref, who: c.name,
      role: a ? roleLabel[a.role] : c.status === "ON_THE_WAY" ? "Đang tới" : c.status === "KEEP_CONTACT" ? "Giữ liên lạc" : struck ? "Không giúp được" : "Đang gọi",
      text: (base || ({ RINGING: "Đang đổ chuông.", ANSWERED: "Đã nghe máy.", ON_THE_WAY: "Đang tới", MISSED: "Chưa nghe máy.", KEEP_CONTACT: "Giữ máy theo dõi.", CANNOT_HELP: "Không thể giúp." })[c.status]) + eta,
      status: ({ RINGING: "Đang gọi", ANSWERED: "Đã nghe", ON_THE_WAY: c.arrivalMinutes ? `Tới sau ${c.arrivalMinutes}′` : "Đang tới", MISSED: "Không nghe", KEEP_CONTACT: "Giữ máy", CANNOT_HELP: "Không giúp" } as Record<string, string>)[c.status],
      quote: c.offer?.quote,
      state: struck ? "struck" : c.status === "ON_THE_WAY" || c.status === "KEEP_CONTACT" ? "ok" : "pending",
    });
  }
  const rank = { sealed: 0, ok: 1, pending: 2, struck: 3 }, role = (c: Clause) => ["Nơi đến", "Hỗ trợ", "Đang tới", "Giữ liên lạc", "Dự phòng"].indexOf(c.role) + 1 || 9;
  return out.sort((x, y) => rank[x.state] - rank[y.state] || role(x) - role(y));
}

function Seal({ at }: { at?: string }) {
  return (
    <svg className="seal" viewBox="0 0 100 100" role="img" aria-label={`Đã xác nhận lúc ${hhmm(at)}`}>
      <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="3" />
      <circle cx="50" cy="50" r="39" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <text x="50" y="39" textAnchor="middle" fontSize="10" fontWeight="700" letterSpacing="1.5">ĐÃ</text>
      <text x="50" y="56" textAnchor="middle" fontSize="12.5" fontWeight="700" letterSpacing=".6">XÁC NHẬN</text>
      <text x="50" y="71" textAnchor="middle" fontSize="10" fontWeight="600">{hhmm(at)}</text>
    </svg>
  );
}

export default function Minute({ state }: { state: State }) {
  const list = clauses(state);
  const plan = state.plans.find(p => !p.superseded);
  return (
    <section className="minute" aria-label="Biên bản điều phối">
      <header>
        <h3>Biên bản điều phối</h3>
        <p>{state.metrics.sosAt ? `Lập lúc ${hhmm(state.metrics.sosAt)}${plan ? ` · kế hoạch v${plan.revision}` : ""}` : "Chưa có yêu cầu hỗ trợ"}</p>
      </header>
      {list.length === 0 ? (
        <p className="minute-empty">
          Khi AI gọi người thân và địa điểm quanh đó, mỗi lời nhận giúp sẽ thành một điều khoản ở đây, kèm câu họ nói. <span className="blank" />
        </p>
      ) : (
        <ol>
          {list.map((c, n) => (
            <li key={c.key} className={c.state}>
              <span className="clause-head"><span className="clause-no">Điều {n + 1} · {c.role}</span><span className="clause-status">{c.status}</span></span>
              <b>{c.code && <span className="code">{c.code}</span>}{c.who}</b>
              {c.state === "pending" ? <span className="blank" aria-label="chờ trả lời" /> : c.state !== "struck" && <p>{c.text}</p>}
              {c.quote && c.state === "sealed" && <q>{c.quote}</q>}
              {c.state === "sealed" && <Seal at={c.at} />}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
