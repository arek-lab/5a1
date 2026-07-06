# S1.2 — QR Scan Route Handler, Token Exchange, and Session Cookie Implementation Plan

## Overview

Build the two route handlers that convert a QR scan into an authenticated guest session. Reception scan (`/api/scan/reception`) exchanges a single-use `init_token` for an anonymous Supabase user, creates a `sessions` row, and sets the `__Host-session` cookie. Room scan (`/api/scan/room`) upgrades an existing `auth_level=1` session to `auth_level=2` by verifying the room's `valid_from/valid_until` window and linking the reservation. IT-2 integration tests verify both paths against a real Supabase instance with active RLS.

## Current State Analysis

S1.1 is complete: `lib/qr/generate.ts` exports `generateReceptionQR`, `generateRoomQR`, `deactivateRoomQR` (all service_role-backed with DPA gate); Vitest is configured with `@/` alias.

`proxy.ts` (Next.js 16 middleware, correct filename) handles JWT refresh and injects `x-property-id` / `x-session-id` headers. The Custom Access Token Hook (migration 004) queries `sessions` by `auth_user_id` on every JWT refresh — so the `sessions` row must exist **before** `refreshSession()` is called for the hook to inject correct claims.

`sessions.reservation_id` is NOT NULL in the current schema. Reception scan cannot know the reservation (the rotating QR is property-wide, not per-guest). A migration must relax this constraint; room scan handler populates it when the room is linked.

No scan route handlers or `lib/scan/` module exist.

## Desired End State

- `GET /api/scan/reception?init_token=<UUID>`: validates + consumes the single-use token, signs in anonymously, creates `sessions` row (auth_level=1), refreshes JWT so hook injects claims, sets `__Host-session` cookie, redirects to `/`
- `GET /api/scan/room?room_id=<UUID>`: reads `__Host-session` cookie, validates auth_level=1 session, validates room QR and `valid_from/valid_until` window, upgrades session to auth_level=2 + populates `reservation_id` + updates `expires_at = checkout+2h`, refreshes JWT, redirects to `/`
- IT-2 passes with active RLS: happy path reception scan, replay rejection, room step-up valid, room step-up out-of-window

### Key Discoveries

- Custom Access Token Hook contract: `lib/supabase/database.types.ts:626` — `set_tenant_context(p_property_id, p_session_id?)`; hook queries `sessions` by `auth_user_id` DESC latest non-revoked non-expired row
- Reception QR validity rule from S1.1 plan: `expires_at > now()` AND `used_at IS NULL` (do NOT check `is_active`)
- Room QR validity rule from S1.1 plan: `is_active = true` (no TTL — multi-use; access window controlled by `rooms.valid_from/valid_until`)
- `__Host-` cookie prefix requires `Secure + Path=/ + no Domain` — enforced by the prefix itself in compliant browsers; `Secure` is set explicitly
- Route handlers must create their own Supabase SSR client with cookies writing to the redirect response object (not via `next/headers`) — the `proxy.ts` (middleware) pattern shows the correct `setAll` → `response.cookies.set` wiring
- `signInAnonymously()` stores the session in-memory; subsequent `refreshSession()` uses the in-memory refresh_token without re-reading request cookies — this makes the sign-in → create sessions row → refresh sequence reliable
- Next.js App Router route handlers can be imported and called directly in Vitest with a `new NextRequest(url)` — no dev server needed for IT-2

## What We're NOT Doing

- Rate limiting (`/api/scan/*` calls) — S1.3 (Upstash Redis)
- Anomaly detection (ASN, country jump) — S1.3
- Early check-out atomic transaction — S1.3
- Device fingerprint capture (`device_fingerprint` column) — S1.3
- PostHog `guest_qr_scanned` event — S5.1 (TODO comment placeholder added in S1.2)
- Error page UI at `/error` — S3.4 (a minimal stub page is enough for IT-2)
- Changing `generateReceptionQR()` signature — it stays property-only

## Implementation Approach

Four sequential phases. Phase 1 (migration) is a blocker: the route handler cannot insert into `sessions` without nullable `reservation_id`. Phase 2 (scan library) extracts DB logic into standalone functions so IT-2 tests can call the route handlers directly as functions without mocking DB internals. Phase 3 (route handlers) orchestrates: library calls + Supabase auth ops + cookie/redirect. Phase 4 (IT-2) verifies the end-to-end observable behaviour.

## Critical Implementation Details

**Supabase client in route handlers:** Do NOT use `createServerClient()` from `lib/supabase/server.ts` (reads/writes via `next/headers`). Each scan handler creates its own `createServerClient` instance from `@supabase/ssr` with `getAll: () => request.cookies.getAll()` and `setAll` writing directly to the `redirectResponse` object (mirroring the `proxy.ts` pattern). This ensures Supabase auth cookies end up on the outgoing redirect response, not orphaned in `next/headers`.

**Refresh timing:** After `signInAnonymously()`, insert the `sessions` row (service_role) BEFORE calling `refreshSession()`. The Custom Access Token Hook queries `sessions` on every token refresh — if the row doesn't exist yet, the hook returns `auth_level: 0` (fail-closed). The insertion must complete first.

**Atomic token invalidation:** Use a conditional UPDATE: `UPDATE qr_codes SET used_at = now() WHERE init_token = $1 AND used_at IS NULL RETURNING id`. If the returned count is 0, a concurrent request already consumed the token — return `token_used` error. Do NOT use a SELECT-then-UPDATE pattern (TOCTOU race).

**`expires_at` for reception-only sessions:** Reception scan cannot know the checkout time (no reservation linked yet). Set `expires_at = now() + INTERVAL '24 hours'` as a temporary value. Room scan handler overwrites it with `reservation.check_out + INTERVAL '2 hours'` when the reservation is linked.

**`__Host-session` cookie on redirect response:** `redirectResponse.cookies.set('__Host-session', sessionId, { httpOnly: true, secure: true, sameSite: 'strict', path: '/' })`. The `__Host-` prefix is enforced by the browser — `Secure` and `Path=/` are redundantly explicit for clarity.

---

## Phase 1: Migration — sessions.reservation_id nullable

### Overview

Reception scans create sessions without a known reservation (property-wide QR). The current NOT NULL constraint blocks this. One additive migration relaxes it; no data changes needed (no existing rows in staging/dev that would be affected).

### Changes Required

#### 1. Migration 005 — relax sessions.reservation_id

**File**: `supabase/migrations/20260626000005_sessions_nullable_reservation.sql`

**Intent**: Allow `sessions.reservation_id` to be NULL so reception-only sessions (auth_level=1) can be created before the room is known. Room scan populates it.

**Contract**:

```sql
-- Reception scans create sessions before the reservation is known.
-- Room scan handler populates reservation_id + expires_at when room is linked.
ALTER TABLE sessions ALTER COLUMN reservation_id DROP NOT NULL;
```

### Success Criteria

#### Automated Verification

- `npx supabase db push` exits 0
- `npm run typecheck` passes (database.types.ts `Insert.reservation_id` updated to `string | null` — re-generate types after migration)

#### Manual Verification

- `\d sessions` in psql shows `reservation_id uuid` without `not null`

---

## Phase 2: Scan Library

### Overview

Pure DB-logic functions extracted from the route handlers. Each function takes explicit parameters; none import from `next/headers` or `next/server`. This separation makes the route handlers thin orchestrators and allows IT-2 to test observable behaviour by calling the route handler's exported `GET` function with a `NextRequest`.

### Changes Required

#### 1. Error type constants

**File**: `lib/scan/errors.ts` (new)

**Intent**: Centralise the string literal union types for scan errors so route handlers and tests share the same error vocabulary.

**Contract**: Export two types:

- `ReceptionScanError`: `'token_not_found' | 'token_expired' | 'token_used'`
- `RoomScanError`: `'missing_session_cookie' | 'session_not_found' | 'session_expired' | 'session_revoked' | 'wrong_auth_level' | 'room_qr_not_found' | 'outside_window' | 'no_active_reservation'`

#### 2. Reception scan DB logic

**File**: `lib/scan/reception.ts` (new)

**Intent**: Provide two functions the reception route handler calls in sequence: one validates + atomically consumes the token; the other creates the sessions row.

**Contract**: Exports:

- `findAndConsumeToken(initToken: string): Promise<{ ok: true; qr: Tables<'qr_codes'> } | { ok: false; error: ReceptionScanError }>`:
  1. Service-role SELECT `qr_codes` WHERE `init_token = $1` AND `type = 'reception'`
  2. If no row → `{ ok: false, error: 'token_not_found' }`
  3. If `expires_at <= now()` → `{ ok: false, error: 'token_expired' }`
  4. If `used_at IS NOT NULL` → `{ ok: false, error: 'token_used' }`
  5. Atomic UPDATE: `UPDATE qr_codes SET used_at = now() WHERE id = $1 AND used_at IS NULL` — if affected rows = 0 → `{ ok: false, error: 'token_used' }` (concurrent race)
  6. Return `{ ok: true, qr: row }`

- `createReceptionSession(params: { propertyId: string; authUserId: string }): Promise<Tables<'sessions'>>`:
  1. Service-role INSERT into `sessions`: `{ property_id, auth_user_id, auth_level: 1, expires_at: now+24h, reception_scan_at: now(), reservation_id: null }`
  2. Return the inserted row (SELECT returning)
  3. Throw on Supabase error

#### 3. Room scan DB logic

**File**: `lib/scan/room.ts` (new)

**Intent**: Provide two functions the room route handler calls: one validates all preconditions for the step-up; the other applies the upgrade.

**Contract**: Exports:

- `validateRoomScan(params: { sessionId: string; roomId: string }): Promise<{ ok: true; session: Tables<'sessions'>; room: Tables<'rooms'>; reservation: Tables<'reservations'> } | { ok: false; error: RoomScanError }>`:
  1. Service-role SELECT `sessions` WHERE `id = sessionId`
  2. If no row → `session_not_found`; if `revoked = true` → `session_revoked`; if `expires_at <= now()` → `session_expired`; if `auth_level !== 1` → `wrong_auth_level`
  3. Service-role SELECT `qr_codes` WHERE `room_id = roomId AND type = 'room' AND is_active = true AND property_id = session.property_id` — if no row → `room_qr_not_found`
  4. Service-role SELECT `rooms` WHERE `id = roomId AND property_id = session.property_id`
  5. If `rooms.valid_from IS NULL OR rooms.valid_until IS NULL OR now() < valid_from OR now() > valid_until` → `outside_window`
  6. If `rooms.room_active_reservation_id IS NULL` → `no_active_reservation`
  7. Service-role SELECT `reservations` WHERE `id = rooms.room_active_reservation_id`
  8. Return `{ ok: true, session, room, reservation }`

- `upgradeSession(params: { sessionId: string; roomId: string; reservationId: string; checkOut: string }): Promise<void>`:
  1. Service-role UPDATE `sessions` SET `auth_level = 2, room_id = roomId, room_scan_at = now(), reservation_id = reservationId, expires_at = checkOut::timestamp + INTERVAL '2 hours'` WHERE `id = sessionId`
  2. Throw on error

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes on the new files
- `npm run lint` passes on the new files

---

## Phase 3: Route Handlers

### Overview

Two thin Next.js App Router Route Handlers. Each creates its own Supabase SSR client writing to the outgoing redirect response, calls Phase 2 library functions for DB work, performs Supabase auth operations, sets cookies, and returns the redirect.

### Changes Required

#### 1. Reception scan route handler

**File**: `app/api/scan/reception/route.ts` (new)

**Intent**: Orchestrate the full reception scan flow: consume token → sign in anonymously → create sessions row → refresh JWT → set cookies → redirect to `/`.

**Contract**: Exports `GET(request: NextRequest): Promise<NextResponse>`.

Key invariants the implementation must respect:
- `findAndConsumeToken` is called BEFORE `signInAnonymously`. Token invalidation is the point of no return; auth failure after this means the guest must get a new QR (acceptable single-use semantics).
- `createReceptionSession` is called AFTER `signInAnonymously` (needs `user.id`) but BEFORE `refreshSession` (hook must find the row).
- Supabase SSR client is created with `getAll: () => request.cookies.getAll()` and `setAll` writing to the redirect `NextResponse` object — NOT to `next/headers`.
- `__Host-session` cookie attributes: `httpOnly: true, secure: true, sameSite: 'strict', path: '/'`.
- On any error from `findAndConsumeToken` → `NextResponse.redirect('/error?type=<error>')`; on Supabase auth error → `NextResponse.redirect('/error?type=auth_failed')`.
- Append `// TODO(S5.1): posthog.capture('guest_qr_scanned', { qr_type: 'reception', property_id })` comment after successful session creation.

#### 2. Room scan route handler

**File**: `app/api/scan/room/route.ts` (new)

**Intent**: Orchestrate the room step-up: read session cookie → validate room scan eligibility → upgrade session in DB → refresh JWT → redirect to `/`.

**Contract**: Exports `GET(request: NextRequest): Promise<NextResponse>`.

Key invariants:
- Read `__Host-session` from `request.cookies.get('__Host-session')?.value`. If absent → `NextResponse.redirect('/error?type=missing_session_cookie')`.
- `upgradeSession` is called BEFORE `refreshSession` (hook must find the updated row with auth_level=2).
- Same Supabase SSR client pattern as reception handler (writes to response).
- On any `validateRoomScan` error → `NextResponse.redirect('/error?type=<error>')`.
- Append `// TODO(S5.1): posthog.capture('guest_qr_scanned', { qr_type: 'room', property_id })` comment.

#### 3. Error page stub

**File**: `app/[locale]/(guest)/error/page.tsx` (new)

**Intent**: Minimal branded page that shows the error type from query params. IT-2 needs a valid redirect target; the real UI is built in S3.4.

**Contract**: Server Component; reads `searchParams.type`; renders `<p>Error: {type}</p>` and `<p>Please contact reception.</p>`. No styling; no client-side code.

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes on all new files
- `npm run lint` passes on all new files
- `npm run build` exits 0

#### Manual Verification

- Scan a real reception QR in a browser → observe 302 to `/`, `__Host-session` cookie present in DevTools → Application → Cookies with HttpOnly + Secure + SameSite=Strict
- Scan a room QR after reception scan → cookie unchanged but DevTools shows updated JWT in Supabase `sb-...` cookie with `auth_level: 2`
- Scan the same reception QR a second time → browser lands on `/error?type=token_used`

---

## Phase 4: IT-2 Integration Tests

### Overview

Vitest integration tests that import the route handler's exported `GET` function and call it with a `NextRequest`. Tests run against the real Supabase instance with active RLS. Fixture data is seeded via service_role before the suite and cleaned up in `afterAll`.

### Changes Required

#### 1. IT-2 test file

**File**: `lib/scan/__tests__/it-2.test.ts` (new)

**Intent**: Verify the four IT-2 scenarios from the roadmap §9.2: happy path reception, replay protection, room step-up within window, room step-up outside window.

**Contract**: Test structure outline (implementer writes the actual assertion code):

```
beforeAll:
  - Insert fixture property (service_role) → capture propertyId
  - Insert fixture room (service_role) → capture roomId
  - Insert fixture reservation with check_in=yesterday, check_out=tomorrow (service_role) → capture reservationId, checkOut
  - Update room: room_active_reservation_id=reservationId, valid_from=1h ago, valid_until=tomorrow
  - Insert reception qr_codes row: property_id, type='reception', init_token=UUID, expires_at=+15min, is_active=true
  - Insert room qr_codes row: property_id, type='room', room_id, is_active=true

afterAll:
  - Delete all fixture rows (sessions, qr_codes, rooms, reservations, properties) in FK-safe order

Test 1 — "happy path: valid reception scan":
  - Call GET(new NextRequest('/api/scan/reception?init_token=<fixtureToken>'))
  - Assert: response.status === 302
  - Assert: response.headers.get('location') === '/'  (or host-prefixed /)
  - Assert: set-cookie header contains '__Host-session=' + correct attrs (HttpOnly, SameSite=Strict, Path=/)
  - DB: SELECT sessions WHERE property_id = propertyId → row exists with auth_level=1
  - DB: SELECT qr_codes WHERE init_token = fixtureToken → used_at IS NOT NULL

Test 2 — "replay: same token used twice":
  - (Test 1 has already consumed the token)
  - Call GET(new NextRequest('/api/scan/reception?init_token=<same fixtureToken>'))
  - Assert: response.status === 302
  - Assert: response.headers.get('location') contains '/error?type=token_used'

Test 3 — "room step-up within valid window":
  - Extract sessionId from Test 1's set-cookie header
  - Set room valid_from/valid_until to cover now()
  - Call GET(new NextRequest('/api/scan/room?room_id=<roomId>')) with __Host-session=sessionId cookie
  - Assert: response.status === 302, location === '/'
  - DB: SELECT sessions WHERE id = sessionId → auth_level=2, room_id populated, reservation_id populated

Test 4 — "room step-up outside valid window":
  - Create a fresh reception session (separate signIn, not using consumed token)
    OR directly insert a sessions row via service_role with auth_level=1
  - Update room: valid_from=yesterday, valid_until=1h ago (window has passed)
  - Call GET with the fresh session cookie
  - Assert: response.status === 302, location contains '/error?type=outside_window'
```

One test file import of `next/headers` will be needed if `createServerClient` from server.ts is called indirectly. Mock it at the top of the test file with `vi.mock('next/headers', () => ({ cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })) }))` — only needed if any import path reaches server.ts; the route handlers create their own clients and should not trigger this.

### Success Criteria

#### Automated Verification

- `npm run test -- lib/scan/__tests__/it-2.test.ts` exits 0 with all 4 test cases passing
- `npm run typecheck` passes on the test file
- `npm run lint` passes on the test file

#### Manual Verification

- IT-2 output shows "4 passed" with no skipped tests
- Confirm test runs against real Supabase (not mocked): `SUPABASE_SERVICE_ROLE_KEY` must be set in `.env.local`

**Implementation Note**: After all four IT-2 tests pass and the manual cookie/redirect behaviour is confirmed in a browser (Phase 3 manual verification), pause for confirmation before merging. Commit should be `feat(s1-2): route handlers + token exchange + IT-2`.

---

## Testing Strategy

### Unit Tests

None added in S1.2. The library functions are fully covered by IT-2 integration tests.

### Integration Tests

IT-2 (Phase 4): four scenarios against real Supabase covering the full scan → session → cookie chain.

### Manual Testing Steps

1. `npx supabase db push` — migration 005 applies cleanly
2. `npm run dev`
3. Generate a reception QR via psql or Supabase SQL editor: `INSERT INTO qr_codes(property_id, type, is_active) VALUES('<id>', 'reception', true) RETURNING init_token`
4. Open `http://localhost:3000/api/scan/reception?init_token=<token>` — should redirect to `/`; inspect DevTools cookies
5. Reload the same URL — should redirect to `/error?type=token_used`
6. Scan room QR URL with valid session cookie, within `valid_from/valid_until` window — should redirect to `/`; JWT `app_metadata.auth_level` should be 2

## Performance Considerations

Reception scan: 4 DB round-trips (SELECT qr_codes, UPDATE qr_codes, INSERT sessions, SELECT sessions) + 2 Supabase auth calls (signInAnonymously, refreshSession). Target <500ms total server-side (network latency to Supabase EU is the dominating factor).

Room scan: 4 DB round-trips (SELECT sessions, SELECT qr_codes, SELECT rooms, SELECT reservations) + 1 UPDATE + 1 refreshSession. Similar budget.

## Migration Notes

Migration 005 is additive (DROP NOT NULL on an existing column). No data is changed. Safe to apply in any environment. Idempotent re-apply is safe (postgres will warn but not error if constraint is already absent).

After applying the migration, **regenerate database types**: `npx supabase gen types typescript --local > lib/supabase/database.types.ts`. The `sessions.Insert.reservation_id` type must become `string | null` (currently `string`).

## References

- Session scope: `context/foundation/session-plan.md §S1.2`
- IT-2 definition: `context/foundation/implementation_roadmap.md §9.2`
- Token validity contract: `context/changes/s1-1/plan.md §Critical Implementation Details`
- Custom Access Token Hook: `context/changes/s0-3/plan.md §Phase 1`; `supabase/migrations/20260626000004_auth_hook.sql`
- Supabase SSR client cookie wiring: `proxy.ts`
- Schema types: `lib/supabase/database.types.ts`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Migration — sessions.reservation_id nullable

#### Automated

- [x] 1.1 `npx supabase db push` exits 0 for migration 005 — fdfb556
- [x] 1.2 `npm run typecheck` passes after regenerating database.types.ts — fdfb556

#### Manual

- [x] 1.3 `\d sessions` in psql shows `reservation_id uuid` without `not null` — fdfb556

### Phase 2: Scan Library

#### Automated

- [x] 2.1 `npm run typecheck` passes on lib/scan/ files — 27cbd9e
- [x] 2.2 `npm run lint` passes on lib/scan/ files — 27cbd9e

### Phase 3: Route Handlers

#### Automated

- [x] 3.1 `npm run typecheck` passes on new route handler files — 591ee2e
- [x] 3.2 `npm run lint` passes on new route handler files — 591ee2e
- [x] 3.3 `npm run build` exits 0 — 591ee2e

#### Manual

- [x] 3.4 Reception scan redirects to `/`; `__Host-session` cookie present with correct attributes in DevTools — 591ee2e
- [x] 3.5 Replay of same token redirects to `/error?type=token_used` — 591ee2e
- [x] 3.6 Room scan redirects to `/`; JWT `app_metadata.auth_level === 2` — 591ee2e

### Phase 4: IT-2 Integration Tests

#### Automated

- [x] 4.1 `npm run test -- lib/scan/__tests__/it-2.test.ts` exits 0 — 4 tests pass

#### Manual

- [x] 4.2 Test output shows "4 passed", no skipped — confirmed running against real Supabase

