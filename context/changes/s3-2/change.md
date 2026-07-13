---
change_id: s3-2
title: Browse + flow zamówienia (3–4 tapy)
status: implementing
created: 2026-07-10
updated: 2026-07-10
archived_at: null
---

## Notes

z 'c:/data/_new_projects/5a1/context/foundation/session-plan.md'

## TODO — out of scope for S3.2, raised during Phase 4 manual verification (2026-07-13)

The ekran sukcesu's "Zobacz moje zamówienia" link points to `/orders`, which the plan assumed
would 404 until S3.3 adds a guest-facing route ("link poprawny, 404 do czasu S3.3" —
`plan.md` Phase 4, point 3). That assumption is wrong: Next.js route groups (`(guest)`,
`(hotel)`) don't add a path segment, so a guest `/orders` and the already-existing staff
`/orders` (`app/[locale]/(hotel)/orders/page.tsx`) would collide on the same URL. Since only
the staff page exists today, `/orders` always resolves to it and its `getHotelUser()` guard
redirects unauthenticated visitors to `/login` — bouncing the guest out of the PWA into the
staff login screen instead of a harmless 404.

Confirmed by user during manual E2E-01 testing; left as-is per user decision (no code change
this session — see conversation, "Zostaw jak jest + TODO"). Needs resolving when S3.3 builds
the guest `/orders` route: either the guest route must be added under a path that doesn't
collide with the staff one (route groups won't help — both currently need literal `/orders`),
or the staff/guest split needs a routing rework (e.g. locale-prefixed staff area under
something other than the bare `[locale]` root, or a `/staff` prefix). Candidate target: S3.3
(`Moje zamówienia + SSE + fallback polling`) — resolve before wiring up the link for real.
