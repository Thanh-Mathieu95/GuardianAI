# Verification — local preview, 31 October 2026

| Check | Result |
| --- | --- |
| TypeScript and production Next build | Passed |
| Unit/regression suite | 36 passed |
| Isolated production HTTP integration | Passed |
| OpenAI companion, extraction, bounded planner | Real synthetic requests passed |
| Realtime client secret | Real mint passed; credential not logged |
| Actual microphone conversation | Not tested |
| Local standalone health, page and 11 static assets | HTTP200 |
| Actual background demo timer | Advanced automatically |
| Client asset secret scan | User key absent |
| Local environment files in standalone artifact | Absent |
| npm dependency audit | 0 vulnerabilities at installation |
| Browser integration | Five scenarios passed: parallel-call demo, live recipient in a second tab, full director, SOS map/new sessions, interactive phone at 390px |
| Desktop one-click launcher | Starts a detached local server and reuses it on subsequent invocations |
| Hosted PostgreSQL / optional Google Routes | Not tested; credentials not supplied |

The HTTP integration uses its own in-memory database, disables AI and creates synthetic participants. It covers unauthenticated access, same-origin writes, cross-owner report denial, recipient consent, hiding a walker's position from an unconfirmed partner, stale session rejection, missing live maps, the ten-stage demo, audio consent and idempotent retries, raw-byte hashes, HTML/JSON export, SSE and record deletion.

Current desktop, mobile and dedicated-phone captures exist. Browser checks include all ten demo steps, sourced role assignments, reference-route labeling, column collapse, 390px overflow, VI/EN inside the phone, invitation creation and returning between phone tabs. The Impeccable verdict pass scored all five listed fixes resolved and returned `ship` at that scope; it is not a whole-product certification. The command-center Desktop shortcut was opened through Explorer and its destination checked; the phone launcher's URL and shared server reuse were checked through its command interface. Real microphone and two-device P2P behavior remain outside these automated checks.


Call extension verification: expanding directory and timezone/overnight hours; opt-in/presence delivery; three-call concurrency and deduplication; stale/duplicate/foreign recipient events; source IDs; early plan; acceptance before task calls; no handoff inferred from completed calls; persisted attempts and deadlines across restart. HTTP tests cover private recipient call views and real call answer/message endpoints with AI disabled. The five Edge scenarios use isolated in-memory storage and synthetic GPS; the live flow uses a real joined test recipient in a second tab, not a scripted acceptance. Microphone conversation and remote-device connectivity remain unverified.

The Impeccable source detector was run once for the extension: one font warning (Arial pinned by the supplied brief) and 100 token advisories. A fresh finish review returned fix for three issues. The rebuilt production captures were re-reviewed: all three were scored resolved, with disposition ship at those fixes-only scope (completed-call semantics, initial LIVE SOS visibility, unobscured road legend). This is not a whole-product certification.


TEAM regression verification: no fictional recipients are inserted by a user SOS; late join/call permission enrolls the actual invited Dung; old invitation tokens survive atomic recovery; actual roleplayer offers create only simulated routes and require acceptance. A three-person Edge roleplay exercised Mai, late Dung and venue teammate Thu through private replies, early plan and two-sided handoff. Support profiles are included in case-file JSON. Local current-owner legacy invitations were recovered without replacing recipient links. Remote-device connectivity and real microphone remain outside these automated checks.

Final TEAM UI checks: the three-person roleplay and SOS map/new-session checks passed in the final targeted run (56.1 seconds); the other four browser scenarios passed in the preceding full run. The roleplay includes source labels, no real GPS venue action, actual recipient handoff and separate scripted scope. Impeccable scored all four listed TEAM fixes resolved, disposition ship at fixes-only scope. Concurrent palette/font and bulb-string visual changes are outside that verdict.
