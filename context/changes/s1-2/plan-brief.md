# S1.2 — QR Scan Route Handler, Token Exchange, and Session Cookie — Plan Brief

> Full plan: `context/changes/s1-2/plan.md`

## What & Why

Build the two route handlers that turn a physical QR scan into an authenticated guest session: reception scan (`auth_level 0→1`) and room scan (`auth_level 1→2`). Without these handlers, the guest app cannot bootstrap authentication — every downstream session (S1.3, S3.x, S4.x) blocks on this flow.

## Starting Point

S1.1 delivered `lib/qr/generate.ts` (QR code creation) and Vitest. The Custom Access Token Hook (S0.3, migration 004) is live and queries `sessions` by `auth_user_id` on every JWT refresh. `sessions.reservation_id` is NOT NULL — reception-only sessions cannot be created until that constraint is relaxed.

## Desired End State

A guest scans the hotel reception QR → browser lands on `http(s)://app/api/scan/reception?init_token=<UUID>` → single-use token consumed → anonymous Supabase user created → `sessions` row inserted (auth_level=1) → JWT refreshed (hook injects `property_id` + `session_id` + `auth_level`) → `__Host-session` cookie set → browser redirected to `/`. A second scan of the same token returns `/error?type=token_used`. Later, scanning the room QR upgrades the same session to auth_level=2 with `reservation_id` and `expires_at = checkout+2h` linked. IT-2 verifies all four scenarios against a real Supabase instance.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Route structure | `/api/scan/reception` + `/api/scan/room` (two files) | Separate handlers for separate concerns; each is independently testable | Plan |
| Reception QR URL | `/api/scan/reception?init_token=UUID` direct API route | One HTTP hop; no page render needed before auth | Plan |
| Step-up mechanism | Update existing sessions row + `refreshSession()` | One Supabase user per stay; continuous audit trail; hook re-reads updated row | Plan |
| sessions.reservation_id | Make nullable via migration 005 | Reception QR is property-wide — no reservation known at first scan | Plan |
| expires_at at reception | `now() + 24h` temporary; overwritten at room scan | Cannot compute `checkout+2h` without reservation; 24h is enough to complete check-in | Plan |
| Error response | `302 /error?type=<reason>` | Phones scanning QR get a readable page, not raw JSON | Plan |
| IT-2 test approach | Import route handler `GET`, call with `new NextRequest(url)` | No dev server needed; tests DB + cookie state together | Plan |
| PostHog event | Deferred to S5.1 (TODO comment only) | S5.1 is the dedicated analytics session | Plan |
| Device fingerprint | NULL for now | S1.3 adds anomaly detection; populate there with full context | Plan |

## Scope

**In scope:**
- Migration 005: `sessions.reservation_id DROP NOT NULL`
- Regenerate `database.types.ts` after migration
- `lib/scan/errors.ts`, `lib/scan/reception.ts`, `lib/scan/room.ts` (DB logic)
- `app/api/scan/reception/route.ts` and `app/api/scan/room/route.ts`
- Minimal error page stub `app/[locale]/(guest)/error/page.tsx`
- IT-2 integration tests (4 cases, real Supabase)

**Out of scope:**
- Rate limiting, anomaly detection, early check-out (S1.3)
- Error page UI (S3.4)
- PostHog events (S5.1)
- Device fingerprint (S1.3)

## Architecture / Approach

```
Guest phone (QR scan)
  │
  ▼ GET /api/scan/reception?init_token=UUID
  │
  ├─ findAndConsumeToken()  [service_role — atomic UPDATE WHERE used_at IS NULL]
  ├─ signInAnonymously()    [createServerClient (writes to response)]
  ├─ createReceptionSession() [service_role — INSERT sessions auth_level=1]
  ├─ refreshSession()       [hook fires → JWT: property_id + session_id + auth_level=1]
  ├─ Set-Cookie: __Host-session=<sessions.id>
  └─ 302 → /

Guest (later) scans room QR
  │
  ▼ GET /api/scan/room?room_id=UUID  [with __Host-session cookie]
  │
  ├─ validateRoomScan()     [service_role — checks session, room QR, valid_from/until window]
  ├─ upgradeSession()       [service_role — auth_level=2, reservation_id, expires_at=checkout+2h]
  ├─ refreshSession()       [hook fires → JWT: auth_level=2]
  └─ 302 → /
```

Critical ordering constraint: `sessions` row must be inserted **before** `refreshSession()`. The Custom Access Token Hook reads `sessions` on every refresh; inserting after would deliver a JWT with stale (level=0) claims.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Migration | `sessions.reservation_id` nullable + regenerated types | Must re-run `supabase gen types` after push |
| 2. Scan library | `lib/scan/` functions — DB validation, token consumption, session CRUD | Atomic UPDATE race condition must be handled (0-row case) |
| 3. Route handlers | Two working scan endpoints + error stub page | Supabase client must write auth cookies to response object, not `next/headers` |
| 4. IT-2 tests | 4 integration test cases pass with real Supabase | Test ordering: reception scan must run before room scan (room test reads its session) |

**Prerequisites:** S1.1 complete ✓; Supabase project accessible with `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`; `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` set.

**Estimated effort:** ~1 session across 4 phases (migration is trivial; library + handlers + tests is the bulk).

## Open Risks & Assumptions

- `refreshSession()` without explicit `refresh_token` arg works because `signInAnonymously()` stores the session in the client's in-memory state — assumption to validate during Phase 3 manual testing
- `__Host-session` cookie: modern browsers treat `localhost` as secure; cookie should work in dev; verify Railway preview uses HTTPS (it does — Railway provisions TLS)
- IT-2 depends on real Supabase instance — tests will fail locally if env vars are missing; CI must have them set

## Success Criteria (Summary)

- `npm run test -- lib/scan/__tests__/it-2.test.ts` exits 0, 4 tests pass
- Browser: scan reception QR → `__Host-session` cookie set with HttpOnly + Secure + SameSite=Strict
- Browser: scan same QR again → `/error?type=token_used`
- Browser: scan room QR after reception → JWT `app_metadata.auth_level === 2`
