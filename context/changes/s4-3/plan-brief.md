# Fallback, Transparentność i Quick Reply Chips — Plan Brief

> Full plan: `context/changes/s4-3/plan.md`

## What & Why

Roadmap §6.3 requires the AI concierge to route complaints/urgent requests to reception immediately (never attempt to answer), to auto-escalate after 3 consecutive failed answers, and to offer Quick Reply chips — on top of the plain fallback bubble and disclosure line S4.2 already shipped. This session closes those three remaining gaps.

## Starting Point

S4.2 shipped a working streaming chat (`/concierge`) with a `[FALLBACK]`-triggered bubble (recepcja CTA) and a static "wirtualny asystent" disclosure line. No complaint/urgent detection, no escalation-streak tracking, and no Quick Reply chips exist yet. The `concierge_response_escalated` analytics event is already reserved in the codebase (`lib/analytics/events.ts`) but has no caller.

## Desired End State

A guest whose message reads as a complaint or urgent request sees an escalation bubble on the very first reply — no attempted KB answer first. A guest who gets 3 KB-uncovered answers in a row sees that same escalation bubble on the 3rd. An empty chat shows tappable Quick Reply chips for common questions that auto-send on tap and disappear once the conversation starts.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Streak persistence | Client-side, in-memory counter | Matches S4.2's stateless client-held-history architecture; no schema/Redis changes for a UX counter |
| Escalation action | Distinct guest-facing bubble + logged event | Reuses the already-reserved `concierge_response_escalated` event; no new staff-facing surface this session |
| Complaint detection | New `[ESCALATE]` model flag in system prompt | Same proven mechanism as the existing `[FALLBACK]` flag, no separate keyword heuristic to maintain |
| Quick Reply content | Static, platform-owned, bilingual | Ships this session with zero per-hotel KB dependency; mirrors S2.4's seeded FAQ categories |
| Chip tap behavior | Auto-send immediately | True to "quick" — chips are complete questions, not templates needing editing |
| Chip visibility | Empty-state only | Keeps mid-conversation UI clean; avoids looking like ongoing upsell (HITL #6 optics) |
| Streak reset rule | Resets on any normal answer | Matches roadmap's "3 consecutive" wording literally |
| Escalate vs. Fallback UI | Same escalation bubble for both triggers (complaint = turn 1, streak = turn 3) | One UI/event to build instead of two; both route to the same place (reception) |

## Scope

**In scope:** `[ESCALATE]` system prompt instruction, stream-route detection + event logging for the complaint path, a new minimal `/api/concierge/escalate` logging endpoint for the streak path, chat UI escalation bubble + consecutive-fallback counter, static Quick Reply chips, new i18n strings (PL/EN).

**Out of scope:** staff-visible escalation record/inbox, keyword-based complaint heuristic, rate-limiting the escalation-logging endpoint, per-property/configurable Quick Reply chips, chip-then-edit flow, distinct copy per escalation trigger.

## Architecture / Approach

The existing `/api/concierge/stream` route gains one string check (`[ESCALATE]` prefix on the accumulated answer) and one extra `captureEvent` call — no new SSE frame types. Because the 3-consecutive-fallback streak only exists in the client's component state, it needs its own tiny server touchpoint: a new authenticated `POST /api/concierge/escalate` that just logs the reserved analytics event when the client's counter hits 3. The chat component adds an `isEscalated` message flag (rendered as a distinct bubble) and a counter that resets on any normal answer, plus a static Quick Reply chip row visible only before the first message.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Prompt & Analytics Groundwork | `[ESCALATE]` system prompt instruction, `reason` field on the reserved analytics event | Low — pure prompt/type change |
| 2. Stream Route: Complaint Detection | `route.ts` detects `[ESCALATE]` and logs `reason: 'complaint'` | Must not disturb the existing `[FALLBACK]`/confidence logic already tested in S4.2 |
| 3. Escalation Logging Endpoint | New `/api/concierge/escalate` route logging `reason: 'streak'` | Endpoint is trust-light by design (logging only) — confirm that's acceptable, not a security gap |
| 4. Guest Chat UI | Escalation bubble, streak counter, Quick Reply chips | Streak-reset logic (reset only on a true normal answer) is the one subtle state-machine detail to get right |

**Prerequisites:** S4.2 (`status: implemented`) — stream route, chat UI, fallback bubble, disclosure line all shipped.
**Estimated effort:** ~1 session, 4 small phases.

## Open Risks & Assumptions

- The escalation-logging endpoint trusts the client's streak count without server-side verification — acceptable because it's analytics-only (no OpenAI cost, no data exposure), but a determined guest could spam fake `reason: 'streak'` events into PostHog.
- Complaint/urgent detection quality depends entirely on the model correctly self-classifying via `[ESCALATE]` — same trust level already accepted for `[FALLBACK]` in S4.2, but there's no automated way to verify real-world accuracy beyond manual spot-checks.
- Quick Reply chip content is static and identical across all hotels — a hotel without breakfast service still shows a breakfast chip (worst case: guest gets a real KB-grounded "not offered" answer, not a broken flow).

## Success Criteria (Summary)

- A complaint/urgent message escalates immediately (turn 1), never attempting a KB answer first.
- 3 consecutive fallback answers escalate on the 3rd, with the streak correctly resetting on any normal answer in between.
- Quick Reply chips are visible only on an empty chat, auto-send on tap, and both escalation triggers log `concierge_response_escalated` with the correct `reason`.
