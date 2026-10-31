import type { Pair, Point } from "./types";

export type PartnerProfile = {
  kind: string;
  address: string;
  contact: string;
  contactVerifiedAt: string | null;
  timezone: string;
  hours: { days: number[]; open: number; close: number }[];
  updatedAt: string;
  source: "PARTNER" | "SIMULATED" | "EXTERNAL";
  receiving: boolean;
  staffed: boolean;
  waiting: boolean;
  accessible: boolean;
  limitations: string;
  entrance: string;
  meeting: string;
};
export type CallState =
  | "QUEUED"
  | "CALLING"
  | "RINGING"
  | "CONNECTED"
  | "CONVERSING"
  | "COMPLETED"
  | "NO_ANSWER"
  | "BUSY"
  | "DECLINED"
  | "ERROR"
  | "CANCELLED";
export type AppCall = {
  id: string;
  incidentId: string;
  memberId: string;
  name: string;
  role: "CONTACT" | "PARTNER";
  purpose: "INQUIRY" | "ASSIGNMENT";
  planId: string | null;
  task: Pair | null;
  adapter: "SIMULATED" | "IN_APP";
  state: CallState;
  attempt: number;
  seq: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  deadline: string | null;
  retryAt: string | null;
  endedAt: string | null;
  reason: string | null;
  seenEvents: string[];
  turns: {
    id: string;
    who: "AI" | "RECIPIENT";
    text: string;
    at: string;
    source: "AI" | "RECIPIENT" | "SIMULATED";
  }[];
  history: {
    at: string;
    state: CallState;
    reason: string | null;
    attempt: number;
  }[];
};
export type Discovery = {
  at: string;
  radius: number;
  radii: number[];
  candidates: {
    memberId: string;
    name: string;
    meters: number | null;
    group: "AVAILABLE" | "UNKNOWN" | "UNLINKED";
    eligible: boolean;
    reasons: string[];
    profile?: PartnerProfile;
  }[];
  references: {
    id: string;
    name: string;
    point: Point;
    address: string;
    source: string;
    updatedAt: string;
    linked: false;
  }[];
};
export type Coordination = {
  calls: AppCall[];
  discovery: Discovery | null;
  limits: {
    concurrency: number;
    durationSeconds: number;
    queueSeconds: number;
    retries: number;
    budgetSeconds: number;
    maxPartners: number;
    initialRadius: number;
    maxRadius: number;
  };
  reservedSeconds: number;
  autoplay: boolean;
  outcome:
    | "SEARCHING"
    | "WAITING"
    | "OFFER_AVAILABLE"
    | "TASKS_ASSIGNED"
    | "COMPLETE"
    | "STOPPED";
};
