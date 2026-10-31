"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  AudioLines,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  Expand,
  FileText,
  Maximize2,
  Minimize2,
  Eye,
  Keyboard,
  Layers,
  MapPin,
  Mic,
  Navigation,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  PhoneCall,
  Phone,
  Play,
  Radio,
  RefreshCw,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Square,
  TriangleAlert,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import type { Adapter, AgentName, Call, Incident, Point, Scenario } from "@/lib/types";
import Map3D from "./map3d";
import type { AIState, AIProvider } from "@/lib/ai";
import Companion, { type Signal } from "./companion";
import { subscribe } from "./client";
import NetworkPanel from "./network-panel";
import AgentWorkbench from "./agent-workbench";
import Showcase from "./showcase";
import Minute from "./minute";
import PlaceDirectory from "./place-directory";
import { assessPlace, serviceLabels } from "@/lib/place-context";
import { mapPlaceAppearance, visibleMapPlaces } from "@/lib/map-places";
type State = Omit<Incident, "owner">;
type PublicAI = {
  configured: boolean;
  provider: AIProvider | null;
  model: string | null;
  local: boolean;
  message: string;
};
const aiState = (s: State): AIState =>
  s.ai || { enabled: false, status: "OFF", busy: false, runs: [] };
const missingAI: PublicAI = {
  configured: false,
  provider: null,
  model: null,
  local: false,
  message: "Chưa cấu hình AI. Chạy SETUP-AI.cmd để kết nối model.",
};
type RecognitionEvent = {
  results: { [index: number]: { [index: number]: { transcript: string } } };
};
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
declare global {
  interface Window {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  }
}
const clock = (s: string) =>
  new Date(s).toLocaleTimeString("vi-VN", { hour12: false });
const elapsed = (ms: number) =>
  `${Math.floor(ms / 60000)
    .toString()
    .padStart(2, "0")}:${Math.floor((ms % 60000) / 1000)
    .toString()
    .padStart(2, "0")}`;
const agents: AgentName[] = [
  "Voice",
  "Risk",
  "Research",
  "Verification",
  "Calling",
  "Route",
];
const scenarioLabels: Record<Scenario, string> = {
  NIGHT_WALK: "Đi bộ ban đêm",
  CANNOT_TALK: "Không thể nói chuyện",
  ROAD_BLOCKED: "Tuyến đường bị chặn",
  ALL_UNAVAILABLE: "Tất cả từ chối",
  LOCATION_LOST: "Mất vị trí GPS",
};
const statusLabel: Record<string, string> = {
  ACTIVE_TRIP: "Đang đồng hành",
  SOS_RECEIVED: "Đã nhận SOS",
  AWAITING_CONFIRMATION: "Cần xác nhận SOS",
  TRIAGE: "Đánh giá yêu cầu",
  SEARCHING: "Đang tìm địa điểm",
  CONTACTING: "Đang liên hệ",
  ROUTE_PROPOSED: "Có tuyến đề xuất",
  GUIDING: "Đang hướng dẫn",
  REPLANNING: "Đang lập lại kế hoạch",
  NO_RESPONDERS: "Chưa có nơi tiếp nhận",
  LOCATION_UNAVAILABLE: "Cần cập nhật vị trí",
  CLOSED: "Đã kết thúc",
  USER_CANCELLED: "Đã hủy",
};
export default function Dashboard({ view }: { view: string }) {
  const [live, setLive] = useState<State | null>(null),
    [token, setToken] = useState(""),
    [online, setOnline] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [presentation, setPresentation] = useState(false),
    [spotlight, setSpotlight] = useState(""),
    [tab, setTab] = useState("agents"),
    [replay, setReplay] = useState<State[] | null>(null),
    [replayIndex, setReplayIndex] = useState(0),
    [filter, setFilter] = useState("ALL"),
    [signal, setSignal] = useState<Signal | null>(null),
    [selectedPlace, setSelectedPlace] = useState(""),
    [showClosedPlaces, setShowClosedPlaces] = useState(false),
    [hideLeft, setHideLeft] = useState(false),
    [hideRight, setHideRight] = useState(false),
    [bare, setBare] = useState(false);
  const [scenario, setScenario] = useState<Scenario>("NIGHT_WALK"),
    [zone, setZone] = useState<"HANOI" | "HCM">("HANOI"),
    [mode, setMode] = useState<"SIMULATION" | "TEST_LIVE">("SIMULATION"),
    [placesAdapter, setPlacesAdapter] = useState<Adapter>("CITY"),
    [routeAdapter, setRouteAdapter] = useState<Adapter>("CITY"),
    [realConsent, setRealConsent] = useState(false),
    [numbers, setNumbers] = useState(""),
    [password, setPassword] = useState(""),
    [aiConfig, setAIConfig] = useState<PublicAI>(missingAI),
    [integrations, setIntegrations] = useState({
      google: false,
      gateway: false,
    });
  const state = replay?.[replayIndex] || live;
  const mounted = useRef(true);
  useEffect(() => { setSelectedPlace(""); setShowClosedPlaces(false); }, [live?.id]);
  useEffect(() => {
    if (state && selectedPlace && !visibleMapPlaces(state, showClosedPlaces).some(p => p.id === selectedPlace)) setSelectedPlace("");
  }, [state, selectedPlace, showClosedPlaces]);
  useEffect(() => {
    mounted.current = true;
    fetch("/api/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (!mounted.current) return;
        setLive(data.incident);
        setToken(data.operatorToken || "");
        setIntegrations(data.integrations);
        setAIConfig(data.integrations.ai || missingAI);
      })
      .catch(() =>
        setError("Không kết nối được backend. Kiểm tra server local."),
      );
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!live?.id) return;
    return subscribe<State, Omit<Signal, "at">>(`/api/incidents/${live.id}`, {
      state: setLive,
      signal: (s) => setSignal({ ...s, at: Date.now() }),
      online: setOnline,
    });
  }, [live?.id]);
  useEffect(() => {
    if (!replay) return;
    const timer = setInterval(
      () => setReplayIndex((n) => Math.min(n + 1, replay.length - 1)),
      900,
    );
    return () => clearInterval(timer);
  }, [replay]);
  const act = useCallback(
    async (action: string, body: unknown = {}, root = false) => {
      if (replay) {
        setError("Đang xem REPLAY. Trở về hiện tại trước khi thao tác.");
        return;
      }
      if (!live) return;
      setBusy(true);
      setError("");
      try {
        const response = await fetch(
            root ? `/api/${action}` : `/api/incidents/${live.id}/${action}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-operator-token": token,
              },
              body: JSON.stringify(body),
            },
          ),
          data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (data.operatorToken) {
          setToken(data.operatorToken);
          setPassword("");
        } else if (data.id) setLive(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [live, token, replay],
  );
  // Demo control for the simulated city: walk / wrong turn / jump. Returns false on failure.
  async function simMove(body: { action: string; lat?: number; lng?: number }) {
    if (!live || replay) return false;
    try {
      const res = await fetch(`/api/incidents/${live.id}/sim/move`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-operator-token": token },
          body: JSON.stringify(body),
        }),
        data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }
  async function replayEvents() {
    if (!live) return;
    try {
      const r = await fetch(`/api/incidents/${live.id}/replay`);
      if (!r.ok) throw new Error("Không tải được replay");
      const snapshots = await r.json();
      if (!snapshots.length) throw new Error("Chưa có lịch sử");
      setReplay(snapshots);
      setReplayIndex(0);
    } catch (e) {
      setError(String(e));
    }
  }
  function download() {
    if (!live) return;
    const blob = new Blob([JSON.stringify(live, null, 2)], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `${live.id}-audit.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  if (!state)
    return (
      <main className="loading">
        <Shield size={52} />
        <h1>
          GUARDIAN<span>AI</span>
        </h1>
        <p>{error || "Đang kết nối trung tâm điều phối…"}</p>
      </main>
    );
  const plan = state.plans.find((p) => !p.superseded),
    selected = state.places.find((p) => p.id === plan?.selectedPlaceId),
    closed = ["CLOSED", "USER_CANCELLED"].includes(state.status);
  const ai = aiState(state);
  const start = () =>
    act(
      "incidents",
      {
        scenario,
        zone,
        mode,
        placesAdapter,
        routeAdapter,
        aiEnabled: ai.enabled,
        aiConsent: ai.enabled,
      },
      true,
    );
  const startCalls = () =>
    act("calls/start", {
      provider: state.mode === "SIMULATION" ? "MOCK" : "REAL_TEST",
      numbers: numbers
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean),
      consent: realConsent,
    });
  const sosActive = !!state.metrics.sosAt && !closed;
  const phone = (
    <PhonePanel
      state={state}
      act={act}
      busy={busy || !!replay}
      onError={setError}
      aiConfig={aiConfig}
      onOpenAI={() => setSpotlight("ai")}
      onOpenNetwork={() => setSpotlight("network")}
      signal={signal}
    />
  );
  const mapEl = (
    <IncidentMap
      state={state}
      selected={selectedPlace}
      showClosed={showClosedPlaces}
      onShowClosed={setShowClosedPlaces}
      onSelect={setSelectedPlace}
      onMove={simMove}
      onDecide={(placeId, accept) => act("place/decide", { placeId, accept })}
    />
  );
  const calls = (
    <div className="call-list">
      {state.metrics.sosAt && state.places.length ? (
        state.places.slice(0, 3).map((p, idx) => {
          const c = state.calls.filter((c) => c.placeId === p.id).at(-1);
          return <CallLane key={p.id} call={c} name={p.name} index={idx} />;
        })
      ) : (
        <Empty text="Các cuộc gọi xuất hiện sau khi Research tìm được ứng viên." />
      )}
    </div>
  );
  const decision = (
    <div className="decision">
      <div className="eyebrow">
        <ShieldCheck size={15} /> COORDINATOR DECISION{" "}
        {plan && <span>v{plan.revision}</span>}
      </div>
      <h3>{selected ? selected.name : "Chưa chọn điểm hỗ trợ"}</h3>
      {plan ? (
        <>
          <p className="confirmed">
            <CheckCircle2 size={15} /> SUPPORT CONFIRMED ·{" "}
            {plan.selectedPlaceId.startsWith("partner-")
              ? "APP ĐỐI TÁC"
              : state.mode === "SIMULATION"
                ? "MOCK"
                : "TEST CALL"}
          </p>
          {plan.reasons.map((r) => (
            <p key={r} className="reason">
              <Check size={14} />
              {r}
            </p>
          ))}
          <small>Bằng chứng: {plan.evidenceRefs.join(" · ")}</small>
        </>
      ) : (
        <p>Chỉ chọn điểm có xác nhận tiếp nhận và có tuyến khả dụng.</p>
      )}
    </div>
  );
  const controls = (
    <div className="controls-content">
      <div className="section-title">
        <SlidersHorizontal size={19} />
        <h2>Điều khiển demo</h2>
        <span className="pill">OPERATOR</span>
      </div>
      <AISettings
        state={state}
        config={aiConfig}
        token={token}
        act={act}
        onConfig={setAIConfig}
        onError={setError}
      />
      <NetworkPanel onError={setError} token={token} />
      {!token && (
        <div className="login">
          <label>
            Mật khẩu operator
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <button onClick={() => act("operator/login", { password }, true)}>
            Mở điều khiển
          </button>
        </div>
      )}
      <div className="settings-grid">
        <label>
          Tình huống
          <select
            value={scenario}
            onChange={(e) => setScenario(e.target.value as Scenario)}
          >
            {Object.entries(scenarioLabels).map(([k, v]) => (
              <option value={k} key={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Khu vực
          <select
            value={zone}
            onChange={(e) => setZone(e.target.value as "HANOI" | "HCM")}
          >
            <option value="HANOI">Hà Nội · seed</option>
            <option value="HCM">TP. Hồ Chí Minh · seed</option>
          </select>
        </label>
        <label>
          Chế độ
          <select
            value={mode}
            onChange={(e) =>
              setMode(e.target.value as "SIMULATION" | "TEST_LIVE")
            }
          >
            <option>SIMULATION</option>
            <option>TEST_LIVE</option>
          </select>
        </label>
        <label>
          Địa điểm
          <select
            value={placesAdapter}
            onChange={(e) =>
              setPlacesAdapter(e.target.value as Adapter)
            }
          >
            <option value="CITY">Bản đồ 3D Thủ Thiêm (phố thật OSM)</option>
            <option value="FIXTURE">Offline fixtures</option>
            <option value="GOOGLE" disabled={!integrations.google}>
              Google Places {integrations.google ? "" : "· cần API key"}
            </option>
          </select>
        </label>
        <label>
          Định tuyến
          <select
            value={routeAdapter}
            onChange={(e) =>
              setRouteAdapter(e.target.value as Adapter)
            }
          >
            <option value="CITY">Chỉ đường Thủ Thiêm · né điểm sự cố</option>
            <option value="FIXTURE">Offline route</option>
            <option value="GOOGLE" disabled={!integrations.google}>
              Google Routes {integrations.google ? "" : "· cần API key"}
            </option>
          </select>
        </label>
        <button
          className="primary"
          disabled={busy || !token || !!replay}
          onClick={start}
        >
          <Play size={16} /> Start Scenario
        </button>
      </div>
      {(placesAdapter === "GOOGLE" || routeAdapter === "GOOGLE") && (
        <p className="fine-print warning">
          Google adapter gửi vị trí incident tới Google để tìm địa điểm / tuyến.
          Chỉ bắt đầu khi đồng ý sử dụng dịch vụ bên ngoài.
        </p>
      )}
      <div className="control-row">
        <button
          disabled={busy || !token || closed || !!replay}
          onClick={() => act("freeze")}
        >
          <span>{state.frozen ? <Play size={15} /> : <Pause size={15} />}</span>
          {state.frozen ? "Tiếp tục" : "Freeze Demo"}
        </button>
        <button
          disabled={busy || !token || !!replay}
          onClick={() => act("reset")}
        >
          <RefreshCw size={15} /> Reset Incident
        </button>
        <button onClick={replayEvents}>
          <Eye size={15} /> Replay Event Log
        </button>
        <button onClick={download}>
          <Download size={15} /> Tải audit JSON
        </button>
      </div>
      <h4>
        Đưa biến cố vào tình huống{" "}
        <span className="muted">· SIMULATION ONLY</span>
      </h4>
      <div className="inject-grid">
        {[
          ["ROAD_BLOCKED", "Chặn tuyến đường"],
          ["ROAD_DARK", "Báo đoạn đường tối"],
          ["STORE_DECLINES", "Điểm hỗ trợ từ chối"],
          ["HOTEL_ACCEPTS", "Hotel xác nhận"],
          ["GPS_STALE", "Mất GPS"],
          ["CONTACT_NO_ANSWER", "Không bắt máy"],
          ["USER_REJECTS_ROUTE", "Từ chối tuyến"],
          ["ESCALATE", "Hỗ trợ cảnh sát"],
          ["TRIP_STOPPED", "Đi về: dừng bất thường"],
          ["TRIP_DEVIATED", "Đi về: lệch tuyến"],
        ].map(([a, l]) => (
          <button
            key={a}
            disabled={
              busy ||
              !token ||
              closed ||
              state.mode !== "SIMULATION" ||
              !!replay
            }
            onClick={() => act("inject", { action: a })}
          >
            {a === "ROAD_BLOCKED" ? (
              <Navigation size={15} />
            ) : (
              <TriangleAlert size={15} />
            )}{" "}
            {l}
          </button>
        ))}
      </div>
      {state.mode === "TEST_LIVE" && (
        <div className="real-call">
          <p>
            Cuộc gọi thật chỉ tới số test thuộc nhóm, đã có đồng ý. Kết quả
            Places không cấp quyền gọi.
          </p>
          <label>
            3 số E.164, ngăn cách bằng dấu phẩy
            <input
              placeholder="+84…, +84…, +84…"
              value={numbers}
              onChange={(e) => setNumbers(e.target.value)}
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={realConsent}
              onChange={(e) => setRealConsent(e.target.checked)}
            />
            Tôi xác nhận người nhận đã đồng ý tham gia test.
          </label>
          {!integrations.gateway && (
            <p className="warning">
              Chưa cấu hình call gateway. Cuộc gọi thật đang bị khóa.
            </p>
          )}
        </div>
      )}
      <button
        className="primary wide"
        disabled={
          busy ||
          !token ||
          state.running ||
          !state.places.length ||
          !state.metrics.sosAt ||
          closed ||
          !!replay ||
          (state.mode === "TEST_LIVE" &&
            (!realConsent || !integrations.gateway))
        }
        onClick={startCalls}
      >
        <Phone size={16} />
        {state.mode === "SIMULATION"
          ? "Start Mock Calls · 3 lanes"
          : "Start Real Test Calls"}
      </button>
      <p className="fine-print">
        Bản demo hỗ trợ, không phải hệ thống cứu hộ được chứng nhận. Mọi cuộc
        gọi 113 trong demo đều mô phỏng.
      </p>
    </div>
  );
  const events = state.events
    .filter((e) => filter === "ALL" || e.agent === filter)
    .slice()
    .reverse();
  const timeline = (
    <div className="timeline-panel">
      <div className="timeline-top">
        <h3>Incident timeline</h3>
        <select
          aria-label="Lọc sự kiện"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="ALL">Tất cả agent</option>
          {[...agents, "Coordinator", "Monitoring", "Contact", "Policy"].map(
            (a) => (
              <option key={a}>{a}</option>
            ),
          )}
        </select>
      </div>
      {events.map((e) => (
        <div className="timeline-event" key={e.id}>
          <span
            className={"event-dot " + (e.status === "FAILED" ? "red" : "")}
          />
          <div>
            <div>
              <b>{e.agent}</b>
              <span className="source-tag">{e.sourceKind}</span>
              <time>{clock(e.time)}</time>
            </div>
            <p>{e.summary}</p>
            <small>
              {e.type} · {e.reasonCode}
              {e.evidenceRefs.length > 0 && ` · ${e.evidenceRefs.join(", ")}`}
            </small>
          </div>
        </div>
      ))}
    </div>
  );
  const operations = (
    <section className="panel ops-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">ORCHESTRATION</span>
          <h2>Agent Operations</h2>
        </div>
        <span className="signal">
          <Activity size={17} />
        </span>
      </div>
      <div className="tabs">
        {[
          ["agents", "Agents"],
          ["calls", "Calls"],
          ["timeline", "Timeline"],
        ].map(([id, label]) => (
          <button
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
            key={id}
          >
            {label}
            {id === "calls" && <span>{state.calls.length}</span>}
          </button>
        ))}
      </div>
      <div className="ops-body">
        {tab === "agents" ? (
          <>
            <div className="agent-grid">
              {agents.map((name, idx) => {
                const e = state.events.filter((e) => e.agent === name).at(-1);
                return (
                  <div
                    className={
                      "agent-card " + (e?.status === "WORKING" ? "working" : "")
                    }
                    key={name}
                  >
                    <div>
                      <span className="agent-number">0{idx + 1}</span>
                      {e?.status === "WORKING" ? (
                        <span className="pulse-dot" />
                      ) : e ? (
                        <CheckCircle2 size={15} />
                      ) : (
                        <span className="idle-dot" />
                      )}
                    </div>
                    <b>{name} Agent</b>
                    <span className={"agent-status " + (e?.status || "")}>
                      {e?.status || "IDLE"}
                    </span>
                    <p>{e?.summary || "Chờ yêu cầu điều phối"}</p>
                  </div>
                );
              })}
            </div>
            {decision}
            <div className="mini-call-heading">
              <span>PARALLEL CALL POOL</span>
              <span>{state.metrics.maxConcurrentCalls} MAX CONCURRENT</span>
            </div>
            {calls}
          </>
        ) : tab === "calls" ? (
          calls
        ) : (
          timeline
        )}
      </div>
    </section>
  );
  return (
    <main className={`app view-${view} ${presentation ? "presentation" : ""} ${bare && view === "command-center" ? "bare" : ""}`}>
      {view !== "command-center" && (
      <header className="topbar">
        <a className="brand" href="/demo/command-center">
          <span className="brand-icon">
            <Shield size={22} />
          </span>
          <div>
            GUARDIAN<span>AI</span>
          </div>
        </a>
        <span
          className={
            "status-pill " +
            (closed ? "" : state.metrics.sosAt ? "alert" : "calm")
          }
        >
          <span className={closed ? "" : "pulse-dot"} />
          {statusLabel[state.status] || state.status}
        </span>
        <div
          className={"mode-badge " + (state.mode === "TEST_LIVE" ? "live" : "")}
        >
          <span />
          {replay ? "REPLAY" : state.mode}
        </div>
        <button
          className={"ai-model-badge " + ai.status}
          onClick={() => setSpotlight("ai")}
        >
          <AudioLines size={14} />
          {ai.busy
            ? "AI THINKING"
            : ai.status === "LIVE"
              ? "AI LIVE"
              : ai.status === "FALLBACK"
                ? "AI FALLBACK"
                : ai.enabled
                  ? "AI READY"
                  : aiConfig.configured
                    ? "AI OFF"
                    : "AI CHƯA KẾT NỐI"}
          <small>{ai.model || aiConfig.model || "Cấu hình model"}</small>
        </button>
        <div className="top-actions">
          <span
            className={"sync-dot " + (online ? "on" : "")}
            title={online ? "Đã đồng bộ" : "Mất kết nối"}
          />
          <span className="timer">
            <Clock size={15} />
            {elapsed(state.logicalMs)}
            {state.frozen && <Pause size={13} />}
          </span>
          <button onClick={() => setSpotlight("network")}>
            <Users size={15} /> Mạng lưới
          </button>
          <button onClick={() => setSpotlight("controls")}>
            <SlidersHorizontal size={15} /> Điều khiển
          </button>
          <button
            className="icon-button"
            title="Chế độ trình chiếu"
            aria-label="Chế độ trình chiếu"
            onClick={() => setPresentation(!presentation)}
          >
            <Expand size={18} />
          </button>
        </div>
      </header>
      )}
      {view !== "command-center" && (
      <nav className="navline">
        <div>
          <span className="live-dot" />
          <b>
            {view === "command-center" ? "COMMAND CENTER" : view.toUpperCase()}
          </b>
          <span className="nav-separator">/</span>
          <span>{scenarioLabels[state.scenario]}</span>
        </div>
        <div>
          {[
            ["command-center", "Tổng quan"],
            ["phone", "Điện thoại"],
            ["control", "Điều khiển"],
            ["calls", "Cuộc gọi"],
            ["architecture", "Kiến trúc"],
          ].map(([path, label]) => (
            <a
              key={path}
              href={"/demo/" + path}
              className={view === path ? "current" : ""}
            >
              {label}
            </a>
          ))}
        </div>
      </nav>
      )}
      {!online && (
        <div className="connection-warning">
          <WifiOff size={16} /> Dữ liệu ghi nhận gần nhất:{" "}
          {clock(state.updatedAt)}. Đang kết nối lại backend…
        </div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          <TriangleAlert size={17} />
          <span>{error}</span>
          <button aria-label="Đóng thông báo" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {replay && (
        <div className="replay-banner">
          <Eye size={17} /> REPLAY · {replayIndex + 1}/{replay.length} · Dữ liệu
          lịch sử, không thực thi tác vụ.
          <input
            aria-label="Vị trí replay"
            type="range"
            min="0"
            max={replay.length - 1}
            value={replayIndex}
            onChange={(e) => setReplayIndex(Number(e.target.value))}
          />
          <button onClick={() => setReplay(null)}>Trở về hiện tại</button>
        </div>
      )}
      {["command-center", "calls", "control"].includes(view) && <Showcase state={state} act={act} disabled={busy || !token || !!replay} />}
      <div className="cc-strips">
      {["command-center", "calls", "control"].includes(view) && <PlaceDirectory state={state} act={act} disabled={busy || !token || !!replay} onSelect={setSelectedPlace} showClosed={showClosedPlaces} onShowClosed={setShowClosedPlaces} />}
      {["command-center", "calls", "control"].includes(view) && <AgentWorkbench state={state} act={act} disabled={busy || !token || !!replay} onOpenNetwork={() => setSpotlight("network")} />}
      </div>
      {view === "command-center" ? (
        <div className={"cc " + (sosActive ? "sos" : "calm") + (hideLeft ? " hide-l" : "") + (hideRight ? " hide-r" : "")}>
          <section className="cc-phone">{phone}</section>
          <section className="cc-map">
            {mapEl}
            <button
              className="cc-toggle left"
              aria-label={hideLeft ? "Mở điện thoại" : "Thu gọn điện thoại"}
              aria-pressed={hideLeft}
              onClick={() => setHideLeft(!hideLeft)}
            >
              {hideLeft ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
            <button
              className="cc-toggle right"
              aria-label={hideRight ? "Mở bảng thông tin" : "Thu gọn bảng thông tin"}
              aria-pressed={hideRight}
              onClick={() => setHideRight(!hideRight)}
            >
              {hideRight ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
            </button>
            <button
              className="cc-toggle chrome"
              aria-label={bare ? "Hiện thanh công cụ" : "Ẩn thanh công cụ"}
              aria-pressed={bare}
              onClick={() => setBare(!bare)}
            >
              {bare ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          </section>
          <aside className="cc-side">
            <div className="decision brief">
              <h3>{selected ? selected.name : sosActive ? "Đang tìm nơi tiếp nhận…" : "Sẵn sàng"}</h3>
              {plan && (
                <p className="confirmed">
                  <CheckCircle2 size={15} /> Đã nhận · tuyến v{plan.revision}
                </p>
              )}
              {state.emergency && (
                <p className="advice critical">
                  <TriangleAlert size={14} />
                  KHẨN CẤP · {state.emergency.label}
                  {state.emergency.medical ? " · cần 115" : ""}
                </p>
              )}
              {!!state.seals?.length && (
                <a className="evidence-link" href={`/api/incidents/${state.id}/evidence`} target="_blank" rel="noopener">
                  <FileText size={14} /> Hồ sơ bằng chứng · {state.seals.length} lần niêm phong
                </a>
              )}
              {plan?.route.advisories?.[0] && (
                <p className="advice">
                  <TriangleAlert size={14} />
                  {plan.route.advisories[0]}
                </p>
              )}
            </div>
            <Minute state={state} />
            {state.calls.length > 0 && (
              <div className="side-block">
                <h4>Sổ cuộc gọi</h4>
                {calls}
              </div>
            )}
            <div className="side-block side-feed">
              <h4>
                Diễn biến
                <button className="text-button" onClick={() => setSpotlight("timeline")}>
                  Xem tất cả
                </button>
              </h4>
              {state.events
                .slice(-4)
                .reverse()
                .map((e) => (
                  <p key={e.id} className={e.status === "FAILED" ? "failed" : ""}>
                    <time>{clock(e.time)}</time>
                    {e.summary}
                  </p>
                ))}
            </div>
          </aside>
          <div className="cc-bar">
            <span className={"status-pill " + (closed ? "" : state.metrics.sosAt ? "alert" : "calm")}>
              <span className={closed ? "" : "pulse-dot"} />
              {replay ? "REPLAY · " : ""}
              {statusLabel[state.status] || state.status}
            </span>
            <span className="cc-meta" title={online ? "Đã đồng bộ" : "Mất kết nối"}>
              <span className={"sync-dot " + (online ? "on" : "")} />
              <Clock size={13} />
              {elapsed(state.logicalMs)}
              {state.frozen && <Pause size={12} />}
            </span>
            <button
              className={"cc-ai " + ai.status}
              title={"AI · " + (ai.model || aiConfig.model || "chưa cấu hình")}
              onClick={() => setSpotlight("ai")}
            >
              <AudioLines size={14} />
              <span className="lbl">
                {ai.busy ? "AI…" : ai.status === "LIVE" ? "AI LIVE" : ai.enabled ? "AI" : aiConfig.configured ? "AI OFF" : "AI ?"}
              </span>
            </button>
            <span className="cc-spacer" />
            {state.mode === "SIMULATION" && (
              <>
                <button
                  title="Mock Calls"
                  disabled={!token || busy || !state.metrics.sosAt || !state.places.length || state.running || closed || !!replay}
                  onClick={startCalls}
                >
                  <Phone size={14} /> <span className="lbl">Mock Calls</span>
                </button>
                <button
                  title="Chặn đường"
                  disabled={!plan || busy || !token || !!replay}
                  onClick={() => act("inject", { action: "ROAD_BLOCKED" })}
                >
              <Navigation size={14} /> <span className="lbl">Chặn đường</span>
                </button>
                <button title="Báo đoạn phía trước thiếu sáng và tính đường tránh" disabled={!plan || busy || !token || !!replay || state.routeAdapter !== "CITY"} onClick={() => act("inject", { action: "ROAD_DARK" })}><TriangleAlert size={14} /><span className="lbl">Đường tối</span></button>
              </>
            )}
            <button title="Kịch bản mới" disabled={busy || !token || !!replay} onClick={start}>
              <RefreshCw size={14} /> <span className="lbl">Kịch bản mới</span>
            </button>
            <span className="cc-sep" />
            <button className="cc-icon" title="Mạng lưới" aria-label="Mạng lưới" onClick={() => setSpotlight("network")}>
              <Users size={15} />
            </button>
            <button className="cc-icon" title="Điều khiển" aria-label="Điều khiển" onClick={() => setSpotlight("controls")}>
              <SlidersHorizontal size={15} />
            </button>
            <a className="cc-icon" href="/demo/phone" title="Điện thoại" aria-label="Điện thoại">
              <Smartphone size={15} />
            </a>
            <a className="cc-icon" href="/demo/calls" title="Cuộc gọi" aria-label="Cuộc gọi">
              <PhoneCall size={15} />
            </a>
            <a className="cc-icon" href="/demo/architecture" title="Kiến trúc" aria-label="Kiến trúc">
              <Network size={15} />
            </a>
          </div>
        </div>
      ) : view === "phone" ? (
        <div className={"standalone-phone " + (sosActive ? "sos" : "calm")}>
          {sosActive && <div className="phone-map">{mapEl}</div>}
          {phone}
        </div>
      ) : view === "control" ? (
        <section className="control-page panel">
          {controls}
          <Metrics state={state} />
        </section>
      ) : view === "calls" ? (
        <section className="calls-page panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">CONCURRENT ADAPTER TASKS</span>
              <h1>Calling Operations</h1>
            </div>
            <span className="pill">
              {state.mode === "SIMULATION" ? "MOCK" : "REAL TEST"}
            </span>
          </div>
          {calls}
          <button
            className="primary"
            disabled={
              busy ||
              !token ||
              state.running ||
              !state.places.length ||
              !state.metrics.sosAt ||
              closed ||
              !!replay ||
              (state.mode === "TEST_LIVE" && !realConsent)
            }
            onClick={startCalls}
          >
            <Phone size={16} />
            Start {state.mode === "SIMULATION" ? "Mock" : "Test"} Calls
          </button>
          {decision}
          <Metrics state={state} />
        </section>
      ) : (
        <Architecture />
      )}
      {closed && view === "command-center" && (
        <div className="completed-strip">
          <ShieldCheck size={22} />
          <b>
            {state.status === "CLOSED"
              ? "Đã khép vòng hỗ trợ"
              : "Yêu cầu đã hủy"}
          </b>
          <Metrics state={state} />
          <button onClick={download}>
            <Download size={15} /> Tải báo cáo
          </button>
        </div>
      )}
      {view !== "command-center" && (
      <footer className="footer">
        <span>
          <Shield size={13} /> GUARDIAN AI · HACKATHON DEMO
        </span>
        <span>
          Thông tin và tuyến đi cần kiểm tra thực địa. Không bảo đảm an toàn
          tuyệt đối.
        </span>
        <span>LOCAL-FIRST / AUDITABLE</span>
      </footer>
      )}
      {spotlight && (
        <div className="modal-backdrop" onClick={() => setSpotlight("")}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Spotlight"
            className={"modal " + (spotlight === "phone" ? "phone-modal" : "")}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="Đóng spotlight"
              onClick={() => setSpotlight("")}
            >
              <X size={21} />
            </button>
            <div className="eyebrow">
              {replay ? "REPLAY" : state.mode} / SPOTLIGHT
            </div>
            {spotlight === "ai" ? (
              <AISettings
                state={state}
                config={aiConfig}
                token={token}
                act={act}
                onConfig={setAIConfig}
                onError={setError}
              />
            ) : spotlight === "timeline" ? (
              timeline
            ) : spotlight === "network" ? (
              <NetworkPanel onError={setError} token={token} />
            ) : spotlight === "controls" ? (
              controls
            ) : spotlight === "calls" ? (
              calls
            ) : spotlight === "phone" ? (
              phone
            ) : (
              decision
            )}
          </section>
        </div>
      )}
    </main>
  );
}
function AISettings({
  state,
  config,
  token,
  act,
  onConfig,
  onError,
}: {
  state: State;
  config: PublicAI;
  token: string;
  act: (action: string, body?: unknown, root?: boolean) => Promise<void>;
  onConfig: (config: PublicAI) => void;
  onError: (text: string) => void;
}) {
  const [consent, setConsent] = useState(false),
    [checking, setChecking] = useState(false),
    [result, setResult] = useState<{
      provider: string;
      model: string;
      latencyMs: number;
      reply: string;
    } | null>(null),
    [testError, setTestError] = useState("");
  const ai = aiState(state),
    closed = ["CLOSED", "USER_CANCELLED"].includes(state.status);
  async function refresh() {
    try {
      const res = await fetch("/api/ai/config", { cache: "no-store" });
      if (!res.ok) throw new Error("Không tải được cấu hình AI.");
      onConfig(await res.json());
    } catch (e) {
      onError(e instanceof Error ? e.message : "Không tải được AI config.");
    }
  }
  async function probe() {
    setChecking(true);
    setResult(null);
    setTestError("");
    try {
      const res = await fetch("/api/ai/test", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-operator-token": token,
          },
          body: "{}",
        }),
        data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
    } catch (e) {
      setTestError(e instanceof Error ? e.message : "Kiểm tra AI thất bại.");
    } finally {
      setChecking(false);
    }
  }
  return (
    <section className="ai-settings">
      <div className="ai-settings-heading">
        <span className="mini-shield">
          <AudioLines size={23} />
        </span>
        <div>
          <h2>AI hội thoại & điều phối</h2>
          <p>Model thật · ngữ cảnh sự cố · phản hồi tiếng Việt</p>
        </div>
        <span className={"ai-state-pill " + ai.status}>{ai.status}</span>
      </div>
      <div className="ai-provider-info">
        <div>
          <span>PROVIDER</span>
          <b>{config.provider || "Chưa cấu hình"}</b>
        </div>
        <div>
          <span>MODEL</span>
          <b>{config.model || "—"}</b>
        </div>
        <div>
          <span>DỮ LIỆU MAP / CALLS</span>
          <b>
            {state.mode === "SIMULATION"
              ? "Vẫn là mô phỏng"
              : "Theo adapter đã chọn"}
          </b>
        </div>
      </div>
      <p className="ai-config-message">{config.message}</p>
      {!config.configured && (
        <div className="ai-setup-steps">
          <b>Kết nối model tại máy</b>
          <ol>
            <li>
              Trong thư mục GuardianAI, chạy <code>SETUP-AI.cmd</code>.
            </li>
            <li>
              Nhập OpenAI API key vào cửa sổ cấu hình; model mặc định là GPT-4.1
              mini.
            </li>
            <li>
              Khởi động lại server bằng <code>START-GUARDIAN.cmd</code>, tải lại
              trang rồi bấm Kiểm tra AI.
            </li>
          </ol>
          <small>
            Key nằm trong .env.local trên máy; không đưa vào chat hoặc mã
            frontend.
          </small>
        </div>
      )}
      <div className="ai-settings-actions">
        <button
          disabled={checking || !config.configured || !token}
          onClick={probe}
        >
          {checking ? <Activity size={15} /> : <Radio size={15} />}{" "}
          {checking ? "Đang gọi model…" : "Kiểm tra AI thật"}
        </button>
        <button disabled={checking} onClick={refresh}>
          <RefreshCw size={14} />
          Đọc lại cấu hình
        </button>
      </div>
      {result && (
        <div className="ai-probe-success">
          <CheckCircle2 size={17} />
          <div>
            <b>
              Model đã trả lời · {result.provider} / {result.model} ·{" "}
              {result.latencyMs} ms
            </b>
            <p>{result.reply}</p>
          </div>
        </div>
      )}
      {testError && (
        <p className="ai-test-error" role="alert">
          {testError}
        </p>
      )}
      <label className="checkbox ai-consent">
        <input
          type="checkbox"
          checked={consent || ai.enabled}
          disabled={ai.enabled}
          onChange={(e) => setConsent(e.target.checked)}
        />
        Tôi đồng ý gửi nội dung hội thoại và ngữ cảnh sự cố tới{" "}
        {config.provider || "OpenAI API"}. Tọa độ GPS chính xác và số điện thoại
        không được tự đính kèm; nội dung tôi tự nhập vẫn được gửi.
      </label>
      <button
        className={"wide " + (ai.enabled ? "" : "primary")}
        disabled={
          closed || (!ai.enabled && (!config.configured || !consent || ai.busy))
        }
        onClick={() => act("ai/enable", { enabled: !ai.enabled, consent })}
      >
        <AudioLines size={17} />
        {ai.enabled ? "Tắt AI cho phiên này" : "Bật AI cho phiên này"}
      </button>
      <p className="fine-print">
        Bật AI độc lập với chế độ SIMULATION. Model không tự xác nhận điểm tiếp
        nhận, hủy SOS hay kết thúc sự cố. “Trò chuyện với Guardian” dùng GPT
        Realtime (giọng nói hai chiều); ô chat dùng GPT qua Responses API.
      </p>
      {ai.error && <p className="ai-test-error">Lần gần nhất: {ai.error}</p>}
      {ai.runs.length > 0 && (
        <details className="ai-run-details">
          <summary>Lịch sử gọi model ({ai.runs.length}/40)</summary>
          {ai.runs
            .slice()
            .reverse()
            .map((run) => (
              <div key={run.id}>
                <b>
                  {run.task} · {run.status}
                </b>
                <span>
                  {run.provider} / {run.model} · {run.latencyMs} ms ·{" "}
                  {clock(run.time)}
                </span>
                {run.error && <p>{run.error}</p>}
                <small>
                  {run.id}
                  {run.requestId ? " · provider request " + run.requestId : ""}
                </small>
              </div>
            ))}
        </details>
      )}
    </section>
  );
}
function PhonePanel({
  state,
  act,
  busy,
  onError,
  aiConfig,
  onOpenAI,
  onOpenNetwork,
  signal,
}: {
  state: State;
  act: (action: string, body?: unknown, root?: boolean) => Promise<void>;
  busy: boolean;
  onError: (text: string) => void;
  aiConfig: PublicAI;
  onOpenAI: () => void;
  onOpenNetwork: () => void;
  signal: Signal | null;
}) {
  const [text, setText] = useState(
      "Guardian, có người đang đi theo tôi. Hãy giúp tôi.",
    ),
    [listening, setListening] = useState(false),
    [muted, setMuted] = useState(true),
    [gps, setGps] = useState(false),
    [coords, setCoords] = useState(
      `${state.location.lat}, ${state.location.lng}`,
    ),
    [typing, setTyping] = useState(false),
    [rtLive, setRtLive] = useState(false);
  const recognition = useRef<Recognition | null>(null),
    watch = useRef<number | null>(null),
    latest = useRef(state),
    latestAct = useRef(act),
    lastSpeech = useRef("");
  latest.current = state;
  latestAct.current = act;
  useEffect(() => {
    setText(
      state.scenario === "CANNOT_TALK"
        ? "Tôi không thể nói chuyện. Hãy giúp tôi bằng tin nhắn."
        : "Guardian, có người đang đi theo tôi. Hãy giúp tôi.",
    );
    setListening(false);
    setGps(false);
    setTyping(false);
    lastSpeech.current = "";
    return () => {
      recognition.current?.stop();
      if (watch.current !== null) {
        navigator.geolocation.clearWatch(watch.current);
        watch.current = null;
      }
      if ("speechSynthesis" in window) speechSynthesis.cancel();
    };
  }, [state.id, state.scenario]);
  useEffect(() => {
    if (
      muted ||
      rtLive ||
      state.message === lastSpeech.current ||
      !("speechSynthesis" in window)
    )
      return;
    lastSpeech.current = state.message;
    const utterance = new SpeechSynthesisUtterance(state.message);
    utterance.lang = "vi-VN";
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  }, [state.message, muted, rtLive]);
  const closed = ["CLOSED", "USER_CANCELLED"].includes(state.status),
    plan = state.plans.find((p) => !p.superseded),
    place = state.places.find((p) => p.id === plan?.selectedPlaceId);
  const ai = aiState(state);
  function mic() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Constructor =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Constructor) {
      onError(
        "Trình duyệt chưa hỗ trợ nhận giọng nói. Dùng ô nhập text hoặc mở Chrome/Edge.",
      );
      return;
    }
    const rec = new Constructor();
    recognition.current = rec;
    rec.lang = "vi-VN";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setText(transcript);
      void latestAct.current("voice-intent", {
        text: transcript,
        source: "MIC",
        explicit: false,
      });
    };
    rec.onerror = (e) =>
      onError("Microphone: " + e.error + ". Có thể nhập text để tiếp tục.");
    rec.onend = () => setListening(false);
    try {
      rec.start();
      setListening(true);
    } catch {
      onError("Không khởi động được microphone.");
    }
  }
  // Toggles GPS tracking; with keepOn it only starts it. Resolves after the first fix is saved.
  function useGps(keepOn = false): Promise<string> {
    if (gps && watch.current !== null) {
      if (keepOn) return Promise.resolve("GPS đang theo dõi vị trí.");
      navigator.geolocation.clearWatch(watch.current);
      watch.current = null;
      setGps(false);
      return Promise.resolve("Đã tắt GPS.");
    }
    if (!navigator.geolocation) {
      const message =
        "Thiết bị chưa hỗ trợ GPS. Dùng vị trí seed hoặc nhập tọa độ.";
      onError(message);
      return Promise.resolve(message);
    }
    return new Promise((resolve) => {
      let last = 0,
        first = true;
      watch.current = navigator.geolocation.watchPosition(
        async (pos) => {
          setGps(true);
          if (Date.now() - last < 10000) return;
          last = Date.now();
          if (["CLOSED", "USER_CANCELLED"].includes(latest.current.status))
            return;
          await latestAct.current("location", {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            kind: "LIVE",
            consent: true,
          });
          if (first)
            resolve(
              `Đã bật GPS, độ chính xác khoảng ${Math.round(pos.coords.accuracy)} m; vị trí cập nhật mỗi 10 giây.`,
            );
          first = false;
        },
        (err) => {
          setGps(false);
          if (watch.current !== null)
            navigator.geolocation.clearWatch(watch.current);
          watch.current = null;
          const message =
            "Không lấy được GPS: " +
            err.message +
            ". Vị trí seed được giữ nguyên, bạn có thể nhập tọa độ.";
          onError(message);
          resolve(message);
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 },
      );
    });
  }
  function saveCoords() {
    const [lat, lng] = coords.split(",").map(Number);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    ) {
      onError("Nhập tọa độ theo dạng vĩ độ, kinh độ hợp lệ.");
      return;
    }
    void act("location", {
      lat,
      lng,
      kind: state.mode === "SIMULATION" ? "MOCK" : "LIVE",
      consent: true,
    });
  }
  const canTalk = !busy && !closed && !state.running && !ai.busy;
  const canSos = canTalk && !plan;
  return (
    <div className="phone-shell">
      <div className="phone-notch" />
      <div className="phone-screen">
        <div className="phone-status">
          <span>{clock(state.updatedAt).slice(0, 5)}</span>
          <span>
            <Wifi size={12} />
            <span className="battery" />
          </span>
        </div>
        <div className="phone-appbar">
          <span className="mini-shield">
            <ShieldCheck size={18} />
          </span>
          <b>
            Guardian<span>AI</span>
          </b>
          <span className="tiny-mode">{state.mode}</span>
          <button className="phone-net" aria-label="Mạng lưới · link mời người thân" title="Mạng lưới" onClick={onOpenNetwork}>
            <Users size={16} />
          </button>
        </div>
        {!closed && (
          <div className="phone-sticky-action">
            <button
              className="sos-button"
              disabled={!canSos}
              onClick={() =>
                act("sos", {
                  text: "Tôi cảm thấy không an toàn. Hãy giúp tôi.",
                  source: "TEXT",
                })
              }
            >
              <Shield size={20} />
              <span>
                SOS<small>Tôi cần hỗ trợ</small>
              </span>
              <ChevronRight size={19} />
            </button>
          </div>
        )}
        <Companion
          state={state}
          signal={signal}
          aiConfigured={aiConfig.configured}
          onError={onError}
          onLiveChange={setRtLive}
          startGps={() => useGps(true)}
        />
        <div className="phone-content">
          {state.escalation && (
            <div className={"escalation" + (state.emergency ? " critical" : "")}>
              {state.emergency && (
                <strong className="emergency-title">
                  <TriangleAlert size={16} /> KHẨN CẤP · {state.emergency.label}
                </strong>
              )}
              <b>{state.mode === "SIMULATION" ? "113 SIMULATED" : "TÓM TẮT CHO 113"}</b>
              <p>{state.escalation}</p>
              {state.emergency?.medical && (
                <a className="call-113 call-115" href="tel:115">
                  <Phone size={14} /> Gọi cấp cứu 115 · bạn tự bấm gọi
                </a>
              )}
              <a className="call-113" href="tel:113">
                <Phone size={14} /> Mở trình gọi 113 · bạn tự bấm gọi
              </a>
              {!!state.seals?.length && (
                <a className="evidence-link" href={`/api/incidents/${state.id}/evidence`} target="_blank" rel="noopener">
                  <FileText size={14} /> Hồ sơ bằng chứng ({state.seals.length} lần niêm phong)
                </a>
              )}
            </div>
          )}
          <h2 className="phone-title">
            {closed
              ? "Hành trình đã khép lại."
              : plan
                ? "Đã có nơi tiếp nhận."
                : state.metrics.sosAt
                  ? "Đang tìm người giúp bạn…"
                  : "Bạn không đơn độc."}
          </h2>
          <div className="guardian-message">
            <div>
              <Shield size={13} />
              <b>GUARDIAN</b>
              <span>TRỢ LÝ</span>
            </div>
            <p aria-live="polite">{state.message}</p>
          </div>
          {ai.enabled && (
            <div className="ai-conversation" aria-label="Lịch sử hội thoại AI">
              {state.transcript
                .filter((t) => ["AI", "MIC", "TEXT"].includes(t.source))
                .slice(-6)
                .map((t, n) => (
                  <div
                    className={t.source === "AI" ? "assistant" : "user"}
                    key={n}
                  >
                    <span>
                      {t.speaker} ·{" "}
                      {t.source === "AI" ? "AI GENERATED" : t.source} ·{" "}
                      {clock(t.time)}
                    </span>
                    <p>{t.text}</p>
                  </div>
                ))}
            </div>
          )}
          {ai.error && (
            <p className="ai-inline-error">
              {ai.error} · Có thể dùng SOS dự phòng.
            </p>
          )}
          {ai.pendingAction && (
            <div className="ai-pending">
              <b>
                AI đề xuất:{" "}
                {
                  {
                    SOS: "Bật SOS",
                    BLOCK_ROUTE: "Báo tuyến không đi được",
                    CANCEL: "Hủy yêu cầu hỗ trợ",
                    ARRIVED: "Xác nhận đã đến nơi",
                    ESCALATE: "Chuẩn bị tóm tắt khẩn cấp",
                  }[ai.pendingAction.intent]
                }
              </b>
              <p>Chưa thực hiện. Bạn xác nhận thao tác này?</p>
              <div>
                <button
                  className="primary"
                  disabled={busy || ai.busy}
                  onClick={() => act("ai/confirm", { accept: true })}
                >
                  Xác nhận
                </button>
                <button
                  disabled={busy || ai.busy}
                  onClick={() => act("ai/confirm", { accept: false })}
                >
                  Từ chối
                </button>
              </div>
            </div>
          )}
          {!ai.enabled && state.transcript.length > 0 && (
            <div className="user-transcript">
              <span>{state.transcript.at(-1)?.source} · BẠN</span>
              <p>“{state.transcript.at(-1)?.text}”</p>
            </div>
          )}
          {place && plan && (
            <div className="destination-card">
              <div>
                <MapPin size={16} />
                <b>{place.name}</b>
                <span>v{plan.revision}</span>
              </div>
              <small>
                <CheckCircle2 size={12} /> CONFIRMED ·{" "}
                {plan.selectedPlaceId.startsWith("partner-")
                  ? "APP ĐỐI TÁC"
                  : state.mode === "SIMULATION"
                    ? "MOCK"
                    : "REAL TEST"}
              </small>
              <p>{plan.route.steps[0]}</p>
              {plan.route.durationSeconds !== undefined && (
                <p>
                  ETA từ API: {Math.ceil(plan.route.durationSeconds / 60)} phút
                </p>
              )}
              <small>
                {plan.route.sourceKind === "SIMULATED"
                  ? "SIMULATED ROUTE · không có ETA thực"
                  : "Google Routes · " + clock(plan.route.capturedAt)}
              </small>
              {state.status === "ROUTE_PROPOSED" && (
                <button
                  className="primary wide"
                  disabled={busy}
                  onClick={() => act("route/accept", { planId: plan.id })}
                >
                  Chấp nhận tuyến <ArrowRight size={14} />
                </button>
              )}
              <button
                className="text-button"
                disabled={busy || closed || state.mode !== "SIMULATION"}
                onClick={() => act("inject", { action: "USER_REJECTS_ROUTE" })}
              >
                Không thể dùng tuyến này
              </button>
              <button
                disabled={busy || closed}
                onClick={() => act("close", { cancel: false })}
              >
                <Check size={14} />
                Tôi đã gặp nhân viên {state.mode === "SIMULATION" ? "(mô phỏng)" : ""}
              </button>
            </div>
          )}
          {state.location.stale && (
            <p className="warning gps-warning">
              <TriangleAlert size={14} />
              GPS cũ · {clock(state.location.observedAt)}
            </p>
          )}
          {closed ? (
            <div className="phone-end">
              <CheckCircle2 size={29} />
              <b>
                {state.status === "CLOSED"
                  ? "Đã xác nhận đến nơi"
                  : "Yêu cầu đã hủy"}
              </b>
              {!!state.seals?.length && (
                <a className="evidence-link" href={`/api/incidents/${state.id}/evidence`} target="_blank" rel="noopener">
                  <FileText size={14} /> Hồ sơ bằng chứng
                </a>
              )}
              <button disabled={busy} onClick={() => act("transcript/delete")}>
                Xóa transcript thử nghiệm
              </button>
            </div>
          ) : (
            typing && (
              <>
                <label className="text-input-label">
                  {ai.enabled ? "Nhắn cho AI" : "Nhập lời nhắn / SOS"}
                  <textarea
                    aria-label="Lời nhắn SOS"
                    rows={2}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    maxLength={2000}
                  />
                </label>
                <div className="phone-input-actions">
                  <button
                    disabled={busy || closed || !text.trim()}
                    onClick={() =>
                      act(ai.enabled ? "message" : "sos", {
                        text,
                        source: "TEXT",
                      })
                    }
                  >
                    {ai.enabled ? "Gửi cho AI" : "Gửi SOS"}{" "}
                    <ArrowRight size={13} />
                  </button>
                  <button
                    className={listening ? "recording" : ""}
                    disabled={!(ai.enabled ? canTalk : canSos)}
                    onClick={mic}
                  >
                    <Mic size={15} />
                    {listening ? "Dừng mic" : "Đọc chính tả"}
                  </button>
                </div>
              </>
            )
          )}
          <div className="phone-tools">
            <button
              aria-label="Bật hoặc tắt giọng đọc"
              title="Giọng đọc trình duyệt"
              onClick={() => {
                if (!muted) speechSynthesis.cancel();
                setMuted(!muted);
              }}
            >
              {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
            </button>
            {!closed && (
              <button onClick={() => setTyping(!typing)}>
                <Keyboard size={16} /> Nhập chữ
              </button>
            )}
            <button
              disabled={busy || closed || state.mode !== "SIMULATION"}
              onClick={() => act("inject", { action: "ESCALATE" })}
            >
              <Phone size={16} />
              113
            </button>
          </div>
          <details className="phone-more">
            <summary>
              <MapPin size={13} /> Vị trí{" "}
              {state.location.kind === "MOCK" ? "mô phỏng" : "GPS"}
              {state.location.stale ? " · đã cũ" : ""}
            </summary>
            <div className="location-line">
              {state.location.lat.toFixed(4)}, {state.location.lng.toFixed(4)}
              <button onClick={() => void useGps()} disabled={closed}>
                {gps ? "Dừng GPS" : "Dùng GPS"}
              </button>
            </div>
            <div className="manual-input">
              <input
                aria-label="Tọa độ thủ công"
                value={coords}
                onChange={(e) => setCoords(e.target.value)}
              />
              <button onClick={saveCoords} disabled={closed}>
                Cập nhật
              </button>
            </div>
          </details>
          {!closed && (
            <button
              className="cancel-link"
              disabled={busy}
              onClick={() => act("close", { cancel: true })}
            >
              Dừng yêu cầu hỗ trợ
            </button>
          )}
        </div>
        <div className="phone-home" />
      </div>
    </div>
  );
}
function CallLane({
  call,
  name,
  index,
}: {
  call?: Call;
  name: string;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={"call-lane " + (call?.status || "QUEUED")}>
      <button
        className="call-lane-heading"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span className="call-icon">
          <Phone size={16} />
        </span>
        <div>
          <b>{name}</b>
          <small>
            AGENT {String(index + 1).padStart(2, "0")} ·{" "}
            {call?.providerMode || "MOCK"} · số test ẩn
          </small>
        </div>
        <span className="call-state">
          {call?.status === "CONFIRMED" ? (
            <CheckCircle2 size={13} />
          ) : call?.status === "DECLINED" ? (
            <X size={13} />
          ) : null}
          {call?.status || "QUEUED"}
        </span>
        <ArrowDown size={13} />
      </button>
      {expanded && (
        <div className="call-transcript">
          {call?.transcript.length ? (
            call.transcript.map((t, idx) => (
              <div key={idx}>
                <b>{t.speaker}</b>
                <time>{clock(t.time)}</time>
                <p>{t.text}</p>
              </div>
            ))
          ) : (
            <p>
              Chưa có transcript. CONNECTED không đồng nghĩa đồng ý tiếp nhận.
            </p>
          )}
          {call && <small>Evidence: {call.id}</small>}
        </div>
      )}
    </div>
  );
}
const toastEvents = new Set([
  "PLACE_FOUND",
  "CONTACT_ALERTED",
  "CONTACT_ANSWERED",
  "CONTACT_ON_THE_WAY",
  "HELP_CONFIRMED",
  "CALL_CONNECTED",
  "ROUTE_SELECTED",
  "NO_RESPONDERS",
  "EMERGENCY_DETECTED",
  "CONTACT_LOST",
  "EVIDENCE_SEALED",
  "EVIDENCE_SHARED",
  "CONTACT_MESSAGE",
  "COORDINATION_UPDATED",
  "ROAD_DARK",
]);
// A toast is one glance on the map, not a log line.
const toastText = (e: { type: string; summary: string }) =>
  e.type === "NO_RESPONDERS" ? "Chưa có nơi đủ điều kiện tiếp nhận · đang tìm tiếp"
    : e.summary.length > 140 ? e.summary.slice(0, 138) + "…" : e.summary;
const placeStatus: Record<string, string> = {
  UNKNOWN: "Chưa liên hệ",
  CONTACTED: "Đang liên hệ",
  CONFIRMED: "Đã đồng ý tiếp nhận",
  DECLINED: "Từ chối",
};
const distance = (a: Point, b: Point) => {
  const r = Math.PI / 180,
    x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r),
    y = (b.lat - a.lat) * r;
  return Math.round(Math.hypot(x, y) * 6371000);
};
// Map fills its container; markers are clickable and details open in a card.
function IncidentMap({
  state,
  selected,
  showClosed,
  onShowClosed,
  onSelect,
  onMove,
  onDecide,
}: {
  state: State;
  selected: string;
  showClosed: boolean;
  onShowClosed: (value: boolean) => void;
  onSelect: (id: string) => void;
  onMove: (body: { action: string; lat?: number; lng?: number }) => Promise<boolean>;
  onDecide: (placeId: string, accept: boolean) => Promise<void>;
}) {
  const [walking, setWalking] = useState(false),
    [tapMove, setTapMove] = useState(false),
    [toast, setToast] = useState<{ text: string; kind: string } | null>(null),
    city = state.routeAdapter === "CITY",
    closedMap = ["CLOSED", "USER_CANCELLED"].includes(state.status),
    canSim = city && state.mode === "SIMULATION" && !closedMap,
    arrived = !!state.nav?.arrived,
    scanning = !!state.metrics.sosAt && !arrived && !closedMap,
    moveRef = useRef(onMove),
    lastToast = useRef("");
  moveRef.current = onMove;
  // Pop a transient toast when the AI reaches a milestone (found a place, got someone).
  useEffect(() => {
    const latest = state.events.filter((e) => toastEvents.has(e.type)).at(-1);
    if (!latest || latest.id === lastToast.current) return;
    lastToast.current = latest.id;
    setToast({ text: toastText(latest), kind: latest.type });
  }, [state.events]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  // Auto-walk along the active route until arrival or an error.
  useEffect(() => {
    if (!walking) return;
    if (arrived || !canSim) {
      setWalking(false);
      return;
    }
    let stop = false;
    const t = setInterval(async () => {
      if (stop) return;
      if (!(await moveRef.current({ action: "step" }))) setWalking(false);
    }, 1600);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [walking, arrived, canSim]);
  const plan = state.plans.find((p) => !p.superseded),
    sel = visibleMapPlaces(state, showClosed).find((p) => p.id === selected),
    selIndex = state.places.findIndex((p) => p.id === selected),
    selCall = sel && state.calls.filter((c) => c.placeId === sel.id).at(-1);
  return (
    <div className="map-canvas big">
      <Map3D
        state={state}
        selected={selected}
        showClosed={showClosed}
        scanning={scanning}
        tapMove={tapMove}
        onSelect={onSelect}
        onTap={(p) => void onMove({ action: "to", lat: p.lat, lng: p.lng })}
      />
      <div className="map-overlay">
        <span className={state.location.stale ? "warning" : "connected"}>
          <span className="live-dot" />
          {state.location.stale ? "GPS cũ" : "Vị trí " + (state.location.kind === "MOCK" ? "mô phỏng" : "GPS")}
        </span>
        <small>{clock(state.location.observedAt)}</small>
      </div>
      {toast && (
        <div className={"map-toast " + toast.kind} role="status">
          <span className="map-toast-dot" />
          {toast.text}
        </div>
      )}
      <div className="map-legend">
        <span><i className="lg-user" />Bạn</span>
        {!!state.metrics.sosAt && <>
          <span><i className="lg-partner" />Danh sách hỗ trợ</span>
          <span><i className="lg-public" />Tham khảo đang mở</span>
          <span><i className="lg-unknown" />Giờ/trực ban chưa rõ</span>
          <span><i className="lg-ok" />Đã nhận giúp</span>
          <span><i className="lg-risk" />Sự cố mô phỏng</span>
          {!!state.roadObservations?.length && <span><i className="lg-dark" />Đoạn báo tối</span>}
          <label><input type="checkbox" aria-label="Hiện điểm đã đóng trên bản đồ" checked={showClosed} onChange={e => onShowClosed(e.target.checked)} />Hiện đã đóng</label>
        </>}
      </div>
      {tapMove ? (
        <div className="map-hint">Chạm vào bản đồ để chuyển vị trí của bạn tới đó</div>
      ) : (
        !sel &&
        state.places.length > 0 && (
          <div className="map-hint">{state.metrics.sosAt ? "Vàng: danh sách hỗ trợ · Xanh lam: nơi tham khảo" : "Bật SOS để tìm và hiển thị các điểm hỗ trợ"}</div>
        )
      )}
      {state.nav && city && (
        <div className={"nav-banner " + (state.nav.offRoute ? "off" : state.nav.arrived ? "done" : "")}>
          <Navigation size={16} />
          <div>
            <b>
              {state.nav.offRoute
                ? "Đang đi lệch tuyến"
                : state.nav.arrived
                  ? `Đã tới ${state.nav.target}`
                  : state.nav.next || `Tới ${state.nav.target}`}
            </b>
            <small>
              {state.nav.where}
              {!state.nav.arrived && state.nav.remaining !== undefined
                ? ` · còn ${state.nav.remaining} m tới ${state.nav.target}`
                : ""}
            </small>
          </div>
        </div>
      )}
      {canSim && (
        <div className="sim-controls" onClick={(e) => e.stopPropagation()}>
          <span>MÔ PHỎNG DI CHUYỂN</span>
          <button className={walking ? "on" : ""} onClick={() => setWalking(!walking)}>
            {walking ? "Dừng đi" : "Đi theo tuyến"}
          </button>
          <button onClick={() => void onMove({ action: "step" })}>+40 m</button>
          <button
            onClick={() => {
              setWalking(false);
              void onMove({ action: "deviate" });
            }}
          >
            Đi lệch
          </button>
          <button className={tapMove ? "on" : ""} onClick={() => setTapMove(!tapMove)}>
            Đặt vị trí
          </button>
          <button className="danger" onClick={() => void onMove({ action: "attack" })}>
            Bị tấn công
          </button>
          <button
            onClick={() => {
              setWalking(false);
              void onMove({ action: "lost" });
            }}
          >
            Mất tín hiệu
          </button>
        </div>
      )}
      {plan && (
        <div className="route-badge">
          <Navigation size={14} /> Tuyến v{plan.revision} ·{" "}
          {plan.route.sourceKind === "SIMULATED" ? "mô phỏng" : "API"}
        </div>
      )}
      {sel && (
        <div
          className="place-card"
          onClick={(e) => e.stopPropagation()}
        >
          <button className="place-card-close" aria-label="Đóng" onClick={() => onSelect("")}>
            <X size={16} />
          </button>
          <span className="place-card-kind">
            {selIndex + 1} ·{" "}
            {sel.id.startsWith("partner-") ? "Đối tác Guardian" : sel.category}
          </span>
          <h3>{sel.name}</h3>
          <p className="muted">{sel.address}</p>
          <p className={`venue-affiliation ${mapPlaceAppearance(state, sel).listed ? "is-support-listed" : "is-reference"}`}>{mapPlaceAppearance(state, sel).groupLabel} · {mapPlaceAppearance(state, sel).availabilityLabel}</p>
          <dl>
            <dt>Cách bạn</dt>
            <dd>{distance(state.location, sel)} m</dd>
            <dt>Tiếp nhận</dt>
            <dd className={"place-status " + sel.supportStatus}>{placeStatus[sel.supportStatus]}</dd>
            <dt>Giờ mở cửa</dt>
            <dd>{assessPlace(state, sel).hours?.label ?? (sel.openingStatus === "OPEN" ? "Đang mở" : "Chưa rõ")}</dd>
            {sel.profile && <>
              <dt>Bán / cung cấp</dt><dd>{sel.profile.goods.join(", ") || "Dịch vụ hỗ trợ chuyên biệt"}</dd>
              <dt>Chức năng</dt><dd>{sel.profile.services.map(s => serviceLabels[s]).join(", ")}</dd>
              <dt>Hiện tại</dt><dd>{assessPlace(state, sel).hours?.status === "CLOSED" ? "Ngoài giờ niêm yết" : "Trong giờ niêm yết"} · mô phỏng</dd>
            </>}
            {selCall && (
              <>
                <dt>Cuộc gọi</dt>
                <dd>{selCall.status}</dd>
              </>
            )}
          </dl>
          {sel.profile && <div className="venue-card-reason"><b>Vì sao nên cân nhắc / loại?</b>{[...assessPlace(state, sel).reasons, ...assessPlace(state, sel).blockers, ...sel.profile.limitations].map((reason, index) => <p key={index}>{reason}</p>)}</div>}
          {selCall?.transcript.at(-1) && (
            <blockquote>
              <b>{selCall.transcript.at(-1)!.speaker}:</b> {selCall.transcript.at(-1)!.text}
            </blockquote>
          )}
          {sel.id.startsWith("partner-") ? (
            <p className="place-card-note">
              Đối tác thật: họ trả lời trên điện thoại của mình.
            </p>
          ) : sel.contactEligibility !== "ALLOWLIST" ? (
            <p className="place-card-note">
              {assessPlace(state, sel).publicService ? "Cơ sở công khai: app không gọi thay; chưa xác minh tiếp nhận. 113 / 115 do người dùng quyết định gọi." : "Điểm tham khảo trên bản đồ; chưa tham gia kênh liên hệ mô phỏng."}
            </p>
          ) : (
            state.mode === "SIMULATION" &&
            !closedMap &&
            state.places.length > 0 && (
              <div className="place-card-actions">
                <small>Đóng vai cửa hàng này:</small>
                <button
                  className="primary"
                  disabled={sel.supportStatus === "CONFIRMED"}
                  onClick={() => void onDecide(sel.id, true)}
                >
                  <Check size={14} /> Đồng ý tiếp nhận
                </button>
                <button
                  disabled={sel.supportStatus === "DECLINED"}
                  onClick={() => void onDecide(sel.id, false)}
                >
                  <X size={14} /> Từ chối
                </button>
              </div>
            )
          )}
          {plan?.selectedPlaceId === sel.id && (
            <p className="confirmed">
              <CheckCircle2 size={14} /> Điểm đến hiện tại · kế hoạch v{plan.revision}
            </p>
          )}
          <small>
            Nguồn: {sel.source} · {clock(sel.capturedAt)}
          </small>
        </div>
      )}
    </div>
  );
}
function Metrics({ state }: { state: State }) {
  return (
    <div className="metrics">
      {[
        [
          "SOS → ứng viên",
          state.metrics.candidatesMs === undefined
            ? "—"
            : state.metrics.candidatesMs + " ms",
        ],
        [
          "SOS → xác nhận",
          state.metrics.firstConfirmedMs === undefined
            ? "—"
            : (state.metrics.firstConfirmedMs / 1000).toFixed(1) + " s",
        ],
        ["Cuộc gọi đồng thời", state.metrics.maxConcurrentCalls],
        ["Plan revisions", Math.max(0, state.plans.length - 1)],
        ["Policy blocked", state.metrics.policyBlocked],
      ].map(([k, v]) => (
        <div key={String(k)}>
          <b>{v}</b>
          <span>{k}</span>
        </div>
      ))}
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <Radio size={22} />
      <p>{text}</p>
    </div>
  );
}
function Architecture() {
  return (
    <section className="architecture panel">
      <span className="eyebrow">SYSTEM DESIGN / AUDITABLE ORCHESTRATION</span>
      <h1>Một trạng thái chung. Nhiều tác vụ phối hợp.</h1>
      <p>
        GPT Realtime trò chuyện liên tục bằng giọng nói và gọi công cụ chạy nền
        (SOS, mật mã an toàn, đổi tuyến, 113). Một SOS đổ chuông song song app
        người thân và app điểm đối tác; AI nói chuyện với đối tác và chỉ chọn nơi
        đã đồng ý. Backend kiểm tra mọi đầu ra trước khi đổi trạng thái.
      </p>
      <div className="architecture-flow">
        {[
          ["01", "Web / Mic / SOS", "Phone · Control · Command Center"],
          [
            "02",
            "Next.js API + PolicyGate",
            "Session · Consent · Allowlist · Rate limit",
          ],
          [
            "03",
            "Coordinator State Machine",
            "Risk → Research → Verification → Calling → Route",
          ],
          [
            "04",
            "SQLite + Event Snapshots",
            "Persist · Evidence · Replay · 24h retention",
          ],
          [
            "05",
            "Server-Sent Events",
            "Một incident đồng bộ trên mọi tab cùng phiên",
          ],
        ].map(([n, title, detail]) => (
          <div key={n}>
            <span>{n}</span>
            <div>
              <h3>{title}</h3>
              <p>{detail}</p>
            </div>
            <ArrowRight size={25} />
          </div>
        ))}
      </div>
      <div className="architecture-notes">
        <div>
          <h3>Offline, có thể kiểm chứng</h3>
          <p>
            3 địa điểm hư cấu, 3 tác vụ gọi độc lập. Chặn tuyến hoặc thu hồi xác
            nhận làm thay đổi kế hoạch backend.
          </p>
        </div>
        <div>
          <h3>Ranh giới tích hợp</h3>
          <p>
            Google Places / Routes có adapter tùy chọn. Real test calls yêu cầu
            gateway của nhóm, số test allowlist và consent. Không gọi cơ quan
            khẩn cấp.
          </p>
        </div>
        <div>
          <h3>Giới hạn minh bạch</h3>
          <p>
            Sơ đồ nền không phải bản đồ đường phố. Không có chứng nhận cứu hộ;
            web không bảo đảm GPS chạy nền. Speech recognition có thể cần
            Internet của trình duyệt.
          </p>
        </div>
      </div>
    </section>
  );
}
