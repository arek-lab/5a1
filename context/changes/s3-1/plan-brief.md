# App Shell + Splash + Welcome + Home (S3.1) — Plan Brief

> Full plan: `context/changes/s3-1/plan.md`

## What & Why

Build the guest-facing PWA app shell — the flow a guest sees right after a QR scan: splash → welcome → home. Today the guest routes are empty placeholders; this session gives the guest app its first real screen, gated on a valid, sufficiently-authenticated session.

## Starting Point

Session/tenant infrastructure already exists (`proxy.ts` validates `__Host-session`, forwards `x-property-id`/`x-session-id` headers; `withTenantContext()` scopes RLS). `sessions.auth_level` (0/1/2) is tracked but nothing gates guest pages on it yet. `services.is_pinned` (max 3) already backs "Polecamy" server-side from the panel (S2.3). No guest UI, no PWA manifest, no locale-without-URL-prefix mechanism, and no `guest_first_name` lookup exist yet — all greenfield.

## Desired End State

A guest scanning into a hotel sees: a time-based splash (≤1.5s), a welcome banner with their first name (or a generic greeting), then a home page with a static 5-category grid and a below-the-fold "Polecamy" section (up to 3 pinned services, capped to show once per 24h). A floating Concierge button and a "PL | EN" switcher are always present. The shell is installable per Lighthouse's PWA checks. Anyone without `auth_level >= 1` is redirected to the existing branded error page.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Locale on first SSR render | Cookie (`NEXT_LOCALE`) → Accept-Language → default, mirrored from localStorage | SSR needs a signal before hydration; localStorage alone can't inform the server, so a non-httpOnly cookie mirrors it without touching `__Host-session`. |
| Splash dismissal | Purely time-based (1.5s), independent of data fetch | Guarantees the hard-timeout budget regardless of DB/network latency; content streams in underneath via RSC. |
| Missing guest name | Generic greeting fallback, never blocks | `guest_first_name` is UX-only per HITL #1; a missing name isn't a session-integrity issue. |
| PWA scope this session | Manifest + installability metadata only, no Service Worker | Full SW caching is explicitly S3.5's job; keeps this session bounded. |
| Concierge button (pre-S4) | Visible, links to a placeholder `/concierge` "coming soon" page | Satisfies the always-visible spec without faking chat; gives S4 a route to build into. |
| Polecamy frequency cap | Boolean localStorage key per `session_id`, 24h TTL, hides whole section | Matches roadmap wording exactly; avoids disproportionate per-tile state tracking for a below-the-fold nudge. |
| Empty category tiles | Always show all 5, never hide/count services | Matches the existing "never hide, handle downstream" philosophy (§5.5); empty-state handling is S3.2's job. |
| Guest auth gating | Guard at `auth_level >= 1`, redirect to `/error` otherwise | Prevents unauthenticated visitors from seeing personalized content; reuses the existing error page. |
| Performance/PWA verification | Manual Lighthouse run, no CI gate this session | No Lighthouse CI infra exists or is scoped by the roadmap for S3.1; avoids scope creep. |
| Category tile source | Hardcoded i18n keys + icon map keyed off `service-categories.ts` | Single source of truth with the panel; categories are a fixed taxonomy, not hotel-configurable. |
| Logo fallback | Hotel name as text wordmark when `logo_url` is null | Keeps CLS budget intact and guarantees hotel-specific (not generic platform) branding. |
| Language switcher | New shared `components/guest/` component | Mirrors the existing `components/panel/` convention; all future guest pages (S3.2–S3.5) reuse it for free. |

## Scope

**In scope:**
- Guest session context helper (`auth_level` guard, reservation join for first name)
- Locale resolution without URL prefix + language switcher
- Guest app shell layout (header, guard, PWA manifest)
- Splash screen, welcome banner
- Home page: category grid + Polecamy section with frequency cap
- Floating Concierge stub + placeholder route
- PL/EN translations for everything above
- Unit tests + manual Lighthouse verification

**Out of scope:**
- Service Worker / Workbox caching (S3.5)
- `/c/[category]` list page, service detail, order flow (S3.2)
- Real AI Concierge chat (S4)
- Lighthouse CI / automated perf gates
- Per-category service-count queries or hiding empty categories
- Hotel-content auto-translate pipeline

## Architecture / Approach

Bottom-up layering: (1) session/locale data helpers with no UI, (2) app shell layout carrying the auth guard and PWA metadata, (3) splash/welcome presentational pieces, (4) home page content assembly, (5) translations + tests + manual perf verification. Each phase is independently testable; the Phase 2 guard protects everything built afterward.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Session & locale foundation | `getGuestSessionContext`, `requireGuestSession`, cookie/Accept-Language locale resolution, language switcher | Locale fallback chain has three tiers — easy to get precedence wrong |
| 2. App shell + PWA manifest | Guest layout with header/guard, Concierge stub route, `manifest.json`/metadata | Next.js 15's exact manifest convention (`app/manifest.ts` vs static file) needs verifying against the installed version |
| 3. Splash + welcome | Time-based splash, name-fallback welcome banner | Splash must stay decoupled from data-fetch timing or it risks blowing the 1.5s budget |
| 4. Home page | Category grid, pinned-services query, Polecamy frequency cap | `localStorage` timing/session_id keying must exactly match roadmap's 24h-per-session intent |
| 5. Translations + tests + perf verification | PL/EN keys, unit test coverage, manual Lighthouse pass | No existing Lighthouse/E2E tooling — first time this project verifies perf budgets at all |

**Prerequisites:** A working QR scan flow to produce a valid `auth_level >= 1` session cookie for manual testing (already built in S1.1/S1.2); S2.3's pinned-services data (already built).
**Estimated effort:** ~5 phases, single session.

## Open Risks & Assumptions

- Assumes Next.js 15's App Router metadata API (`app/manifest.ts`) is preferred over a static `public/manifest.json`; Phase 2 will confirm against the installed Next version and adjust the file location if needed, without changing the deliverable.
- No E2E tooling exists yet; the true end-to-end guest flow (E2E-01) is validated at S3.2, not here — this session's manual verification is necessarily partial (visual/manual Lighthouse only).

## Success Criteria (Summary)

- A guest with a valid `auth_level >= 1` session sees splash → welcome → home in sequence, with correct name/generic-greeting handling.
- All 5 category tiles and the frequency-capped Polecamy section render correctly; language switching persists across reloads.
- Lighthouse reports PWA installability passing and FCP/LCP/CLS/INP budgets met on a throttled mobile profile.
