# S0.3 — Supabase Auth + Custom Access Token Hook + Middleware Implementation Plan

## Overview

Establish the authentication and per-request tenant context foundation that every S1+ session depends on. Three interlocking pieces: (1) a Postgres Custom Access Token Hook that injects `property_id`, `session_id`, and `auth_level` into every Supabase JWT; (2) Next.js middleware that refreshes the JWT and extracts those claims into request headers; (3) a tenant helper (`lib/supabase/tenant.ts`) that route handlers call to set the Postgres RLS context (`set_tenant_context`) before touching tenant data. Sentry and PostHog EU are initialized without events.

## Current State Analysis

S0.2 delivered:
- 12 Postgres tables with full RLS policies and mandatory indexes — all applied to the remote Supabase project
- `set_tenant_context(property_id, session_id)` SECURITY DEFINER function restricted to `service_role`
- `lib/supabase/server.ts` — stub with empty cookie handlers (explicitly marked for S0.3 replacement)
- `lib/supabase/client.ts` — browser client stub
- `lib/supabase/database.types.ts` — generated TypeScript types
- `@supabase/ssr` and `@supabase/supabase-js` installed

Missing:
- `sessions.auth_user_id` has no index (the Custom Hook queries this column on every JWT mint/refresh — a full table scan without it)
- No `middleware.ts`
- No `lib/supabase/tenant.ts`
- No Sentry, PostHog, or Better Stack packages or configuration
- Anonymous Sign-In not yet enabled in the Supabase project

## Desired End State

After S0.3:
- `supabase.auth.signInAnonymously()` works; a subsequent `refreshSession()` returns a JWT where `app_metadata` contains `property_id`, `session_id`, and `auth_level` (populated from the `sessions` table by the hook)
- Every Next.js request passes through `middleware.ts`, which refreshes the JWT and injects `x-property-id` / `x-session-id` request headers
- Any route handler that makes tenant-aware DB queries calls `withTenantContext(headers)` from `lib/supabase/tenant.ts`, which calls `set_tenant_context` via service_role
- `lib/supabase/server.ts` uses real `next/headers` cookie callbacks
- Sentry is initialized with a global-error catch-all
- PostHog EU is initialized (no events yet)
- `.env.example` and `.env.local` updated with all new variables

### Key Discoveries:

- `sessions.auth_user_id` index is missing — added in migration 004 (this session)
- `set_tenant_context` is transaction-local (`set_config(..., is_local=true)`); middleware cannot call it because middleware doesn't share a DB connection with route handlers. Header injection is the clean bridge.
- The hook fires on every JWT mint/refresh. When no `sessions` row exists for the user (first anonymous sign-in, before S1.2 creates the record), the hook returns `auth_level: 0` with no `property_id` or `session_id` — fail-closed by design.
- Middleware must run on **Edge runtime** (default) for JWT refresh via `@supabase/ssr`. Route handlers (Node.js) call `set_tenant_context`. Do NOT add `export const runtime = 'nodejs'` to middleware.
- The Supabase Custom Access Token Hook must be a SECURITY DEFINER function granted to `supabase_auth_admin` and registered in the Supabase Dashboard (Authentication → Hooks → Custom Access Token).
- Better Stack uptime monitoring is configured externally (no npm package). The `.env.example` entry for `BETTER_STACK_SOURCE_TOKEN` is the only code artifact.

## What We're NOT Doing

- Setting the `__Host-session` cookie (that is S1.2's `/api/scan/*` route handler)
- Reading `__Host-session` in middleware (S1.2 sets it; the JWT claims are the source for S0.3)
- Route-level auth guards / redirects (S3.4 for guest, S2.1 for panel)
- Vitest or Playwright setup (no test framework yet)
- pgvector activation (HITL #12 — post-MVP)
- Upstash Redis installation (S1.3)
- PostHog events (S5.1)
- Sentry source maps in CI (post-S0.3 CI enhancement)
- Better Stack npm package (`@logtail/next`) — external uptime config only

## Implementation Approach

Phase 1 is a prerequisite for all others: the hook must exist in the database before middleware can extract meaningful claims from the JWT. The `sessions.auth_user_id` index is added in the same migration to avoid a separate migration file.

`lib/supabase/server.ts` is updated in Phase 2 to use real cookie handlers before middleware.ts is written — middleware imports from it.

Monitoring (Phase 3) is independent of the auth chain and can be done in any order after Phase 1 setup.

## Critical Implementation Details

**Hook claim injection path:** The hook returns claims via `event.claims` mutation. Supabase Custom Access Token Hook expects the function to accept `event jsonb` and return `jsonb`. The returned object must include the full `claims` key with all existing claims merged — not just the new ones. Omitting existing claims (like `role`, `iss`, `aud`) will break auth.

**Header sanitization in route handlers:** `x-property-id` and `x-session-id` are plain string headers. Before passing to `set_tenant_context`, validate they are valid UUID format. An invalid header silently calling `set_tenant_context` with a malformed UUID would error at the Postgres function level — validate first and short-circuit.

**`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` vs `NEXT_PUBLIC_SUPABASE_ANON_KEY`:** The existing stubs use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the Supabase v2 client uses `SUPABASE_PUBLISHABLE_KEY` / formerly `ANON_KEY`). Keep the same env var name to avoid breaking changes.

---

## Phase 1: Auth Configuration + Hook Migration

### Overview

Enable Anonymous Sign-In in the Supabase project, add the missing `sessions.auth_user_id` index, and write + register the Custom Access Token Hook SQL function. This phase has a manual gate: the hook must be registered in the Supabase Dashboard after the function is deployed.

### Changes Required:

#### 1. Enable Anonymous Sign-In (manual step)

**File**: Supabase Dashboard → Authentication → Providers → Anonymous

**Intent**: Toggle "Enable anonymous sign-ins" to ON. This is a project setting, not a migration — there is no SQL equivalent in the CLI. Must be done before testing in Phase 4.

**Contract**: No code file changes. Document the step in the DoD verification script.

---

#### 2. Migration 004 — sessions.auth_user_id index + hook function

**File**: `supabase/migrations/20260626000004_auth_hook.sql`

**Intent**: Add the missing index on `sessions.auth_user_id` (the hook queries this on every JWT refresh). Write the Custom Access Token Hook function that injects `property_id`, `session_id`, and `auth_level` from the `sessions` table into the JWT's `app_metadata`.

**Contract**:

```sql
-- Index
CREATE INDEX IF NOT EXISTS sessions_auth_user_id_idx ON sessions (auth_user_id);

-- Hook function (must match Supabase's expected signature exactly)
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_property_id  uuid;
  v_session_id   uuid;
  v_auth_level   smallint;
  v_user_id      uuid;
  v_claims       jsonb;
BEGIN
  v_user_id := (event->>'user_id')::uuid;
  v_claims  := event->'claims';

  SELECT s.property_id, s.id, s.auth_level
    INTO v_property_id, v_session_id, v_auth_level
    FROM sessions s
   WHERE s.auth_user_id = v_user_id
     AND NOT s.revoked
     AND s.expires_at > now()
   ORDER BY s.created_at DESC
   LIMIT 1;

  IF v_property_id IS NOT NULL THEN
    v_claims := jsonb_set(v_claims, '{app_metadata,property_id}', to_jsonb(v_property_id));
    v_claims := jsonb_set(v_claims, '{app_metadata,session_id}',  to_jsonb(v_session_id));
    v_claims := jsonb_set(v_claims, '{app_metadata,auth_level}',  to_jsonb(v_auth_level));
  ELSE
    v_claims := jsonb_set(v_claims, '{app_metadata,auth_level}',  to_jsonb(0::smallint));
  END IF;

  RETURN jsonb_set(event, '{claims}', v_claims);
END;
$$;

-- Grant execute to supabase_auth_admin (required for hook registration)
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC, anon, authenticated;
```

---

#### 3. Register hook in Supabase Dashboard (manual step)

**File**: Supabase Dashboard → Authentication → Hooks → Custom Access Token

**Intent**: Add a new hook pointing to `public.custom_access_token_hook`. Must be done after the migration is applied.

**Contract**: Select "PostgreSQL function" as hook type, schema `public`, function `custom_access_token_hook`. No code file change.

---

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npx supabase db push` exits 0 with no errors
- Function exists: `\df public.custom_access_token_hook` in psql returns one row
- Index exists: `\di sessions_auth_user_id_idx` in psql returns one row

#### Manual Verification:

- Supabase Dashboard shows Anonymous Sign-In enabled
- Supabase Dashboard Authentication → Hooks shows `custom_access_token_hook` registered
- Hook smoke test (Phase 4 DoD script): after inserting test session data, `refreshSession()` returns JWT with `property_id` in `app_metadata`

**Implementation Note**: After this phase's automated verification passes, the dashboard steps (Anonymous Sign-In + hook registration) must be confirmed by a human before proceeding to Phase 2. The hook registration is the gate — middleware in Phase 2 is useless if claims never appear in the JWT.

---

## Phase 2: Middleware + Server Client + Tenant Helper

### Overview

Update `lib/supabase/server.ts` to use real `next/headers` cookie callbacks, write `middleware.ts` with JWT refresh and header injection, and write `lib/supabase/tenant.ts` with the `withTenantContext` helper. Together these complete the per-request RLS context pipeline.

### Changes Required:

#### 1. Real server client

**File**: `lib/supabase/server.ts`

**Intent**: Replace the empty stub cookie handlers with real `next/headers` read/write callbacks. This is the standard `@supabase/ssr` server pattern for Next.js App Router.

**Contract**: The function signature stays `createServerClient()` (no params). It imports `cookies` from `next/headers` and passes `getAll`/`setAll` callbacks. For server components (where `setAll` cannot call `response.headers.set`), the write callback is a no-op — the middleware handles cookie refresh. The client uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

---

#### 2. Middleware

**File**: `middleware.ts` (project root)

**Intent**: Intercept every request, refresh the Supabase JWT (so session cookies stay fresh), extract `property_id` and `session_id` from JWT `app_metadata` claims, and inject them as `x-property-id` and `x-session-id` request headers for downstream route handlers. Pass through without redirect when claims are absent (unauthenticated users get `auth_level: 0` behavior).

**Contract**:

```typescript
// Key structural contract — not the full implementation
export async function middleware(request: NextRequest) {
  // 1. createServerClient with response-mutating cookie callbacks
  // 2. supabase.auth.getUser()  — refreshes JWT, sets updated cookies on response
  // 3. Extract user.user_metadata or user.app_metadata.property_id / session_id
  // 4. Clone request headers; inject x-property-id + x-session-id if present
  // 5. Return NextResponse.next({ request: { headers: clonedHeaders }, headers: response.headers })
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

Claims live in `user.app_metadata` (injected by the hook into `app_metadata` within the JWT). Use `supabase.auth.getUser()` — not `getSession()` — to get a server-verified user object.

---

#### 3. Tenant context helper

**File**: `lib/supabase/tenant.ts`

**Intent**: Provide a `withTenantContext(headers)` function that route handlers call once at the top of any function that makes tenant-aware DB queries. It reads `x-property-id` and `x-session-id` from the incoming request headers, validates they are valid UUIDs, and calls `set_tenant_context` via a service_role Supabase client.

**Contract**:

```typescript
// Returns a service_role Supabase client with RLS context set for the request.
// Throws if property_id header is absent or not a valid UUID.
export async function withTenantContext(
  headers: ReadonlyHeaders
): Promise<SupabaseClient<Database>>
```

The service_role client uses `SUPABASE_SERVICE_ROLE_KEY` (not the anon/publishable key). UUID validation: test with a simple regex or `crypto.randomUUID` parse — reject anything that doesn't match `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` format before calling the DB function.

---

#### 4. Service-role client helper

**File**: `lib/supabase/service-role.ts`

**Intent**: Expose a `createServiceRoleClient()` factory used by `lib/supabase/tenant.ts` and later by server-side cron/admin operations. Separate from `server.ts` so it's never accidentally imported in client components.

**Contract**: `createServiceRoleClient()` returns `SupabaseClient<Database>` using `SUPABASE_URL` (not public) and `SUPABASE_SERVICE_ROLE_KEY`. No cookie handling needed — service_role bypasses auth.

---

### Success Criteria:

#### Automated Verification:

- `npm run typecheck` passes with no errors
- `npm run lint` passes with no warnings on the new files
- `npm run build` exits 0 (middleware doesn't break the build)

#### Manual Verification:

- Visit any page locally (`npm run dev`); no console errors about Supabase cookies
- Middleware matcher covers expected routes (verify via `next dev` request logs)

---

## Phase 3: Monitoring Init

### Overview

Install and initialize Sentry (`@sentry/nextjs`) with a global-error catch-all, initialize PostHog EU with a client-side provider stub (no events yet), update `.env.example` with all new variables.

### Changes Required:

#### 1. Sentry installation and configuration

**File**: `package.json` (add `@sentry/nextjs`)

**File**: `sentry.server.config.ts` (project root)

**File**: `sentry.client.config.ts` (project root)

**File**: `sentry.edge.config.ts` (project root)

**File**: `next.config.ts` — wrap with `withSentryConfig`

**Intent**: Initialize Sentry for server, client, and edge runtimes. The `dsn` comes from `NEXT_PUBLIC_SENTRY_DSN`. Set `tracesSampleRate: 0` for now (performance monitoring not needed on MVP); only error capture. Tunnel route not needed at this stage.

**Contract**: Use `@sentry/nextjs`'s `withSentryConfig` wrapper in `next.config.ts`. The three config files use `Sentry.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, ... })`. Do not enable session replay or performance monitoring.

---

#### 2. Global error boundary

**File**: `app/global-error.tsx`

**Intent**: Next.js App Router's top-level error boundary. Calls `Sentry.captureException(error)` so unhandled errors propagate to Sentry. This is the "catch-all" in the DoD.

**Contract**: Must be a `'use client'` component (App Router requirement). Renders a minimal "Something went wrong" UI with a reload button. Calls `Sentry.captureException` in a `useEffect` triggered by the error prop.

---

#### 3. PostHog EU initialization

**File**: `package.json` (add `posthog-js` and `posthog-node`)

**File**: `lib/posthog/client.ts` — browser PostHog singleton

**File**: `lib/posthog/server.ts` — server-side `PostHog` instance (posthog-node)

**File**: `app/providers.tsx` — `PostHogProvider` wrapper component

**File**: `app/layout.tsx` — wrap children with `<Providers>`

**Intent**: Initialize PostHog EU Cloud with `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` (must be `https://eu.posthog.com`). No `posthog.capture()` calls yet. The client singleton disables autocapture and pageview capture (S5.1 adds deliberate events). The server instance is exported for S5.1 server-side event tracking.

**Contract**:

```typescript
// lib/posthog/client.ts
posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
  api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  person_profiles: 'never',       // no PII — guests are opaque UUIDs
  autocapture: false,
  capture_pageview: false,        // S5.1 adds deliberate events
  capture_pageleave: false,
  disable_session_recording: true,
})
```

---

#### 4. Environment variables

**File**: `.env.example`

**Intent**: Document all new variables required by S0.3. Operators cloning the repo know exactly what to fill in.

**Contract**: Add the following entries (values are placeholders, not secrets):

```
# Sentry
NEXT_PUBLIC_SENTRY_DSN=

# PostHog EU
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://eu.posthog.com

# Better Stack (uptime monitoring — no npm package; configured externally)
BETTER_STACK_SOURCE_TOKEN=

# Supabase service role (server-only — never expose to browser)
SUPABASE_SERVICE_ROLE_KEY=
```

---

### Success Criteria:

#### Automated Verification:

- `npm run build` exits 0 after Sentry wrapper is applied in `next.config.ts`
- `npm run typecheck` passes (no missing type definitions for new packages)
- `npm run lint` passes on all new/modified files

#### Manual Verification:

- Throw a test error in a server component; it appears in the Sentry project's "Issues" tab
- PostHog project receives an `$identify` or init ping (confirm in PostHog Live Events — even without explicit events, init triggers a session start)
- `.env.example` diff reviewed; no real secrets committed

---

## Phase 4: DoD Verification

### Overview

Verify the full claim injection chain: insert test data via service_role, sign in anonymously, refresh the session, and assert the JWT contains `property_id`, `session_id`, and `auth_level`. Also confirm the Sentry catch-all is wired.

### Changes Required:

#### 1. DoD verification script

**File**: `supabase/tests/dod_s0_3_jwt_claims.sql`

**Intent**: A psql-executable script that creates test fixtures, performs the JWT round-trip, and verifies claims. Mirrors the IT-3 style from S0.2. Run once manually to satisfy the DoD; not a CI test yet.

**Contract**: The script inserts a test `properties` row and a `sessions` row with a known `auth_user_id` (pointing to a temporary anonymous auth user), calls `custom_access_token_hook` directly with a synthetic `event` jsonb, and asserts the returned claims contain `property_id`, `session_id`, and `auth_level = 1`. Uses `DO $$ ... ASSERT ... $$` blocks and prints `DOD S0.3 PASSED` on success.

Testing the hook function directly (rather than through a real sign-in flow) is acceptable here because: (1) we can't script `signInAnonymously()` from psql; (2) the hook's contract is the SQL function itself; (3) the real sign-in round-trip is verified manually once in the Supabase Dashboard or a throwaway Next.js test route.

---

### Success Criteria:

#### Automated Verification:

- `psql $DATABASE_URL -f supabase/tests/dod_s0_3_jwt_claims.sql` prints `DOD S0.3 PASSED`
- `npm run typecheck && npm run lint && npm run build` all pass (full CI pipeline green)

#### Manual Verification:

- Enable Anonymous Sign-In in Supabase Dashboard (Phase 1 gate) ✓
- Register `custom_access_token_hook` in Authentication → Hooks (Phase 1 gate) ✓
- In Supabase Dashboard SQL Editor: `SELECT * FROM pg_proc WHERE proname = 'custom_access_token_hook'` returns one row
- In browser / Supabase JS console: `supabase.auth.signInAnonymously()` succeeds; subsequent `supabase.auth.refreshSession()` returns a session where `session.user.app_metadata.auth_level === 0` (no sessions row yet — expected for a bare anonymous user)
- Sentry: throw an error in a dev page; confirm it appears in Sentry Issues

---

## Testing Strategy

### Unit Tests:

- Not in this session (Vitest not yet installed). The hook logic is verified via the psql DoD script.

### Integration Tests:

- IT-3 (tenant isolation) from S0.2 remains valid — run it as a regression check after applying migration 004 to confirm the new migration didn't break existing policies.

### Manual Testing Steps:

1. `npx supabase db push` — confirm migration 004 applies cleanly
2. Enable Anonymous Sign-In in Dashboard, register hook
3. Run `supabase/tests/dod_s0_3_jwt_claims.sql` — assert PASSED
4. Run `npm run dev` — open any page; check no console errors about cookie handling
5. In Supabase Dashboard SQL Editor, manually call the hook with a test payload; confirm claim shape
6. Throw a test error; confirm Sentry receives it

## Migration Notes

Migration 004 is additive (new index + new function). No data changes. Safe to apply in any environment order. The hook function can be re-deployed with `CREATE OR REPLACE` — idempotent.

## References

- Roadmap §3.2: Identity model + JWT claims design
- Roadmap §3.1: RLS + `set_tenant_context` pattern
- S0.2 plan: `context/changes/s0-2/plan.md`
- Supabase Custom Access Token Hook docs: https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook
- `@supabase/ssr` middleware pattern: https://supabase.com/docs/guides/auth/server-side/nextjs

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Auth Configuration + Hook Migration

#### Automated

- [x] 1.1 `npx supabase db push` exits 0 for migration 004 — f0454a7
- [x] 1.2 `\df public.custom_access_token_hook` returns one row in psql — f0454a7
- [x] 1.3 `\di sessions_auth_user_id_idx` returns one row in psql — f0454a7

#### Manual

- [x] 1.4 Anonymous Sign-In enabled in Supabase Dashboard
- [x] 1.5 `custom_access_token_hook` registered in Authentication → Hooks
- [x] 1.6 Hook smoke: `dod_s0_3_jwt_claims.sql` prints `DOD S0.3 PASSED`

### Phase 2: Middleware + Server Client + Tenant Helper

#### Automated

- [x] 2.1 `npm run typecheck` passes with no errors — 48f30b9
- [x] 2.2 `npm run lint` passes on all new files — 48f30b9
- [x] 2.3 `npm run build` exits 0 — 48f30b9

#### Manual

- [x] 2.4 `npm run dev` — no console errors about cookie handling on any page — 48f30b9
- [x] 2.5 Middleware matcher verified via request logs (static assets excluded) — 48f30b9

### Phase 3: Monitoring Init

#### Automated

- [x] 3.1 `npm run build` exits 0 with Sentry wrapper applied — af33cae
- [x] 3.2 `npm run typecheck` passes after adding posthog packages — af33cae
- [x] 3.3 `npm run lint` passes on all new/modified files — af33cae

#### Manual

- [x] 3.4 Test error thrown → appears in Sentry Issues — af33cae
- [x] 3.5 PostHog Live Events shows init ping — af33cae
- [x] 3.6 `.env.example` diff reviewed — no real secrets — af33cae

### Phase 4: DoD Verification

#### Automated

- [x] 4.1 `psql $DATABASE_URL -f supabase/tests/dod_s0_3_jwt_claims.sql` prints `DOD S0.3 PASSED` — f28be55
- [x] 4.2 `npm run typecheck && npm run lint && npm run build` all pass — f28be55

#### Manual

- [x] 4.3 `supabase.auth.signInAnonymously()` succeeds in browser / Dashboard console — f28be55
- [x] 4.4 `refreshSession()` returns JWT with `app_metadata.auth_level === 0` (no sessions row — expected) — f28be55
- [x] 4.5 Sentry catch-all confirmed: error appears in Sentry Issues — f28be55
