"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  GitBranch,
  MapPin,
  MessageSquare,
  Play,
  Settings2,
  Users,
  X,
} from "lucide-react";
import type { Call, Incident } from "@/lib/types";
import {
  demoCases,
  demoLabels,
  emptyNeeds,
  type DemoCase,
} from "@/lib/support";

type State = Omit<Incident, "owner">;
type Tab = "activity" | "setup" | "changes";
const callLabels: Record<Call["status"], string> = {
  QUEUED: "Đang chờ",
  RINGING: "Đang liên hệ",
  CONNECTED: "Đang trao đổi",
  CONFIRMED: "Đã xác nhận",
  DECLINED: "Từ chối",
  NO_ANSWER: "Không phản hồi",
  FAILED: "Chưa đủ điều kiện",
};
const supportLabels = {
  WAITING_SPACE: "Chỗ chờ",
  STAFF_MEET: "Nhân viên đón",
  CONTACT_FAMILY: "Liên hệ người thân",
};
const contactLabels = {
  RINGING: "Đang gọi",
  ANSWERED: "Đã nghe",
  ON_THE_WAY: "Có thể đi đón",
  MISSED: "Chưa nghe",
  KEEP_CONTACT: "Giữ liên lạc",
  CANNOT_HELP: "Không thể giúp",
};
const time = (value: string) =>
  new Date(value).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
const readableCheck = (text: string) =>
  text.replace(
    /\b(UNKNOWN|CLARIFY|ACCEPTED|DECLINED|EXPIRED|REVOKED)\b/g,
    (value) =>
      ({
        UNKNOWN: "chưa rõ",
        CLARIFY: "cần làm rõ",
        ACCEPTED: "đồng ý",
        DECLINED: "từ chối",
        EXPIRED: "hết thời hạn",
        REVOKED: "đã thu hồi",
      })[value] ?? value,
  );

export default function AgentWorkbench({
  state,
  act,
  disabled,
  onOpenNetwork,
}: {
  state: State;
  act: (action: string, data?: object) => unknown;
  disabled: boolean;
  onOpenNetwork?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("activity");
  const [selectedId, setSelectedId] = useState("");
  const [scenario, setScenario] = useState<DemoCase>("CLARIFY");
  const [participants, setParticipants] = useState<"SIMULATED" | "NETWORK">("SIMULATED");
  const [text, setText] = useState("Tôi cần một nơi chờ hỗ trợ.");
  const [communication, setCommunication] = useState("");
  const [movement, setMovement] = useState("");
  const [maxWalk, setMaxWalk] = useState("");
  const [refusals, setRefusals] = useState("");
  const [familyMinutes, setFamilyMinutes] = useState("");
  const [update, setUpdate] = useState(
    "Đồng ý tiếp nhận, có chỗ chờ. Cửa vào: cửa sau. Điều kiện: không yêu cầu thêm. Tương tác kín đáo: có. Cần di chuyển: có. Qua ngõ: không.",
  );
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const n = state.needs ?? emptyNeeds();
    setCommunication(n.communication ?? "");
    setMovement(n.canMove === null ? "" : n.canMove ? "yes" : "no");
    setMaxWalk(n.maxWalkMeters === null ? "" : String(n.maxWalkMeters));
    setRefusals(n.refusals.join("\n"));
    setSelectedId("");
    setFamilyMinutes("");
    setParticipants(state.networkOnly ? "NETWORK" : "SIMULATED");
    // Keep draft fields while SSE updates the same incident.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.id]);
  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !panelRef.current?.contains(event.target) &&
        !toggleRef.current?.contains(event.target)
      )
        setOpen(false);
    };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open]);

  const plan = state.plans.find((p) => !p.superseded);
  const routeDecision = state.routeDecisions?.find(d => d.id === plan?.routeDecisionId);
  const name = (id?: string) => state.places.find((p) => p.id === id)?.name;
  const calls = state.calls.filter(
    (c, index, all) =>
      !all.slice(index + 1).some((other) => other.placeId === c.placeId),
  );
  const selectedCall = calls.find((c) => c.placeId === plan?.selectedPlaceId);
  const branch =
    calls.find((c) => c.id === selectedId) ?? selectedCall ?? calls[0];
  const support = branch?.support;
  const confirmed = calls.filter((c) => c.status === "CONFIRMED").length;
  const running = calls.filter((c) =>
    ["RINGING", "CONNECTED", "QUEUED"].includes(c.status),
  ).length;
  const locked =
    disabled || ["CLOSED", "USER_CANCELLED"].includes(state.status);
  const needs = {
    ...emptyNeeds(),
    communication:
      communication === "" ? null : (communication as "PUBLIC" | "DISCREET"),
    canMove: movement === "" ? null : movement === "yes",
    maxWalkMeters: maxWalk === "" ? null : Number(maxWalk),
    refusals: refusals
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  };
  const saved = state.needs ?? emptyNeeds();
  const needLabels = [
    saved.communication === "DISCREET"
      ? "Cần kín đáo"
      : saved.communication === "PUBLIC"
        ? "Nói công khai"
        : null,
    saved.canMove === false
      ? "Không thể di chuyển"
      : saved.canMove === true
        ? "Có thể di chuyển"
        : null,
    saved.maxWalkMeters !== null ? `Đi bộ ≤ ${saved.maxWalkMeters} m` : null,
    ...saved.refusals,
  ].filter(Boolean);
  const panelId = `agent-panel-${state.id}`;
  const close = () => {
    setOpen(false);
    toggleRef.current?.focus();
  };

  return (
    <section className="agent-workbench" aria-label="Hoạt động agent">
      <button
        ref={toggleRef}
        className="aw-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        <span className="aw-brand">
          <span className={`aw-signal${running ? " is-running" : ""}`}>
            <Activity size={15} />
          </span>
          <b>Hoạt động agent</b>
          <span className="aw-demo-label">{state.networkOnly ? "TRONG APP" : "DEMO"}</span>
        </span>
        <span className="aw-overview">
          <span>
            <GitBranch size={13} />
            {calls.length} nhánh
          </span>
          <span className={confirmed ? "aw-positive" : ""}>
            <CheckCircle2 size={13} />
            {confirmed} xác nhận
          </span>
          {plan && (
            <span className="aw-destination">
              {name(plan.selectedPlaceId)} · v{plan.revision}
            </span>
          )}
        </span>
        <span className="aw-toggle-end">
          {open ? "Thu gọn" : "Chi tiết"}
          <ChevronDown size={15} className={open ? "aw-chevron-open" : ""} />
        </span>
      </button>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          className="aw-panel"
          role="region"
          aria-label="Chi tiết hoạt động agent"
        >
          <header className="aw-panel-head">
            <nav className="aw-tabs" aria-label="Nội dung hoạt động agent">
              {(
                [
                  ["activity", "Theo dõi", Activity],
                  ["setup", "Kịch bản", Settings2],
                  ["changes", "Cập nhật", GitBranch],
                ] as const
              ).map(([key, label, Icon]) => (
                <button
                  key={key}
                  aria-pressed={tab === key}
                  className={tab === key ? "is-active" : ""}
                  onClick={() => setTab(key)}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </nav>
            <button
              className="aw-close"
              aria-label="Đóng bảng hoạt động agent"
              onClick={close}
            >
              <X size={16} />
            </button>
          </header>
          <div className="aw-content">
            {tab === "activity" && (
              <div className="aw-activity-layout">
                <div className="aw-branches">
                  <div className="aw-section-title">
                    <h3>Trao đổi với đối tác</h3>
                    <span>
                      {running
                        ? `${running} nhánh đang chạy`
                        : "Kết quả từng nhánh"}
                    </span>
                  </div>
                  {!calls.length ? (
                    <div className="aw-empty">
                      <MessageSquare size={24} />
                      <b>Chưa có cuộc trao đổi</b>
                      <p>Chọn kịch bản để bắt đầu demo trên một máy.</p>
                      <button onClick={() => setTab("setup")}>
                        Chọn kịch bản
                        <ArrowRight size={13} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div
                        className="aw-branch-picker"
                        aria-label="Chọn nhánh hội thoại"
                      >
                        {calls.map((c) => (
                          <button
                            key={c.id}
                            className={`aw-branch ${c.status}${branch?.id === c.id ? " is-selected" : ""}`}
                            aria-pressed={branch?.id === c.id}
                            onClick={() => setSelectedId(c.id)}
                          >
                            <span className="aw-status-dot" />
                            <span>
                              <b>{name(c.placeId)}</b>
                              <small>{callLabels[c.status]}</small>
                            </span>
                            {c.status === "CONFIRMED" && <Check size={14} />}
                          </button>
                        ))}
                      </div>
                      {branch && (
                        <div className="aw-branch-detail" key={branch.id}>
                          <div className="aw-branch-heading">
                            <b>{name(branch.placeId)}</b>
                            <span
                              className={`aw-mode${branch.dialogueMode === "AI_LIVE" ? " is-live" : ""}`}
                            >
                              {branch.dialogueMode === "AI_LIVE"
                                ? "AI thật · đối tác mô phỏng"
                                : branch.providerMode === "APP"
                                  ? "Đối tác trong app"
                                  : branch.dialogueMode === "SCRIPTED_FALLBACK"
                                    ? "Kịch bản dự phòng"
                                    : "Đang kết nối"}
                            </span>
                          </div>
                          <dl className="aw-facts">
                            {[
                              [
                                "Hỗ trợ",
                                support?.supportTypes
                                  .map((t) => supportLabels[t])
                                  .join(" · ") || "Chưa xác nhận",
                              ],
                              [
                                "Điểm gặp",
                                support?.entrance ?? "Chưa xác nhận",
                              ],
                              [
                                "Điều kiện",
                                support?.conditions.join("; ") || "Chưa làm rõ",
                              ],
                              [
                                "Thời hạn",
                                support?.validUntil
                                  ? `Nhận đến ${time(support.validUntil)}`
                                  : "Chưa cung cấp",
                              ],
                            ].map(([label, value]) => (
                              <div key={label}>
                                <dt>{label}</dt>
                                <dd>{value}</dd>
                              </div>
                            ))}
                          </dl>
                          {!!branch.checks?.length && (
                            <div className="aw-notice">
                              <Clock size={14} />
                              <span>
                                {readableCheck(branch.checks[0])}
                                {branch.checks.length > 1
                                  ? ` · ${branch.checks.length - 1} mục cần kiểm tra thêm`
                                  : ""}
                              </span>
                            </div>
                          )}
                          <details className="aw-disclosure">
                            <summary>
                              <MessageSquare size={14} />
                              Hội thoại
                              <span>{branch.transcript.length} lượt</span>
                              <ChevronDown size={14} />
                            </summary>
                            <div className="aw-transcript">
                              {branch.transcript.length ? (
                                branch.transcript.map((t, index) => (
                                  <article
                                    key={index}
                                    className={
                                      t.speaker === "Guardian AI"
                                        ? "aw-agent-message"
                                        : ""
                                    }
                                  >
                                    <header>
                                      <b>{t.speaker}</b>
                                      <time>{time(t.time)}</time>
                                    </header>
                                    <p>{t.text}</p>
                                  </article>
                                ))
                              ) : (
                                <p className="aw-muted">
                                  Chưa nhận được phản hồi.
                                </p>
                              )}
                            </div>
                          </details>
                          <details className="aw-disclosure">
                            <summary>
                              <CheckCircle2 size={14} />
                              Kiểm tra & bằng chứng
                              <ChevronDown size={14} />
                            </summary>
                            <div className="aw-evidence">
                              {branch.checks?.length ? (
                                branch.checks.map((check, index) => (
                                  <p key={index}>{readableCheck(check)}</p>
                                ))
                              ) : (
                                <p>
                                  {support
                                    ? "Dữ kiện hội thoại đã được kiểm tra. Tuyến và thời hạn được kiểm tra khi lập kế hoạch."
                                    : "Đang chờ dữ kiện."}
                                </p>
                              )}
                              {!!support?.missing.length && (
                                <p>
                                  Cần hỏi thêm: {support.missing.join("; ")}
                                </p>
                              )}
                              <small>
                                {support?.evidenceRefs.join(" · ") ||
                                  "Chưa có bằng chứng"}
                              </small>
                            </div>
                          </details>
                        </div>
                      )}
                    </>
                  )}
                </div>
                <aside className="aw-plan-card">
                  <div className="aw-section-title">
                    <h3>Phương án hiện tại</h3>
                    {plan && (
                      <span className="aw-revision">v{plan.revision}</span>
                    )}
                  </div>
                  {plan ? (
                    <>
                      <div className="aw-plan-destination">
                        <MapPin size={18} />
                        <h4>{name(plan.selectedPlaceId)}</h4>
                      </div>
                      <p className="aw-plan-state">
                        {state.status === "USER_CANCELLED"
                          ? "Yêu cầu đã hủy"
                          : state.status === "CLOSED"
                            ? "Phiên đã kết thúc"
                            : plan.acceptedAt
                              ? "Đã chấp nhận · đang hướng dẫn"
                              : "Chờ người dùng chấp nhận"}
                      </p>
                      <p className="aw-plan-summary">
                        {selectedCall?.support?.entrance
                          ? `Đón tại ${selectedCall.support.entrance}. `
                          : ""}
                        {selectedCall?.support?.conditions.join("; ")}
                      </p>
                      {plan.coordination && (
                        <div className="aw-coordination">
                          <span>{plan.coordination.mode === "AI_LIVE" ? "GPT kết hợp đề xuất của mọi người" : "Phân vai theo quy tắc"}</span>
                          <p>{plan.coordination.summary}</p>
                          <ul>
                            {plan.coordination.assignments.map((a) => (
                              <li key={a.ref} data-role={a.role}>
                                <b>{a.who}</b> <em>{({ PRIMARY: "Chính", SUPPORT: "Phối hợp", BACKUP: "Dự phòng", UNUSED: "Chưa dùng" })[a.role]}</em>
                                <p>{a.instruction}</p>
                                <small>{a.reason}</small>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="aw-backup">
                        <span>Dự phòng</span>
                        <b>{name(plan.backupPlaceId) ?? "Chưa có"}</b>
                      </div>
                      <details className="aw-disclosure">
                        <summary>
                          Lý do & so sánh
                          <ChevronDown size={14} />
                        </summary>
                        <div className="aw-evidence">
                          {plan.reasons.map((reason, index) => (
                            <p key={index}>{reason}</p>
                          ))}
                          {routeDecision && <>
                            <b>Agent tuyến · {routeDecision.mode === "AI_LIVE" ? "GPT đã đánh giá tuyến" : routeDecision.mode === "SINGLE_OPTION" ? "Chỉ có một tuyến từ nguồn" : "Chọn theo quy tắc dự phòng"}</b>
                            {routeDecision.fallbackReason && <p>{routeDecision.fallbackReason}</p>}
                            {routeDecision.candidates.filter(o => o.placeId === plan.selectedPlaceId).map(o => <div key={o.route.id}>
                              <b>{o.route.id === plan.route.id ? "Tuyến được chọn" : "Tuyến khác"} · {o.route.distanceMeters ?? "?"} m</b>
                              <p>{o.eligible ? routeDecision.assessments.find(a => a.routeId === o.route.id)?.reasons.join("; ") : o.checks.join("; ")}</p>
                              <small>{o.route.sourceKind} · {o.evidenceRefs.join(" · ")}</small>
                            </div>)}
                          </>}
                          {plan.comparisons?.map((c) => (
                            <div key={c.placeId}>
                              <b>{name(c.placeId)}</b>
                              <p>{c.reasons.join("; ")}</p>
                              <small>
                                {c.evidenceRefs.join(" · ") ||
                                  "Chưa có phản hồi"}
                              </small>
                            </div>
                          ))}
                        </div>
                      </details>
                      <details className="aw-disclosure">
                        <summary>Hồ sơ và lịch sử quyết định<ChevronDown size={14} /></summary>
                        <div className="aw-evidence">
                          <p>Agent tuyến: {({ WATCHING: "đang theo dõi", ASSESSING: "đang đánh giá", PAUSED: "chờ phương án hợp lệ", STOPPED: "đã dừng" })[state.routeAgent?.status ?? "PAUSED"]}. Lưu lịch sử kế hoạch và bằng chứng theo từng cập nhật.</p>
                          <a href={`/api/incidents/${state.id}/evidence`} target="_blank" rel="noreferrer">Mở báo cáo / in PDF</a>{" · "}
                          <a href={`/api/incidents/${state.id}/report-history`} target="_blank" rel="noreferrer">Lịch sử dữ liệu & chuỗi băm JSON</a>
                        </div>
                      </details>
                      <div className="aw-plan-actions">
                        <button
                          className="aw-primary"
                          disabled={locked || !!plan.acceptedAt}
                          onClick={() =>
                            act("route/accept", { planId: plan.id })
                          }
                        >
                          <Check size={14} />
                          {plan.acceptedAt
                            ? "Đã chấp nhận"
                            : "Chấp nhận phương án"}
                        </button>
                        {plan.acceptedAt && (
                          <>
                            <button
                              disabled={locked || !!state.handoff?.userAt}
                              onClick={() =>
                                act("handoff", {
                                  side: "USER",
                                  planId: plan.id,
                                })
                              }
                            >
                              <Users size={14} />
                              {state.handoff?.userAt
                                ? "Đã báo gặp nhân viên"
                                : "Tôi đã gặp nhân viên"}
                            </button>
                            {state.simulatorOnly && (
                              <button
                                disabled={locked || !!state.handoff?.partnerAt}
                                onClick={() =>
                                  act("handoff", {
                                    side: "PARTNER",
                                    planId: plan.id,
                                  })
                                }
                              >
                                {state.handoff?.partnerAt
                                  ? "Điểm đến đã xác nhận"
                                  : "Điểm đến xác nhận tiếp nhận"}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="aw-empty">
                      <MapPin size={24} />
                      <b>
                        {state.running
                          ? "Đang tìm phương án phù hợp"
                          : "Chưa có phương án tiếp nhận"}
                      </b>
                      <p>Chỉ đề xuất khi đã kiểm tra đủ điều kiện.</p>
                    </div>
                  )}
                  {state.handoff?.completedAt && (
                    <div className="aw-complete">
                      <CheckCircle2 size={16} />
                      Đã hoàn thành bàn giao hai chiều
                    </div>
                  )}
                </aside>
              </div>
            )}

            {tab === "setup" && (
              <div className="aw-setup-layout">
                <div className="aw-setup-main">
                  <div className="aw-section-title">
                    <h3>Chuẩn bị demo</h3>
                    <span>{participants === "NETWORK" ? "Mỗi người có một phiên AI riêng" : "Thực hiện trên một máy"}</span>
                  </div>
                  <label>Người tham gia<select value={participants} onChange={e => setParticipants(e.target.value as "SIMULATED" | "NETWORK")}><option value="SIMULATED">Một máy · đối tác mô phỏng</option><option value="NETWORK">Nhiều máy · người trong mạng lưới</option></select></label>
                  {participants === "NETWORK" && <div className="aw-notice"><Users size={14} /><span>Thêm đối tác/người thân trong Mạng lưới, gửi link HTTPS và đợi họ đồng ý tham gia. Bật AI cho phiên nếu muốn nói chuyện bằng giọng nói.{onOpenNetwork && <button onClick={onOpenNetwork}>Mở Mạng lưới</button>}</span></div>}
                  {participants === "SIMULATED" && <>
                  <label>
                    Kịch bản
                    <select
                      value={scenario}
                      onChange={(e) => setScenario(e.target.value as DemoCase)}
                    >
                      {demoCases.map((key) => (
                        <option key={key} value={key}>
                          {demoLabels[key]}
                        </option>
                      ))}
                    </select>
                  </label>
                  </>}
                  <label>
                    Tình huống
                    <textarea
                      rows={2}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                    />
                  </label>
                  <div className="aw-form-grid">
                    <label>
                      Giao tiếp
                      <select
                        value={communication}
                        onChange={(e) => setCommunication(e.target.value)}
                      >
                        <option value="">Chưa cung cấp</option>
                        <option value="PUBLIC">Có thể nói công khai</option>
                        <option value="DISCREET">Cần kín đáo</option>
                      </select>
                    </label>
                    <label>
                      Di chuyển
                      <select
                        value={movement}
                        onChange={(e) => setMovement(e.target.value)}
                      >
                        <option value="">Chưa cung cấp</option>
                        <option value="yes">Có thể tiếp tục</option>
                        <option value="no">Không thể tiếp tục</option>
                      </select>
                    </label>
                    <label>
                      Đi bộ tối đa (m)
                      <input
                        type="number"
                        min="0"
                        max="20000"
                        placeholder="Chưa cung cấp"
                        value={maxWalk}
                        onChange={(e) => setMaxWalk(e.target.value)}
                      />
                    </label>
                    <label>
                      Điều cần tránh
                      <textarea
                        rows={1}
                        placeholder="Mỗi dòng một điều"
                        value={refusals}
                        onChange={(e) => setRefusals(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="aw-form-actions">
                    <button
                      className="aw-primary"
                      disabled={disabled || !text.trim()}
                      onClick={() => {
                        setTab("activity");
                        void act(scenario === "SHOWCASE" && participants === "SIMULATED" ? "demo/showcase" : "demo/run", scenario === "SHOWCASE" && participants === "SIMULATED" ? {} : {
                          demoCase: scenario,
                          needs,
                          text,
                          participants,
                        });
                      }}
                    >
                      <Play size={14} />
                      Reset & chạy kịch bản
                    </button>
                    <button
                      disabled={locked}
                      onClick={() => act("needs", needs)}
                    >
                      Lưu giới hạn cho phiên này
                    </button>
                  </div>
                </div>
                <aside className="aw-context-card">
                  <Settings2 size={20} />
                  <h3>Giới hạn đang áp dụng</h3>
                  {needLabels.length ? (
                    <div className="aw-chips">
                      {needLabels.map((label, index) => (
                        <span key={index}>{label}</span>
                      ))}
                    </div>
                  ) : (
                    <p>
                      Người dùng chưa cung cấp giới hạn. Thông tin thiếu được
                      giữ là chưa biết.
                    </p>
                  )}
                  <div className="aw-context-note">
                    <b>Demo trong ứng dụng</b>
                    <p>{participants === "NETWORK" ? "Gọi các thành viên đã đồng ý tham gia trong app. Không gọi số điện thoại thật." : "Đối tác mô phỏng. Không gọi số điện thoại thật."}</p>
                    <p>
                      Nhánh dùng AI hoặc kịch bản dự phòng được gắn nhãn riêng.
                    </p>
                  </div>
                </aside>
              </div>
            )}

            {tab === "changes" && (
              <div className="aw-setup-layout">
                <div className="aw-setup-main">
                  <div className="aw-section-title">
                    <h3>Cập nhật từ đối tác</h3>
                    <span>
                      {name(plan?.selectedPlaceId) ?? "Chưa chọn điểm đến"}
                    </span>
                  </div>
                  {selectedCall && state.simulatorOnly ? (
                    <>
                      <label>
                        Phản hồi mới
                        <textarea
                          rows={3}
                          value={update}
                          onChange={(e) => setUpdate(e.target.value)}
                        />
                      </label>
                      <div className="aw-form-actions">
                        <button
                          className="aw-primary"
                          disabled={locked || !update.trim()}
                          onClick={() =>
                            act("demo/update", {
                              callId: selectedCall.id,
                              generation: selectedCall.generation,
                              text: update,
                            })
                          }
                        >
                          Gửi thay đổi cửa / điều kiện
                        </button>
                        <button
                          className="aw-danger"
                          disabled={locked}
                          onClick={() =>
                            act("demo/update", {
                              callId: selectedCall.id,
                              generation: selectedCall.generation,
                              text: "Rút lại xác nhận, không còn tiếp nhận.",
                            })
                          }
                        >
                          Thu hồi tiếp nhận
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="aw-muted">
                      Phần này khả dụng khi demo một máy đã có điểm tiếp nhận.
                    </p>
                  )}
                  <div className="aw-family">
                    <h3>Người thân</h3>
                    {state.contacts.map((c) => (
                      <p key={c.memberId}>
                        <span>{c.name}</span>
                        <b>
                          {contactLabels[c.status]}
                          {c.arrivalMinutes !== undefined
                            ? ` · tự báo ${c.arrivalMinutes} phút`
                            : ""}
                        </b>
                      </p>
                    ))}
                    {!state.contacts.length && (
                      <p className="aw-muted">
                        Chưa có cập nhật từ người thân.
                      </p>
                    )}
                    {state.simulatorOnly && (
                      <>
                        <label>
                          Thời gian đến do người thân tự báo
                          <input
                            type="number"
                            min="0"
                            max="1440"
                            placeholder="Chưa biết · phút"
                            value={familyMinutes}
                            onChange={(e) => setFamilyMinutes(e.target.value)}
                          />
                        </label>
                        <div className="aw-form-actions">
                          {[
                            ["KEEP_CONTACT", "Giữ liên lạc"],
                            ["ON_THE_WAY", "Đi đón"],
                            ["CANNOT_HELP", "Không thể giúp"],
                          ].map(([action, label]) => (
                            <button
                              key={action}
                              disabled={locked}
                              onClick={() =>
                                act("demo/family", {
                                  action,
                                  ...(familyMinutes !== "" &&
                                  action === "ON_THE_WAY"
                                    ? { arrivalMinutes: Number(familyMinutes) }
                                    : {}),
                                })
                              }
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <aside className="aw-context-card">
                  <div className="aw-section-title">
                    <h3>Lịch sử phương án</h3>
                    <span>{state.plans.length} phiên bản</span>
                  </div>
                  {state.plans.length ? (
                    <ol className="aw-history">
                      {state.plans.map((p) => (
                        <li
                          key={p.id}
                          className={p.superseded ? "is-superseded" : ""}
                        >
                          <span className="aw-revision">v{p.revision}</span>
                          <div>
                            <b>{name(p.selectedPlaceId)}</b>
                            <small>
                              {p.superseded
                                ? "Đã mất hiệu lực"
                                : p.acceptedAt
                                  ? "Đã chấp nhận"
                                  : "Đang đề xuất"}{" "}
                              · {time(p.createdAt)}
                            </small>
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p>Chưa có phương án.</p>
                  )}
                  {state.handoff && (
                    <div className="aw-context-note">
                      <b>Bàn giao hai chiều</b>
                      <p>
                        {state.handoff.userAt
                          ? "✓ Người dùng đã xác nhận"
                          : "○ Chờ người dùng"}
                      </p>
                      <p>
                        {state.handoff.partnerAt
                          ? "✓ Điểm đến đã xác nhận"
                          : "○ Chờ điểm đến"}
                      </p>
                    </div>
                  )}
                </aside>
              </div>
            )}
          </div>
          <footer className="aw-panel-foot">
            <span>
              <span className="aw-status-dot" />
              Chỉ trao đổi trong ứng dụng
            </span>
            <span>ETA chưa biết khi thiếu nguồn live</span>
          </footer>
        </div>
      )}
    </section>
  );
}
