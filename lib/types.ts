import type { AIState } from "./ai";
import type { Support, Needs, DemoCase } from "./support";
export type Mode = "SIMULATION" | "TEST_LIVE";
export type Status =
  | "ACTIVE_TRIP"
  | "SOS_RECEIVED"
  | "AWAITING_CONFIRMATION"
  | "TRIAGE"
  | "SEARCHING"
  | "CONTACTING"
  | "ROUTE_PROPOSED"
  | "GUIDING"
  | "REPLANNING"
  | "NO_RESPONDERS"
  | "LOCATION_UNAVAILABLE"
  | "HELP_REACHED"
  | "CLOSED"
  | "USER_CANCELLED";
export type AgentName =
  | "Voice"
  | "Risk"
  | "Research"
  | "Verification"
  | "Calling"
  | "Route"
  | "Coordinator"
  | "Contact"
  | "Monitoring"
  | "Policy";
export type CallStatus =
  | "QUEUED"
  | "RINGING"
  | "CONNECTED"
  | "DECLINED"
  | "CONFIRMED"
  | "NO_ANSWER"
  | "FAILED";
export type Point = { lat: number; lng: number };
export type Place = Point & {
  profile?: import("./place-context").VenueProfile;
  id: string;
  name: string;
  category: string;
  address: string;
  source: string;
  capturedAt: string;
  openingStatus: "OPEN" | "CLOSED" | "UNKNOWN";
  supportStatus: "UNKNOWN" | "CONTACTED" | "CONFIRMED" | "DECLINED";
  contactEligibility: "ALLOWLIST" | "NOT_ALLOWED";
  verification: "PUBLIC_INFO_ONLY" | "CONTACT_ATTEMPTED" | "SUPPORT_CONFIRMED";
  publicPhone?: string;
  evidenceRefs: string[];
};
export type Transcript = {
  externalId?: string;
  speaker: string;
  text: string;
  time: string;
  source: "TEXT" | "MIC" | "MOCK" | "REAL_TEST" | "AI" | "APP";
};
// What one helper proposes to do, grounded in their own latest words.
export type Offer = { text: string; quote: string; evidenceRef: string; source: "AI" | "RULES" };
export type Assignment = {
  ref: string;
  who: string;
  role: "PRIMARY" | "SUPPORT" | "BACKUP" | "UNUSED";
  instruction: string;
  reason: string;
};
export type Call = {
  offer?: Offer;
  support?: Support;
  checks?: string[];
  dialogueMode?: "AI_LIVE" | "SCRIPTED_FALLBACK" | "WEB";
  modelCalls?: number;
  questions?: string[];
  id: string;
  placeId: string;
  providerMode: "MOCK" | "REAL_TEST" | "APP";
  memberId?: string;
  falseAlarm?: boolean;
  status: CallStatus;
  startedAt: string;
  endedAt?: string;
  transcript: Transcript[];
  generation: number;
};
export type Route = {
  id: string;
  source: string;
  sourceKind: "LIVE" | "SIMULATED";
  capturedAt: string;
  points: Point[];
  steps: string[];
  durationSeconds?: number;
  distanceMeters?: number;
  superseded: boolean;
  blocked: boolean;
  // Simulated city only: turn-by-turn maneuvers (metres along the route) and street segments used.
  maneuvers?: { lat: number; lng: number; text: string; at: number }[];
  edges?: string[];
  blockedAt?: Point;
  // Why this route: skipped shortcuts and incident-history warnings along the way.
  advisories?: string[];
  safety?: { darkMeters: number; quietMeters: number; weightedCost: number; sourceKind: "SIMULATED" };
  darkAt?: Point;
};
export type Adapter = "FIXTURE" | "GOOGLE" | "CITY";
export type RouteOption = {
  placeId: string;
  route: Route;
  eligible: boolean;
  checks: string[];
  evidenceRefs: string[];
};
export type RouteDecision = {
  id: string;
  createdAt: string;
  trigger: string;
  mode: "AI_LIVE" | "RULES_FALLBACK" | "SINGLE_OPTION" | "KEPT_CURRENT";
  selectedPlaceId: string | null;
  selectedRouteId: string | null;
  reasons: string[];
  evidenceRefs: string[];
  candidates: RouteOption[];
  assessments: { routeId: string; reasons: string[]; evidenceRefs: string[] }[];
  runId?: string;
  fallbackReason?: string;
  planId?: string;
  discarded?: boolean;
  placeDecision?: { mode: "AI_LIVE" | "RULES_FALLBACK"; reasons: string[]; evidenceRefs: string[]; runId?: string };
};
export type Nav = {
  routeId: string;
  target: string;
  step: number;
  offRoute: boolean;
  arrived: boolean;
  where: string;
  next?: string;
  nextIn?: number;
  remaining?: number;
};
export type Plan = {
  coordination?: {
    mode: "AI_LIVE" | "RULES_FALLBACK";
    summary: string;
    assignments: Assignment[];
    offersSignature: string;
  };
  routeDecisionId?: string;
  acceptedAt?: string;
  supportUpdatedAt?: string;
  supportSignature?: string;
  backupPlaceId?: string;
  comparisons?: {
    placeId: string;
    reasons: string[];
    evidenceRefs: string[];
  }[];
  id: string;
  revision: number;
  selectedPlaceId: string;
  route: Route;
  reasons: string[];
  evidenceRefs: string[];
  createdAt: string;
  superseded: boolean;
};
export type AgentEvent = {
  id: string;
  incidentId: string;
  time: string;
  logicalMs: number;
  agent: AgentName;
  type: string;
  status: "WORKING" | "SUCCEEDED" | "FAILED" | "WAITING";
  summary: string;
  evidenceRefs: string[];
  sourceKind: "LIVE" | "SIMULATED";
  reasonCode: string;
};
export type Scenario =
  | "NIGHT_WALK"
  | "CANNOT_TALK"
  | "ROAD_BLOCKED"
  | "ALL_UNAVAILABLE"
  | "LOCATION_LOST";
export type Incident = {
  locale?: "vi" | "en";
  scenarioClock?: string;
  roadObservations?: { edgeId: string; kind: "DARK"; observedAt: string; sourceKind: "SIMULATED" | "USER_REPORT" }[];
  evidenceShare?: { at: string; reason: string; hash: string; to: string[] };
  // Audio of the user's voice conversation (mic + AI), stored as files and hashed into the dossier.
  recordings?: { session: string; mime: string; startedAt: string; updatedAt: string; chunks: number; bytes: number; sha256: string }[];
  recordingsDeletedAt?: string;
  showcase?: {
    status: "RUNNING" | "WAITING_APPROVAL" | "COMPLETED" | "STOPPED" | "FAILED";
    step: number;
    // Where the map should look for this step (fit all points).
    focus?: Point[];
    title: string;
    narration: string;
    narrationId?: string;
    playback?: "PENDING" | "FINISHED" | "UNAVAILABLE" | "SKIPPED" | "TIMED_OUT";
    pace?: "PRESENTATION" | "BALANCED" | "QUICK";
    voiceEnabled?: boolean;
    startedAt: string;
    completedAt?: string;
    error?: string;
  };
  routeDecisions?: RouteDecision[];
  routeAgent?: { status: "WATCHING" | "ASSESSING" | "PAUSED" | "STOPPED"; checkedAt: string; reason: string };
  needs?: Needs;
  demoCase?: DemoCase;
  simulatorOnly?: boolean;
  networkOnly?: boolean;
  dialogueRequests?: number;
  familyRequests?: number;
  handoff?: {
    planId: string;
    userAt?: string;
    partnerAt?: string;
    completedAt?: string;
  };
  id: string;
  owner: string;
  mode: Mode;
  status: Status;
  createdAt: string;
  updatedAt: string;
  scenario: Scenario;
  zone: "HANOI" | "HCM";
  location: Point & {
    kind: "MOCK" | "LIVE";
    observedAt: string;
    stale: boolean;
  };
  riskLevel: 1 | 2 | 3 | 4;
  riskReasons: string[];
  unknowns: string[];
  places: Place[];
  calls: Call[];
  plans: Plan[];
  events: AgentEvent[];
  transcript: Transcript[];
  message: string;
  frozen: boolean;
  logicalMs: number;
  running: boolean;
  generation: number;
  blockedCount: number;
  placesAdapter: Adapter;
  routeAdapter: Adapter;
  metrics: {
    sosAt?: string;
    candidatesMs?: number;
    firstConfirmedMs?: number;
    maxConcurrentCalls: number;
    policyBlocked: number;
  };
  consent: { location: boolean; calls: boolean };
  escalation?: string;
  ai: AIState;
  // Trusted contacts alerted in-app for this incident.
  contacts: ContactAlert[];
  // Short visual description the user volunteered, shown to confirmed partners.
  appearance?: string;
  // Covert SOS (safe phrase): the phone keeps a disguised screen.
  covert?: boolean;
  trip?: Trip;
  blockedEdges?: string[];
  // Directions the user asked for outside an SOS plan (simulated city).
  freeRoute?: Route & { target: string };
  nav?: Nav;
  // Detected from what the user said/typed (lib/emergency.ts); medical → 115.
  emergency?: {
    kind: string;
    label: string;
    medical: boolean;
    at: string;
    text: string;
  };
  // Evidence: location trail, the user's statement, and sealed (hashed) snapshots of the dossier.
  track?: { lat: number; lng: number; at: string; kind: "MOCK" | "LIVE" }[];
  statements?: { topic: string; text: string; at: string }[];
  seals?: { at: string; reason: string; hash: string }[];
};
export type ContactAlert = {
  offer?: Offer;
  lastMessage?: string;
  transcript?: Transcript[];
  response?: import("./family").FamilyResponse;
  memberId: string;
  name: string;
  status:
    | "RINGING"
    | "ANSWERED"
    | "ON_THE_WAY"
    | "MISSED"
    | "KEEP_CONTACT"
    | "CANNOT_HELP";
  arrivalMinutes?: number;
  alertedAt: string;
  updatedAt: string;
};
export type Trip = {
  destination: Point & { label: string };
  startedAt: string;
  expectedBy: string;
  status: "ACTIVE" | "CHECKING" | "ESCALATED" | "ARRIVED" | "ENDED";
  checkinDueAt?: string;
  checkinReason?: string;
  lastMovedAt: string;
};
export type ActionProposal = {
  kind: "CALL";
  mode: Mode;
  provider: "MOCK" | "REAL_TEST" | "APP";
  number?: string;
  consent: boolean;
  eligible: boolean;
};
