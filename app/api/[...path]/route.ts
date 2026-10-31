import { NextRequest, NextResponse } from "next/server";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  activePlan,
  event,
  fresh,
  getEngine,
  invalidate,
  original,
  seal,
  terminal,
} from "@/lib/engine";
import { aiConfigured, realtimeSecret } from "@/lib/ai";
import { digest } from "@/lib/repository";
import type { Account, Incident, Member } from "@/lib/types";
import { reportHtml } from "@/lib/report";
import { caseFile } from "@/lib/case-file";
import { emergency } from "@/lib/rules";
import { places, isOpen, walkingRoute } from "@/lib/city";
import { distance } from "@/lib/rules";
import {
  coordination,
  callEvent,
  pump,
  cancelCalls,
  findCall,
  callTerminal,
  transition,
} from "@/lib/calls";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const globals = globalThis as unknown as {
  newSecret?: string;
  rate?: Map<string, number[]>;
};
const secret = () => {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32)
    return process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === "production")
    throw new Error("SERVER_SECRET_REQUIRED");
  return (globals.newSecret ??= randomUUID() + randomUUID());
};
const sign = (id: string) =>
  createHmac("sha256", secret()).update(id).digest("hex");
function aiAccess(req: NextRequest) {
  const code = process.env.AI_ACCESS_CODE;
  if (
    code &&
    !timingSafeEqual(
      Buffer.from(digest(code)),
      Buffer.from(digest(req.headers.get("x-guardian-ai-code") || "")),
    )
  )
    throw new Error("AI_ACCESS_CODE_REQUIRED");
}
function scope(req: NextRequest): "DEMO" | "TEAM" | "LIVE" {
  const value =
    req.headers.get("x-guardian-mode") ||
    (req.method === "GET" ? req.nextUrl.searchParams.get("scope") : null);
  return value === "demo" ? "DEMO" : value === "team" ? "TEAM" : "LIVE";
}
function demoScope(req: NextRequest) {
  return scope(req) === "DEMO";
}
function ownerCookie(req: NextRequest) {
  return scope(req) === "DEMO"
    ? "guardian_demo_v3"
    : scope(req) === "TEAM"
      ? "guardian_team_v1"
      : "guardian_live_v3";
}
function signedOwner(value?: string) {
  const [id, sig] = value?.split(".") || [];
  if (!id || !/^[a-f0-9-]{36}$/.test(id) || !sig) return null;
  const expected = sign(id);
  return sig.length === expected.length &&
    timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    ? id
    : null;
}
function owner(req: NextRequest) {
  return signedOwner(req.cookies.get(ownerCookie(req))?.value);
}
function rate(key: string, max: number, window = 60000) {
  const m = (globals.rate ??= new Map<string, number[]>());
  const recent = (m.get(key) || []).filter((n) => Date.now() - n < window);
  if (recent.length >= max) throw new Error("RATE_LIMIT");
  m.set(key, [...recent, Date.now()]);
  if (m.size > 10000)
    for (const [k, v] of m) if (v.at(-1)! < Date.now() - window) m.delete(k);
}
const point = {
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
};
const locale = z.enum(["vi", "en"]);
const text = z.string().trim().min(1).max(2000);
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("team-location"), ...point }).strict(),
  z.object({ action: z.literal("call-demo") }).strict(),
  z
    .object({ action: z.literal("demo-received"), planId: z.string().uuid() })
    .strict(),
  z
    .object({ action: z.literal("cancel-call"), callId: z.string().uuid() })
    .strict(),
  z
    .object({
      action: z.literal("call-settings"),
      concurrency: z.number().int().min(1).max(5),
      maxPartners: z.number().int().min(1).max(8),
      initialRadius: z.number().int().min(100).max(2000),
      maxRadius: z.number().int().min(2000).max(10000),
    })
    .strict(),
  z
    .object({
      action: z.literal("scenario-time"),
      minute: z.number().int().min(0).max(1439),
    })
    .strict(),
  z
    .object({
      action: z.literal("directions"),
      placeId: z.string().min(1).max(80),
    })
    .strict(),
  z
    .object({
      action: z.literal("simulate"),
      kind: z.enum(["move", "offroute", "injury", "signal"]),
    })
    .strict(),
  z
    .object({
      action: z.literal("new"),
      mode: z.enum(["DEMO", "LIVE", "TEAM"]),
      locale,
    })
    .strict(),
  z.object({ action: z.literal("locale"), locale }).strict(),
  z
    .object({
      action: z.literal("demo"),
      locale,
      ai: z.boolean().default(false),
      consent: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      action: z.enum([
        "pause",
        "next",
        "stop",
        "cancel",
        "block",
        "arrived",
        "checkin",
        "trip-stop",
      ]),
    })
    .strict(),
  z.object({ action: z.literal("sos"), text }).strict(),
  z.object({ action: z.literal("chat"), text }).strict(),
  z.object({ action: z.literal("ai-sos"), text }).strict(),
  z
    .object({
      action: z.literal("ai"),
      enabled: z.boolean(),
      consent: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal("needs"),
      maxWalk: z.number().int().min(20).max(5000),
      avoidAlleys: z.boolean(),
      discreet: z.boolean(),
      canMove: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal("location"),
      ...point,
      consent: z.literal(true),
    })
    .strict(),
  z.object({ action: z.literal("accept"), planId: z.string().uuid() }).strict(),
  z
    .object({ action: z.literal("handoff"), planId: z.string().uuid() })
    .strict(),
  z
    .object({
      action: z.literal("trip"),
      label: z.string().trim().min(1).max(80),
      minutes: z.number().int().min(1).max(240),
    })
    .strict(),
  z.object({ action: z.literal("covert"), enabled: z.boolean() }).strict(),
  z
    .object({
      action: z.literal("transcript"),
      who: z.enum(["You", "Guardian AI"]),
      text,
      id: z.string().min(1).max(120),
    })
    .strict(),
  z.object({ action: z.literal("voice"), consent: z.literal(true) }).strict(),
  z
    .object({
      action: z.literal("recording-consent"),
      consent: z.literal(true),
    })
    .strict(),
  z.object({ action: z.literal("delete-transcript") }).strict(),
]);
const memberInput = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("team-venue"),
      placeId: z.string().min(1).max(80),
    })
    .strict(),
  z.object({ action: z.literal("heartbeat") }).strict(),
  z
    .object({ action: z.literal("call-consent"), enabled: z.boolean() })
    .strict(),
  z
    .object({
      action: z.literal("call-event"),
      incidentId: z.string().uuid(),
      callId: z.string().uuid(),
      eventId: z.string().uuid(),
      attempt: z.number().int().min(1).max(3),
      seq: z.number().int().min(0),
      kind: z.enum(["ringing", "answer", "decline", "busy", "end"]),
    })
    .strict(),
  z
    .object({
      action: z.literal("call-message"),
      incidentId: z.string().uuid(),
      callId: z.string().uuid(),
      messageId: z.string().uuid(),
      attempt: z.number().int().min(1).max(3),
      text,
    })
    .strict(),
  z
    .object({
      action: z.literal("profile"),
      kind: z.string().trim().min(1).max(60),
      address: z.string().trim().min(1).max(250),
      timezone: z
        .string()
        .max(80)
        .refine((s) => {
          try {
            new Intl.DateTimeFormat("en", { timeZone: s });
            return true;
          } catch {
            return false;
          }
        }),
      hours: z
        .array(
          z
            .object({
              days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
              open: z.number().int().min(0).max(1439),
              close: z.number().int().min(0).max(1439),
            })
            .strict(),
        )
        .max(14),
      receiving: z.boolean(),
      staffed: z.boolean(),
      waiting: z.boolean(),
      accessible: z.boolean(),
      limitations: z.string().max(500),
      entrance: z.string().max(250),
      meeting: z.string().max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal("join"),
      consent: z.literal(true),
      calls: z.boolean().optional(),
    })
    .strict(),
  z.object({ action: z.literal("duty"), enabled: z.boolean() }).strict(),
  z
    .object({
      action: z.literal("location"),
      ...point,
      consent: z.literal(true),
    })
    .strict(),
  z
    .object({ action: z.literal("reply"), text, incidentId: z.string().uuid() })
    .strict(),
  z
    .object({ action: z.literal("handoff"), incidentId: z.string().uuid() })
    .strict(),
  z
    .object({
      action: z.literal("voice"),
      locale,
      consent: z.literal(true),
      callId: z.string().uuid().optional(),
    })
    .strict(),
]);
const publicAccount = (a: Account) => ({
  id: a.id,
  version: a.version,
  incident: a.incident,
  members: a.members.map(({ tokenHash: _, ...m }) => m),
  config: {
    ai: aiConfigured(),
    aiAccessRequired: Boolean(process.env.AI_ACCESS_CODE),
    maps: !!process.env.GOOGLE_MAPS_API_KEY,
    storage: process.env.DATABASE_URL ? "postgres" : "sqlite",
  },
});
function receiver(a: Account, m: Member) {
  const i = a.incident,
    r = i.replies.find((r) => r.memberId === m.id),
    p = activePlan(i);
  const canSee = !!r && (m.role === "CONTACT" || r.state === "ACCEPTED");
  return {
    member: {
      id: m.id,
      name: m.name,
      role: m.role,
      joined: m.joined,
      onDuty: m.onDuty,
      location: m.location,
      profile: m.profile,
      callConsentAt: m.callConsentAt || null,
    },
    mode: i.mode,
    config: { ai: aiConfigured() && i.ai.enabled },
    incident: r
      ? {
          id: i.id,
          mode: i.mode,
          status: i.status,
          locale: i.locale,
          risk: i.risk,
          reply: r,
          calls: coordination(i).calls.filter((c) => c.memberId === m.id),
          location: canSee ? i.location : null,
          plan: canSee ? p : null,
          trip: m.role === "CONTACT" ? i.trip : null,
          shared: m.role === "CONTACT" && !!i.sharedAt,
          events: canSee ? i.events.slice(-6) : [],
        }
      : null,
  };
}
function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
function fail(e: unknown) {
  if (e instanceof z.ZodError) return json({ error: "INVALID_INPUT" }, 400);
  const msg = e instanceof Error ? e.message : "REQUEST_FAILED";
  const allowed = /^[A-Z][A-Z0-9_]+$/;
  const error = allowed.test(msg) ? msg : "REQUEST_FAILED";
  return json(
    { error },
    error === "NOT_FOUND"
      ? 404
      : error === "FORBIDDEN" || error === "ORIGIN_REQUIRED"
        ? 403
        : error === "SESSION_REQUIRED"
          ? 401
          : error === "RATE_LIMIT"
            ? 429
            : 400,
  );
}
type Context = { params: Promise<{ path: string[] }> };
export async function GET(req: NextRequest, context: Context) {
  try {
    const { path } = await context.params;
    const e = getEngine();
    if (path[0] === "health") {
      await e.repo.ready;
      return json({
        service: "guardian-ai-new",
        ready: true,
        storage: process.env.DATABASE_URL ? "postgres" : "sqlite",
      });
    }
    if (path[0] === "join" && path[1]) {
      const { a, m } = await e.member(path[1]);
      if (path[2] === "record") {
        if (
          !m.joined ||
          m.role !== "CONTACT" ||
          !a.incident.sharedAt ||
          !a.incident.replies.some((r) => r.memberId === m.id)
        )
          throw new Error("NOT_FOUND");
        return new Response(
          reportHtml(
            a.incident,
            await e.repo.integrity(a.incident.id),
            req.nextUrl.searchParams.get("lang") === "en" ? "en" : "vi",
          ),
          {
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "no-store",
            },
          },
        );
      }
      return json(receiver(a, m));
    }
    let id = owner(req);
    if (path[0] === "session") {
      id ??= randomUUID();
      const a = await e.account(id, scope(req));
      const response = json(publicAccount(a));
      response.cookies.set(ownerCookie(req), id + "." + sign(id), {
        httpOnly: true,
        sameSite: "lax",
        secure:
          req.nextUrl.protocol === "https:" ||
          process.env.PUBLIC_URL?.startsWith("https:"),
        maxAge: 86400 * 7,
        path: "/",
      });
      return response;
    }
    if (!id) throw new Error("SESSION_REQUIRED");
    const a = await e.account(id);
    if (path[0] === "state") return json(publicAccount(a));
    if (path[0] === "record") {
      const i = [a.incident, ...a.history].find((i) => i.id === path[1]);
      if (!i) throw new Error("NOT_FOUND");
      const integrity = await e.repo.integrity(i.id);
      if (req.nextUrl.searchParams.get("format") === "json")
        return json({ incident: i, integrity, caseFile: caseFile(i) });
      return new Response(
        reportHtml(
          i,
          integrity,
          req.nextUrl.searchParams.get("lang") === "en" ? "en" : "vi",
        ),
        {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          },
        },
      );
    }
    if (path[0] === "audio") {
      const i = [a.incident, ...a.history].find((i) => i.id === path[1]);
      if (!i || !i.recordings.some((r) => r.id === path[2]))
        throw new Error("NOT_FOUND");
      const rows = await e.repo.query(
        "SELECT mime,payload FROM guardian_audio WHERE incident=$1 AND id=$2 ORDER BY seq",
        [i.id, path[2]],
      );
      const bytes = Buffer.concat(
        rows.map((r) => Buffer.from(String(r.payload), "base64")),
      );
      return new Response(bytes, {
        headers: {
          "Content-Type": String(rows[0]?.mime || "application/octet-stream"),
          "Cache-Control": "no-store",
        },
      });
    }
    if (path[0] === "stream") {
      const encoder = new TextEncoder();
      let timer: ReturnType<typeof setInterval>;
      let stopped = false;
      const stream = new ReadableStream({
        async start(controller) {
          const send = async () => {
            try {
              if (!stopped)
                controller.enqueue(
                  encoder.encode(
                    "data: " +
                      JSON.stringify(publicAccount(await e.account(id!))) +
                      "\n\n",
                  ),
                );
            } catch {
              clearInterval(timer);
            }
          };
          await send();
          timer = setInterval(send, 2000);
          req.signal.addEventListener(
            "abort",
            () => {
              stopped = true;
              clearInterval(timer);
              try {
                controller.close();
              } catch {}
            },
            { once: true },
          );
        },
        cancel() {
          stopped = true;
          clearInterval(timer);
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
        },
      });
    }
    throw new Error("NOT_FOUND");
  } catch (e) {
    return fail(e);
  }
}
export async function POST(req: NextRequest, context: Context) {
  try {
    const origin = req.headers.get("origin");
    let expected = process.env.PUBLIC_URL
      ? new URL(process.env.PUBLIC_URL).origin
      : req.nextUrl.origin;
    // Local Next may normalize localhost. Only accept an explicit local Host as an additional origin.
    const host = req.headers.get("host") || "";
    const local =
      /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host) &&
      origin === `http://${host}`;
    if (!origin || (origin !== expected && !local))
      throw new Error("ORIGIN_REQUIRED");
    const { path } = await context.params,
      e = getEngine();
    if (path[0] === "join" && path[1]) {
      rate("join:" + digest(path[1]), 30);
      const { a, m } = await e.member(path[1]);
      const d = memberInput.parse(await req.json());
      let result: unknown;
      await e.with(a.id, async (current) => {
        const member = current.members.find((x) => x.id === m.id)!;
        const i = current.incident;
        if (d.action === "join") {
          member.joined = true;
          member.lastSeenAt = nowDate();
          if (d.calls === true) member.callConsentAt = nowDate();
          return;
        }
        if (!member.joined) throw new Error("CONSENT_REQUIRED");
        if (d.action === "team-venue") {
          if (i.mode !== "TEAM" || member.role !== "PARTNER")
            throw new Error("TEAM_ONLY");
          const place = places.find((p) => p.id === d.placeId);
          if (!place) throw new Error("NOT_FOUND");
          member.location = place.point;
          member.profile = {
            ...e.demoProfile(place.id)!,
            hours: [{ days: [0, 1, 2, 3, 4, 5, 6], open: 0, close: 0 }],
            contact: "in-app:" + member.id,
            contactVerifiedAt: nowDate(),
            source: "SIMULATED",
          };
          member.onDuty = true;
          const r = i.replies.find((r) => r.memberId === member.id);
          if (r) {
            r.location = member.location;
            r.profile = member.profile;
            await e.plan(i);
          }
          return;
        }
        if (d.action === "heartbeat") {
          member.lastSeenAt = nowDate();
          pump(i, e.callMembers(current));
          return;
        }
        if (d.action === "call-consent") {
          member.callConsentAt = d.enabled ? nowDate() : null;
          if (!d.enabled)
            for (const c of coordination(i).calls.filter(
              (c) => c.memberId === member.id && !callTerminal(c),
            ))
              transition(i, c, "CANCELLED", "CONSENT_REVOKED");
          return;
        }
        if (d.action === "profile") {
          if (member.role !== "PARTNER") throw new Error("FORBIDDEN");
          const { action: _, ...profile } = d;
          member.profile = {
            ...profile,
            source: "PARTNER",
            updatedAt: nowDate(),
            contact: "in-app:" + member.id,
            contactVerifiedAt: nowDate(),
          };
          const r = i.replies.find((r) => r.memberId === member.id);
          if (r) {
            r.profile = member.profile;
            await e.plan(i);
          }
          return;
        }
        if (d.action === "location") {
          if (member.role !== "PARTNER") throw new Error("FORBIDDEN");
          member.location = { lat: d.lat, lng: d.lng };
          const reply = i.replies.find((r) => r.memberId === member.id);
          if (reply) {
            reply.location = member.location;
            if (activePlan(i)?.replyId === reply.id)
              invalidate(i, [
                "Địa điểm tiếp nhận đã đổi; cần chấp nhận lại tuyến.",
                "The receiving location changed; the route needs acceptance again.",
              ]);
            await e.plan(i);
          }
          return;
        }
        if (d.action === "duty") {
          if (member.role !== "PARTNER") throw new Error("FORBIDDEN");
          member.onDuty = d.enabled;
          if (!d.enabled) {
            const r = i.replies.find((r) => r.memberId === member.id);
            if (r?.state === "ACCEPTED")
              await e.reply(i, member.id, "I can no longer help.", false);
          }
          return;
        }
        if (d.action === "voice") {
          if (!i.replies.some((r) => r.memberId === member.id) || terminal(i))
            throw new Error("NO_ACTIVE_REQUEST");
          rate("voice:" + a.id, 6, 600000);
          const c = d.callId ? findCall(i, member.id, d.callId) : undefined;
          if (c && !["CONNECTED", "CONVERSING"].includes(c.state))
            throw new Error("CALL_NOT_CONNECTED");
          result = await realtimeSecret(i, member.role, d.locale, c);
          return;
        }
        if (d.incidentId !== i.id) throw new Error("STALE_SESSION");
        if (terminal(i) || i.status === "SIGNAL_LOST")
          throw new Error("SESSION_ENDED");
        if (d.action === "call-event") {
          result = callEvent(i, member.id, d);
          pump(i, e.callMembers(current));
        } else if (d.action === "call-message")
          result = await e.callMessage(
            current,
            member.id,
            d.callId,
            d.text,
            d.messageId,
            d.attempt,
          );
        else if (d.action === "reply") await e.reply(i, member.id, d.text);
        else e.handoff(i, "PARTNER", member.id);
      });
      return json(result || { ok: true });
    }
    const id = owner(req);
    if (!id) throw new Error("SESSION_REQUIRED");
    rate("owner:" + id, 100);
    if (path[0] === "recover-team") {
      if (scope(req) !== "TEAM") throw new Error("TEAM_ONLY");
      const source = signedOwner(req.cookies.get("guardian_demo_v3")?.value);
      if (source && (await e.repo.load(source))?.incident.mode === "DEMO")
        await e.repo.recoverTeamInvitations(source, id);
      await e.with(id, (a) => e.syncRecipients(a));
      return json(publicAccount(await e.account(id)));
    }
    if (path[0] === "members") {
      if (scope(req) === "DEMO") throw new Error("TEAM_INVITATION_REQUIRED");
      const d = z
        .object({
          name: z.string().trim().min(1).max(60),
          role: z.enum(["CONTACT", "PARTNER"]),
        })
        .strict()
        .parse(await req.json());
      return json(await e.with(id, (a) => e.invite(a, d.name, d.role)), 201);
    }
    if (path[0] === "audio") {
      const audioId = z
          .string()
          .uuid()
          .parse(req.nextUrl.searchParams.get("id")),
        seq = z.coerce
          .number()
          .int()
          .min(0)
          .max(5000)
          .parse(req.nextUrl.searchParams.get("seq"));
      const mime = req.headers.get("content-type")?.split(";")[0];
      if (!["audio/webm", "audio/mp4", "audio/ogg"].includes(mime || ""))
        throw new Error("INVALID_AUDIO_TYPE");
      const bytes = Buffer.from(await req.arrayBuffer());
      if (bytes.length > 2 * 1024 * 1024)
        throw new Error("AUDIO_CHUNK_TOO_LARGE");
      await e.with(id, async (a) => {
        const i = a.incident;
        if (terminal(i)) throw new Error("SESSION_ENDED");
        if (path[1] !== i.id) throw new Error("STALE_SESSION");
        if (!i.recordingConsentAt)
          throw new Error("RECORDING_CONSENT_REQUIRED");
        const rows = await e.repo.query(
          "SELECT * FROM guardian_audio WHERE incident=$1 AND id=$2 ORDER BY seq",
          [i.id, audioId],
        );
        if (rows[seq]) {
          if (rows[seq].hash !== digest(bytes) || rows[seq].mime !== mime)
            throw new Error("AUDIO_RETRY_MISMATCH");
          return;
        }
        if (seq !== rows.length) throw new Error("AUDIO_OUT_OF_ORDER");
        if (rows.length && rows[0].mime !== mime)
          throw new Error("AUDIO_TYPE_CHANGED");
        if (
          i.recordings.reduce((n, r) => n + r.bytes, 0) + bytes.length >
          80 * 1024 * 1024
        )
          throw new Error("RECORDING_LIMIT");
        e.repo.stageAudio(a, {
          id: audioId,
          seq,
          mime: mime!,
          payload: bytes.toString("base64"),
          hash: digest(bytes),
        });
        const all = [...rows, { payload: bytes.toString("base64") }];
        const total = Buffer.concat(
          all.map((r) => Buffer.from(String(r.payload), "base64")),
        );
        const metadata = {
          id: audioId,
          mime: mime!,
          chunks: all.length,
          bytes: total.length,
          hash: digest(total),
        };
        i.recordings = i.recordings
          .filter((r) => r.id !== audioId)
          .concat(metadata);
      });
      return json({ ok: true });
    }
    if (path[0] !== "action") throw new Error("NOT_FOUND");
    const { incidentId, ...body } = await req.json();
    const d = input.parse(body);
    let extra: unknown;
    const result = await e.with(id, async (a) => {
      const i = a.incident;
      if (d.action === "new") {
        if (d.mode !== scope(req)) throw new Error("MODE_SCOPE_MISMATCH");
        await e.create(a, d.mode, d.locale);
        return publicAccount(a);
      }
      if (d.action === "demo") {
        if (!demoScope(req)) throw new Error("DEMO_ONLY");
        if (d.ai) aiAccess(req);
        if (d.ai && !d.consent) throw new Error("AI_CONSENT_REQUIRED");
        if (d.ai && !aiConfigured()) throw new Error("AI_NOT_CONFIGURED");
        await e.startDemo(a, d.locale, d.ai);
        return publicAccount(a);
      }
      if (d.action === "call-demo") {
        if (!demoScope(req)) throw new Error("DEMO_ONLY");
        await e.create(a, "DEMO", i.locale);
        coordination(a.incident).autoplay = true;
        await e.sos(
          a,
          i.locale === "vi"
            ? "Có người bám theo tôi. Tôi cần chỗ chờ, không qua hẻm."
            : "Someone is following me. I need a place to wait without using an alley.",
        );
        return publicAccount(a);
      }
      if (d.action !== "locale" && incidentId !== i.id)
        throw new Error("STALE_SESSION");
      if (terminal(i) && !["locale", "delete-transcript"].includes(d.action))
        throw new Error("SESSION_ENDED");
      switch (d.action) {
        case "team-location":
          if (i.mode !== "TEAM") throw new Error("TEAM_ONLY");
          i.location = {
            lat: d.lat,
            lng: d.lng,
            at: nowDate(),
            source: "SIMULATED",
          };
          i.track.push({ lat: d.lat, lng: d.lng, at: nowDate() });
          await e.plan(i);
          break;
        case "demo-received": {
          if (i.mode !== "DEMO") throw new Error("DEMO_ONLY");
          const p = activePlan(i);
          if (!p || p.id !== d.planId) throw new Error("PLAN_CHANGED");
          const r = i.replies.find((r) => r.id === p.replyId)!;
          e.handoff(i, "PARTNER", r.memberId);
          break;
        }
        case "call-settings":
          if (i.sosAt) throw new Error("CALLS_ALREADY_STARTED");
          Object.assign(coordination(i).limits, {
            concurrency: d.concurrency,
            maxPartners: d.maxPartners,
            initialRadius: d.initialRadius,
            maxRadius: d.maxRadius,
          });
          break;
        case "cancel-call": {
          const c = coordination(i).calls.find((c) => c.id === d.callId);
          if (!c) throw new Error("CALL_NOT_FOUND");
          if (!callTerminal(c))
            transition(i, c, "CANCELLED", "OWNER_CANCELLED");
          break;
        }
        case "scenario-time":
          if (i.mode === "LIVE") throw Error("DEMO_ONLY");
          i.scenarioMinute = d.minute;
          if (i.reference) {
            const place = places.find((p) => p.name === i.reference!.name);
            if (place && !isOpen(place, d.minute)) delete i.reference;
          }
          await e.plan(i);
          event(i, "SCENARIO_TIME", [
            "Đã đổi giờ tình huống; kiểm tra lại giờ mở cửa và phương án.",
            "Scenario time changed; opening hours and plans rechecked.",
          ]);
          break;
        case "directions": {
          const place = places.find((p) => p.id === d.placeId);
          if (!place || !isOpen(place, i.scenarioMinute) || !i.location)
            throw Error("NO_OPEN_DESTINATION");
          if (i.mode === "LIVE") throw Error("SIMULATED_PLACE_NOT_LIVE");
          i.reference = {
            name: place.name,
            route: walkingRoute(i.location, place.point, [], true),
          };
          event(i, "REFERENCE_ROUTE", [
            "Tuyến do bạn yêu cầu; nơi này chưa xác nhận tiếp nhận.",
            "User-requested reference route; this place has not confirmed reception.",
          ]);
          break;
        }
        case "simulate": {
          if (i.mode !== "DEMO") throw Error("DEMO_ONLY");
          if (d.kind === "signal") {
            e.lose(i);
            if (i.demo) i.demo.status = "STOPPED";
            break;
          }
          if (d.kind === "injury") {
            i.risk = 4;
            original(
              i,
              "You",
              i.locale === "vi"
                ? "Tình huống mô phỏng: tôi bị thương, đang chảy máu."
                : "Simulated scenario: I am injured and bleeding.",
            );
            invalidate(i, [
              "Có thương tích; cần đánh giá lại khả năng sơ cứu.",
              "Injury reported; first-aid capability must be reassessed.",
            ]);
            seal(i, [
              "Ghi nhận thương tích mô phỏng",
              "Simulated injury recorded",
            ]);
            break;
          }
          const p = activePlan(i);
          if (!p?.acceptedAt || !i.location) throw Error("NO_ACCEPTED_PLAN");
          if (d.kind === "offroute") {
            i.location = {
              ...i.location,
              lat: i.location.lat + 0.001,
              at: nowDate(),
            };
            invalidate(i, [
              "Mô phỏng lệch tuyến; dừng chỉ dẫn cũ.",
              "Simulated route deviation; previous guidance stopped.",
            ]);
            await e.plan(i);
            break;
          }
          p.progressMeters = Math.min(
            p.route.meters,
            (p.progressMeters || 0) + 40,
          );
          let left = p.progressMeters,
            point = p.route.points.at(-1)!;
          for (let n = 1; n < p.route.points.length; n++) {
            const a = p.route.points[n - 1],
              b = p.route.points[n],
              length = distance(a, b);
            if (left <= length) {
              const ratio = left / (length || 1);
              point = {
                lat: a.lat + (b.lat - a.lat) * ratio,
                lng: a.lng + (b.lng - a.lng) * ratio,
              };
              break;
            }
            left -= length;
          }
          i.location = { ...point, at: nowDate(), source: "SIMULATED" };
          i.track.push({ ...point, at: nowDate() });
          event(i, "SIMULATED_MOVEMENT", [
            "Đã tiến 40 m dọc tuyến phố mô phỏng.",
            "Advanced 40 m along the simulated street route.",
          ]);
          break;
        }
        case "locale":
          i.locale = d.locale;
          break;
        case "pause":
          if (!i.demo || i.demo.status !== "RUNNING")
            throw new Error("NO_ACTIVE_DEMO");
          i.demo.paused = !i.demo.paused;
          i.demo.nextAt = new Date(Date.now() + 12000).toISOString();
          break;
        case "next":
          if (i.mode !== "DEMO" || i.demo?.paused)
            throw new Error("NO_ACTIVE_DEMO");
          await e.demoStep(i);
          break;
        case "stop":
        case "cancel":
          i.status = "CANCELLED";
          i.generation++;
          if (i.demo) i.demo.status = "STOPPED";
          invalidate(i, ["Phiên đã dừng", "Session stopped"]);
          seal(i, ["Người dùng kết thúc phiên", "User ended the session"]);
          break;
        case "ai":
          if (d.enabled) aiAccess(req);
          if (d.enabled && (!d.consent || !aiConfigured()))
            throw new Error("AI_CONSENT_REQUIRED");
          i.ai.enabled = d.enabled;
          i.ai.consentedAt = d.enabled ? nowDate() : null;
          i.ai.status = d.enabled ? "READY" : "OFF";
          break;
        case "sos":
          if (i.mode === "DEMO") throw new Error("TEAM_INVITATION_REQUIRED");
          if (i.mode === "LIVE") rate("sos:" + id, 6, 3600000);
          await e.sos(a, d.text);
          break;
        case "chat":
          {
            const result = await e.chat(i, d.text);
            extra =
              i.mode !== "DEMO" && result.intent === "SOS"
                ? { ...result, ...(await e.autoSos(a, d.text)) }
                : result;
          }
          break;
        case "ai-sos":
          extra = await e.autoSos(a, d.text);
          break;
        case "needs":
          i.needs = {
            maxWalk: d.maxWalk,
            avoidAlleys: d.avoidAlleys,
            discreet: d.discreet,
            canMove: d.canMove,
          };
          await e.plan(i);
          break;
        case "location":
          await e.location(i, d);
          break;
        case "accept":
          e.accept(i, d.planId);
          break;
        case "block":
          await e.block(i);
          break;
        case "handoff":
          if (activePlan(i)?.id !== d.planId) throw new Error("PLAN_CHANGED");
          e.handoff(i, "USER");
          break;
        case "trip":
          if (
            i.mode !== "LIVE" ||
            !i.location ||
            Date.now() - Date.parse(i.location.at) > 90000
          )
            throw new Error("CURRENT_LOCATION_REQUIRED");
          if (!a.members.some((m) => m.role === "CONTACT" && m.joined))
            throw new Error("JOINED_CONTACT_REQUIRED");
          if (i.sosAt) throw new Error("SOS_ALREADY_ACTIVE");
          i.trip = {
            label: d.label,
            dueAt: new Date(Date.now() + d.minutes * 60000).toISOString(),
            checkBy: null,
            lastCheckAt: nowDate(),
            state: "ACTIVE",
          };
          e.alert(
            i,
            a.members.filter((m) => m.role === "CONTACT"),
          );
          event(i, "TRIP_STARTED", [
            "Người thân đã có thể theo dõi phiên.",
            "Your joined contacts can now follow the session.",
          ]);
          break;
        case "checkin":
          if (i.trip?.state !== "CHECKING") throw new Error("NO_CHECKIN");
          i.trip.state = "ACTIVE";
          i.trip.checkBy = null;
          i.trip.dueAt = new Date(Date.now() + 10 * 60000).toISOString();
          i.trip.lastCheckAt = nowDate();
          i.status = "READY";
          event(i, "CHECKED_IN", [
            "Bạn xác nhận vẫn ổn; hẹn thêm 10 phút.",
            "You checked in; extended by 10 minutes.",
          ]);
          break;
        case "arrived":
        case "trip-stop":
          if (!i.trip) throw new Error("NO_TRIP");
          i.trip.state = d.action === "arrived" ? "ARRIVED" : "STOPPED";
          i.trip.checkBy = null;
          event(
            i,
            "TRIP_FINISHED",
            d.action === "arrived"
              ? [
                  "Bạn tự xác nhận đã tới nơi.",
                  "You reported reaching your destination.",
                ]
              : ["Đã dừng hẹn giờ.", "Check-in timer stopped."],
          );
          break;
        case "covert":
          i.covert = d.enabled;
          break;
        case "transcript":
          if (!i.ai.enabled) throw new Error("AI_CONSENT_REQUIRED");
          original(i, d.who, d.text, d.id);
          if (d.who === "You") {
            const urgent = emergency(d.text);
            if (urgent) {
              i.risk = urgent.risk;
              if (i.mode !== "DEMO") extra = await e.autoSos(a, d.text);
              event(i, "URGENT_TRANSCRIPT", [
                "Hội thoại có dấu hiệu khẩn cấp; bạn có thể chọn SOS hoặc gọi hỗ trợ.",
                "Urgent content in conversation; you can choose SOS or call for help.",
              ]);
            }
          }
          break;
        case "voice":
          rate("voice:" + id, 6, 600000);
          extra = await realtimeSecret(i, "USER");
          break;
        case "recording-consent":
          i.recordingConsentAt = nowDate();
          event(i, "RECORDING_CONSENT", [
            "Bạn đồng ý lưu âm thanh của cuộc trò chuyện AI.",
            "You consented to storing audio of the AI conversation.",
          ]);
          break;
        case "delete-transcript":
          if (!terminal(i)) throw new Error("END_SESSION_FIRST");
          i.transcript = [];
          for (const c of coordination(i).calls) c.turns = [];
          i.replies.forEach((r) => {
            r.quote = "";
            r.offer = "";
          });
          i.recordings = [];
          i.events = [];
          i.seals = [];
          i.sharedAt = null;
          e.repo.erasePrivateHistory(a);
          event(i, "REDACTED", [
            "Đã xóa lời nói và ghi âm theo yêu cầu.",
            "Statements and recordings deleted on request.",
          ]);
          break;
      }
      i.updatedAt = nowDate();
      return publicAccount(a);
    });
    return json({ ...result, result: extra });
  } catch (e) {
    return fail(e);
  }
}
const nowDate = () => new Date().toISOString();
