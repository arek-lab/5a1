# S0.2 — Database Schema + RLS Policies — Plan Brief

> Full plan: `context/changes/s0-2/plan.md`
> Research: `context/research/session_06/multitenant-patterns.md`, `context/research/session_06/security-qr-sessions.md`
> Synthesis SQL: `context/research/synthesis/roadmap-identity-panel.md §2.2`

## What & Why

Establish the complete Supabase Postgres foundation — all tables, ENUMs, indexes, and Row-Level Security — that every subsequent session builds on. Nothing in the application (auth, guest UI, panel, AI) can be implemented until the schema exists and tenant isolation is verified.

## Starting Point

S0.1 delivered a clean Next.js 15 scaffold with CI/CD and `.env.example` variable stubs for Supabase. No Supabase project exists, no `supabase/` directory, no SDK packages installed. All architectural decisions (table structure, RLS approach, ENUM values) were made during the synthesis phase; the SQL definitions are pre-written in `roadmap-identity-panel.md §2.2`.

## Desired End State

A remote Supabase EU-West project with 12 tables deployed, RLS active on 9 of them, TypeScript types generated at `lib/supabase/database.types.ts`, minimal client stubs at `lib/supabase/server.ts` and `lib/supabase/client.ts`, and the IT-3 tenant isolation test passing — proving that a query in hotel A's context returns zero rows belonging to hotel B.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Multi-tenancy model | Shared DB + RLS per `property_id` | Cost ($25/mo for 200 hotels vs $5 000 for DB-per-tenant) and Supabase-native support | Research |
| RLS mechanism | `current_setting('app.property_id', true)::uuid` | 10–20× faster than subquery-per-row; `missing_ok=true` makes missing context fail-closed (0 rows) | Research |
| Staff policy mechanism | `auth.uid()` + `hotel_users` join | Staff auth is Supabase email/password; `auth.uid()` is always available regardless of S0.3 setup timing | Plan |
| `set_tenant_context` access | service_role only (REVOKE FROM PUBLIC) | Prevents browser clients from setting arbitrary property_id and reading other tenants' data | Plan |
| Circular FK resolution | ALTER TABLE after both tables exist | `rooms.room_active_reservation_id → reservations` and `reservations.room_id → rooms` — both nullable; ALTER TABLE is the only safe ordering | Plan |
| `dpa_signed_at` on properties | Include in S0.2 | HITL #11 requires this as a gate; adding it later costs an ALTER TABLE migration touch in multiple sessions | Plan |
| `embedding vector(1536)` | Column present, value NULL | Keeps upgrade path to pgvector intact without activating RAG on MVP (HITL #12) | Research |
| SDK install timing | S0.2 (now, via terminal command) | Client stubs and `gen types` are needed immediately in S0.3; deferred install adds friction | Plan |
| Local dev workflow | Remote Supabase only (no Docker) | No Docker requirement; fastest path to DoD; Railway persistent server makes local-only dev unnecessary | Plan |
| IT-3 format | SQL script via `psql` | Matches DoD wording ("ręczny SQL"); no Vitest install needed yet | Plan |

## Scope

**In scope:**
- Supabase project provisioning (EU West / Frankfurt)
- `npm install @supabase/supabase-js @supabase/ssr` + `supabase` CLI dev dep
- `supabase init` + `supabase link`
- `supabase/migrations/20260626000001_initial_schema.sql` — 4 ENUMs, 12 tables, all indexes
- `supabase/migrations/20260626000002_rls_policies.sql` — `set_tenant_context` function, RLS enable, all policies
- `lib/supabase/database.types.ts` (generated), `lib/supabase/server.ts`, `lib/supabase/client.ts` (stubs)
- `supabase/tests/it3_tenant_isolation.sql` — IT-3 verification script

**Out of scope:**
- Supabase Auth / Custom Access Token Hook (S0.3)
- Next.js middleware calling `set_tenant_context` (S0.3)
- Any application queries against these tables (S1+)
- pgvector activation / vector indexes (HITL #12 — post-MVP only)
- Local Docker Supabase stack

## Architecture / Approach

Single Postgres database shared by all hotel tenants. Each of the 9 tenant tables carries `property_id UUID NOT NULL REFERENCES properties(id)` and an RLS policy that compares it against `current_setting('app.property_id', true)::uuid`. The context variable is set per-request by server-side middleware (S0.3) via the `set_tenant_context(property_id, session_id)` SECURITY DEFINER function. The function is restricted to `service_role` — browsers cannot call it. The 3 platform tables (`audit_logs`, `platform_config`, `job_queue`) are explicitly revoked from `anon` and `authenticated` roles and accessed only by server-side service_role code.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Setup | Supabase project, CLI linked, SDK installed, `.env.local` filled | Manual gate: project must be created before migration can apply |
| 2. Migration 001 | All 12 tables, 4 ENUMs, mandatory indexes | Circular FK (rooms ↔ reservations) requires ALTER TABLE ordering |
| 3. Migration 002 | RLS enabled, all policies, set_tenant_context restricted to service_role | Staff policies are inert until hotel_users are populated (S2.1) — that's expected |
| 4. Apply + types + IT-3 | Live schema, generated TS types, client stubs, isolation verified | IT-3 requires `SET LOCAL ROLE anon` in psql — anon role must be granted to postgres in Supabase (it is by default) |

**Prerequisites:** GitHub repo reachable, Railway account active (already done in S0.1). Supabase account required (new signup or existing).  
**Estimated effort:** 1 session (~3–4h); schema writing is the bulk; setup and verification are quick.

## Open Risks & Assumptions

- Supabase may auto-create schema migrations during project setup (e.g. `auth` schema, `storage` schema). If `supabase db pull` shows unexpected migration history, run it first to reconcile before pushing.
- IT-3 uses `SET LOCAL ROLE anon` in psql. In Supabase's Postgres, `anon` is a real role granted to `postgres` — this should work. If it fails with "role not found", verify with `\du anon` in psql.
- The `reservation_status` ENUM is not listed in the session scope but is required by the `reservations` table — included without ambiguity; the session plan simply omitted it.

## Success Criteria (Summary)

- `npx supabase db push` applies both migrations with 0 errors
- `npx supabase db push` is idempotent on a second run ("No changes found")
- IT-3 SQL script prints "IT-3 PASSED: tenant isolation verified across 9 tables"
