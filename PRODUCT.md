# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **Primary:** a person walking alone who feels unsafe, usually at night, holding a phone in one hand, possibly being followed. They talk to the companion AI by voice, can switch to covert mode, and need to know in seconds where to walk.
- **Family and contacts:** receive a call from the family AI, state what they can do and when they arrive, and later open the evidence dossier at `/r/<token>`.
- **Partner venues:** registered businesses (cafés, pharmacies, guards, hotels) that answer an in-app call, accept or decline sheltering the user, and receive an assignment.
- **Evaluators right now:** a hackathon jury watching the command center on a projector while the one-button showcase runs.

## Product Purpose
Guardian AI is an SOS companion. It turns one distress moment into coordinated help: the companion AI talks to the user, AI callers reach family and nearby venues at the same time, each person proposes their own idea, and the planner merges those offers into one safe walking route drawn on the map. Everything is sealed into an evidence dossier that is sent to family if contact is lost. Success = the user reaches a staffed safe place, and anyone reviewing afterwards can trust what happened.

## Positioning
Not a panic button that only alerts. It coordinates many humans' concrete offers ("I'll be there in ten minutes", "our guard will meet you at the door") into one plan with explicit roles (PRIMARY / SUPPORT / BACKUP), grounded by verbatim quotes, and keeps a hash-chained evidence record.

## Operating Context
- Command center `/demo/command-center`: 3D MapLibre map of Thủ Thiêm, incident timeline, agent activity, calls, plan coordination, showcase card. Shown on a projector or laptop.
- Phone companion: voice session (OpenAI Realtime), SOS, covert mode, recording indicator, directions.
- Receiver `/r/<token>`: family or partner on their own phone, call + assignment + evidence link.
- Evidence dossier: an HTML report (summary, timeline, statements, recordings, locations, contacts, plans, transcript, seals), printable and phone-readable.
- Interface language: Vietnamese.
- Competition delivery: a stable public HTTPS demo link hosted through Vercel, usable independently by judges without the presenter's laptop or tunnel. Deployment readiness includes persistent state, background coordination, isolated sessions and testing on the actual deployed URL; the current local runtime still needs migration before claiming this works.
- Selected deployment design: Vercel frontend, a single continuously running Node backend (Render by default for the competition), Supabase Postgres for durable state and private Supabase Storage for recordings. Guest judges can run the simulation without signing up; live voice is an optional, consented branch. See docs/COMPETITION-FLOW.md and docs/SUPABASE-ARCHITECTURE.md; this is the target design, not a claim of a completed migration.

## Capabilities and Constraints
- Next.js 16 App Router, React 19, TypeScript, plain CSS files (`app/globals.css`, `app/command.css`, `app/voice.css`), MapLibre + OpenFreeMap tiles. No CSS framework.
- Never auto-dial 113/115; only offer `tel:` links the user taps.
- 30 simulated venues and a simulated city graph; the showcase is scripted demonstration data and must read as a demo.
- Must keep working over a Cloudflare tunnel on real phones.

## Brand Commitments
- Name: Guardian AI. No logo asset exists.

## Evidence on Hand
- Showcase run screenshots: `data/showcase-step-*.png`, `data/evidence-report-*.png`.
- No testimonials, users, or metrics exist; do not invent any.

## Product Principles
1. In danger, the next step beats the full picture: one instruction, one route, one place.
2. Every claim shown is grounded: who said it, quoted.
3. Humans decide emergency calls; the system only prepares them.
4. The record must survive the incident: sealed, readable, shareable.

## Accessibility & Inclusion
- Phone screens are used one-handed, in the dark, under stress: large targets, high contrast, minimal reading.
- Covert mode must not reveal recording or SOS state on screen.
