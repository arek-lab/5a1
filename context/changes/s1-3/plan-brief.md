# S1.3 — Rate Limiting, Anomaly Detection, Early Check-Out — Plan Brief

> Full plan: `context/changes/s1-3/plan.md`

## What & Why

S1.3 hardens the QR scan flow built in S1.2 with three security layers: rate limiting (prevents brute-force token enumeration), anomaly detection (catches session hijacking via ASN/country-change signals), and early checkout (instantly revokes all guest access when the hotel initiates a departure). These are MUST items from the implementation roadmap (§8.1 Faza 1) and are required before any guest-facing session infrastructure can be considered production-ready.

## Starting Point

S1.2 is fully done: both scan route handlers exist and IT-2 passes. The sessions table has `last_asn` and `revoked` columns ready to use. Upstash Redis env vars are defined in `.env.example` but the npm packages are not installed and no Redis code exists. The proxy.ts middleware injects tenant headers but has no concept of session revocation — a revoked session currently proceeds normally.

## Desired End State

A guest who triggers early checkout (or whose session is flagged by anomaly detection) is immediately cut off: the next HTTP request with their `__Host-session` cookie returns 401. Scan endpoints enforce 5-req/15min/IP via Upstash sliding window. Sessions seen from more than 2 distinct ASNs in 30 minutes, or from a different country than the first scan, are auto-revoked with an `audit_logs` entry. IT-4 passes with 4 scenarios.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
|---|---|---|
| GeoIP provider | ip-api.com (HTTP, Redis-cached 1h) behind `resolveIpInfo()` interface | Zero files to bundle; interface makes MaxMind swap a 1-file change if rate limits become a problem |
| Rate limit scope | Both `/api/scan/reception` and `/api/scan/room` | Roadmap specifies `/api/scan/*`; shared `lib/rate-limit/scan.ts` avoids duplication |
| Anomaly action | Full spec: audit_log + `sessions.revoked=true` for both ASN>2 and country jump | Matches roadmap D4 exactly; revocation is cheap and reversible by hotel staff |
| Early checkout API | Library function + panel route handler now (unauthenticated; RBAC in S2.1) | End-to-end testable sooner; RBAC is a one-line guard added in S2.1 without touching the logic |
| Middleware revocation | Service-role DB check in `proxy.ts` on `__Host-session` cookie presence | Single enforcement point; makes IT-4's "cookie → 401" assertion work cleanly; ~1–3 ms per guarded request |
| IT-4 location | `lib/checkout/__tests__/it-4.test.ts` | Follows the pattern of IT-2 living under the module it tests |

## Scope

**In scope:**
- `@upstash/ratelimit` + `@upstash/redis` install and wiring
- `lib/rate-limit/client.ts` and `lib/rate-limit/scan.ts`
- `lib/geo/ip-info.ts` (resolveIpInfo with Redis cache)
- `lib/anomaly/detect.ts` (Redis SET for ASN tracking, country detection, revoke action)
- Updates to both scan route handlers: rate limit + GeoIP + anomaly + `sessions.last_asn` update
- `proxy.ts` session revocation guard
- Migration 006: `process_early_checkout` RPC function
- `lib/checkout/early-checkout.ts`
- `app/api/panel/reservations/[id]/checkout/route.ts` (unauthenticated POST)
- `lib/checkout/__tests__/it-4.test.ts` — IT-4 (4 scenarios)

**Out of scope:**
- Device fingerprint tracking (`sessions.device_fingerprint` stays NULL)
- CAPTCHA after 3 failed attempts (deferred to S3.4)
- Per-request anomaly detection in middleware (scan-time only)
- RBAC on checkout route (deferred to S2.1)
- `revoked_at`/`revoked_reason` columns on sessions (audit_logs used instead)
- Anomaly detection unit tests beyond IT-4 coverage

## Architecture / Approach

Layered middleware: rate limiting (Redis sliding window) is the outermost guard on both scan endpoints. Anomaly detection fires after a successful scan, writing to two Redis keys per session (`anomaly:{id}:asns` SET + `anomaly:{id}:country` STRING) and revoking via service_role if thresholds exceeded. The middleware (proxy.ts) enforces revocation universally: one indexed PK lookup on `sessions` when `__Host-session` cookie is present. Early checkout is a single Supabase RPC call (`SECURITY DEFINER` plpgsql) that atomically commits 5 table changes and cannot partially succeed.

```
Request → proxy.ts ──── __Host-session? ──── revoked? ──► 401
               │
               └──► /api/scan/* ──── rate limit (Redis) ──► 429
                                │
                                └──► scan logic (S1.2)
                                         │
                                         └──► resolveIpInfo → trackAndDetect (async)
                                                    │
                                                    └──► anomaly? → UPDATE sessions.revoked + audit_log

Hotel panel: POST /api/panel/reservations/[id]/checkout
    → processEarlyCheckout(reservationId)
        → supabase.rpc('process_early_checkout') [atomic, 5 tables]
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Upstash Rate Limiting | 429 on 6th scan attempt per IP/15min | Upstash credentials absent in test env — manual gate before Phase 2 |
| 2. GeoIP + Anomaly Detection | last_asn populated; ASN/country anomalies auto-revoke sessions | ip-api.com outage is non-fatal (graceful null); localhost test IPs are no-ops |
| 3. Middleware Revocation | 401 for revoked sessions on all routes | Extra 1-3ms per guarded request; IT-2 must still pass (non-revoked sessions unaffected) |
| 4. Early Checkout + IT-4 | Atomic 5-table checkout transaction; IT-4 green | Phase 3 must be done before IT-4 Test 2 (proxy 401 assertion) can pass |

**Prerequisites:** S1.2 fully done (✅ all progress items checked). Upstash Redis account with REST URL + token. Real Supabase instance for IT-4 (not mocked).

**Estimated effort:** ~1 session across 4 phases (Phase 1 is 30 min, Phase 2 is the heaviest at ~90 min, Phase 3 is 20 min, Phase 4 with IT-4 is ~60 min).

## Open Risks & Assumptions

- ip-api.com has a 45 req/min free-tier limit. With Redis caching (TTL 1h), this is sufficient for dev/pilot; if a single IP sees 46 unique scans per minute, the cache prevents this from being hit in practice. Monitor at scale.
- The `process_early_checkout` RPC closes `rooms.valid_until` only when `reservations.room_id IS NOT NULL`. Reservations without a linked room (e.g., reception-only auth_level=1 sessions) still get their sessions revoked, but the room window step is skipped — this is correct behaviour.
- The checkout route handler is unauthenticated until S2.1. In dev/staging this is acceptable; it must not be deployed to production until the RBAC guard is added.

## Success Criteria (Summary)

- IT-4 passes: `npm run test -- lib/checkout/__tests__/it-4.test.ts` exits 0 with 4 tests
- After `processEarlyCheckout(reservationId)`, any request with the revoked `__Host-session` → 401; any room QR scan → `session_revoked` redirect
- Reception scan endpoint returns 429 on the 6th attempt within 15 minutes from the same IP
