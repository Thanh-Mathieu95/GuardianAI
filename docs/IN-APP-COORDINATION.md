# In-app incident coordination

The central engine owns incidents, verified statements, plans, acceptance and two-sided handoff. Each in-app call is a child of one incident and one recipient. The call UI and the recipient's AI voice session cannot directly change a plan or declare a completed handoff.

## Implemented extension

| Requirement | Implementation |
| --- | --- |
| Partner directory | Recipient-authored profile: type, address, timezone, weekday opening windows, staffing, receiving, waiting, accessibility, limitations, entrance, meeting instructions and update time. In-app contact verified through possession of the private joined invitation; no phone verification is claimed. |
| Discovery | Expanding radii, distance sorting, configurable maximum partners, consent/duty/hours/capability filters. Unlinked and uncertain entries remain distinct. `PlaceSearchAdapter` provides a reference-only extension point; no external lookup service is configured. |
| Parallel calls | One persistent call record per recipient, purpose and plan. Default three active calls, 90-second maximum attempt, one bounded retry, 45-second offline queue timeout, 900-second reserved incident budget. This budget limits call duration, not a monetary OpenAI spending cap. |
| Delivery truth | LIVE stays queued until a recently connected recipient has explicitly allowed app calls. Opening the incoming-call UI acknowledges ringing; only the recipient can answer, reject or mark busy. No PSTN, Twilio or phone gateway is used. |
| Private conversations | Only the matching invitation can read or update its calls. Text and optional OpenAI Realtime voice are supported. Each recipient talks privately to an AI assistant; this is not a human-to-human audio conference. |
| Evidence | Original recipient statements retain their IDs. Source-bound extraction and admission precede plans. HTML and JSON case files link findings, plans and call transcripts to original evidence. |
| First useful plan | A qualifying offer can produce a plan while other calls continue. User acceptance is required. Task-notification calls reference the accepted plan and remain distinct from support inquiries. |
| Completion | Both walker and selected receiving partner must confirm meeting. A task acknowledgment or completed call never completes handoff. DEMO has an explicitly labeled venue-confirmation control. |
| Reliability | Persistent attempts, deadlines, state history, event IDs and sequence numbers survive restart. Duplicate, stale, wrong-attempt and wrong-recipient events cannot advance call state. Budget reservation occurs within the queued account mutation and committed revision. |
| Stop conditions | Ending, replacing or losing the incident cancels active calls. Changed plans cancel obsolete task notifications. Revoking call consent cancels that recipient's calls. |

The provider adapter is deliberately in-app, following the user's revised scope. There are no public telephony webhooks or third-party webhook signatures. App writes require the expected Origin, a signed owner session or an invitation bearer credential, and incident/call/recipient binding. The call event reducer also checks sequence, attempt and duplicate event ID.

## DEMO and LIVE

### TEAM support profiles

`/team` and `/team/phone` use a third signed owner cookie, isolated from scripted DEMO and live GPS. Support profiles are the account's actual invited members, with names, roles, links and explicit readiness. TEAM creates no fixture recipients: SOS and late-join synchronization use only that member list. The location and route are simulated while each statement is submitted by its real roleplayer. The same central call queue and plan/handoff checks still apply. TEAM provenance is stored as REHEARSAL in incident events, and case-file JSON includes the participating support profiles.

The host's authenticated demo cookie can recover legacy invitations accidentally created in the old scripted workspace. Account revisions and hashed-token ownership move atomically, preserving original recipient links and consent. A third party's unsigned account ID cannot perform recovery. Scripted DEMO no longer accepts real invitations or manual SOS through its API; its UI directs those tasks to Support profiles. Explicit scenario run controls continue to use fictional participants.

`/demo/command-center` and `/demo/phone` use a separate signed demo cookie. `/walk` and `/phone` use the live cookie. Opening/resetting one scope does not replace the other. Report/audio URLs carry their scope and require its signed owner cookie.

**Parallel-call demo** creates an isolated simulated incident and exercises the same call queue, deadlines, statement capture, admission, routing and task machinery. Its recipients and conversations are clearly synthetic; it does not mint voice sessions or contact real participants. Browser speech synthesis can read a scripted conversation when the presenter presses its listen button. The older ten-stage director remains available for withdrawal, rerouting, injury and lost-contact demonstrations.

**LIVE** requires current GPS to send SOS, recipients who have joined and explicit call consent. The owner can enable independent AI companion chat/voice. With AI enabled and consent recorded, urgent conversation or the AI's `request_help` tool can activate in-app SOS automatically. Missing GPS produces a blocked decision with an honest event. Emergency phone dialing and accepting a route remain user actions.

## Runtime and limits

Run one persistent Node server with durable SQLite or the existing PostgreSQL adapter. The repository's account revision check rejects conflicting writes, and the per-account queue serializes mutations. This is not a distributed worker cluster: use a shared job queue/lease system before running multiple coordinating instances. Deadlines are reevaluated by the server timer after restart. OpenAI network failures retain bounded fallback behavior; there is no guarantee of protection, recipient availability or a safe route.

Recipients must keep their page open; browser microphone and GPS need permission. A local judge demonstration can use two browser tabs on one computer. Remote phones need a reachable HTTPS deployment; a localhost invitation is not reachable on another phone. Native background ringing and push are not implemented.

The voice connection uses the existing [OpenAI Realtime WebRTC flow](https://developers.openai.com/api/docs/guides/realtime-webrtc). Browser AI audio and the app's call lifecycle are separate: microphone activity alone never confirms that a recipient accepted or completed support.
