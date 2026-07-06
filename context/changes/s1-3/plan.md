# S1.3 — Rate Limiting, Anomaly Detection, and Early Check-Out Implementation Plan

## Overview

Three security subsystems bolted onto the S1.2 scan foundation: (1) Upstash Redis rate limiting on both scan endpoints, (2) per-session ASN/country anomaly detection that auto-revokes compromised sessions, and (3) an atomic early-checkout transaction that revokes all guest access in a single RPC call. A middleware revocation check makes revoked sessions immediately return 401 across all routes.

## Current State Analysis

S1.2 is fully complete and all its progress items are checked. The two scan route handlers (`app/api/scan/reception/route.ts`, `app/api/scan/room/route.ts`) exist and pass IT-2. The sessions table already has `last_asn INTEGER` and `device_fingerprint TEXT` columns (schema migration 001), but they are never populated. `@upstash/redis` is NOT installed; only `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are declared in `.env.example`. The proxy.ts middleware injects `x-property-id`/`x-session-id` headers but does NOT check `sessions.revoked` — revoked sessions currently get headers injected and proceed normally. No `lib/rate-limit/`, `lib/geo/`, `lib/anomaly/`, or `lib/checkout/` modules exist.

## Desired End State

- `GET /api/scan/reception?init_token=…` and `GET /api/scan/room?room_id=…` both enforce Upstash rate limiting: 5 requests/15 min/IP → HTTP 429.
- Every scan resolves the client IP to ASN + country via `resolveIpInfo()` (ip-api.com, Redis-cached). The ASN is stored in `sessions.last_asn`. A Redis SET tracks distinct ASNs per session in a 30-min sliding window; `COUNT(DISTINCT asn) > 2` → `sessions.revoked = true` + `audit_logs` entry. A country change from the first scan → same revocation + audit.
- After any session revocation, the next HTTP request carrying that `__Host-session` cookie → 401 (API) or redirect to error page (page route). This happens in `proxy.ts` via a single service-role DB check.
- `POST /api/panel/reservations/[id]/checkout` calls `process_early_checkout(reservation_id)` Supabase RPC, which in one atomic transaction: sets `reservations.status = 'checked_out'`, revokes all matching sessions, closes `rooms.valid_until`, deactivates room QR codes, and inserts an `audit_logs` entry. After the call: `__Host-session` → 401; room QR scan → `session_revoked` error.
- IT-4 passes: 4 scenarios covering the happy path, 401 enforcement, QR denial, and rollback on invalid input.

### Key Discoveries

- `sessions.last_asn INTEGER` and `sessions.revoked BOOLEAN` already exist (`supabase/migrations/20260626000001_initial_schema.sql:119,121`). No migration needed for these columns.
- `validateRoomScan` already returns `{ ok: false, error: 'session_revoked' }` when `session.revoked === true` (`lib/scan/room.ts:21`) — room scan denial works without changes once revocation is written.
- `reservations.room_id UUID REFERENCES rooms(id)` is the FK to use when finding the room for an early-checkout transaction (`supabase/migrations/20260626000001_initial_schema.sql:79`).
- `audit_logs` is service_role–only, no RLS, append-only (`supabase/migrations/20260626000001_initial_schema.sql:173-182`). The RPC function must run with elevated privileges to INSERT there.
- Client IP on Railway: extract from `x-forwarded-for` header (first/leftmost entry). Private IPs (`127.0.0.1`, `::1`) → `resolveIpInfo` returns `{ asn: null, country: null }` and skips anomaly tracking.

## What We're NOT Doing

- Device fingerprint tracking (`sessions.device_fingerprint`) — schema column exists but remains NULL; out of scope for S1.3.
- CAPTCHA after 3 failed attempts — roadmap mentions this but it requires a UI integration deferred to S3.4.
- Middleware-level anomaly detection on every request — anomaly detection fires at scan time only; per-request tracking is out of scope.
- Anomaly detection tests (unit/integration) beyond what IT-4 exercises — anomaly is implicitly tested via the room scan path in IT-4.
- RBAC on the checkout route handler — `app/api/panel/reservations/[id]/checkout/route.ts` is created unauthenticated; RBAC and auth middleware are added in S2.1.
- Adding `revoked_at`/`revoked_reason` columns to sessions — `audit_logs` captures the why and when; sessions schema stays as-is.

## Implementation Approach

Four sequential phases. Phase 1 (rate limiting) is self-contained and unlocks the shared Redis client that Phases 2 and 4 depend on. Phase 2 (anomaly detection) extends both route handlers with GeoIP lookups and Redis SET tracking. Phase 3 (middleware revocation) is independent but must land before Phase 4 so that IT-4's "cookie → 401" assertion works against a real proxy. Phase 4 (early checkout + IT-4) closes the session with a DB-level atomic transaction.

## Critical Implementation Details

**IP extraction in route handlers:** Both scan route handlers run in Node.js (no Edge runtime). Extract client IP with `request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? null`. On localhost this returns `::1` / `127.0.0.1`; `resolveIpInfo` returns `{ asn: null, country: null }` for private ranges and anomaly detection is a no-op.

**Upstash Redis client:** `@upstash/ratelimit` uses `@upstash/redis` internally. The rate limiter should be a module-level singleton (constructed once at module load, not per-request) so the underlying HTTP connection pool is reused. Instantiate with `new Redis({ url, token })` from env vars; fail fast on missing config at startup.

**Supabase RPC function vs PROCEDURE:** `process_early_checkout` must be a `FUNCTION ... RETURNS void LANGUAGE plpgsql SECURITY DEFINER`, not a `PROCEDURE`. Supabase `.rpc()` only calls functions; the implicit transaction from `SECURITY DEFINER` ensures all statements commit or roll back together. SECURITY DEFINER is required so the function can INSERT into `audit_logs` (service_role-only table) even when called from a non-service-role context (the panel route handler will eventually use a user-scoped client after S2.1 RBAC is added).

**Proxy.ts service-role query placement:** The session revocation check must execute BEFORE `supabase.auth.getUser()` would update any cookies — place it as the first async operation in the middleware, before the Supabase SSR client is constructed. If the session is revoked, return immediately without calling `getUser()` to avoid unnecessary token refresh.

---

## Phase 1: Upstash Redis + Rate Limiting

### Overview

Install the Upstash packages, create a shared Redis client singleton and a scan-specific rate limiter, then wire a 5-req/15min/IP check into both scan route handlers as the very first guard.

### Changes Required

#### 1. Install dependencies

**File**: `package.json`

**Intent**: Add Upstash client libraries. The env vars already exist in `.env.example`.

**Contract**: Add `"@upstash/redis": "^1"` and `"@upstash/ratelimit": "^2"` to `dependencies`.

#### 2. Upstash Redis client singleton

**File**: `lib/rate-limit/client.ts` (new)

**Intent**: Create a module-level Redis client reused across rate limiter, GeoIP cache, and anomaly detection. Fail fast if env vars are absent.

**Contract**: Exports `redis: Redis` (from `@upstash/redis`), constructed from `process.env.UPSTASH_REDIS_REST_URL` and `process.env.UPSTASH_REDIS_REST_TOKEN`. Throw a descriptive error at module load time if either is missing.

#### 3. Scan rate limiter

**File**: `lib/rate-limit/scan.ts` (new)

**Intent**: Encapsulate the sliding window rate limiter for `/api/scan/*` so both route handlers share the same limit configuration without duplication.

**Contract**: Exports `checkScanRateLimit(ip: string): Promise<{ allowed: boolean; remaining: number; retryAfter: number }>`. Uses `new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, '15 m') })` from `@upstash/ratelimit`. Key prefix: `rl:scan:{ip}`. Returns the Upstash result shaped into the three fields.

#### 4. Wire rate limiting into reception route handler

**File**: `app/api/scan/reception/route.ts` (modify)

**Intent**: Reject scan attempts that exceed 5 requests per 15 minutes from the same IP before any token validation or DB work.

**Contract**: At the top of `GET`, extract IP from `x-forwarded-for` header (first entry, fallback `'unknown'`). Call `checkScanRateLimit(ip)`. If `!allowed` → return `new NextResponse(null, { status: 429, headers: { 'Retry-After': String(retryAfter), 'X-RateLimit-Remaining': '0' } })`.

#### 5. Wire rate limiting into room route handler

**File**: `app/api/scan/room/route.ts` (modify)

**Intent**: Same 5-req/15min/IP guard on the room scan endpoint (same shared limiter, different path but same `/api/scan/*` namespace).

**Contract**: Same IP extraction and `checkScanRateLimit` call pattern as the reception handler. 429 response on limit exceeded.

### Success Criteria

#### Automated Verification

- `npm install` exits 0 (packages resolve)
- `npm run typecheck` passes on all files in `lib/rate-limit/` and the modified route handlers
- `npm run lint` passes on all modified files
- `npm run build` exits 0

#### Manual Verification

- With real Upstash credentials in `.env.local`: make 6 rapid requests to `/api/scan/reception?init_token=anything` → first 5 get 302 or scan-error redirects, 6th gets 429 with `Retry-After` header
- Confirm `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are non-empty in `.env.local` before testing

**Implementation Note**: After automated verification passes and the 429 behaviour is confirmed manually, pause for confirmation before proceeding to Phase 2.

---

## Phase 2: GeoIP + Anomaly Detection

### Overview

Add a `resolveIpInfo` abstraction backed by ip-api.com with Redis caching, then implement per-session ASN tracking and country-change detection. Both scan route handlers call anomaly detection after a successful scan; revoked sessions are immediately inert (Phase 3 enforces the 401; `validateRoomScan` already enforces `session_revoked` at the DB level).

### Changes Required

#### 1. GeoIP abstraction

**File**: `lib/geo/ip-info.ts` (new)

**Intent**: Provide a single `resolveIpInfo(ip)` function behind an interface so the underlying provider (ip-api.com today, MaxMind later) can be swapped without touching anomaly detection logic.

**Contract**: Exports type `IpInfo = { asn: number | null; country: string | null }` and `async function resolveIpInfo(ip: string): Promise<IpInfo>`.

Implementation rules:
- Private/loopback IPs (`127.0.0.1`, `::1`, `10.*`, `192.168.*`, `172.16-31.*`) → return `{ asn: null, country: null }` immediately (no API call).
- Cache key: `geo:{ip}` in Upstash Redis, TTL 3600 s. Check cache first; return cached value on hit.
- On miss: `GET http://ip-api.com/json/{ip}?fields=countryCode,as` (plain HTTP — ip-api.com requires HTTP for the free tier). Parse: `{ countryCode: string, as: string }` where `as` is e.g. `"AS15169 Google LLC"` → extract the numeric portion as `asn`. On API error or timeout (3 s) → return `{ asn: null, country: null }` (non-fatal).
- Write successful result to Redis cache before returning.

#### 2. Anomaly detection module

**File**: `lib/anomaly/detect.ts` (new)

**Intent**: Track distinct ASNs seen per session in a 30-minute Redis window and detect country jumps; take the appropriate action (audit log + session revocation) when thresholds are crossed.

**Contract**: Exports `async function trackAndDetectAnomaly(params: { sessionId: string; propertyId: string; asn: number | null; country: string | null }): Promise<void>`.

Implementation rules:
- If both `asn` and `country` are null (private IP), return immediately — no-op.
- Redis key for ASN set: `anomaly:{sessionId}:asns`, type SET; `SADD` the ASN (as string); `EXPIRE` 1800 s after each add.
- Redis key for country: `anomaly:{sessionId}:country`, type STRING; get existing value on first call and SET if absent (SETNX + EXPIRE 1800 s).
- After the SADD, `SCARD anomaly:{sessionId}:asns` to get distinct ASN count.
- **ASN anomaly**: if `SCARD > 2` → call `revokeSession(sessionId, propertyId, 'anomaly_asn')`.
- **Country jump**: if stored country is set AND differs from current `country` → call `revokeSession(sessionId, propertyId, 'anomaly_country_jump')`.
- `revokeSession(sessionId, propertyId, reason)` (local helper, not exported): service-role UPDATE `sessions SET revoked = true WHERE id = sessionId AND revoked = false`; then service-role INSERT into `audit_logs (property_id, event_type, target_id, metadata)` with `event_type = 'anomaly_revoke'` and `metadata = { reason, session_id: sessionId }`.

#### 3. Wire anomaly detection into reception route handler

**File**: `app/api/scan/reception/route.ts` (modify)

**Intent**: After the session row is created and the JWT is refreshed, resolve the client IP info and run anomaly detection. Also update `sessions.last_asn` with the resolved ASN.

**Contract**: After `createReceptionSession(...)`:
1. Resolve `ipInfo = await resolveIpInfo(clientIp)`.
2. If `ipInfo.asn !== null`: service-role UPDATE `sessions SET last_asn = ipInfo.asn WHERE id = session.id`.
3. Call `trackAndDetectAnomaly({ sessionId: session.id, propertyId: qr.property_id, asn: ipInfo.asn, country: ipInfo.country })`.

The anomaly detection result is fire-and-forget for the scan response (the revocation takes effect on the next request via the middleware). Do NOT await-then-redirect-to-error — the guest completes the scan regardless; the session is marked revoked in DB and the middleware enforces 401 on the next request.

#### 4. Wire anomaly detection into room route handler

**File**: `app/api/scan/room/route.ts` (modify)

**Intent**: Same pattern as reception: after `upgradeSession`, resolve IP info, update `last_asn`, call `trackAndDetectAnomaly` with the now-known `session.property_id`.

**Contract**: After `upgradeSession(...)`:
1. Resolve `ipInfo = await resolveIpInfo(clientIp)`.
2. If `ipInfo.asn !== null`: service-role UPDATE `sessions SET last_asn = ipInfo.asn WHERE id = sessionId`.
3. Call `trackAndDetectAnomaly({ sessionId, propertyId: validation.session.property_id, asn: ipInfo.asn, country: ipInfo.country })`.

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes on `lib/geo/`, `lib/anomaly/`, and modified route handlers
- `npm run lint` passes on all new/modified files
- `npm run build` exits 0

#### Manual Verification

- With a real IP (non-localhost environment or ngrok tunnel), reception scan resolves and stores `last_asn` in the sessions row visible in Supabase Studio
- Confirm ip-api.com response is cached in Upstash Redis (key `geo:{ip}` visible in Upstash dashboard)
- Simulate country jump: manually UPDATE a session's Redis country key to a different value and scan again → `audit_logs` gets a new `anomaly_revoke` entry; `sessions.revoked` is `true`

**Implementation Note**: The GeoIP call is non-fatal — if ip-api.com is down, scans still succeed. Confirm this behaviour in logs before proceeding to Phase 3.

---

## Phase 3: Middleware Session Revocation Check

### Overview

`proxy.ts` currently has no knowledge of session revocation. This phase adds a fast service-role DB lookup when `__Host-session` cookie is present. Revoked or expired sessions get a 401 (API) or error-page redirect (pages) before any JWT refresh or header injection.

### Changes Required

#### 1. Session revocation guard in proxy.ts

**File**: `proxy.ts` (modify)

**Intent**: Make revoked sessions immediately inert across all routes. This is the enforcement point that makes early checkout and anomaly revocation actually cut off guest access.

**Contract**:

Add `import { createServiceRoleClient } from '@/lib/supabase/service-role'` at the top.

At the very beginning of `proxy(request: NextRequest)`, before the Supabase SSR client construction:

```typescript
const sessionId = request.cookies.get('__Host-session')?.value
if (sessionId) {
  const admin = createServiceRoleClient()
  const { data: session } = await admin
    .from('sessions')
    .select('id, revoked, expires_at')
    .eq('id', sessionId)
    .single()

  const invalid = !session || session.revoked || new Date(session.expires_at) <= new Date()
  if (invalid) {
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return new NextResponse(null, { status: 401 })
    }
    const response = NextResponse.redirect(new URL('/error?type=session_revoked', request.url))
    response.cookies.delete('__Host-session')
    return response
  }
}
```

The single service-role SELECT on `sessions(id)` (indexed PK) adds ~1–3 ms per request where `__Host-session` is present. Requests without the cookie (unauthenticated routes, static assets — already excluded by matcher) are unaffected.

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes on `proxy.ts`
- `npm run lint` passes
- `npm run build` exits 0
- Existing IT-2 test suite still passes: `npm run test -- lib/scan/__tests__/it-2.test.ts` (IT-2 does not carry a `__Host-session` cookie on the route-handler calls, so the guard is a no-op in those tests)

#### Manual Verification

- Manually set `sessions.revoked = true` for an active session in Supabase Studio → next browser request to any page with that cookie → redirect to `/error?type=session_revoked` and cookie cleared from DevTools
- Same with `sessions.expires_at` set to the past → same behaviour

**Implementation Note**: Verify IT-2 still passes (guard must not break non-revoked session paths) before proceeding to Phase 4.

---

## Phase 4: Early Checkout + IT-4

### Overview

One Supabase RPC function wraps the five-table atomic transaction. A thin library function calls it. A panel route handler exposes it over HTTP (unauthenticated for now; RBAC added in S2.1). IT-4 verifies all observable post-checkout invariants.

### Changes Required

#### 1. Migration 006 — process_early_checkout RPC

**File**: `supabase/migrations/20260626000006_early_checkout_fn.sql` (new)

**Intent**: Single plpgsql function that atomically marks a reservation checked out, revokes all its sessions, closes the room availability window, deactivates room QR codes, and records an audit event. SECURITY DEFINER so it can INSERT into `audit_logs` regardless of the caller's role.

**Contract**:

```sql
CREATE OR REPLACE FUNCTION process_early_checkout(p_reservation_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_property_id UUID;
  v_room_id     UUID;
BEGIN
  SELECT property_id, room_id
    INTO v_property_id, v_room_id
    FROM reservations
   WHERE id = p_reservation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reservation_not_found: %', p_reservation_id;
  END IF;

  -- 1. Mark reservation checked out
  UPDATE reservations SET status = 'checked_out' WHERE id = p_reservation_id;

  -- 2. Revoke all sessions tied to this reservation
  UPDATE sessions SET revoked = true
   WHERE reservation_id = p_reservation_id AND revoked = false;

  -- 3. Close the room availability window
  IF v_room_id IS NOT NULL THEN
    UPDATE rooms SET valid_until = now()
     WHERE id = v_room_id AND room_active_reservation_id = p_reservation_id;

    -- 4. Deactivate room QR codes
    UPDATE qr_codes SET is_active = false
     WHERE room_id = v_room_id AND type = 'room';
  END IF;

  -- 5. Audit trail (service_role–only table; SECURITY DEFINER gives access)
  INSERT INTO audit_logs (property_id, event_type, target_id, metadata)
  VALUES (
    v_property_id,
    'early_checkout',
    p_reservation_id,
    jsonb_build_object('reservation_id', p_reservation_id, 'room_id', v_room_id)
  );
END;
$$;
```

SECURITY DEFINER + `SET search_path = public` is the recommended pattern for Supabase RPC functions that need elevated table access.

#### 2. Early checkout library function

**File**: `lib/checkout/early-checkout.ts` (new)

**Intent**: Thin wrapper that calls the RPC via service_role client and surfaces the error clearly. This is the function IT-4 and the route handler both call.

**Contract**: Exports `async function processEarlyCheckout(reservationId: string): Promise<void>`. Calls `createServiceRoleClient().rpc('process_early_checkout', { p_reservation_id: reservationId })`. If `error` is non-null → throw `new Error(error.message)`.

#### 3. Panel checkout route handler

**File**: `app/api/panel/reservations/[id]/checkout/route.ts` (new)

**Intent**: HTTP surface for the early checkout operation. Unauthenticated for now — RBAC guard (owner/admin/staff only) is added in S2.1.

**Contract**: Exports `POST(request: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse>`. Calls `processEarlyCheckout(params.id)`. On success → `NextResponse.json({ ok: true }, { status: 200 })`. On error whose message starts with `reservation_not_found` → 404 JSON. On any other error → 500 JSON.

Append comment: `// TODO(S2.1): add RBAC guard — only owner/admin/staff may trigger early checkout`.

#### 4. IT-4 integration tests

**File**: `lib/checkout/__tests__/it-4.test.ts` (new)

**Intent**: Verify all four post-checkout invariants from `implementation_roadmap.md §9.2 IT-4`: atomic transaction, 401 enforcement, QR denial, and rollback on bad input.

**Contract**: Test structure outline:

```
beforeAll:
  - Insert fixture property (service_role) → propertyId
  - Insert fixture room (service_role) → roomId
  - Insert fixture reservation: check_in=yesterday, check_out=tomorrow, status='checked_in', room_id=roomId → reservationId
  - Update room: room_active_reservation_id=reservationId, valid_from=2h ago, valid_until=tomorrow
  - Insert room qr_codes row: property_id, type='room', room_id=roomId, is_active=true → qrId
  - signInAnonymously via Supabase client → authUserId
  - Insert sessions row: property_id=propertyId, auth_user_id=authUserId, auth_level=2,
      reservation_id=reservationId, room_id=roomId, expires_at=tomorrow, revoked=false → sessionId

afterAll:
  - Delete fixture rows in FK-safe order: sessions, qr_codes, audit_logs (WHERE target_id=reservationId), rooms, reservations, properties

Test 1 — "processEarlyCheckout: all five DB changes committed atomically":
  - Call processEarlyCheckout(reservationId) → expect no throw
  - DB: SELECT reservations WHERE id=reservationId → status === 'checked_out'
  - DB: SELECT sessions WHERE id=sessionId → revoked === true
  - DB: SELECT rooms WHERE id=roomId → valid_until <= now()
  - DB: SELECT qr_codes WHERE id=qrId → is_active === false
  - DB: SELECT audit_logs WHERE target_id=reservationId → at least 1 row with event_type='early_checkout'

Test 2 — "revoked session → 401 from proxy":
  - Import proxy from '@/../proxy'
  - const req = new NextRequest('http://localhost:3000/api/scan/reception', { headers: { Cookie: `__Host-session=${sessionId}` } })
  - const res = await proxy(req)
  - expect(res.status).toBe(401)

Test 3 — "room QR scan with revoked session → session_revoked error":
  - Import GET from '@/app/api/scan/room/route'
  - Create NextRequest('/api/scan/room?room_id=<roomId>') with Cookie: `__Host-session=${sessionId}`
  - const res = await GET(request)
  - expect(res.status).toBe(302)
  - expect(res.headers.get('location')).toContain('session_revoked')

Test 4 — "processEarlyCheckout: throws on non-existent reservation; no audit_log entry":
  - const fakeId = '00000000-0000-0000-0000-000000000001'
  - await expect(processEarlyCheckout(fakeId)).rejects.toThrow('reservation_not_found')
  - DB: SELECT audit_logs WHERE target_id=fakeId → 0 rows (rollback confirmed)
```

### Success Criteria

#### Automated Verification

- `npx supabase db push` exits 0 for migration 006
- `npm run typecheck` passes on `lib/checkout/`, `app/api/panel/reservations/[id]/checkout/`, and the test file
- `npm run lint` passes on all new files
- `npm run build` exits 0
- `npm run test -- lib/checkout/__tests__/it-4.test.ts` exits 0 — all 4 tests pass

#### Manual Verification

- Call `POST /api/panel/reservations/<reservationId>/checkout` via `curl` or Postman → 200 `{"ok":true}`; confirm all 5 DB changes in Supabase Studio
- With the browser carrying the revoked `__Host-session` cookie, navigate to any page → redirected to `/error?type=session_revoked`; cookie cleared from DevTools
- Room QR URL: `GET /api/scan/room?room_id=<roomId>` with the revoked session cookie → redirects to `/error?type=session_revoked`
- Call `POST /api/panel/reservations/00000000-0000-0000-0000-000000000001/checkout` → 404 response

**Implementation Note**: After all 4 IT-4 tests pass and manual checkout behaviour is confirmed, pause for confirmation before merging. Commit: `feat(s1-3): rate limiting + anomaly detection + early checkout + IT-4`.

---

## Testing Strategy

### Unit Tests

None added in S1.3. All logic is tested via IT-4 integration tests and manual verification of rate limiting and anomaly detection.

### Integration Tests

IT-4 (Phase 4): four scenarios against real Supabase with active RLS. Covers the full early-checkout transaction chain and the downstream 401/session-revoked enforcement.

### Manual Testing Steps

1. `npm install` — verify @upstash/ratelimit and @upstash/redis appear in node_modules
2. Populate `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in `.env.local`
3. `npx supabase db push` — migration 006 applies cleanly
4. `npm run dev`
5. Rate limiting: make 6 rapid reception scan requests → 6th returns 429 with `Retry-After`
6. GeoIP (requires real IP — use ngrok or staging): reception scan → check Supabase Studio sessions row `last_asn` is populated; check Upstash dashboard for `geo:{ip}` key
7. Anomaly revocation: manually UPDATE Redis `anomaly:{sessionId}:country` to `XX`, then scan → `audit_logs` entry with `anomaly_revoke`, `sessions.revoked = true`
8. Middleware 401: set `sessions.revoked = true` in Supabase Studio → next page load with that cookie → `/error?type=session_revoked`
9. Early checkout: `curl -X POST http://localhost:3000/api/panel/reservations/<id>/checkout` → 200; all 5 DB changes visible in Studio

## Performance Considerations

**Middleware DB query**: 1 service-role SELECT per request where `__Host-session` cookie is present. Expected latency ~1–3 ms (Railway → Supabase EU, indexed PK lookup). This is the accepted cost of opaque session UUIDs (documented in `context/research/session_06/security-qr-sessions.md §1`).

**GeoIP resolution**: ip-api.com call is max 3 s with timeout; Redis cache (TTL 1h) means repeat IPs cost ~1 ms. For the reception scan path, the GeoIP call happens after the redirect response is prepared — consider calling `resolveIpInfo` in a non-blocking manner if latency becomes a concern post-MVP.

## Migration Notes

Migration 006 is additive — it creates a new function, touches no existing columns or rows. Safe to apply to any environment. Idempotent re-apply works (CREATE OR REPLACE). After applying: `npx supabase gen types typescript --local > lib/supabase/database.types.ts` — the generated types will include the new RPC signature.

## References

- Session scope: `context/foundation/session-plan.md §S1.3`
- IT-4 definition: `context/foundation/implementation_roadmap.md §9.2`
- Security design: `context/research/session_06/security-qr-sessions.md`
- Anomaly decisions D4, D5: `context/foundation/implementation_roadmap.md §3.4`
- Prior scan implementation: `context/changes/s1-2/plan.md`
- Supabase service-role client: `lib/supabase/service-role.ts`
- Existing scan library: `lib/scan/reception.ts`, `lib/scan/room.ts`, `lib/scan/errors.ts`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Upstash Redis + Rate Limiting

#### Automated

- [x] 1.1 `npm install` exits 0 — @upstash/ratelimit and @upstash/redis in node_modules
- [x] 1.2 `npm run typecheck` passes on lib/rate-limit/ and modified route handlers
- [x] 1.3 `npm run lint` passes on all modified files
- [x] 1.4 `npm run build` exits 0

#### Manual

- [x] 1.5 6th rapid request to /api/scan/reception returns 429 with Retry-After header

### Phase 2: GeoIP + Anomaly Detection

#### Automated

- [ ] 2.1 `npm run typecheck` passes on lib/geo/, lib/anomaly/, and modified route handlers
- [ ] 2.2 `npm run lint` passes on all new/modified files
- [ ] 2.3 `npm run build` exits 0

#### Manual

- [ ] 2.4 Reception scan populates sessions.last_asn (visible in Supabase Studio)
- [ ] 2.5 ip-api.com result cached as geo:{ip} key in Upstash dashboard
- [ ] 2.6 Simulated country jump produces audit_logs entry and sessions.revoked=true

### Phase 3: Middleware Session Revocation Check

#### Automated

- [ ] 3.1 `npm run typecheck` passes on proxy.ts
- [ ] 3.2 `npm run lint` passes
- [ ] 3.3 `npm run build` exits 0
- [ ] 3.4 IT-2 still passes: `npm run test -- lib/scan/__tests__/it-2.test.ts` — 4 tests pass

#### Manual

- [ ] 3.5 Manually revoked session → next page load redirects to /error?type=session_revoked and clears cookie
- [ ] 3.6 Expired session (expires_at in the past) → same 401/redirect behaviour

### Phase 4: Early Checkout + IT-4

#### Automated

- [ ] 4.1 `npx supabase db push` exits 0 for migration 006
- [ ] 4.2 `npm run typecheck` passes on lib/checkout/, app/api/panel/, and test file
- [ ] 4.3 `npm run lint` passes on all new files
- [ ] 4.4 `npm run build` exits 0
- [ ] 4.5 `npm run test -- lib/checkout/__tests__/it-4.test.ts` exits 0 — 4 tests pass

#### Manual

- [ ] 4.6 POST /api/panel/reservations/<id>/checkout → 200 {"ok":true}; all 5 DB changes visible in Studio
- [ ] 4.7 Browser with revoked session cookie → /error?type=session_revoked; cookie cleared
- [ ] 4.8 Room QR scan with revoked session → /error?type=session_revoked redirect
- [ ] 4.9 POST with non-existent reservation ID → 404 response
