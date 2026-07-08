# PostHog EU: 10 core events + consent banner — Implementation Plan

## Overview

S5.1 wires the app's first real analytics data path: a server-side PostHog EU capture helper, the 4 of 10 MUST events whose host code already exists (`hotel_login`, `hotel_settings_updated`, `guest_qr_scanned`, `guest_session_returned`), a typed registry covering all 10 events (including the 6 that will only fire once S2.6/S3.2/Phase 4 land), and a non-blocking consent banner that respects `doNotTrack`.

## Current State Analysis

- `posthog-js` and `posthog-node` are already installed. `lib/posthog/client.ts` re-exports `posthog-js`; `lib/posthog/server.ts` exports `posthogServer` (a `posthog-node` client, `flushAt: 1, flushInterval: 0`). Neither is ever called with `.capture()` anywhere in the codebase today.
- `app/providers.tsx` unconditionally calls `posthog.init(...)` client-side with `autocapture: false, capture_pageview: false, capture_pageleave: false, disable_session_recording: true` — it's currently an inert init with no consent gating.
- `app/api/scan/reception/route.ts:104` and `app/api/scan/room/route.ts:94` already carry `// TODO(S5.1): posthog.capture('guest_qr_scanned', ...)` comments marking the intended hook points.
- Panel login (`app/[locale]/(hotel-auth)/login/login-form.tsx`) is a **client component** that calls `supabase.auth.signInWithPassword` directly via the browser client — there is no server route in the login path today, so `hotel_login` (which per HITL below must be server-side) needs one.
- Panel mutation actions already exist and are the natural `hotel_settings_updated` hook points: `app/[locale]/(hotel)/onboarding/actions.ts` (`saveHotelProfile`), `app/[locale]/(hotel)/services/actions.ts` (`createServiceFromTemplate`, `createCustomService`, `updateService`, `toggleServiceActive`, `toggleServicePin`), `app/[locale]/(hotel)/knowledge/actions.ts` (`createKnowledgeFromTemplate`, `createKnowledgeEntry`, `updateKnowledgeEntry`, `deleteKnowledgeEntry`).
- `proxy.ts` (Next.js middleware) already validates the `__Host-session` cookie against the `sessions` table (`id, revoked, expires_at`) on every request and injects `x-property-id`/`x-session-id` headers from JWT `app_metadata`. It does not currently track guest return visits — the `sessions` table has no `last_seen_at` column.
- `sessions.id` (UUID, created in `lib/scan/reception.ts`'s `createReceptionSession`) is the natural `guest_id` — no separate identifier exists or is needed.
- The DB uses `property_id` everywhere (`hotel_id` does not exist as a column); per roadmap §7.4 `hotel_id` is intentionally a PostHog-only group-property name, sourced from `property_id`.
- No i18n keys, no consent/cookie library, and no `doNotTrack` handling exist anywhere in the codebase today.
- **Scope gap (confirmed with user):** `guest_order_received`, `guest_order_submitted` (S2.6 inbox, S3.2 guest order flow) and `concierge_query_submitted`, `concierge_response_delivered`, `concierge_response_escalated` (Phase 4 AI Concierge) have no host code yet — those features don't exist in the codebase. This plan defines their typed capture signatures now so the future sessions call a ready-made function, but cannot make them appear in PostHog Live Events yet.

## Desired End State

- `lib/analytics/capture.ts` exports a single `captureEvent` helper used by every instrumented call site; it is fire-and-forget, never throws, and reports failures to Sentry.
- `lib/analytics/events.ts` defines a typed union of all 10 event names with their property shapes (6 wired, 4 reserved for future sessions with a comment pointing at the owning session).
- `hotel_login`, `hotel_settings_updated`, `guest_qr_scanned`, `guest_session_returned` events appear in PostHog EU Live Events with `$groups.hotel_id` set on every one and `distinct_id` = `sessions.id` for guest events / `hotel_users.id` for hotel events.
- A non-blocking, informational consent banner appears on first visit (guest and hotel panel), is dismissible, stores its dismissal in `localStorage`, and is skipped entirely (banner + PostHog init) when `navigator.doNotTrack === '1'`.
- `sessions` has a `last_seen_at` column, updated on every guest page request; a return after a 30-minute gap fires `guest_session_returned`.

### Key Discoveries:

- `app/api/scan/reception/route.ts:104`, `app/api/scan/room/route.ts:94` — exact TODO markers to replace.
- `app/[locale]/(hotel-auth)/login/login-form.tsx:23-24` — client-only sign-in call; no server hook exists yet for `hotel_login`.
- `proxy.ts:11-29` — existing session-cookie validation block; the `last_seen_at` check slots in right after the existing validity check.
- `supabase/migrations/20260626000001_initial_schema.sql:109-123` — `sessions` table definition (no `last_seen_at`).
- `lib/panel/rbac.ts` — `Resource` enum already includes `hotel_profile`, `services`, `knowledge` — no RBAC changes needed, capture happens after the existing permission check succeeds.

## What We're NOT Doing

- Not building S2.6 (orders inbox), S3.2 (guest order flow), or any Phase 4 AI Concierge code. `guest_order_received`, `guest_item_details_opened`, `guest_order_submitted`, `concierge_query_submitted`, `concierge_response_delivered`, `concierge_response_escalated` are typed but unused until those sessions land.
- Not implementing a blocking opt-in consent gate — the banner is informational per roadmap §7.4 ("Mierzymy użycie bez danych osobowych"), not a cookie-consent wall.
- Not propagating `doNotTrack` through the server-side request chain — only the client-side `posthog.init()` call and banner display respect it. Server-side guest events (`guest_qr_scanned`, `guest_session_returned`) fire regardless of the browser's DNT header; this is a documented, accepted limitation (data is pseudonymous/non-PII).
- Not adding `posthog.groupIdentify` calls or a separate hotel-name/plan sync to PostHog groups — `$groups: { hotel_id }` on each event is sufficient for S5.1; enriching group properties is SHOULD-level, deferred to S5.2 (dashboard).
- Not adding a `hotel_login` capture for failed login attempts — only successful sign-in.
- Not writing to a real PostHog EU project in automated tests — tests mock `posthog-node`.
- Not touching `lib/panel/onboarding-resume.ts`, `readiness.ts` or other read-only panel modules — only mutating actions get instrumented.

## Implementation Approach

One shared helper (`captureEvent`) is the single choke point every instrumented call site goes through, guaranteeing `$groups.hotel_id` is never forgotten and failures never propagate to the caller. All capture is server-side: for the one client-only call site (panel login), the client calls a new tiny API route after a successful sign-in instead of capturing from the browser. A `sessions.last_seen_at` column, updated in `proxy.ts`, gives `guest_session_returned` a real signal instead of firing on every page load. The consent banner and `doNotTrack` gating live entirely in `app/providers.tsx` and a new banner component — informational only, no effect on server-side capture.

## Critical Implementation Details

### Timing & lifecycle

`posthogServer` is configured with `flushAt: 1, flushInterval: 0` (immediate send per event), but on a serverless/edge-adjacent runtime a fire-and-forget `capture()` call can still be outstanding when the route handler returns and the process is frozen/recycled. `captureEvent` must call `await posthogServer.capture(...)` internally (awaited by the helper itself, not by the caller who just does `void captureEvent(...)`) and additionally call `posthogServer.flush()` before returning, wrapped in the same try/catch — this makes the "fire-and-forget from the caller's perspective" and "actually delivered before the request ends" requirements both true at once.

### State sequencing

In `proxy.ts`, the `last_seen_at` read-then-maybe-capture-then-write must happen using the value read *before* the update, then update to `now()` in the same request — otherwise a later request in the same burst would recompute the gap against an already-updated timestamp and never observe the >30 min return.

## Phase 1: Analytics core infrastructure

### Overview

Typed event registry, the `captureEvent` helper, and the `sessions.last_seen_at` migration — no call sites wired yet.

### Changes Required:

#### 1. Event registry

**File**: `lib/analytics/events.ts`

**Intent**: Define the full set of 10 event names and their property shapes in one place so every call site (current and future) shares the same contract, and so a reviewer can see all 10 MUST events and their status (wired vs. reserved) at a glance.

**Contract**: Exports a discriminated union `AnalyticsEvent` keyed by event name (`hotel_login`, `hotel_settings_updated`, `guest_order_received`, `guest_qr_scanned`, `guest_item_details_opened`, `guest_order_submitted`, `guest_session_returned`, `concierge_query_submitted`, `concierge_response_delivered`, `concierge_response_escalated`), each with its own `properties` shape (e.g. `guest_qr_scanned` carries `qr_type: 'reception' | 'room'`; `concierge_response_delivered` carries `confidence: number, latency_ms: number`).

**4 wired now** (host code exists — Phase 2 instruments these): `hotel_login`, `hotel_settings_updated`, `guest_qr_scanned`, `guest_session_returned`.

**6 reserved** (no host code yet — typed only, one-line comment naming the owning future session): `guest_order_received` (S2.6), `guest_item_details_opened` (S3.2), `guest_order_submitted` (S2.6/S3.2), `concierge_query_submitted` (S4.2), `concierge_response_delivered` (S4.2), `concierge_response_escalated` (S4.3).

#### 2. Capture helper

**File**: `lib/analytics/capture.ts`

**Intent**: One function every instrumented call site uses, so `$groups.hotel_id`, error isolation, and flush-before-return are guaranteed centrally rather than repeated at each of the ~11 call sites.

**Contract**: `captureEvent(event: AnalyticsEvent, ctx: { distinctId: string; propertyId: string }): Promise<void>`. Internally calls `posthogServer.capture({ distinctId: ctx.distinctId, event: event.name, properties: event.properties, groups: { hotel_id: ctx.propertyId } })`, then `await posthogServer.flush()`, all inside try/catch reporting to `Sentry.captureException` on failure. Never rethrows — callers invoke it as `void captureEvent(...)` (or `await` it if they want the flush to complete before their own response, e.g. in the login-event route where the request is about to end anyway).

#### 3. `sessions.last_seen_at` migration

**File**: `supabase/migrations/20260707000001_sessions_last_seen_at.sql`

**Intent**: Give `guest_session_returned` a real "gap since last activity" signal instead of firing on every page load.

**Contract**: `ALTER TABLE sessions ADD COLUMN last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now();` Also update `lib/supabase/database.types.ts`'s `sessions` Row/Insert/Update types to include `last_seen_at: string` (regenerate via existing Supabase type-gen convention or hand-edit consistent with the other columns).

### Success Criteria:

#### Automated Verification:

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] Migration applies cleanly against local Supabase (`supabase db reset` or equivalent project convention)
- [ ] Unit tests for `captureEvent` pass (mocked `posthog-node`): confirms `groups.hotel_id` set, confirms Sentry capture on thrown error, confirms no exception escapes the helper

#### Manual Verification:

- [ ] None for this phase — no user-facing behavior yet

---

## Phase 2: Wire instrumentation into existing hooks

### Overview

Replace the two TODO comments, add the small login-event route, instrument the panel mutation actions, and add the `last_seen_at` check in `proxy.ts`.

### Changes Required:

#### 1. `guest_qr_scanned`

**File**: `app/api/scan/reception/route.ts`, `app/api/scan/room/route.ts`

**Intent**: Replace the existing `// TODO(S5.1)` comments (line 104 and line 94 respectively) with real `captureEvent` calls, using the newly-created `sessions.id` as `distinctId` and the resolved `property_id` as the group.

**Contract**: `void captureEvent({ name: 'guest_qr_scanned', properties: { qr_type: 'reception' | 'room' } }, { distinctId: session.id, propertyId })` placed after the session row exists (reception: after `createReceptionSession`; room: after `upgradeSession`), not blocking the redirect response.

#### 2. `hotel_login`

**File**: new `app/api/panel/auth/login-event/route.ts`; edit `app/[locale]/(hotel-auth)/login/login-form.tsx`

**Intent**: Since login is a client-only Supabase call with no server hook, add a minimal POST route the client calls right after a successful sign-in (before `router.push`), so the capture stays server-side per the agreed architecture.

**Contract**: New route: `POST` handler resolves the caller via `getHotelUser()` (already reads the authenticated cookie context), calls `captureEvent({ name: 'hotel_login', properties: {} }, { distinctId: hotelUser.id, propertyId: hotelUser.propertyId })`, returns 204. `login-form.tsx`: after `signInError` check passes (line 26), `await fetch('/api/panel/auth/login-event', { method: 'POST' })` before `router.push('/dashboard')` — fire-and-forget is acceptable here too (don't block navigation on it; use `void fetch(...)`).

#### 3. `hotel_settings_updated`

**File**: `app/[locale]/(hotel)/onboarding/actions.ts`, `app/[locale]/(hotel)/services/actions.ts`, `app/[locale]/(hotel)/knowledge/actions.ts`

**Intent**: Every successful mutating action (profile save, service create/update/toggle/pin, knowledge create/update/delete) fires the same `hotel_settings_updated` event with an `area` property distinguishing which panel section changed — one event name, not one per action, keeping the tracking plan small.

**Contract**: Add `void captureEvent({ name: 'hotel_settings_updated', properties: { area: 'profile' | 'services' | 'knowledge' } }, { distinctId: hotelUser.id, propertyId: hotelUser.propertyId })` immediately before each existing `return {}` success path (after the Supabase write succeeds, before `revalidatePath`/`revalidate*Paths()` — order doesn't matter since it's fire-and-forget, but keep it consistent). Call sites: `saveHotelProfile` (area: `'profile'`), `createServiceFromTemplate`/`createCustomService`/`updateService`/`toggleServiceActive`/`toggleServicePin` (area: `'services'`), `createKnowledgeFromTemplate`/`createKnowledgeEntry`/`updateKnowledgeEntry`/`deleteKnowledgeEntry` (area: `'knowledge'`).

#### 4. `guest_session_returned`

**File**: `proxy.ts`

**Intent**: Detect a guest re-opening the app after a real gap (>30 min) rather than on every page navigation, using the new `last_seen_at` column.

**Contract**: In the existing session-validation block (`proxy.ts:12-29`, after confirming the session is valid, only for non-`/api/` page routes matching the guest app), read `last_seen_at` alongside the existing `id, revoked, expires_at` select. If `now() - last_seen_at > 30 minutes`, `void captureEvent({ name: 'guest_session_returned', properties: {} }, { distinctId: session.id, propertyId: session.property_id })`. In all cases (returned or not), update `last_seen_at = now()` via a fire-and-forget `admin.from('sessions').update(...)` call — this write must not block the middleware response.

### Success Criteria:

#### Automated Verification:

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] Unit/integration tests (mocked `posthog-node`) pass for all 4 wired hook points, asserting event name + `groups.hotel_id` + correct `distinctId` per call site
- [ ] Existing IT-2 test (`lib/scan/__tests__/it-2.test.ts`) still passes unmodified (capture must not alter response status/cookies/redirect behavior)

#### Manual Verification:

- [ ] Scan a reception QR → `guest_qr_scanned` appears in PostHog EU Live Events with `qr_type: reception` and correct `hotel_id` group
- [ ] Log into the panel → `hotel_login` appears in Live Events
- [ ] Save the hotel profile / create a service / add an FAQ → `hotel_settings_updated` appears with the correct `area`
- [ ] Revisit the guest app after >30 min idle with a still-valid session → `guest_session_returned` appears; a normal page-to-page navigation within the same 30 min does not re-fire it

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Consent banner + doNotTrack

### Overview

Non-blocking informational banner (guest + hotel panel), `localStorage` dismissal, and `doNotTrack` gating of the client-side PostHog init.

### Changes Required:

#### 1. `doNotTrack` gate

**File**: `app/providers.tsx`

**Intent**: Skip `posthog.init()` entirely (and thus the banner) when the browser sends Do Not Track, per roadmap §7.4 "respekt doNotTrack".

**Contract**: Before the existing `posthog.init(...)` call, check `typeof navigator !== 'undefined' && navigator.doNotTrack === '1'`; if true, skip `init()` and don't render the consent banner. Otherwise proceed as today.

#### 2. Consent banner component

**File**: new `components/analytics/consent-banner.tsx`; wired into `app/providers.tsx` (or the root layout, wherever `Providers` renders children)

**Intent**: Show the roadmap-specified copy ("Mierzymy użycie bez danych osobowych") once per browser, dismissible, never blocking any interaction or PostHog init.

**Contract**: Client component reading/writing a `analytics_banner_dismissed` `localStorage` key on mount; renders nothing if the key is set or if DNT skipped init. A dismiss button sets the key and hides the banner. No network calls, no effect on server-side capture.

#### 3. i18n keys

**File**: `messages/en.json`, `messages/pl.json`

**Intent**: Add the banner copy in both locales, following the existing message-file structure (see the existing `onboarding.banner.cta` key for the nesting convention).

**Contract**: New top-level `analytics.banner.message` and `analytics.banner.dismiss` keys (or nested under an existing suitable namespace) with the PL copy from roadmap §7.4 and an English equivalent.

### Success Criteria:

#### Automated Verification:

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] Unit test for the DNT gate: with `navigator.doNotTrack = '1'` mocked, `posthog.init` is never called and the banner doesn't render

#### Manual Verification:

- [ ] First visit (guest app and hotel panel, fresh browser profile) shows the banner; dismissing it hides it and it stays hidden on reload
- [ ] With browser DNT enabled, no banner appears and no PostHog network request fires
- [ ] Banner text renders correctly in both PL and EN

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Test hardening + manual PostHog verification

### Overview

Fill any remaining test gaps from Phases 1–3 and do the final end-to-end manual check against PostHog EU Live Events for all 4 wired events plus `hotel_id` group presence.

### Changes Required:

#### 1. Capture helper test suite

**File**: `lib/analytics/__tests__/capture.test.ts`

**Intent**: Lock down the helper's contract (groups, error isolation, flush) independent of any specific call site, following the existing colocated `__tests__/` convention used by `lib/panel/*` and `lib/qr/*`.

**Contract**: `vi.mock('@/lib/posthog/server')`, assert `capture` called with `groups: { hotel_id: propertyId }`, assert a thrown/rejected `capture` is caught and reported (mock `Sentry.captureException`) without the helper's promise rejecting.

### Success Criteria:

#### Automated Verification:

- [ ] `npm test` (full vitest suite) passes, including all new analytics tests
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes

#### Manual Verification:

- [ ] In PostHog EU project, Live Events shows all 4 wired events within the last hour of manual testing, each with a `$group_hotel_id` (or equivalent group property) matching the test property's id
- [ ] No PII (email, name, IP) appears in any event's properties panel in PostHog

---

## Testing Strategy

### Unit Tests:

- `captureEvent` helper: groups set correctly, error isolation, flush behavior (mocked `posthog-node`)
- DNT gate in `providers.tsx`: init skipped when `navigator.doNotTrack === '1'`

### Integration Tests:

- Reception/room scan routes still pass existing IT-2 assertions with capture wired in (no regression to response shape)
- Each of the 4 wired hook points captures the right event name + property shape when driven through its real route/action (mocked `posthog-node`, real Supabase per existing repo convention)

### Manual Testing Steps:

1. Fresh browser profile → visit guest app → banner shows → dismiss → reload → banner stays hidden
2. Set browser DNT → reload → no banner, no PostHog request in Network tab
3. Scan a reception QR, then a room QR → check PostHog Live Events for two `guest_qr_scanned` events with correct `qr_type`
4. Log into the hotel panel → check `hotel_login` in Live Events
5. Save the hotel profile, add a service, add an FAQ entry → check three `hotel_settings_updated` events with correct `area`
6. Leave the guest app idle >30 min (or manually backdate `last_seen_at` in a test DB), reload → `guest_session_returned` fires; immediately reload again → does not re-fire

## Performance Considerations

`captureEvent`'s internal `await posthogServer.flush()` adds a small amount of latency to each instrumented request (typically <50ms for a single-event flush against PostHog EU's ingestion endpoint) but this happens after the meaningful work (DB write, redirect construction) so it doesn't block the response body being ready — only the very end of the request lifecycle in serverless environments where the function might otherwise be frozen before the async capture completes.

## Migration Notes

`sessions.last_seen_at` is backfilled to `now()` via the column default for all existing rows — acceptable since no session pre-dates this migration in any real deployment (MVP, single pilot hotel, pre-go-live).

## References

- Session-plan scope: `context/foundation/session-plan.md:162-165`
- Roadmap spec: `context/foundation/implementation_roadmap.md:580-588` (§7.4), `:564-579` (§7.3 RODO/DPA)
- Existing TODO markers: `app/api/scan/reception/route.ts:104`, `app/api/scan/room/route.ts:94`
- IT-2 test pattern to follow: `lib/scan/__tests__/it-2.test.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Analytics core infrastructure

#### Automated

- [x] 1.1 npm run typecheck passes — d774ecf
- [x] 1.2 npm run lint passes — d774ecf
- [x] 1.3 Migration applies cleanly — d774ecf
- [x] 1.4 captureEvent unit tests pass (mocked posthog-node) — d774ecf

### Phase 2: Wire instrumentation into existing hooks

#### Automated

- [x] 2.1 npm run typecheck passes — 45b855e
- [x] 2.2 npm run lint passes — 45b855e
- [x] 2.3 Unit/integration tests pass for all 4 wired hook points — 45b855e
- [x] 2.4 Existing IT-2 test still passes unmodified — 45b855e

#### Manual

- [x] 2.5 guest_qr_scanned appears in PostHog Live Events on reception scan — 45b855e
- [x] 2.6 hotel_login appears in Live Events on panel login — 45b855e
- [x] 2.7 hotel_settings_updated appears with correct area on profile/service/knowledge save — 45b855e
- [x] 2.8 guest_session_returned fires only after >30 min gap, not on every navigation

### Phase 3: Consent banner + doNotTrack

#### Automated

- [x] 3.1 npm run typecheck passes — cabbd1e
- [x] 3.2 npm run lint passes — cabbd1e
- [x] 3.3 DNT gate unit test passes — cabbd1e

#### Manual

- [x] 3.4 Banner shows on first visit, dismiss persists across reload — cabbd1e
- [x] 3.5 DNT enabled → no banner, no PostHog request — cabbd1e
- [x] 3.6 Banner text correct in PL and EN — cabbd1e

### Phase 4: Test hardening + manual PostHog verification

#### Automated

- [x] 4.1 Full vitest suite passes
- [x] 4.2 npm run typecheck passes
- [x] 4.3 npm run lint passes

#### Manual

- [x] 4.4 All 4 wired events visible in PostHog EU Live Events with correct hotel_id group
- [x] 4.5 No PII present in any event's properties
