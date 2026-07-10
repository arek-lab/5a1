---
change_id: s3-1
title: App shell, splash, welcome and home screens (S3.1)
status: implementing
created: 2026-07-08
updated: 2026-07-10
archived_at: null
---

## Notes

z 'c:/data/_new_projects/5a1/context/foundation/session-plan.md'

## Handoff — 2026-07-08, mid Phase 2

**Code status**: Phase 2 (`App Shell Layout + PWA Manifest`) implementation is DONE and all automated checks pass:
- `npm run test -- lib/guest components/guest` ✅
- `npm run typecheck` ✅
- `npm run lint` ✅
- `npm run build` ✅ (confirms `/manifest.webmanifest` generation)

Files touched (uncommitted — nothing has been committed yet, waiting on manual verification gate per `/10x-implement` ritual):
- `app/[locale]/(guest)/layout.tsx` — real guard (`requireGuestSession()`) + header (logo/wordmark) + `LanguageSwitcher` + `FloatingConciergeButton`
- `app/[locale]/error/page.tsx` — **moved out of the `(guest)` route group** (was `app/[locale]/(guest)/error/page.tsx`). Reason: the new guest layout guard calls `requireGuestSession()` on every route under `(guest)`; leaving `/error` inside that group would cause an infinite redirect loop when the session is invalid. URL is unchanged (`/error`), only the folder moved.
- `app/[locale]/(guest)/concierge/page.tsx` — static placeholder page
- `components/guest/floating-concierge-button.tsx` — new
- `app/manifest.ts` — new, Next 16 manifest file convention, references placeholder SVG icons
- `public/icons/icon.svg`, `public/icons/icon-maskable.svg` — new placeholder icons (swap for real branding later, not blocking)
- `app/layout.tsx` — added `viewport` export (width, initialScale, themeColor)
- `context/changes/s3-1/plan.md` — Progress 2.1–2.3 checked off

**Blocked on**: Phase 2 manual verification (2.4–2.7) cannot proceed. Guest pages redirect to `/error?type=insufficient_auth` even with a freshly-scanned, valid `auth_level=1` session row in `sessions` (confirmed via SQL). Root cause isolated to: **the Supabase Custom Access Token Hook is not being invoked by Auth during real sign-in/refresh**, even though everything on the DB side checks out:
- `sessions` row created correctly (`auth_level=1`, not revoked, not expired)
- Decoded real JWT's `app_metadata` is consistently `{}` (empty) after scan
- `public.custom_access_token_hook(event jsonb)` called directly via SQL with a realistic event payload (including `app_metadata: '{}'::jsonb` matching the real `auth.users.raw_app_meta_data` shape for the anonymous user) returns correct claims (`property_id`, `session_id`, `auth_level: 1`) — function logic is provably correct
- Only one unambiguous definition of the function exists (`public`, owner `postgres`, `SECURITY DEFINER`, signature `(event jsonb) returns jsonb`)
- `EXECUTE` grant to `supabase_auth_admin` confirmed present
- User confirmed in Supabase Dashboard: hook is registered as "Custom Access Token" → Postgres function → `public.custom_access_token_hook`, shown as **enabled**; project ref matches `.env.local`'s `NEXT_PUBLIC_SUPABASE_URL`

This is an **infra/dashboard configuration issue, not a code bug** — nothing here is inside this session's (S3.1) scope to fix in code.

**Next steps for whoever resumes**:
1. Check Supabase Dashboard → Logs → Auth Logs around the timestamp of a scan attempt, looking for hook-related errors (never got checked — this is the most likely to reveal the real cause).
2. Try forcing a resave: disable the Custom Access Token hook in the dashboard, save, re-enable and re-pick the function explicitly, save again, then retry with a brand new token + cleared cookies.
3. Once `app_metadata.property_id`/`session_id` show up correctly in a decoded JWT after scan, resume the Phase 2 manual verification checklist (2.4–2.7 in `plan.md`), then run the phase-end commit ritual.
4. To retest: generate a fresh reception QR token via SQL (`insert into qr_codes (property_id, type, expires_at, used_at) values ((select id from properties limit 1), 'reception', now() + interval '1 hour', null) returning init_token;`), visit `/api/scan/reception?init_token=<uuid>` in a clean/incognito session, then decode the resulting `sb-*-auth-token` cookie's `access_token` JWT.

Resume with: `/10x-implement s3-1 phase 2`

## Update — 2026-07-10: root cause found, was NOT infra — was a code bug in s0-3

The "infra/dashboard configuration issue" conclusion above was **wrong**. Diagnosed properly this
session (restart project: no change; hook resave: no change; grants/schema privileges: all correct;
Auth Logs: request succeeds with 200, no error surfaced):

Real root cause: `public.custom_access_token_hook` (defined in `s0-3`,
`20260626000004_auth_hook.sql`) used `jsonb_set(v_claims, '{app_metadata,property_id}', ...)` on a
multi-element path. `jsonb_set` silently no-ops when an *intermediate* path element is missing (it
only auto-creates the last element) — and the real GoTrue event for anonymous sign-in omits the
`app_metadata` key entirely, unlike the manual SQL test event used in the original investigation
(which included `app_metadata: {}` and therefore masked the bug).

Fixed out-of-scope-but-blocking via `supabase/migrations/20260710080000_fix_auth_hook_missing_app_metadata.sql`
(pre-seeds `app_metadata` as `{}` before nested `jsonb_set` calls). Full writeup in `s0-3`'s
`change.md` under "Hotfix — 2026-07-10", since the bug originates there, not in s3-1.

Phase 2 manual verification (2.4–2.7) can now resume.

## TODO — out of scope for S3.1, raised during Phase 4 manual verification (2026-07-10)

User suggested adding an in-app "Scan room QR" button (camera access via `MediaDevices` + a
QR-decoding library) on the pre-login/splash screen. Current flow assumes the guest scans both
QR codes with the phone's native camera app, which opens `/api/scan/reception` /
`/api/scan/room` directly in the browser — no in-app camera UI exists or is planned in the
roadmap yet. Needs its own UX design + plan; not part of S3.1 (app shell/splash/welcome/home).
Candidate target: a future session under Faza 3 (guest flow) once S3.2 (category/order flow) is
stable, or a dedicated session if the roadmap is amended.
