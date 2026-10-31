const PUBLIC_HEALTH_TIMEOUT_MS = 2_000;
const VERIFIED_URL_CACHE_TTL_MS = 15_000;
const UNAVAILABLE_URL_CACHE_TTL_MS = 3_000;
const MAX_PUBLIC_URL_CACHE_ENTRIES = 30;

type PublicUrlCheck = {
  until: number;
  url: string | null;
};

// Role-play always stays on the current server. A share URL is published only
// after the public endpoint proves it reaches this same running instance.
export function rolePath(token: string): string {
  return `/r/${encodeURIComponent(token)}`;
}

export function publicOrigin(raw?: string | null): string | null {
  try {
    const url = new URL(raw ?? "");
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

const checks = new Map<string, PublicUrlCheck>();

export async function verifiedPublicUrl(
  raw: string | null,
  instanceId: string,
  transport: typeof fetch = fetch,
): Promise<string | null> {
  const origin = publicOrigin(raw);
  if (!origin) return null;
  const cacheKey = `${instanceId}:${origin}`;
  const cachedCheck = checks.get(cacheKey);
  if (cachedCheck && cachedCheck.until > Date.now()) return cachedCheck.url;

  let verifiedOrigin: string | null = null;
  try {
    const response = await transport(`${origin}/api/health`, {
      signal: AbortSignal.timeout(PUBLIC_HEALTH_TIMEOUT_MS),
      cache: "no-store",
      redirect: "error",
    });
    const health = response.ok ? await response.json() : null;
    if (health?.service === "guardian-ai" && health.instanceId === instanceId) {
      verifiedOrigin = origin;
    }
  } catch {
    // An unavailable or mismatched tunnel must never be advertised.
  }

  checks.set(cacheKey, {
    until:
      Date.now() +
      (verifiedOrigin
        ? VERIFIED_URL_CACHE_TTL_MS
        : UNAVAILABLE_URL_CACHE_TTL_MS),
    url: verifiedOrigin,
  });
  if (checks.size > MAX_PUBLIC_URL_CACHE_ENTRIES) {
    checks.delete(checks.keys().next().value!);
  }
  return verifiedOrigin;
}
