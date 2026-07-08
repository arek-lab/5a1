# Retention Automation (Cron) + Founder Dashboard Implementation Plan

## Overview

S5.2 builds the two go-live-blocking pieces of §7.4/§7.3: (1) an automated retention sweep — session revoke/delete and `audit_logs` purge — triggered by a GitHub Actions schedule against a secret-protected cron route, and (2) a founder-only "Pulse" dashboard showing daily platform numbers, aggregated directly from Postgres. AI-chat retention (no storage table exists — Phase 4 isn't built) and the PostHog `guest_id` purge (needs a new Personal API Key) are explicitly deferred and documented as open gaps. The "Growth" (weekly) dashboard is deferred to a follow-up session — this session's own DoD only requires Pulse.

## Current State Analysis

- `job_queue` and `audit_logs` tables already exist (`supabase/migrations/20260626000001_initial_schema.sql:159-210`), `service_role`-only (REVOKE'd from `anon`/`authenticated` in `20260626000002_rls_policies.sql:221-223`), but have zero consumer/worker code — both are inert schema.
- No cron/scheduling mechanism exists anywhere in the repo. `railway.toml` defines a single web process; `.github/workflows/ci.yml` has no `schedule:` trigger; no `/api/cron/*` route exists.
- `orders.session_id` (`20260626000001_initial_schema.sql:145`) has no `ON DELETE` clause, which defaults to `NO ACTION` — hard-deleting a `sessions` row referenced by an order would currently throw a foreign-key violation. This must be fixed before session deletion can work, since orders are retained 5 years and must survive session deletion.
- `sessions` (`20260626000001_initial_schema.sql:109-123`, `+last_seen_at` from `20260707000002_sessions_last_seen_at.sql`) already has `expires_at` (set to checkout+2h at creation) and `revoked`. `proxy.ts:11-29` already treats `revoked || expires_at <= now()` as an invalid session (401/redirect) — the retention sweep's "revoke" step makes this state durable/queryable rather than changing observable behavior, and the "delete" step is the actual RODO erasure.
- `process_early_checkout` (`20260626000006_early_checkout_fn.sql`) is the existing precedent for a `SECURITY DEFINER` Postgres function writing to `audit_logs` from a service-role-only path — same trust boundary the retention sweep operates in, but the sweep itself is simple enough to run as plain service-role queries from a route handler rather than a DB function.
- `lib/supabase/service-role.ts` is the existing, already-used pattern (`lib/checkout/early-checkout.ts`, `proxy.ts`) for service-role access — this is what the retention sweep and Pulse dashboard both reuse.
- `CRON_SECRET` is **already declared** in `.env.example` (unused) — the env var name is pre-agreed, just needs to be read and enforced.
- No `ADMIN_ACCESS_TOKEN` or any founder/platform-level auth concept exists. `lib/panel/rbac.ts` is entirely hotel-scoped (`owner`/`admin`/`staff`/`viewer`).
- `lib/checkout/__tests__/it-4.test.ts` is the established pattern for this kind of test: real Supabase (via `createServiceRoleClient()`), fixtures inserted with explicitly backdated timestamps (e.g. `twoHoursAgo`), a real function invoked, then DB state asserted directly, with `afterAll` cleanup. IT-8 follows this same pattern.
- `posthog-node` in this repo is capture-only (`lib/posthog/server.ts`, `lib/analytics/capture.ts`) — no query/aggregation client exists, confirming the Pulse dashboard should read Postgres directly rather than PostHog.
- `app/[locale]/` currently contains only `(guest)`, `(hotel)`, `(hotel-auth)` — no admin route group. All existing pages are wrapped in next-intl locale routing.

## Desired End State

- A daily GitHub Actions workflow calls `/api/cron/retention` with a shared secret; the route runs three independent, individually-error-isolated sweeps: revoke sessions past `expires_at`, hard-delete sessions past `expires_at + 48h`, and purge `audit_logs` rows older than 30 days.
- `orders.session_id` survives session deletion (`ON DELETE SET NULL`) so 5-year order retention is never broken by the session sweep.
- A founder can log into `/admin` with a static shared token and see a Pulse page: guests online, orders in the last 24h, QR scans in the last 24h, operators active in the last 7 days, and an explicit "not yet available" indicator for escalation rate (blocked on Phase 4 / AI Concierge, which doesn't exist).
- IT-8 passes against a real (test) Supabase instance using backdated fixtures, verifying all three sweep rules in one pass.

### Key Discoveries:

- `supabase/migrations/20260626000001_initial_schema.sql:145` — `orders.session_id UUID REFERENCES sessions(id)` with no `ON DELETE` clause (defaults to `NO ACTION`).
- `supabase/migrations/20260626000002_rls_policies.sql:221-223` — `audit_logs`/`platform_config`/`job_queue` already `REVOKE ALL ... FROM anon, authenticated`.
- `.env.example` already lists `CRON_SECRET=` (unused today).
- `proxy.ts:11-45` — existing pattern for a service-role DB read + conditional response in middleware; the admin-auth cookie check follows the same shape, added as a new branch keyed on `pathname.startsWith('/admin')`.
- `lib/checkout/__tests__/it-4.test.ts:39-41` — the backdated-timestamp fixture pattern IT-8 reuses directly.

## What We're NOT Doing

- Not building AI-chat retention (no `concierge_messages`/similar table exists — Phase 4 isn't built). A `TODO(S4.x)` comment marks where this sweep rule gets added once that storage exists.
- Not building the PostHog `guest_id` purge (30-day rule). This needs a new `POSTHOG_PERSONAL_API_KEY` and is not covered by IT-8. Documented in Open Risks as a MUST-before-Lighthouse-go-live gap, not silently dropped.
- Not building an orders 5-year purge job — no order is anywhere near 5 years old yet; documented as a keep-only policy, no active job.
- Not building the Growth (weekly) dashboard view — this session's own DoD only requires Pulse; Growth is a follow-up session.
- Not routing retention through `job_queue` — the sweeps run as direct SQL/service-role calls on each cron invocation, not as enqueued+processed jobs. `job_queue`'s intended consumers (CSV import, email) are unbuilt and out of scope here.
- Not building a `platform_admins` table or per-founder accounts — a single static shared token is sufficient for the Lighthouse pilot's one-operator reality.
- Not adding i18n to the admin area — it has exactly one consumer (the founder), so it lives outside `[locale]` routing entirely, in plain English.

## Implementation Approach

The retention sweep is three small, independently-try/caught functions run from a single `/api/cron/retention` route handler, guarded by a `CRON_SECRET` header check, triggered daily by a new GitHub Actions scheduled workflow — no new infrastructure, no `job_queue` involvement. The admin area (`/admin/login`, `/admin`) lives outside `[locale]/`, gated by a cookie set after a token comparison against `ADMIN_ACCESS_TOKEN`, checked in `proxy.ts` alongside the existing session-cookie logic. The Pulse dashboard is a server component running four small aggregation queries via the existing `createServiceRoleClient()`.

## Critical Implementation Details

### State sequencing

The FK fix (`orders.session_id` → `ON DELETE SET NULL`) must land and apply before the session-delete sweep rule is ever exercised against real data — deleting a session referenced by an order without this migration throws a foreign-key violation and aborts that sweep iteration (caught by the per-rule try/catch, but it would silently never succeed). Phase 1 orders this migration first for that reason.

## Phase 1: Retention sweep core

### Overview

Fix the FK constraint blocking session deletion, then implement the three sweep rules as isolated, testable functions.

### Changes Required:

#### 1. Orders FK fix

**File**: `supabase/migrations/20260708000001_orders_session_fk_set_null.sql`

**Intent**: Allow a `sessions` row to be hard-deleted without breaking 5-year order retention.

**Contract**: `ALTER TABLE orders DROP CONSTRAINT <existing_fk_name>, ADD CONSTRAINT orders_session_id_fkey FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL;` (look up the auto-generated constraint name via `\d orders` or `information_schema.table_constraints` before writing the `DROP CONSTRAINT` line, since Postgres auto-names it `orders_session_id_fkey` by convention but this should be confirmed against the actual applied migration, not assumed).

#### 2. Retention sweep functions

**File**: `lib/retention/sweep.ts`

**Intent**: Three independent functions, one per retention rule, each returning a count of affected rows and never throwing past its own boundary — so the cron route can run all three and report partial success.

**Contract**: Exports `revokeExpiredSessions(): Promise<{ count: number }>` (`UPDATE sessions SET revoked = true WHERE revoked = false AND expires_at <= now()`), `deleteRetainedSessions(): Promise<{ count: number }>` (`DELETE FROM sessions WHERE expires_at <= now() - interval '48 hours'`), `purgeOldAuditLogs(): Promise<{ count: number }>` (`DELETE FROM audit_logs WHERE created_at <= now() - interval '30 days'`). All three use `createServiceRoleClient()`.

### Success Criteria:

#### Automated Verification:

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] Migration applies cleanly (paste into Supabase SQL Editor per project convention — no local psql)
- [ ] Unit tests for the three sweep functions pass against real (test) Supabase using backdated fixtures (`lib/retention/__tests__/sweep.test.ts`), confirming: an expired-not-yet-48h session is revoked but not deleted; a session past the 48h grace window is deleted and any referencing order survives with `session_id = null`; an audit_log row older than 30 days is purged, a newer one is kept

#### Manual Verification:

- [ ] None for this phase — no user-facing behavior yet

---

## Phase 2: Cron endpoint + scheduled trigger

### Overview

Wire the three sweep functions behind a secret-protected route, triggered daily by GitHub Actions.

### Changes Required:

#### 1. Cron route

**File**: `app/api/cron/retention/route.ts`

**Intent**: Single entry point the schedule calls; each rule runs independently so one failure doesn't block the others, and every failure is reported to Sentry.

**Contract**: `POST` handler. Rejects with 401 unless the `Authorization` header (or a dedicated header, e.g. `X-Cron-Secret`) exactly matches `process.env.CRON_SECRET`. Otherwise calls all three `lib/retention/sweep.ts` functions, each wrapped in its own try/catch reporting to `Sentry.captureException` on failure (matching the error-isolation pattern already established in `lib/analytics/capture.ts`). Returns 200 with a JSON summary `{ revoked: number, deleted: number, purged: number, errors: string[] }` — never 5xx purely because one rule failed, so a broken rule doesn't hide the fact the other two succeeded.

#### 2. Scheduled workflow

**File**: `.github/workflows/retention-cron.yml`

**Intent**: Daily trigger, following this repo's existing GitHub Actions conventions (`.github/workflows/ci.yml`).

**Contract**: `on: schedule` (one daily cron expression, e.g. `'0 3 * * *'`) plus `workflow_dispatch:` for manual runs. Single job: `curl -X POST -H "X-Cron-Secret: ${{ secrets.CRON_SECRET }}" ${{ secrets.APP_URL }}/api/cron/retention --fail`. `CRON_SECRET` and `APP_URL` added as GitHub Actions repository secrets (documented in this plan's manual verification, not committed).

### Success Criteria:

#### Automated Verification:

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] Unit test for the cron route: missing/incorrect secret → 401, no sweep functions called; correct secret → 200 with summary body (mocked `lib/retention/sweep.ts`)
- [ ] Existing IT-4 test (`lib/checkout/__tests__/it-4.test.ts`) still passes unmodified (FK change doesn't break early-checkout's session revoke path)

#### Manual Verification:

- [ ] `workflow_dispatch` manual run against a deployed preview succeeds and returns a 200 summary
- [ ] Calling the route without the secret returns 401

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Founder auth

### Overview

A minimal, single-token login for a new `/admin` area, checked in `proxy.ts` alongside the existing guest-session logic.

### Changes Required:

#### 1. Admin auth cookie check

**File**: `proxy.ts`

**Intent**: Gate every `/admin/*` route except `/admin/login` behind a valid admin cookie, following the same "check in middleware, redirect if invalid" shape already used for the guest session cookie.

**Contract**: New branch, parallel to the existing `pathname.startsWith('/api/')` early-return: if `pathname.startsWith('/admin')` and `pathname !== '/admin/login'`, read an httpOnly `admin_token` cookie and compare it to `process.env.ADMIN_ACCESS_TOKEN`; on mismatch, redirect to `/admin/login`. This branch bypasses next-intl routing entirely (admin has no locale).

#### 2. Login route + page

**File**: new `app/admin/login/page.tsx`, `app/admin/login/actions.ts`

**Intent**: A plain form (token input, one field) that, on submit, compares the entered value to `ADMIN_ACCESS_TOKEN` and sets the `admin_token` cookie (httpOnly, Secure, SameSite=Strict) on success.

**Contract**: Server action `login(formData): Promise<{ error?: string }>`; on success, sets the cookie and redirects to `/admin`. On mismatch, returns an error the form displays — no lockout/rate-limiting needed at single-founder scale.

#### 3. Env var

**File**: `.env.example`

**Intent**: Document the new secret alongside the existing `CRON_SECRET` line.

**Contract**: Add `ADMIN_ACCESS_TOKEN=` under the existing `# Internal` section.

### Success Criteria:

#### Automated Verification:

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] Unit test: `proxy.ts` redirects `/admin` → `/admin/login` when the cookie is missing/wrong; allows through when it matches `ADMIN_ACCESS_TOKEN`

#### Manual Verification:

- [ ] Visiting `/admin` without logging in redirects to `/admin/login`
- [ ] Submitting the correct token redirects to `/admin` and subsequent visits stay authenticated
- [ ] Submitting the wrong token shows an error and does not set the cookie

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Pulse dashboard + final hardening

### Overview

The daily-numbers dashboard, plus IT-8 and any remaining test gaps from Phases 1-3.

### Changes Required:

#### 1. Pulse aggregation queries

**File**: `lib/admin/pulse.ts`

**Intent**: One function per metric, each a small, direct Postgres aggregation via the service-role client — no PostHog dependency.

**Contract**: Exports `getPulseMetrics(): Promise<{ guestsOnline: number; orders24h: number; qrScans24h: number; operators7d: number }>`. Definitions: `guestsOnline` = count of `sessions` where `revoked = false AND expires_at > now()`; `orders24h` = count of `orders` where `created_at > now() - interval '24 hours'`; `qrScans24h` = count of `sessions` where `reception_scan_at > now() - interval '24 hours'` plus count where `room_scan_at > now() - interval '24 hours'`; `operators7d` = count of distinct `hotel_users` where `status = 'active' AND last_login_at > now() - interval '7 days'`. Escalation rate is NOT part of this function's return type — it's rendered as a static "not available (requires AI Concierge — Phase 4)" string in the page component, not computed.

#### 2. Pulse page

**File**: `app/admin/page.tsx`

**Intent**: Server component rendering `getPulseMetrics()`'s five numbers (four real + one "not available") as a simple list — no charts, per roadmap "liczby nie wykresy".

**Contract**: Async server component, no client-side interactivity, calls `getPulseMetrics()` directly.

#### 3. IT-8 test

**File**: `lib/retention/__tests__/it-8.test.ts`

**Intent**: End-to-end confirmation of the full retention story using the `lib/checkout/__tests__/it-4.test.ts` fixture pattern (real Supabase, backdated timestamps, direct DB assertions).

**Contract**: Insert a property + reservation + three sessions at different ages (fresh, expired-but-within-48h, expired-past-48h) and two `audit_logs` rows (one >30d old, one recent); call all three `lib/retention/sweep.ts` functions directly (not through the HTTP route); assert: fresh session untouched, mid-age session `revoked = true` but still present, old session deleted entirely, old audit log gone, recent audit log present.

### Success Criteria:

#### Automated Verification:

- [ ] `npm test` (full vitest suite) passes, including IT-8 and all new retention/admin tests
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes

#### Manual Verification:

- [ ] Logged into `/admin`, Pulse page shows four real numbers matching manual counts in Supabase, and the escalation-rate row clearly reads as not-yet-available rather than 0 or blank
- [ ] Running the cron route manually against data seeded with backdated fixtures produces the expected before/after state in Supabase

---

## Testing Strategy

### Unit Tests:

- Sweep functions: revoke/delete/purge boundary conditions (mocked-time via backdated fixtures, not fake timers)
- Cron route: secret validation, error isolation per rule
- Admin auth: cookie present/absent/wrong-value branches in `proxy.ts`

### Integration Tests:

- IT-8: full retention story against real Supabase test instance
- IT-4 regression: early-checkout's session revoke still works after the FK change

### Manual Testing Steps:

1. Paste the FK-fix migration into Supabase SQL Editor, confirm it applies with no errors
2. Trigger `/api/cron/retention` manually (`workflow_dispatch` or `curl` with the secret) against seeded backdated data, verify the JSON summary and the resulting Supabase table state
3. Log into `/admin` with the correct token, confirm Pulse numbers match manual Supabase queries
4. Attempt `/admin` with no cookie, wrong token, and correct token — verify redirect/error/success respectively

## Performance Considerations

All three sweep queries are simple, indexed (`sessions(expires_at)`, `audit_logs(property_id, created_at)`) `UPDATE`/`DELETE` statements running once daily against pilot-scale data (3-5 hotels) — no batching or pagination needed at this volume.

## Migration Notes

The FK constraint change is additive in effect (existing `orders` rows are untouched; only future deletes behave differently) and requires no data backfill.

## References

- Session-plan scope: `context/foundation/session-plan.md:167-170`
- Roadmap spec: `context/foundation/implementation_roadmap.md:574` (retention rules), `:588` (Pulse/Growth definitions), `:562` ("automaty retencji muszą działać przed pierwszym wdrożeniem")
- IT-8 spec: `context/foundation/implementation_roadmap.md:681`
- Prior session (S5.1) precedent for documenting unbuilt-feature gaps: `context/changes/s5-1/plan.md:38` (6 reserved events)
- Fixture-based real-Supabase test pattern to follow: `lib/checkout/__tests__/it-4.test.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Retention sweep core

#### Automated

- [x] 1.1 npm run typecheck passes — 1353e10
- [x] 1.2 npm run lint passes — 1353e10
- [x] 1.3 Migration applies cleanly — 1353e10
- [x] 1.4 Sweep function tests pass (backdated fixtures, real Supabase) — 1353e10

### Phase 2: Cron endpoint + scheduled trigger

#### Automated

- [x] 2.1 npm run typecheck passes — f5a158c
- [x] 2.2 npm run lint passes — f5a158c
- [x] 2.3 Cron route secret-validation unit test passes — f5a158c
- [x] 2.4 Existing IT-4 test still passes unmodified — f5a158c

#### Manual

- [x] 2.5 Manual workflow_dispatch run returns 200 summary
- [x] 2.6 Missing/incorrect secret returns 401

### Phase 3: Founder auth

#### Automated

- [x] 3.1 npm run typecheck passes
- [x] 3.2 npm run lint passes
- [x] 3.3 proxy.ts admin-auth redirect unit test passes

#### Manual

- [ ] 3.4 /admin without cookie redirects to /admin/login
- [ ] 3.5 Correct token logs in and persists across visits
- [ ] 3.6 Wrong token shows error, no cookie set

### Phase 4: Pulse dashboard + final hardening

#### Automated

- [ ] 4.1 Full vitest suite passes (incl. IT-8)
- [ ] 4.2 npm run typecheck passes
- [ ] 4.3 npm run lint passes

#### Manual

- [ ] 4.4 Pulse numbers match manual Supabase counts; escalation rate reads as not-yet-available
- [ ] 4.5 Manual cron run against seeded data produces expected before/after state
