import type { ActionProposal } from "./types";
export function policyGate(
  p: ActionProposal,
  allowlist: string[],
  recentCalls = 0,
) {
  if (p.provider === "MOCK")
    return {
      allowed: p.mode === "SIMULATION",
      reason:
        p.mode === "SIMULATION"
          ? "SIMULATION_ONLY"
          : "Mock calls require SIMULATION mode",
    };
  // In-app call to a registered partner who opted in and is on duty.
  if (p.provider === "APP")
    return p.eligible
      ? { allowed: true, reason: "REGISTERED_PARTNER_ON_DUTY" }
      : { allowed: false, reason: "Partner is not registered or off duty" };
  if (p.mode !== "TEST_LIVE")
    return { allowed: false, reason: "Real calls require TEST_LIVE mode" };
  if (!p.consent || !p.eligible)
    return {
      allowed: false,
      reason: "Consent and contact eligibility are required",
    };
  if (
    !p.number ||
    !/^\+[1-9]\d{7,14}$/.test(p.number) ||
    !allowlist.includes(p.number)
  )
    return {
      allowed: false,
      reason: "Number is not a team-controlled E.164 allowlisted test number",
    };
  if (
    ["113", "114", "115", "911", "112"].includes(p.number.replace(/^\+84/, ""))
  )
    return { allowed: false, reason: "Emergency numbers are never callable" };
  if (recentCalls >= 3)
    return {
      allowed: false,
      reason: "Rate limit: 3 real calls per incident / 10 minutes",
    };
  return { allowed: true, reason: "CONSENTED_ALLOWLIST_TEST" };
}
