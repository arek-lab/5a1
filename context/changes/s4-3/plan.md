# Fallback, Transparentność i Quick Reply Chips — Implementation Plan

## Overview

S4.2 already shipped a working streaming chat with a plain `[FALLBACK]` bubble (recepcja CTA) and a static disclosure line (HITL #8). This session adds the three things roadmap §6.3 still requires: an `[ESCALATE]` model flag so complaints/urgent requests route to reception immediately instead of being attempted from KB, a client-tracked 3-consecutive-fallback streak that triggers the same escalation UI, and static Quick Reply chips for common questions (HITL #6-safe — FAQ-neutral, never upsell).

## Current State Analysis

- `lib/concierge/system-prompt.ts` already instructs the model to prefix `[FALLBACK]` when the KB doesn't cover a question, and already forbids claiming to book/order (HITL #7) — no complaint/urgent instruction exists yet.
- `app/api/concierge/stream/route.ts` (`route.ts:104-108`) already computes `confidence = fullAnswer.startsWith('[FALLBACK]') ? 0 : 1` and fires `concierge_response_delivered` after every stream — the hook point for detecting `[ESCALATE]` is the same `fullAnswer` variable, no new state needed server-side for the complaint path.
- `components/guest/concierge-chat.tsx` already parses SSE frames (`chunk`/`error`/`done`), already computes `isFallback: accumulated.startsWith(FALLBACK_PREFIX)` on `done` (line 114-117), and already renders a fallback bubble with a `tel:` CTA. This is the exact shape to extend for the streak counter and the new escalation bubble.
- `lib/analytics/events.ts:16-17` already reserves `concierge_response_escalated` with `properties: Record<string, never>` for this session — confirms the platform's intended event name; this session gives it a `reason` property and a first caller.
- No fallback/escalation streak counter exists anywhere (client or server) — the 3-strike design decision this session made is client-side, in-memory, resetting on any normal answer (matches S4.2's stateless client-held-history architecture).
- No Quick Reply chips exist. `messages/pl.json`'s `concierge` namespace (`pl.json:52-60`) has `disclosure`, `inputPlaceholder`, `send`, `typing`, `fallbackMessage`, `fallbackCta` — this session adds `escalationMessage`/`escalationCta`/`chips.*` alongside them, mirrored in `messages/en.json`.
- `lib/rate-limit/concierge.ts` (session-keyed sliding window via `checkConciergeRateLimit`) already guards the OpenAI-calling route; the new escalation-logging endpoint added this session makes no OpenAI call, so it is intentionally left unguarded by that limiter (see What We're NOT Doing).

### Key Discoveries:

- `route.ts`'s existing `fullAnswer` accumulation (`route.ts:84-91`) is the single place to add `[ESCALATE]` detection — no restructuring of the streaming loop needed.
- The chat component's `updateAssistant` pattern (`concierge-chat.tsx:75-79`) already supports adding new boolean flags (`isEscalated`) the same way `isFallback` was added.
- `messages/pl.json`/`en.json` follow a flat-namespace convention per feature (`concierge.*`); nested `concierge.chips.*` keys are consistent with `guest.categories`-style nesting used elsewhere in the same files.

## Desired End State

A guest who asks a complaint/urgent question ("Mam reklamację, brudny pokój") sees the model immediately return `[ESCALATE]`-prefixed text, which the UI renders as a distinct escalation bubble (not the plain fallback bubble) pointing to reception — no attempted KB answer first. A guest who gets 3 plain `[FALLBACK]` answers in a row (with no successful answer in between) sees that same escalation bubble on the 3rd miss. A guest with an empty chat sees a row of tappable Quick Reply chips (e.g. "Śniadanie — godziny?", "Jest WiFi?") that auto-send on tap and disappear once the conversation starts. Both escalation triggers fire the reserved `concierge_response_escalated` PostHog event (`reason: 'complaint'` or `'streak'`), giving the roadmap's future escalation-rate dashboard metric (§7.4/S5.2) something to read. Verify by:
- Sending a complaint-flavored message and observing the escalation bubble appear on the very first reply, no plain-fallback bubble shown first.
- Sending 3 KB-uncovered questions in a row and observing the plain fallback bubble on misses 1-2, escalation bubble on miss 3.
- Sending a KB-uncovered question, then a normal answered question, then 2 more KB-uncovered questions, and confirming escalation does NOT fire (streak reset by the answered turn in between).
- Tapping a Quick Reply chip on an empty chat and observing it auto-sends and the chip row disappears.
- Inspecting PostHog (or the mocked `captureEvent` call in tests) for `concierge_response_escalated` firing with the correct `reason` in both trigger paths.

## What We're NOT Doing

- **Staff-visible escalation record** — no new inbox/table for staff to see escalated conversations. Escalation is guest-facing UI (stronger bubble, same `tel:` reception CTA) + an analytics event only, per this session's HITL decision. A real-time staff notification channel is a larger, separate feature.
- **Keyword-based complaint heuristic** — complaint/urgent detection is entirely the model's `[ESCALATE]` self-classification via the system prompt, same trust level already accepted for `[FALLBACK]`. No PL/EN keyword list is built or maintained.
- **Rate limiting the new escalation-logging endpoint** — it makes no OpenAI call (near-zero cost, analytics-only), so it does not reuse `checkConciergeRateLimit`. It is still gated behind the existing session-auth check (must have a valid, `auth_level >= 1` session), matching the trust boundary of every other guest route.
- **Per-property Quick Reply chips** — chips are a static, platform-owned, bilingual list identical for every hotel this session. No per-property configuration UI or KB-derived chip generation.
- **Editing input before chip send** — tapping a chip sends immediately; there is no populate-then-review step.
- **Distinct copy for complaint vs. streak escalation** — both triggers render the exact same escalation bubble copy/style; only the logged `reason` property differs.

## Implementation Approach

Four small phases, each independently testable: (1) prompt + event-shape groundwork, (2) extend the existing stream route to detect and log the complaint-flagged case, (3) add a new minimal endpoint for the streak-logged case (since the streak state only exists client-side), (4) wire the chat UI's counter, escalation bubble, and Quick Reply chips. Phases 1-3 are server/lib-only and unit-testable in isolation; Phase 4 is the only phase touching the client component and its existing test file.

## Phase 1: Prompt & Analytics Groundwork

### Overview

Give the model the `[ESCALATE]` instruction and give the analytics event type a `reason` so both trigger paths (built in later phases) can log distinctly.

### Changes Required:

#### 1. System prompt: `[ESCALATE]` instruction

**File**: `lib/concierge/system-prompt.ts`

**Intent**: Instruct the model to recognize complaints, urgent situations, and booking/reservation-change requests, and to respond with an `[ESCALATE]` prefix instead of attempting an answer from KB — mirroring how `[FALLBACK]` is already instructed, but for a different trigger condition (complaint/urgent vs. "KB doesn't cover this").

**Contract**: Add one paragraph to `buildSystemPrompt`'s returned string, analogous in structure to the existing `[FALLBACK]` paragraph. Must state: when the guest's message is a complaint, describes an urgent/safety situation, or asks to book/change/cancel a reservation, reply with exactly the prefix `[ESCALATE]` and do not attempt to answer from KB first (this is a first-turn check, not a "KB lookup failed" fallback).

#### 2. Analytics event shape

**File**: `lib/analytics/events.ts`

**Intent**: Give the already-reserved `concierge_response_escalated` event a `reason` so the two trigger paths (complaint, detected server-side in Phase 2; streak, detected client-side and logged via Phase 3's endpoint) are distinguishable in PostHog.

**Contract**: Change `{ name: 'concierge_response_escalated'; properties: Record<string, never> }` to `{ name: 'concierge_response_escalated'; properties: { reason: 'complaint' | 'streak' } }`. Remove the now-stale "Reserved — S4.3 ... no host code yet" comment above it.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test -- lib/concierge/system-prompt`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- None — this phase is pure library/type code, fully covered by unit tests and the type checker.

---

## Phase 2: Stream Route — Complaint Escalation Detection

### Overview

Extend the existing `/api/concierge/stream` route to detect an `[ESCALATE]`-prefixed model answer and log `concierge_response_escalated` (`reason: 'complaint'`) alongside the existing `concierge_response_delivered` call — no new endpoint, no change to the SSE frame shape the client already parses.

### Changes Required:

#### 1. Route handler

**File**: `app/api/concierge/stream/route.ts`

**Intent**: After the stream completes successfully, check `fullAnswer` for the `[ESCALATE]` prefix the same way it already checks for `[FALLBACK]` (`route.ts:104`), and fire the escalation event when present.

**Contract**: Alongside the existing `const confidence = fullAnswer.startsWith('[FALLBACK]') ? 0 : 1` and its `captureEvent({ name: 'concierge_response_delivered', ... })` call, add: if `fullAnswer.startsWith('[ESCALATE]')`, also call `captureEvent({ name: 'concierge_response_escalated', properties: { reason: 'complaint' } }, { distinctId: sessionId, propertyId })`. The `confidence` computation for `concierge_response_delivered` treats an `[ESCALATE]`-prefixed answer the same as a `[FALLBACK]`-prefixed one (confidence 0) — no new confidence tier. No change to the SSE `chunk`/`done`/`error` frame shapes; the client already receives the raw `[ESCALATE]`-prefixed text as `chunk` events exactly like it does today for `[FALLBACK]`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test -- app/api/concierge/stream`
  - `[ESCALATE]`-prefixed mocked OpenAI response fires `concierge_response_escalated` with `{ reason: 'complaint' }` in addition to the existing `concierge_response_delivered` call
  - A normal (non-prefixed) mocked response does NOT fire `concierge_response_escalated`
  - A `[FALLBACK]`-prefixed mocked response does NOT fire `concierge_response_escalated` (only `[ESCALATE]` triggers the complaint path)
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- None — fully covered by the mocked-OpenAI unit tests already established for this route in S4.2.

---

## Phase 3: Escalation Logging Endpoint (Streak Path)

### Overview

A minimal new authenticated endpoint the client calls fire-and-forget when its in-memory 3-consecutive-fallback counter fires, since that streak state only exists client-side and has no other server touchpoint to hook into.

### Changes Required:

#### 1. Escalation logging route

**File**: `app/api/concierge/escalate/route.ts`

**Intent**: Log `concierge_response_escalated` (`reason: 'streak'`) for a guest session that just hit 3 consecutive fallback answers — analytics-only, no OpenAI call, no response body needed beyond a status code.

**Contract**: `POST(request: NextRequest)`. Same auth shape as `app/api/concierge/stream/route.ts:20-40` (read `x-session-id`, `withTenantContext(request.headers)`, query `sessions` for `auth_level >= 1`) — reuse the identical 401/400 gate, not a new auth pattern. On success, call `captureEvent({ name: 'concierge_response_escalated', properties: { reason: 'streak' } }, { distinctId: sessionId, propertyId })` and return `NextResponse.json({ ok: true }, { status: 204 })`. No request body is read or validated beyond the auth headers — the streak count itself is trusted from the client (this is a logging signal, not a security boundary; see What We're NOT Doing for the rate-limiting tradeoff).

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test -- app/api/concierge/escalate`
  - Missing `x-session-id` → 401, no `captureEvent` call
  - Invalid property header → 400
  - Session missing or `auth_level < 1` → 401, no `captureEvent` call
  - Valid session → `captureEvent` called once with `{ name: 'concierge_response_escalated', properties: { reason: 'streak' } }` and correct `distinctId`/`propertyId`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- None — pure request/response logic, fully covered by unit tests.

---

## Phase 4: Guest Chat UI — Escalation Bubble & Quick Reply Chips

### Overview

Wire the client: a consecutive-fallback counter that resets on any normal answer, a distinct escalation bubble rendered for both the `[ESCALATE]` and 3rd-streak cases, and static Quick Reply chips shown only before the first message.

### Changes Required:

#### 1. Chat client component

**File**: `components/guest/concierge-chat.tsx`

**Intent**: Add escalation detection (both trigger paths) and Quick Reply chips to the existing streaming chat, reusing the established `updateAssistant`/SSE-parsing structure from S4.2.

**Contract**:
- Add `isEscalated: boolean` to `ChatMessage`, set alongside the existing `isFallback` computation in the `done` handler: if `accumulated.startsWith('[ESCALATE]')`, set `isEscalated: true` (not `isFallback`) and fire-and-forget `fetch('/api/concierge/escalate', { method: 'POST' })` (no body needed — auth is via cookie/header the same as the main stream request).
- Track a `consecutiveFallbackCount` ref/state at the component level: increment when a turn resolves `isFallback: true`; reset to 0 when a turn resolves as neither fallback nor escalated (a normal answer). When the count reaches 3, mark that turn's message `isEscalated: true` instead of `isFallback: true`, fire-and-forget the same `/api/concierge/escalate` call, and reset the counter to 0 (so a 4th, 5th, etc. consecutive fallback doesn't re-escalate every turn).
- Render: `isEscalated` messages get a distinct bubble (different background/copy from the plain `isFallback` bubble) using new `t('escalationMessage')` / `t('escalationCta')` strings, same `tel:${phoneReception}` link pattern as the existing fallback bubble.
- Quick Reply chips: a new `QUICK_REPLY_KEYS` array of i18n key suffixes (e.g. `breakfast`, `wifi`, `parking`, `checkout`, `pets`, `area`), rendered as a horizontal row of buttons above the input, visible only when `messages.length === 0`. Tapping a chip calls the same `sendMessage` logic with the chip's translated text as the question (auto-send, no input population).

#### 2. i18n strings

**Files**: `messages/pl.json`, `messages/en.json`

**Intent**: Add `escalationMessage`/`escalationCta` (distinct copy from `fallbackMessage`/`fallbackCta`) and a `chips` object with the static Quick Reply question set, in both languages, following the existing flat `concierge.*` namespace.

**Contract**: Add to the `concierge` namespace: `"escalationMessage": "..."`, `"escalationCta": "..."` (PL: e.g. "Ta sprawa wymaga uwagi recepcji. Łączymy Cię bezpośrednio." / "Zadzwoń do recepcji"; EN equivalents), and `"chips": { "breakfast": "...", "wifi": "...", "parking": "...", "checkout": "...", "pets": "...", "area": "..." }` with concrete FAQ-style question text per key (PL and EN each), matching the existing FAQ categories seeded in S2.4 (godziny, WiFi, parking, checkout, zwierzęta, okolica).

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test -- components/guest/concierge-chat`
  - `[ESCALATE]`-prefixed accumulated text renders the escalation bubble (distinct from the fallback bubble), not the plain fallback bubble
  - 3 consecutive `[FALLBACK]`-prefixed turns: misses 1-2 render the plain fallback bubble, miss 3 renders the escalation bubble
  - A normal answer between two fallback turns resets the streak (2 fallbacks + 1 normal + 2 fallbacks does NOT escalate)
  - Quick Reply chips are visible when `messages` is empty and absent after the first message is sent
  - Tapping a chip sends its question immediately (no manual Send click needed)
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- Send a complaint-style message (e.g. "Mam reklamację") against a real or manually-triggered `[ESCALATE]` response and confirm the escalation bubble appears on the first reply.
- Trigger 3 consecutive KB-uncovered questions and confirm the escalation bubble appears exactly on the 3rd, not before.
- Confirm the disclosure line and Quick Reply chips both render correctly on chat open, and chips disappear after the first message.
- Confirm `concierge_response_escalated` appears in PostHog Live Events (or dev console network tab for `/api/concierge/escalate`) for the streak-triggered case.

---

## Testing Strategy

### Unit Tests:

- System prompt: contains the `[ESCALATE]` instruction alongside the existing `[FALLBACK]` one.
- Stream route: `[ESCALATE]`-prefixed answer fires the escalation event with `reason: 'complaint'`; `[FALLBACK]`-prefixed and normal answers do not.
- Escalate route: auth gate (mirrors the main stream route's existing gate tests), successful call logs the event with `reason: 'streak'`.
- Chat component: escalation bubble rendering for both trigger paths, streak reset on a normal answer, Quick Reply chip visibility and auto-send behavior (fetch and the new escalate call both mocked).

### Integration Tests:

- None with a real OpenAI call (unchanged from S4.2's convention — all model behavior is mocked in tests).

### Manual Testing Steps:

1. Complaint-style message → escalation bubble on the first reply, no plain-fallback bubble shown first.
2. 3 consecutive KB-uncovered questions → plain fallback bubble ×2, escalation bubble on the 3rd.
3. Fallback, then a normal answered question, then 2 more fallbacks → no escalation (streak reset verified).
4. Tap a Quick Reply chip on an empty chat → auto-sends, chip row disappears.
5. Confirm both escalation triggers log `concierge_response_escalated` with the correct `reason` (PostHog Live Events or network inspection).

## Performance Considerations

The new `/api/concierge/escalate` call is fire-and-forget from the client (not awaited before continuing the UI), so it introduces no perceived latency to the chat. It makes no OpenAI call, so its cost/latency profile is negligible compared to the main stream route.

## Migration Notes

Not applicable — no schema changes in this session.

## References

- Related sessions: `context/changes/s4-2/plan.md` (chat UI, stream route, fallback bubble this session extends), `context/changes/s2-4/plan.md` (FAQ template categories mirrored in Quick Reply chip content)
- Roadmap: `context/foundation/implementation_roadmap.md` §6.3 (Zakres i fallback), §7.4 (event spec, escalation rate metric)
- HITL decisions: `context/archive/decisions_log.md` (#6 no AI-initiated sales, #7 suggest-don't-sell, #8 mandatory disclosure)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Prompt & Analytics Groundwork

#### Automated

- [x] 1.1 Unit tests pass: `npm run test -- lib/concierge/system-prompt` — 75b37a9
- [x] 1.2 Type checking passes: `npm run typecheck` — 75b37a9
- [x] 1.3 Linting passes: `npm run lint` — 75b37a9

### Phase 2: Stream Route — Complaint Escalation Detection

#### Automated

- [x] 2.1 Unit tests pass: `npm run test -- app/api/concierge/stream` — e7f07b2
- [x] 2.2 Type checking passes: `npm run typecheck` — e7f07b2
- [x] 2.3 Linting passes: `npm run lint` — e7f07b2

### Phase 3: Escalation Logging Endpoint (Streak Path)

#### Automated

- [x] 3.1 Unit tests pass: `npm run test -- app/api/concierge/escalate` — 28cb055
- [x] 3.2 Type checking passes: `npm run typecheck` — 28cb055
- [x] 3.3 Linting passes: `npm run lint` — 28cb055

### Phase 4: Guest Chat UI — Escalation Bubble & Quick Reply Chips

#### Automated

- [ ] 4.1 Unit tests pass: `npm run test -- components/guest/concierge-chat`
- [ ] 4.2 Type checking passes: `npm run typecheck`
- [ ] 4.3 Linting passes: `npm run lint`

#### Manual

- [ ] 4.4 Complaint-style message escalates on the first reply, no plain-fallback bubble shown first
- [ ] 4.5 3 consecutive fallbacks escalate exactly on the 3rd
- [ ] 4.6 Disclosure line and Quick Reply chips render correctly; chips disappear after first message
- [ ] 4.7 `concierge_response_escalated` observed firing for the streak-triggered case
