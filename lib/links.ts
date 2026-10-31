const PUBLIC_HEALTH_TIMEOUT_MS = 2_000;
const VERIFIED_URL_CACHE_TTL_MS = 15_000;
const UNAVAILABLE_URL_CACHE_TTL_MS = 3_000;
const MAX_PUBLIC_URL_CACHE_ENTRIES = 30;

// Role-play always stays on the current server. A share URL is published only
// after the public endpoint proves it reaches this same running instance.
export function rolePath(token: string) { return `/r/${encodeURIComponent(token)}`; }
export function publicOrigin(raw?: string | null) {
  try {
    const url = new URL(raw ?? "");
    return url.protocol === "https:" && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash ? url.origin : null;
  } catch { return null; }
}
const checks = new Map<string, { until: number; url: string | null }>();
export async function verifiedPublicUrl(raw: string | null, instanceId: string, transport: typeof fetch = fetch) {
  const origin = publicOrigin(raw);
  if (!origin) return null;
  const key = `${instanceId}:${origin}`, cached = checks.get(key);
  if (cached && cached.until > Date.now()) return cached.url;
  let url: string | null = null;
  try {
    const response = await transport(`${origin}/api/health`, { signal: AbortSignal.timeout(PUBLIC_HEALTH_TIMEOUT_MS), cache: "no-store", redirect: "error" });
    const data = response.ok ? await response.json() : null;
    if (data?.service === "guardian-ai" && data.instanceId === instanceId) url = origin;
  } catch { /* An unavailable or mismatched tunnel must never be advertised. */ }
  checks.set(key, { until: Date.now() + (url ? VERIFIED_URL_CACHE_TTL_MS : UNAVAILABLE_URL_CACHE_TTL_MS), url });
  if (checks.size > MAX_PUBLIC_URL_CACHE_ENTRIES) checks.delete(checks.keys().next().value!);
  return url;
}
