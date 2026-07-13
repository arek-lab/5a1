# Guest Edge Cases P0/P1, Error Screens, i18n — Plan Brief

> Full plan: `context/changes/s3-4/plan.md`

## What & Why

The guest app already redirects to `/error?type=...` from five places (token/session/auth failures) but the page is a placeholder stub with no branding and no message differentiation — every P0 failure currently 404s the user experience the roadmap requires. This session builds the real error page, adds offline detection, and completes the P1 order-retry contact info.

## Starting Point

Reception scan, room scan, `proxy.ts`'s session guard, and `requireGuestSession()` all already redirect to `/error?type=...` with 13 distinct type values — but `app/[locale]/error/page.tsx` just renders `Error: {type}` with no logo, no differentiated copy, and no way to reach the hotel's branding (none of the callers pass `property_id`). Order retry (built in S3.2) already works but shows a generic message with no reception phone. No offline detection exists anywhere.

## Desired End State

A guest hitting an expired/invalid QR, a lapsed session, or insufficient auth sees a branded page (hotel logo + name + tappable phone number) with copy that correctly distinguishes "expired" from "invalid" from "you scanned the wrong thing" — or an honest generic message when no property is resolvable at all. Losing connectivity shows a non-blocking toast and disables "Zamów" until back online. A failed order POST retry now shows the reception phone. Everything is bilingual PL/EN.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Property branding on error page | Redirects append `property_id` query param; page does its own service-role lookup | Route handlers already have `property_id` in scope even on failure; no new session state needed | Plan (user-confirmed) |
| Error-type grouping | 4 groups: expired / invalid / insufficient_access / generic | Matches roadmap's "wygasł vs nieprawidłowy" split while giving room-scan issues (outside_window, no_active_reservation) honest copy instead of misleading "invalid" | Plan (user-confirmed) |
| `proxy.ts` expired/revoked bug | Fix it — split into `session_expired` / `session_revoked` | Highest-traffic path to the error page (every natural session lapse); currently mislabels the dominant real case | Plan (user-confirmed) |
| Offline UX mechanism | Plain `useOnlineStatus()` hook + toast in layout, no Context | Matches existing codebase convention (plain hooks everywhere, no state-management library) | Plan (user-confirmed) |
| Order-retry offline vs 5xx | One unified message with phone added; no separate offline-specific copy | Minimal change to a working component; "Zamów" is already disabled when offline so that state is largely unreachable inside the modal | Plan (user-confirmed) |
| Error page retry action | None — informational only, link back to home | Retrying an expired/invalid token fails identically; roadmap scopes "retry" to order mutations only | Plan (user-confirmed) |
| Unresolvable property fallback | Generic platform-neutral message, no logo/phone | Honest about what the platform can know for URL-tampering-style edge cases; still gives an actionable next step | Plan (user-confirmed) |
| i18n structure | New `guest.error` + `guest.offline` namespaces | Consistent with existing flat per-feature namespacing already in `messages/{pl,en}.json` | Plan (user-confirmed) |

## Scope

**In scope:**
- Real `/[locale]/error` page (branded + generic variants, 4 message groups)
- `property_id` plumbing through reception/room scan routes and `proxy.ts`
- Fixing `proxy.ts`'s expired-vs-revoked conflation
- Offline detection hook + toast + "Zamów" disable
- Reception phone in the existing order-retry error message
- PL/EN translations for all of the above

**Out of scope:**
- Service Worker / Workbox caching (S3.5)
- Retry button on the error page itself
- Per-type (13-way) unique translations
- Referer-header or other best-effort property recovery for unresolvable cases
- E2E/Playwright automation (no tooling in repo, consistent with prior sessions)

## Architecture / Approach

Bottom-up: shared error-taxonomy mapping + property-context plumbing first (Phase 1), then the page itself (Phase 2), then two independent features — offline detection (Phase 3) and order-retry phone (Phase 4) — then a final i18n/verification pass (Phase 5). The critical architectural fact: `/[locale]/error/page.tsx` already lives outside the `(guest)` route group, so it doesn't go through `GuestLayout`'s session guard — avoiding a redirect loop. Do not move it inside `(guest)`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Taxonomy + plumbing | `resolveErrorGroup()`, `property_id` on all 5 redirect call sites, proxy.ts fix | Widening `findAndConsumeToken`/`validateRoomScan` return shapes without breaking existing callers/tests |
| 2. `/error` page | Branded + generic rendering, 4 message groups | Redirect-loop regression if page is ever moved into `(guest)` |
| 3. Offline detection | `useOnlineStatus()` hook, toast, disabled "Zamów" | SSR guard for `navigator.onLine` (must default sensibly server-side) |
| 4. Order-retry phone | `phoneReception` threaded into existing retry message | None significant — additive to a working component |
| 5. i18n + verification | Full PL/EN parity, full test/build pass | Missed hard-coded string in a new component |

**Prerequisites:** S3.2 (order flow + retry pattern) implemented — confirmed done.
**Estimated effort:** ~1 session across 5 phases.

## Open Risks & Assumptions

- Assumes `properties.phone_reception` is populated for pilot hotels (existing onboarding field, S2.2) — an empty phone renders the `tel:` link section omitted, not broken, per existing `concierge-chat.tsx` precedent.
- Assumes no other code path redirects to `/error` beyond the 5 identified in research; a `grep -rn "'/error"` sweep during Phase 1 implementation should confirm this before finalizing the plumbing changes.

## Success Criteria (Summary)

- Every one of the 13 known error `type` values renders branded (when resolvable) or honest-generic (when not) copy in both PL and EN, with correct expired/invalid/insufficient-access/generic grouping.
- Offline guests see a non-blocking toast and cannot submit an order until back online.
- A failed order retry shows the reception phone number.
