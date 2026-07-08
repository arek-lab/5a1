# PostHog EU: 10 core events + consent banner — Plan Brief

> Full plan: `context/changes/s5-1/plan.md`

## What & Why

Wire the app's first real analytics: a server-side PostHog EU capture helper, instrumentation for the 4 of 10 MUST events whose host code already exists, a typed registry for all 10 (so future sessions don't redesign the schema), and a non-blocking consent banner respecting `doNotTrack` — per roadmap §7.4.

## Starting Point

`posthog-js`/`posthog-node` are installed and a client-side init already runs in `app/providers.tsx` (inert — no capture, no consent gating). Two route handlers already carry `// TODO(S5.1)` comments marking where `guest_qr_scanned` belongs. No consent UI, no `doNotTrack` handling, and no `sessions.last_seen_at` column exist yet.

## Desired End State

4 events (`hotel_login`, `hotel_settings_updated`, `guest_qr_scanned`, `guest_session_returned`) show up in PostHog EU Live Events with `$groups.hotel_id` set on every one. A dismissible, informational banner appears on first visit and disappears entirely (along with PostHog init) when the browser sends Do Not Track.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| 6 events without host code | Type them now, wire nothing; TODO points at owning future session | DoD "every event in Live Events" only applies to the 4 that have real code paths today; the rest can't fire without building S2.6/S3.2/Phase 4 first |
| Consent banner | Informational, non-blocking, no opt-in gate | Matches roadmap copy ("Mierzymy użycie bez danych osobowych") and non-PII data — a blocking gate would suppress most analytics for no legal requirement |
| Consent storage | `localStorage`, no effect on server capture | Banner is informational, not a gate — no need to plumb consent state to the backend |
| `doNotTrack` | Checked only at client `posthog.init()`; not propagated server-side | Covers the real-world case (browser DNT) with minimal code; server-side guest events are pseudonymous already |
| Event architecture | Always server-side via one `captureEvent` helper; client calls its own API for the one client-only case (login) | Matches roadmap "capture server-side"; guarantees `$groups.hotel_id` and error isolation in one place |
| `guest_id` | Reuse `sessions.id` | Already an opaque UUID with independent PostHog retention (90d) vs. session lifetime (48h post-checkout) — no conflict, no new ID needed |
| `hotel_id` group | Set via `$groups` on every `capture()` call, no separate `groupIdentify` | Guarantees no event ever "forgets" the group; enriching group properties is SHOULD-level, deferred to S5.2 |
| `guest_session_returned` detection | New `sessions.last_seen_at` column, >30 min gap in `proxy.ts` | Without a timestamp, every page load would look like a "return" — the column gives a real signal |
| `hotel_login` capture scope | Success only | Matches the event name literally; failed attempts are security/audit territory (already covered by rate-limiting + audit_logs), not analytics |
| Capture error handling | Fire-and-forget from the caller, but the helper itself awaits `capture()` + `flush()` internally and never throws | Analytics must never break login or QR scanning; serverless runtimes can freeze before a truly-unawaited promise completes |
| Priority if time runs short | Phase 1+2 (core + wiring) are MUST; Phase 3 (banner + DNT) is the first to cut | Data flowing into PostHog with the right group/distinct ids unblocks S5.2's dashboard; the banner is UX polish by comparison |

## Scope

**In scope:**
- `lib/analytics/capture.ts` + `lib/analytics/events.ts` (typed registry, all 10 events)
- Wiring `hotel_login`, `hotel_settings_updated`, `guest_qr_scanned`, `guest_session_returned`
- `sessions.last_seen_at` migration
- Consent banner UI + i18n (PL/EN) + `doNotTrack` gate
- Test coverage (mocked `posthog-node`)

**Out of scope:**
- Building S2.6 orders inbox, S3.2 guest order flow, or Phase 4 AI Concierge (owners of the other 6 events)
- Blocking opt-in consent flow
- `posthog.groupIdentify` / enriched group properties
- Dashboard (Pulse/Growth) — that's S5.2

## Architecture / Approach

One shared `captureEvent(event, { distinctId, propertyId })` helper is the single choke point for every instrumented call site — it sets `$groups.hotel_id`, never throws, and flushes before the request ends. All capture is server-side; the one client-only call site (panel login) gets a tiny new API route the client calls after a successful sign-in. `proxy.ts` gains a `last_seen_at` check to detect real guest returns.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Analytics core | Typed event registry, `captureEvent` helper, `last_seen_at` migration | Getting the flush/fire-and-forget balance wrong in serverless |
| 2. Wire existing hooks | 4 events live in PostHog: login, settings, QR scan, session return | `last_seen_at` gap logic firing on every page load if sequencing is wrong |
| 3. Consent banner + DNT | Informational banner, `doNotTrack` gate | None major — self-contained UI work |
| 4. Test hardening + verification | Full test coverage, manual Live Events check | None major |

**Prerequisites:** None beyond what's already merged (S0.3, S1.2, S2.1–S2.4 panel actions).
**Estimated effort:** ~1 session across 4 phases.

## Open Risks & Assumptions

- Server-side guest events don't respect `doNotTrack` — accepted tradeoff, documented in the plan.
- 6 of 10 MUST events per session-plan cannot be verified in PostHog Live Events this session because their host features don't exist yet; DoD is being interpreted as "every event whose host code exists in the codebase today."
- `sessions.last_seen_at` write on every guest page request adds a small write to a hot path (middleware) — acceptable at MVP scale (single pilot hotel).

## Success Criteria (Summary)

- `hotel_login`, `hotel_settings_updated`, `guest_qr_scanned`, `guest_session_returned` all visible in PostHog EU Live Events with correct `hotel_id` group
- Consent banner shows once per browser, dismissible, absent when DNT is set
- No PII in any event's properties
