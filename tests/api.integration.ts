import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { readdirSync } from "node:fs";

async function main() {
  const socket = createServer();
  await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`;
  const server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--port",
      String(port),
      "--hostname",
      "127.0.0.1",
    ],
    {
      env: {
        ...process.env,
        NODE_ENV: "production",
        DATABASE_URL: "",
        DATABASE_PATH: ":memory:",
        AI_ENABLED: "false",
        OPENAI_API_KEY: "",
        GOOGLE_MAPS_API_KEY: "",
        PUBLIC_URL: "",
        AI_ACCESS_CODE: "isolated-test-code",
        SESSION_SECRET: randomBytes(32).toString("hex"),
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  let output = "";
  server.stdout.on("data", (b) => (output += b));
  server.stderr.on("data", (b) => (output += b));
  const request = (url: string, cookie = "", body?: unknown, origin = base) =>
    fetch(base + "/api/" + url, {
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        "x-guardian-mode": cookie.startsWith("guardian_demo_v3=")
          ? "demo"
          : "live",
        ...(body ? { "Content-Type": "application/json", Origin: origin } : {}),
      },
      ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
    });
  async function client(demo = false) {
    const res = await request("session" + (demo ? "?scope=demo" : ""));
    assert.equal(res.status, 200);
    const c = {
      cookie: res.headers.get("set-cookie")!.split(";")[0],
      state: await res.json(),
    };
    return c;
  }
  type Client = Awaited<ReturnType<typeof client>>;
  async function action(
    c: Client,
    action: string,
    fields: Record<string, unknown> = {},
    expected = 200,
  ) {
    const res = await request("action", c.cookie, {
      action,
      incidentId: c.state.incident.id,
      ...fields,
    });
    assert.equal(
      res.status,
      expected,
      `${action}: ${await res.clone().text()}`,
    );
    const value = await res.json();
    if (value.incident) c.state = value;
    return value;
  }
  try {
    let ready = false;
    for (let n = 0; n < 100; n++) {
      try {
        ready = (await request("health")).ok;
      } catch {}
      if (ready) break;
      await delay(200);
    }
    assert.ok(ready, `Server did not start: ${output.slice(-1000)}`);
    assert.equal((await fetch(base)).status, 200);
    assert.equal((await fetch(base + "/demo")).status, 200);
    assert.equal((await fetch(base + "/walk")).status, 200);
    const workers = readdirSync(".next/static/media").filter((name) =>
      /^maplibre-gl-worker\.[^.]+\.mjs$/.test(name),
    );
    assert.ok(
      workers.length,
      "production build must emit MapLibre's module worker",
    );
    for (const worker of workers) {
      const resource = await fetch(`${base}/_next/static/media/${worker}`);
      assert.equal(
        resource.status,
        200,
        "worker must be served rather than an HTML 404",
      );
      assert.match(resource.headers.get("content-type") || "", /javascript/);
      assert.ok((await resource.text()).includes("MapLibre"));
    }
    assert.equal((await request("state")).status, 401);
    let user = await client();
    const stranger = await client();
    assert.equal(user.state.config.ai, false);
    assert.equal(JSON.stringify(user.state).includes("tokenHash"), false);
    assert.equal(
      (
        await request(
          "action",
          user.cookie,
          { action: "sos", text: "test" },
          "https://wrong-origin.invalid",
        )
      ).status,
      403,
    );
    await action(user, "new", { mode: "LIVE", locale: "en" });
    assert.equal(user.state.incident.location, null);
    await action(user, "sos", { text: "Help me" }, 400);
    await action(user, "location", { lat: 10.77, lng: 106.7, consent: true });
    const contact = await (
      await request("members", user.cookie, {
        name: "QA contact",
        role: "CONTACT",
      })
    ).json();
    const partner = await (
      await request("members", user.cookie, {
        name: "QA partner",
        role: "PARTNER",
      })
    ).json();
    assert.equal(contact.member.tokenHash, undefined);
    for (const invite of [contact, partner])
      assert.equal(
        (
          await request("join/" + invite.token, "", {
            action: "join",
            consent: true,
          })
        ).status,
        200,
      );
    assert.equal(
      (
        await request("join/" + partner.token, "", {
          action: "duty",
          enabled: true,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await request("join/" + partner.token, "", {
          action: "location",
          lat: 10.7701,
          lng: 106.7001,
          consent: true,
        })
      ).status,
      200,
    );
    for (const invite of [contact, partner]) {
      assert.equal(
        (
          await request("join/" + invite.token, "", {
            action: "call-consent",
            enabled: true,
          })
        ).status,
        200,
      );
    }
    assert.equal(
      (
        await request("join/" + partner.token, "", {
          action: "profile",
          kind: "Cafe",
          address: "Test address",
          timezone: "Asia/Ho_Chi_Minh",
          hours: [{ days: [0, 1, 2, 3, 4, 5, 6], open: 0, close: 0 }],
          receiving: true,
          staffed: true,
          waiting: true,
          accessible: true,
          limitations: "",
          entrance: "Main entrance",
          meeting: "Staff at entrance",
        })
      ).status,
      200,
    );
    await action(user, "sos", { text: "Someone is following me." });
    const receiver = await (await request("join/" + partner.token)).json();
    assert.equal(receiver.incident.calls.length, 1);
    assert.equal(receiver.incident.calls[0].memberId, receiver.member.id);
    const call = receiver.incident.calls[0];
    const answer = {
      action: "call-event",
      incidentId: user.state.incident.id,
      callId: call.id,
      attempt: call.attempt,
      seq: call.seq,
      eventId: randomUUID(),
      kind: "answer",
    };
    assert.equal(
      (await request("join/" + partner.token, "", answer)).status,
      200,
    );
    assert.equal(
      (await (await request("join/" + partner.token, "", answer)).json())
        .duplicate,
      true,
    );
    assert.equal(
      (
        await request("join/" + contact.token, "", {
          ...answer,
          eventId: randomUUID(),
        })
      ).status,
      400,
    );
    const privateView = await (await request("join/" + partner.token)).json();
    assert.equal(privateView.incident.calls[0].state, "CONVERSING");
    const sourceId = randomUUID();
    assert.equal(
      (
        await request("join/" + partner.token, "", {
          action: "call-message",
          incidentId: user.state.incident.id,
          callId: call.id,
          attempt: call.attempt,
          messageId: sourceId,
          text: "Maybe, let me ask the manager.",
        })
      ).status,
      200,
    );
    assert.equal(
      receiver.incident.location,
      null,
      "unconfirmed partner must not see walker location",
    );
    assert.ok(
      (await (await request("join/" + contact.token)).json()).incident.location,
    );
    assert.equal(
      (await request("join/" + contact.token + "/record")).status,
      404,
    );
    assert.equal(
      (await request("record/" + user.state.incident.id, stranger.cookie))
        .status,
      404,
    );
    assert.equal(
      (
        await request("join/" + partner.token, "", {
          action: "reply",
          incidentId: user.state.incident.id,
          text: "I accept. You can wait here.",
        })
      ).status,
      200,
    );
    user.state = await (await request("state", user.cookie)).json();
    assert.equal(
      user.state.incident.plans.length,
      0,
      "live routing must not invent a fallback when maps are absent",
    );
    const oldId = user.state.incident.id;
    const liveUser = user;
    user = await client(true);
    assert.equal(user.state.incident.mode, "DEMO");
    assert.notEqual(user.state.id, liveUser.state.id);
    await action(liveUser, "demo", { locale: "en", ai: false }, 400);
    await action(liveUser, "new", { mode: "DEMO", locale: "vi" }, 400);
    const combinedCookies = liveUser.cookie + "; " + user.cookie;
    assert.equal(
      (await (await request("state", combinedCookies)).json()).incident.id,
      oldId,
    );
    assert.equal(
      (await (await request("state?scope=demo", combinedCookies)).json())
        .incident.id,
      user.state.incident.id,
    );
    await action(user, "new", { mode: "DEMO", locale: "vi" });
    await action(user, "sos", { text: "Có người theo tôi. Đây là kiểm thử." });
    assert.equal(
      user.state.incident.demo,
      null,
      "SOS must not start judge choreography",
    );
    await action(user, "covert", { enabled: true, incidentId: oldId }, 400);
    await action(user, "ai", { enabled: true, consent: true }, 400);
    await action(user, "demo", { locale: "en", ai: false });
    for (let n = 0; n < 5; n++) await action(user, "next");
    assert.ok(user.state.incident.plans[0].acceptedAt);
    assert.equal(user.state.incident.replies.length, 5);
    const audioId = randomUUID(),
      bytes = Buffer.from([0, 1, 2, 3, 4]);
    const upload = (seq: number, value = bytes, mime = "audio/webm") =>
      fetch(
        `${base}/api/audio/${user.state.incident.id}?id=${audioId}&seq=${seq}`,
        {
          method: "POST",
          headers: {
            Cookie: user.cookie,
            Origin: base,
            "Content-Type": mime,
            "x-guardian-mode": "demo",
          },
          body: value,
        },
      );
    assert.equal(
      (await upload(0)).status,
      400,
      "recording must require consent",
    );
    await action(user, "recording-consent", { consent: true });
    assert.equal((await upload(1)).status, 400);
    assert.equal((await upload(0)).status, 200);
    assert.equal(
      (await upload(0)).status,
      200,
      "identical retry should be idempotent",
    );
    assert.equal((await upload(0, Buffer.from([5]))).status, 400);
    assert.equal((await upload(1, bytes, "audio/ogg")).status, 400);
    const audio = await request(
      `audio/${user.state.incident.id}/${audioId}`,
      user.cookie,
    );
    assert.deepEqual(Buffer.from(await audio.arrayBuffer()), bytes);
    const record = await (
      await request(`record/${user.state.incident.id}?format=json`, user.cookie)
    ).json();
    assert.equal(
      record.incident.recordings[0].hash,
      createHash("sha256").update(bytes).digest("hex"),
    );
    for (let n = 0; n < 4; n++) await action(user, "next");
    assert.equal(user.state.incident.demo.status, "DONE");
    assert.equal(user.state.incident.status, "SIGNAL_LOST");
    assert.equal(user.state.incident.plans.length, 3);
    assert.ok(
      user.state.incident.plans.every(
        (p: { invalidatedAt: string }) => p.invalidatedAt,
      ),
    );
    const html = await (
      await request(`record/${user.state.incident.id}?lang=en`, user.cookie)
    ).text();
    assert.ok(html.includes("Incident record"));
    const sse = await fetch(base + "/api/stream", {
      headers: { Cookie: user.cookie, "x-guardian-mode": "demo" },
    });
    const reader = sse.body!.getReader();
    assert.ok(
      new TextDecoder()
        .decode((await reader.read()).value)
        .startsWith("data: "),
    );
    await reader.cancel();
    await action(user, "cancel");
    await action(user, "delete-transcript");
    assert.equal(user.state.incident.transcript.length, 0);
    assert.equal(
      (await request(`audio/${user.state.incident.id}/${audioId}`, user.cookie))
        .status,
      404,
    );
    console.log(
      "PASS: page delivery; session isolation; CSRF; recipient consent and location privacy; stale session rejection; live route fail-closed; full demo; audio consent, idempotency and bytes; report; SSE; record deletion.",
    );
  } finally {
    server.kill();
    await new Promise<void>((resolve) => {
      if (server.exitCode !== null) resolve();
      else server.once("exit", () => resolve());
    });
  }
}
void main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
