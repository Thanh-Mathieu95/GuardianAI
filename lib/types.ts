import type { Coordination, PartnerProfile } from "./coordination-types";
export type Locale = "vi" | "en";
export type Point = { lat: number; lng: number };
export type Pair = [string, string];
export type Member = {
  id: string;
  name: string;
  role: "CONTACT" | "PARTNER";
  tokenHash: string;
  joined: boolean;
  onDuty: boolean;
  location: Point | null;
  createdAt: string;
  callConsentAt?: string | null;
  lastSeenAt?: string | null;
  profile?: PartnerProfile;
};
export type Reply = {
  id: string;
  memberId: string;
  name: string;
  role: Member["role"];
  state:
    | "RINGING"
    | "NO_ANSWER"
    | "ACCEPTED"
    | "DECLINED"
    | "CLARIFY"
    | "REVOKED"
    | "ON_THE_WAY"
    | "KEEP_CONTACT";
  quote: string;
  offer: string;
  minutes: number | null;
  at: string;
  expiresAt: string | null;
  location: Point | null;
  simulated: boolean;
  entrance: string;
  discreet: boolean;
  viaAlley: boolean;
  conditions: string[];
  handoff: boolean;
  evidenceIds?: string[];
  profile?: PartnerProfile;
};
export type Route = {
  points: Point[];
  meters: number;
  source: "SIMULATED" | "GOOGLE" | "OSM";
  edgeIds?: string[];
  steps?: { street: string; meters: number }[];
  note: Pair;
};
export type Plan = {
  id: string;
  revision: number;
  replyId: string;
  destination: string;
  route: Route;
  acceptedAt: string | null;
  invalidatedAt: string | null;
  reason: Pair;
  userArrived: boolean;
  progressMeters?: number;
  coordination?: {
    ref: string;
    who: string;
    role: "PRIMARY" | "SUPPORT" | "BACKUP" | "UNUSED";
    instruction: Pair;
  }[];
};
export type Event = {
  id: string;
  at: string;
  type: string;
  message: Pair;
  source: "SIMULATED" | "LIVE" | "REHEARSAL";
  refs: string[];
};
export type Incident = {
  id: string;
  mode: "DEMO" | "LIVE" | "TEAM";
  locale: Locale;
  status:
    | "READY"
    | "CONTACTING"
    | "REVIEW"
    | "GUIDING"
    | "NO_SUPPORT"
    | "CHECK_IN"
    | "SIGNAL_LOST"
    | "COMPLETE"
    | "CANCELLED";
  generation: number;
  createdAt: string;
  updatedAt: string;
  location: (Point & { at: string; source: "SIMULATED" | "LIVE" }) | null;
  track: (Point & { at: string })[];
  needs: {
    maxWalk: number;
    avoidAlleys: boolean;
    discreet: boolean;
    canMove: boolean;
  };
  risk: 1 | 2 | 3 | 4;
  scenarioMinute?: number;
  coordination?: Coordination;
  supportProfiles?: {
    memberId: string;
    name: string;
    role: Member["role"];
    joined: boolean;
    callConsent: boolean;
    onDuty: boolean;
    source: "TEAM" | "LIVE";
  }[];
  sosAt: string | null;
  replies: Reply[];
  plans: Plan[];
  events: Event[];
  transcript: { id: string; who: string; text: string; at: string }[];
  ai: {
    enabled: boolean;
    consentedAt: string | null;
    status: "OFF" | "READY" | "LIVE" | "ERROR";
    calls: number;
    error: string | null;
  };
  recordingConsentAt: string | null;
  trip: {
    label: string;
    dueAt: string;
    checkBy: string | null;
    lastCheckAt: string;
    state: "ACTIVE" | "CHECKING" | "ARRIVED" | "STOPPED";
  } | null;
  demo: {
    step: number;
    paused: boolean;
    nextAt: string;
    status: "RUNNING" | "DONE" | "STOPPED" | "FAILED";
    error: string | null;
  } | null;
  blocked: boolean;
  reference?: { name: string; route: Route };
  sharedAt: string | null;
  seals: { at: string; reason: Pair; hash: string }[];
  covert: boolean;
  recordings: {
    id: string;
    mime: string;
    chunks: number;
    bytes: number;
    hash: string;
  }[];
};
export type Account = {
  id: string;
  version: number;
  incident: Incident;
  members: Member[];
  history: Incident[];
};
export type PublicAccount = Omit<Account, "members" | "history"> & {
  members: Omit<Member, "tokenHash">[];
  config: {
    ai: boolean;
    aiAccessRequired: boolean;
    maps: boolean;
    storage: "sqlite" | "postgres";
  };
  integrity?: { valid: boolean; count: number; head: string };
};
export const choose = (pair: Pair, locale: Locale) =>
  pair[locale === "vi" ? 0 : 1];
export const now = () => new Date().toISOString();
