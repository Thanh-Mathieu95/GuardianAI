# Verification — local preview, 31 October 2026

| Check | Result |
| --- | --- |
| TypeScript and production Next build | Passed |
| Unit/regression suite | 23 passed |
| Isolated production HTTP integration | Passed |
| OpenAI companion, extraction, bounded planner | Real synthetic requests passed |
| Realtime client secret | Real mint passed; credential not logged |
| Actual microphone conversation | Not tested |
| Local standalone health, page and 11 static assets | HTTP200 |
| Actual background demo timer | Advanced automatically |
| Client asset secret scan | User key absent |
| Local environment files in standalone artifact | Absent |
| npm dependency audit | 0 vulnerabilities at installation |
| Browser integration | Two scenarios passed: full command-center demo and interactive phone at 390px |
| Desktop one-click launcher | Starts a detached local server and reuses it on subsequent invocations |
| Hosted PostgreSQL / optional Google Routes | Not tested; credentials not supplied |

The HTTP integration uses its own in-memory database, disables AI and creates synthetic participants. It covers unauthenticated access, same-origin writes, cross-owner report denial, recipient consent, hiding a walker's position from an unconfirmed partner, stale session rejection, missing live maps, the ten-stage demo, audio consent and idempotent retries, raw-byte hashes, HTML/JSON export, SSE and record deletion.

Current desktop, mobile and dedicated-phone captures exist. Browser checks include all ten demo steps, sourced role assignments, reference-route labeling, column collapse, 390px overflow, VI/EN inside the phone, invitation creation and returning between phone tabs. The Impeccable verdict pass scored all five listed fixes resolved and returned `ship` at that scope; it is not a whole-product certification. The command-center Desktop shortcut was opened through Explorer and its destination checked; the phone launcher's URL and shared server reuse were checked through its command interface. Real microphone and two-device P2P behavior remain outside these automated checks.
