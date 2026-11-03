# 🏆 Guardian AI — Top 5 Sea x OpenAI Regional Codex Hackathon – Vietnam

**A companion when you walk alone. Coordinated support when you need it.**

Guardian AI is a web application that helps people walking alone seek support when they feel unsafe. Starting from an SOS, it coordinates with trusted contacts and support venues, verifies their acceptance, proposes a walking plan, and keeps a record of the incident.

## 🏆 Achievement & Announcement

**Guardian AI placed in the Top 5 at the Sea x OpenAI Regional Codex Hackathon – Vietnam.**

The organizers' congratulatory message recognized the Guardian AI team as one of the competition's **Top 5 teams**.

This marks a memorable milestone in Guardian AI's development. We thank the Sea x OpenAI organizers and everyone who supported, tried, and shared feedback on the project.

## Overview

Guardian AI focuses on three practical questions: **Who can help? What can they do? Where should the user go next?** It combines AI conversations, maps, and responses from a support network to build a plan with a confirmed receiving venue.

AI handles communication, information extraction, and suggestions. The backend validates evidence, admission conditions, and execution permissions. The user accepts a plan before receiving directions to a support venue.

> **Project status:** An MVP for development and demonstrations, not a certified emergency response system. Simulated venues, participants, and scenarios are labeled in the demo.

## How It Works

1. **Build a support network:** Add trusted contacts or partner venues and invite them through dedicated links.
2. **Send an SOS:** Describe the situation by text, or by voice when AI is configured and consent has been given.
3. **Coordinate support:** Collect responses from multiple contacts, clarify what help they can offer, check admission conditions, and record arrival times stated by trusted contacts.
4. **Propose a plan:** The backend filters venues by the user's needs and valid acceptance evidence. AI proposes a plan within those constraints.
5. **Accept and monitor:** The user accepts a plan. If acceptance is withdrawn, conditions change, or the route becomes invalid, the system stops the previous guidance and requires acceptance of a new plan.
6. **Confirm handoff and preserve the record:** Both the user and the receiving venue confirm completion. The incident record retains relevant decisions, evidence, and events.

## Key Features

| Feature | What it does |
| --- | --- |
| AI companion | Conversations and structured analysis through OpenAI Responses; two-way voice through OpenAI Realtime/WebRTC when configured |
| Support network coordination | Trusted contacts and partner venues join through dedicated links, receive requests, and respond according to their roles |
| Maps and routing | Displays support venues, compares routes, and reassesses plans when conditions change |
| Trip timer | Tracks expected trip duration and requests check-ins; a timer does not automatically provide directions home |
| Incident records | Stores transcripts, locations, responses, and plan history with access controls; a hash chain helps detect content changes |
| One-click demo | Runs simulated participants' statements through the actual coordination engine to demonstrate SOS handling, replanning, and handoff; does not call real phone numbers |
| State synchronization | Updates screens within the same session through SSE, with polling as a fallback |
| Languages | Vietnamese/English for the landing page and main experience; Vietnamese for the advanced command center |

## Quick Start

Requires **Node.js 24 or later** and **npm**. Local storage uses Node.js's built-in SQLite module.

```sh
git clone https://github.com/Thanh-Mathieu95/GuardianAI.git
cd GuardianAI
npm ci
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

To run a production build locally:

```sh
npm run build
npm start
```

On Windows, `START-GUARDIAN.cmd` installs dependencies and builds the application if needed, then starts the server. Rebuild after code changes before using `npm start`.

## Try the Demo

1. Open the [demo command center](http://127.0.0.1:3000/demo/command-center) and select **Run demo** (the Vietnamese UI label is **Chạy demo**).
2. Follow the SOS scenario, participants' responses, and proposed plan on the map.
3. Observe how the system reassesses the plan when the situation changes.
4. Follow the handoff confirmation, then open **Records** (**Hồ sơ**) to review the timeline and check record integrity.

The default demo requires no sign-in, microphone, or API key. Narration is off by default and can be enabled in the interface. Simulation and device testing are separate flows; enabling AI does not turn simulated participants or venues into real support providers.

### Screens

| Route | Purpose |
| --- | --- |
| `/` | Project introduction |
| `/demo/command-center` | Full dashboard: AI phone, map, agent activity, calls, and incident records |
| `/demo/phone` | Full phone interface: AI conversations, SOS, fake calls, and the companion experience for the journey home |
| `/demo/advanced` | Alternative route to the full dashboard |
| `/demo/guided` | Simplified demo with guided steps |
| `/demo/companion` | Simplified companion interface |
| `/demo/control` | Scenario controls, adapters, and testing tools |
| `/demo/calls` | Call status, conversations, and responses |
| `/demo/architecture` | System architecture and limitations |
| `/r/<token>` | Invitation link for a trusted contact or partner venue |

Tabs in the same browser must use the same host and cookies to share a session. Do not mix `localhost` and `127.0.0.1`. Other devices join through invitation links for their assigned roles.

## Integration Configuration

Copy `.env.example` to `.env.local`, configure it locally, and restart the server. Never commit real keys or `.env.local`. The simulation demo remains available with AI disabled or without an API key.

| Environment variable | Purpose |
| --- | --- |
| `AI_PROVIDER` | `OPENAI` to enable AI with a valid key; `OFF` to disable models |
| `OPENAI_API_KEY` | Server-side OpenAI API key |
| `AI_MODEL`, `AI_REALTIME_MODEL` | Conversation/analysis model and voice model |
| `AI_TIMEOUT_MS` | AI request timeout |
| `GUARDIAN_DB_PATH` | Local SQLite path; defaults to `./data/guardian.sqlite` |
| `GUARDIAN_RECORDINGS_DIR` | Backend recordings directory or recording cache |
| `GUARDIAN_POSTGRES_URL` | PostgreSQL session pooler connection for hosting, using the `guardian_ai` schema |
| `GUARDIAN_SESSION_SECRET` | Stable session secret; also protects recipient tokens stored in PostgreSQL |
| `GUARDIAN_SUPABASE_URL`, `GUARDIAN_SUPABASE_SERVICE_KEY` | Server configuration for the private recordings bucket |
| `PUBLIC_URL` | Public HTTPS origin of the hosted application |
| `GUARDIAN_DEMO_HOSTING` | Enables demo hosting limitation notices; set during both build and runtime |
| `GOOGLE_MAPS_API_KEY` | Google Places/Routes when the corresponding adapter is selected |
| `CALL_GATEWAY_URL`, `CALL_GATEWAY_TOKEN` | Optional team-controlled HTTPS voice gateway |
| `TEST_CALL_ALLOWLIST` | Allowed phone numbers for controlled test calls |
| `OPERATOR_PASSWORD` | Optional operator password |
| `SOS_PER_HOUR` | Rate limit for SOS requests that may ring partner venues |

On Windows, `SETUP-AI.cmd` helps configure AI locally. AI requires consent within the session, and real API usage may incur charges.

Microphone and location access on phones require browser permissions and a secure context, usually HTTPS. The server listens on loopback by default. `START-TUNNEL.cmd` supports testing as described in the [integration guide](docs/INTEGRATIONS.md); the tunnel depends on the host machine remaining online.

## Technology & Architecture

**Next.js 16 · React 19 · TypeScript · Zod 4 · MapLibre/OpenFreeMap · SQLite · PostgreSQL/Supabase**

The Node.js backend runs the coordination engine, monitoring timers, and event channels. Local mode uses SQLite by default. With `GUARDIAN_POSTGRES_URL` configured, PostgreSQL provides durable storage, while in-memory SQLite serves as a working cache restored from the database.

| Component | Responsibility |
| --- | --- |
| `app/`, `components/` | Pages and interfaces for users and support participants |
| `app/api/[...path]/route.ts` | HTTP API, sessions, capabilities, and events |
| `lib/engine.ts`, `lib/types.ts` | Incident state, coordination, and data contracts |
| `lib/support.ts`, `lib/coordination.ts` | Admission conditions, evidence, and role assignments |
| `lib/ai.ts`, `lib/realtime.ts` | AI integration and conversation context |
| `lib/city.ts`, `lib/route-agent.ts` | Road graph, route selection, and reassessment |
| `lib/network.ts`, `lib/receiver.ts` | Support network and recipient access controls |
| `lib/store.ts`, `lib/recordings.ts`, `lib/evidence.ts` | Storage, recordings, and report export |
| `lib/database.ts`, `lib/persistent-store.ts`, `lib/runtime-persistence.ts` | PostgreSQL transactions, revisions, and recovery |
| `lib/remote-recordings.ts`, `supabase/` | Private recordings, migrations, and public CA certificates |
| `lib/showcase.ts` | Demo execution through the engine |
| `tests/` | Business logic, access control, and API tests |

The hosting configuration described in [docs/HOSTING.md](docs/HOSTING.md) uses **Cloudflare for HTTPS access → Render for Next.js/API → Supabase for data and recordings**. The runtime uses one Node.js process and does not yet support autoscaling or a multi-instance job runner. Render Free can sleep or be interrupted, so the demo does not guarantee continuous monitoring.

## Development Checks

For code changes, run the checks relevant to the change:

```sh
npm run typecheck
npm test
npm run build
```

Documentation-only changes require checks for valid paths, commands, and content consistency; an application build is not required.

<details>
<summary>Run API tests against a dedicated QA server</summary>

After building, start the server in PowerShell:

```powershell
$env:AI_PROVIDER = 'OFF'
$env:GUARDIAN_DB_PATH = ':memory:'
$env:GUARDIAN_RECORDINGS_DIR = Join-Path $env:TEMP ('guardian-qa-' + [guid]::NewGuid())
Remove-Item Env:OPERATOR_PASSWORD, Env:CALL_GATEWAY_URL, Env:CALL_GATEWAY_TOKEN -ErrorAction SilentlyContinue
npm start -- --port 3120
```

In a second terminal:

```powershell
$env:GUARDIAN_TEST_URL = 'http://127.0.0.1:3120'
npm run test:api
```

Use QA data only. Mock results do not verify microphone access, WebRTC between physical devices, telephone networks, or cloud integrations.

</details>

## Data & Operational Limitations

- Long-lived keys remain on the server. Session and recipient permissions control access to locations, transcripts, recordings, and reports.
- Local mode without PostgreSQL stores SQLite data and recordings on the host machine. Hosted mode can store data in PostgreSQL and recordings in private Supabase Storage. Records do not automatically expire after a fixed period.
- Recipients must keep their page open to receive in-app ringing. The web application does not guarantee background calls like a native phone app. P2P calls depend on network conditions, and TURN is not provided for every case.
- Simulated maps and routes do not verify real-world road conditions or safety.
- The application does not automatically dial emergency services. Links for Vietnam's 113/115 numbers let users open their dialer themselves.
- Hash chains support record integrity checks; they do not prove that a statement is true.
- When the backend stops, ongoing calls are marked as interrupted and are not automatically redialed. A PostgreSQL lock prevents two backends from running the engine simultaneously.

## Project Documentation

The linked project documents are primarily in Vietnamese.

- [Product specification](docs/PROJECT_SPEC.md)
- [Demo scenarios and simulation boundaries](docs/AGENT-DEMO.md)
- [Presentation flow](docs/COMPETITION-FLOW.md)
- [Integration guide](docs/INTEGRATIONS.md)
- [AI conversations with trusted contacts and partner venues](docs/AI-MEDIATED-CALLS.md)
- [Routing agent and incident reports](docs/ROUTE-AGENT-REPORT.md)
- [Supabase architecture](docs/SUPABASE-ARCHITECTURE.md)
- [Hosting configuration](docs/HOSTING.md)
- [Deployment guide](docs/DEPLOYMENT.md)
- [Acceptance criteria](docs/ACCEPTANCE.md)
