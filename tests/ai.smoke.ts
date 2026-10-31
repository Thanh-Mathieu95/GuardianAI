import assert from "node:assert/strict";
import { Engine } from "../lib/engine";
import { Repository } from "../lib/repository";
import { analyze, extract, recommend, realtimeSecret } from "../lib/ai";
import { admission, validateExtraction } from "../lib/rules";

// Explicit, paid smoke test. Never run as part of npm test or CI.
try {
  process.loadEnvFile(".env.local");
} catch {
  /* Hosted environment may inject secrets. */
}
async function main() {
  const e = new Engine(new Repository(":memory:", ""));
  try {
    const a = await e.account("synthetic-api-smoke");
    await e.startDemo(a, "vi");
    for (let n = 0; n < 3; n++) await e.demoStep(a.incident);
    const i = a.incident;
    i.ai.enabled = true;
    i.ai.consentedAt = new Date().toISOString();
    const quote =
      "Đồng ý, bạn có thể vào chờ ở cửa chính. Nhân viên sẽ đón bạn.";
    const results = await Promise.allSettled([
      analyze(i, "Đây là thử nghiệm mô phỏng. Tôi hơi lo khi đi bộ một mình."),
      extract(quote, "PARTNER").then((x) => validateExtraction(x, quote)),
      recommend(
        i,
        i.replies.filter((r) => !admission(i, r).length),
      ),
      realtimeSecret(i, "USER"),
    ]);
    const names = [
      "Companion response",
      "Sourced offer extraction",
      "Bounded AI planner",
      "Realtime ephemeral credential",
    ];
    results.forEach((r, n) => {
      if (r.status === "rejected")
        throw new Error(
          `${names[n]}: ${r.reason instanceof Error ? r.reason.message : "FAILED"}`,
        );
      assert.ok(r.value);
      console.log(`PASS: ${names[n]}`);
    });
    console.log(
      "Synthetic requests only. No microphone or personal location was transmitted.",
    );
  } finally {
    await e.repo.close();
  }
}
void main().catch((e) => {
  console.error(e instanceof Error ? e.message : "SMOKE_FAILED");
  process.exitCode = 1;
});
