# S0.3 — Supabase Auth + Custom Access Token Hook + Middleware — Plan Brief

> Full plan: `context/changes/s0-3/plan.md`

## What & Why

Wire Supabase Anonymous Sign-In to a Custom Access Token Hook that stamps every JWT with `property_id`, `session_id`, and `auth_level` — then write the Next.js middleware and per-request tenant helper that translate those claims into the Postgres RLS context (`set_tenant_context`). Without this session, no subsequent session can make tenant-isolated DB queries, because the bridge from "who is this user?" to "which hotel's data can they see?" doesn't exist yet.

## Starting Point

S0.2 delivered 12 tables with full RLS, the `set_tenant_context()` function (service_role only), and `lib/supabase/server.ts` and `client.ts` stubs explicitly marked for replacement. Anonymous Sign-In is not yet enabled. No `middleware.ts` exists. `sessions.auth_user_id` has no index despite being the hook's lookup column on every JWT refresh.

## Desired End State

`signInAnonymously()` → `refreshSession()` returns a JWT whose `app_metadata` contains `property_id`, `session_id`, `auth_level` (when a `sessions` row exists for the user). Every Next.js request passes through `middleware.ts`, which refreshes the JWT and injects `x-property-id` / `x-session-id` request headers. Route handlers call `withTenantContext(headers)` once to set the Postgres RLS context before touching tenant data. Sentry is initialized with a global-error catch-all; PostHog EU is initialized with no events yet.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Hook → middleware bridging | Header injection (`x-property-id`, `x-session-id`) | `set_tenant_context` is transaction-local — middleware can't call it; headers are the clean bridge to route handlers | Plan |
| Unauth pass-through | No redirect | Route-level guards belong in S2.1 (panel) and S3.4 (guest); middleware stays minimal | Plan |
| Middleware runtime | Edge (default) | JWT refresh via `@supabase/ssr` works on Edge; route handlers (Node.js) call `set_tenant_context` | Plan |
| Hook claim path | `app_metadata` sub-object | Standard Supabase custom claim location; `getUser()` returns it server-verified | Research |
| Hook default (no session) | `auth_level: 0`, no `property_id` | Fail-closed: anonymous user without a session row gets zero tenant access | Plan |
| sessions.auth_user_id index | Migration 004 (this session) | Hook queries this column on every JWT mint — full table scan without it | Plan |
| Sentry scope | Config + `global-error.tsx` only | Satisfies DoD ("catch-all works"); source maps in CI is a post-S0.3 enhancement | Plan |
| PostHog init | Client provider stub, no events | `autocapture: false`, `capture_pageview: false` — S5.1 adds deliberate events | Plan |
| Better Stack | External config, `.env.example` only | No npm package needed; uptime monitoring is external to the app | Plan |
| DoD test | Direct hook function call via psql | Can't script `signInAnonymously()` from SQL; testing the hook function directly verifies the contract | Plan |

## Scope

**In scope:**
- `supabase/migrations/20260626000004_auth_hook.sql` — `sessions.auth_user_id` index + `custom_access_token_hook` function
- Manual gate: Anonymous Sign-In enabled + hook registered in Supabase Dashboard
- `middleware.ts` — JWT refresh + `x-property-id` / `x-session-id` header injection
- `lib/supabase/server.ts` — real `next/headers` cookie handlers (replaces stub)
- `lib/supabase/service-role.ts` — service_role client factory
- `lib/supabase/tenant.ts` — `withTenantContext(headers)` helper
- `@sentry/nextjs` install + three config files + `global-error.tsx`
- `posthog-js` + `posthog-node` install + `lib/posthog/client.ts` + `lib/posthog/server.ts` + `app/providers.tsx`
- `.env.example` update (Sentry DSN, PostHog key/host, Better Stack token, service role key)
- `supabase/tests/dod_s0_3_jwt_claims.sql` — hook unit verification

**Out of scope:**
- `__Host-session` cookie: set in S1.2
- Route auth guards / redirects: S2.1 (panel), S3.4 (guest)
- Upstash Redis, Vitest, Playwright
- PostHog events (S5.1), Sentry source maps in CI

## Architecture / Approach

```
JWT mint/refresh
  → custom_access_token_hook (postgres)
      reads sessions WHERE auth_user_id = user_id
      injects app_metadata.property_id / session_id / auth_level

Every HTTP request
  → middleware.ts (Edge)
      @supabase/ssr updateSession  ← keeps JWT fresh
      getUser()                    ← server-verified user
      injects x-property-id + x-session-id request headers

Route handler / Server Component (Node.js)
  → withTenantContext(headers)     ← lib/supabase/tenant.ts
      validates UUID headers
      service_role client
      set_tenant_context(property_id, session_id)   ← transaction-local RLS
      returns service_role client for subsequent queries
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Auth + migration | `custom_access_token_hook` deployed; `sessions.auth_user_id` indexed; Anonymous Sign-In on | Manual gate: hook must be registered in Dashboard after migration — easy to forget |
| 2. Middleware + clients | `middleware.ts`, real `server.ts`, `tenant.ts`, `service-role.ts` | Header injection must handle absent claims gracefully (unauthenticated users) |
| 3. Monitoring | Sentry + PostHog initialized; `.env.example` updated | `withSentryConfig` in `next.config.ts` can break build if config is malformed |
| 4. DoD verification | psql hook test passes; full CI pipeline green | Requires real Supabase project credentials in `.env.local` |

**Prerequisites:** S0.2 applied (confirmed); Supabase project credentials in `.env.local`; Sentry and PostHog projects created (accounts needed for DSN / API key).  
**Estimated effort:** 1 session (~3–4h); migration and middleware are the bulk; monitoring init is routine.

## Open Risks & Assumptions

- The Supabase Dashboard hook registration is a manual step with no CLI equivalent — document it prominently so it isn't missed between sessions.
- `@sentry/nextjs` wraps `next.config.ts`; if the project uses a non-standard config shape it may need adjustment.
- PostHog EU host (`https://eu.posthog.com`) is assumed; confirm in the PostHog project settings before deploying.

## Success Criteria (Summary)

- `psql … -f supabase/tests/dod_s0_3_jwt_claims.sql` prints `DOD S0.3 PASSED`
- `npm run typecheck && npm run lint && npm run build` all pass
- Sentry receives a test error from the running dev server
