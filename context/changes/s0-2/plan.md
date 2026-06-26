# S0.2 — Database Schema + RLS Policies — Implementation Plan

## Overview

Establish the complete Supabase database foundation for the Hotel Guest App MVP: 12 tables, 4 ENUMs, all mandatory indexes, Row-Level Security with the `current_setting('app.property_id', true)::uuid` guest-isolation pattern and `auth.uid()` staff policies, plus the `set_tenant_context` helper function. Delivered as two Supabase CLI migration files and verified by the IT-3 tenant-isolation SQL test.

## Current State Analysis

S0.1 is complete: Next.js 15 scaffold, CI/CD pipeline, `railway.toml`, `.env.example` with Supabase var stubs. No `supabase/` directory exists. No `@supabase/supabase-js` or `@supabase/ssr` packages installed (explicitly deferred in S0.1 plan). Supabase project not yet provisioned.

## Desired End State

- `supabase/` directory with `config.toml` and two migration files
- All 12 tables deployed to a remote Supabase EU-West project
- RLS active on 9 tenant tables; 3 platform-only tables accessible by service_role only
- `set_tenant_context(property_id, session_id)` function callable by service_role from server-side middleware (S0.3)
- TypeScript types generated at `lib/supabase/database.types.ts`
- `lib/supabase/server.ts` and `lib/supabase/client.ts` stub entry points in place for S0.3 to extend
- `supabase/tests/it3_tenant_isolation.sql` runs to completion, printing "IT-3 PASSED"

### Key Discoveries

- Full SQL definitions exist in `context/research/synthesis/roadmap-identity-panel.md §2.2` — the migration is schema-to-SQL transcription plus RLS wiring, not design work
- Circular FK: `rooms.room_active_reservation_id → reservations` and `reservations.room_id → rooms` — both nullable; resolved by creating `rooms` first without the back-reference, then `ALTER TABLE rooms ADD COLUMN` after `reservations` exists
- `dpa_signed_at TIMESTAMPTZ` is absent from synthesis SQL but required by HITL #11 (blocks QR generation) — added to `properties` in this migration
- `reservation_status` ENUM is required by the `reservations` table but not listed in the session-plan scope; included because the table definition depends on it
- Staff RLS policies use `auth.uid()` which exists in Supabase regardless of whether Auth is configured (S0.3) — safe to create all policies now; staff policies are inert until hotel users are populated
- `set_tenant_context` must be REVOKED from PUBLIC and GRANTED to service_role only — client-side callers must never set the tenant context themselves

## What We're NOT Doing

- Supabase Auth / Custom Access Token Hook / anonymous sign-in (S0.3)
- Next.js middleware that calls `set_tenant_context` per request (S0.3)
- Any application-level queries against these tables (S1+)
- Local Supabase Docker stack — remote Supabase only
- pgvector activation — `embedding vector(1536)` column exists but is inert; no vector indexes or search (HITL #12)
- Vitest test infrastructure (no test runner installed yet; IT-3 is a `psql` SQL script)

## Implementation Approach

Two migration files keep schema creation (tables, indexes) reviewable separately from security configuration (RLS, function). Both apply atomically via `supabase db push`. Workflow: provision project → install packages → init CLI → write migrations → push → generate types → create client stubs → run IT-3.

## Critical Implementation Details

**Circular FK resolution**: `rooms` and `reservations` have nullable FKs pointing at each other. Creating both in a single `CREATE TABLE` block is impossible. Order: create `rooms` without `room_active_reservation_id`, create `reservations` with `room_id REFERENCES rooms(id)`, then `ALTER TABLE rooms ADD COLUMN room_active_reservation_id UUID REFERENCES reservations(id)`.

**`set_config` must use `is_local = true`**: Supabase's connection pooler (Supavisor, transaction mode) reuses connections across requests. `set_config('app.property_id', value, true)` scopes the variable to the current transaction only — correct isolation. `false` would bleed into the next request on the same pooled connection.

**`current_setting` second argument must be `true`**: `current_setting('app.property_id', true)` returns `NULL` when the variable is not set (e.g. from a service_role context that didn't call `set_tenant_context`). `NULL` in the `USING` clause = no rows match = fail-closed. Omitting `true` causes an error instead of silent rejection.

**pgvector extension before `knowledge_chunks`**: The `embedding vector(1536)` column type requires the `vector` extension to exist. `CREATE EXTENSION IF NOT EXISTS vector` must appear before the `knowledge_chunks` table definition.

**`set_tenant_context` access restriction**: In PostgreSQL, functions are executable by PUBLIC by default. A browser client with the `anon` Supabase key could call `set_tenant_context(arbitrary_uuid)` and read another hotel's data. Immediately after creation: `REVOKE ALL ON FUNCTION set_tenant_context FROM PUBLIC; GRANT EXECUTE ON FUNCTION set_tenant_context TO service_role;`

---

## Phase 1: Supabase Project + CLI + SDK Setup

### Overview

Provision the remote Supabase project, install the Supabase CLI and JS packages, initialize the CLI directory structure, link to the remote project, and wire credentials into `.env.local`. This phase is a HITL gate — the project must exist before Phase 2 can be applied.

### Changes Required

#### 1. Manual: Create Supabase project

**File**: n/a (external action)

**Intent**: Provision the remote Postgres instance the rest of the project depends on.

**Contract**: Go to `app.supabase.com` → New Project. Settings: Region = `eu-west-1` (Frankfurt) to minimize latency from Railway EU. After creation, collect from Project Settings → API: `Project URL`, `anon public key`, `service_role secret key`. From Project Settings → Database → Connection String → Transaction pooler (port 6543): `SUPABASE_DB_URL`. From Project Settings → Database → Connection String → Direct connection (port 5432): needed for `psql` in Phase 4.

#### 2. Install SDK and CLI packages

**File**: `package.json` (dependencies updated)

**Intent**: Add the Supabase browser/server client libraries for use from S0.3 onward, and the Supabase CLI as a dev dependency for migration tooling.

**Contract**: Run in terminal:
```bash
npm install @supabase/supabase-js @supabase/ssr
npm install --save-dev supabase
```

#### 3. Initialize Supabase CLI and link to remote project

**File**: `supabase/config.toml` (created by CLI)

**Intent**: Create the `supabase/` directory structure and link the CLI to the remote project so `supabase db push` knows the target.

**Contract**: Run in sequence:
```bash
npx supabase init
npx supabase login
npx supabase link --project-ref <project-ref>
```
`project-ref` is the string after `supabase.co/project/` in the dashboard URL (e.g. `abcdefghijklmnop`).

#### 4. Populate `.env.local` with Supabase credentials

**File**: `.env.local` (new file, gitignored)

**Intent**: Provide credentials to the app and to `supabase gen types` in Phase 4.

**Contract**: Copy `.env.example` → `.env.local`; fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL` (transaction pooler URL). Verify `.env.local` appears in `.gitignore` (should already be there from Next.js scaffold).

### Success Criteria

#### Automated Verification

- `npx supabase status` exits 0 and prints the linked project ref
- `npm run build` exits 0 (no new errors from SDK install)
- `npm run lint` exits 0

#### Manual Verification

- Supabase dashboard shows the project in EU West (Frankfurt) region
- `.env.local` is not tracked by git (`git status` shows it as untracked)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 2. The Supabase project must be live before `supabase db push` can run in Phase 4.

---

## Phase 2: Migration 001 — ENUMs + Tables + Indexes

### Overview

Write the foundational schema migration: 4 ENUMs, 12 tables in FK-safe dependency order, and all mandatory indexes from the roadmap matrix (§3.3 of `context/foundation/implementation_roadmap.md`).

### Changes Required

#### 1. Create migration file 001

**File**: `supabase/migrations/20260626000001_initial_schema.sql`

**Intent**: Define all database objects the application depends on. The circular FK between `rooms` and `reservations` is resolved by adding the `room_active_reservation_id` column via `ALTER TABLE` after both tables exist.

**Contract**: Structure of the file in order:

```
Section 0 — Extension
  CREATE EXTENSION IF NOT EXISTS vector;

Section 1 — ENUMs (4)
  hotel_role:         'owner' | 'admin' | 'staff' | 'viewer'
  qr_type:            'reception' | 'room'
  order_status:       'new' | 'confirmed' | 'fulfilled' | 'rejected'
  reservation_status: 'pending' | 'checked_in' | 'checked_out' | 'cancelled'

Section 2 — Tables (FK-safe order)
  properties          PK only; no app-table FKs
  hotel_users         → properties ON DELETE CASCADE
  rooms               → properties ON DELETE CASCADE
                        (room_active_reservation_id omitted here; added via ALTER TABLE below)
  reservations        → properties ON DELETE CASCADE
                        room_id REFERENCES rooms(id)  — nullable (set at check-in)
  ALTER TABLE rooms   ADD COLUMN room_active_reservation_id UUID REFERENCES reservations(id);
                        ADD COLUMN valid_from TIMESTAMPTZ;
                        ADD COLUMN valid_until TIMESTAMPTZ;
  qr_codes            → properties ON DELETE CASCADE
                        room_id REFERENCES rooms(id)  — nullable (only for type='room')
  sessions            → properties ON DELETE CASCADE
                        reservation_id REFERENCES reservations(id) ON DELETE CASCADE
                        room_id REFERENCES rooms(id)  — nullable (set after room QR scan)
                        auth_user_id REFERENCES auth.users(id)  — nullable (Supabase anonymous user)
  services            → properties ON DELETE CASCADE
  orders              → properties ON DELETE CASCADE
                        session_id REFERENCES sessions(id)      — nullable
                        reservation_id REFERENCES reservations(id) — nullable
                        room_id REFERENCES rooms(id)            — nullable
                        service_id REFERENCES services(id) NOT NULL
  knowledge_chunks    → properties ON DELETE CASCADE
  audit_logs          — standalone; property_id UUID (no FK constraint; append-only)
  platform_config     — standalone (key TEXT PRIMARY KEY)
  job_queue           — standalone; property_id UUID nullable (no FK constraint; service_role only)

Section 3 — Indexes (all from roadmap §3.3 matrix)
  properties:         PK covers id; no additional index needed
  hotel_users:        (property_id), (property_id, role)
  reservations:       (property_id), (property_id, check_out), (invite_token)
  sessions:           (property_id), (reservation_id), (expires_at)
  rooms:              (property_id), (property_id, room_number)
  qr_codes:           (property_id), (property_id, type), (init_token)
  services:           (property_id), (property_id, category, is_active)
  orders:             (property_id), (property_id, status), (session_id)
  knowledge_chunks:   (property_id), (property_id, category)
  audit_logs:         (property_id, created_at), (actor_id)
  job_queue:          (status, run_at)
```

Full column definitions follow the synthesis SQL in `context/research/synthesis/roadmap-identity-panel.md §2.2` exactly, with these additions:

- `properties.dpa_signed_at TIMESTAMPTZ` — HITL #11; NULL = DPA not signed; blocks QR generation
- `knowledge_chunks.embedding vector(1536)` — column present; value stays NULL on MVP (HITL #12)

### Success Criteria

#### Automated Verification

- `npx supabase db lint` exits 0 (no lint warnings on the migration file)

#### Manual Verification

- Migration file reviewed: all 12 tables present, `room_active_reservation_id` added via `ALTER TABLE`, `dpa_signed_at` present on `properties`, `embedding vector(1536)` present on `knowledge_chunks`, all indexes from the roadmap matrix included

**Implementation Note**: Pause for manual review before Phase 3.

---

## Phase 3: Migration 002 — RLS Policies + `set_tenant_context` Function

### Overview

Second migration: create `set_tenant_context`, enable RLS on the 9 tenant tables, define guest-isolation policies (current_setting pattern) and staff-management policies (auth.uid() pattern), and block platform-only tables from non-service-role access.

### Changes Required

#### 1. Create migration file 002

**File**: `supabase/migrations/20260626000002_rls_policies.sql`

**Intent**: Lock down the database so a request with tenant A's context can never see tenant B's rows. Guest policies rely on `current_setting('app.property_id', true)` set by S0.3 middleware. Staff policies rely on `auth.uid()` resolved by Supabase Auth JWT. Platform tables (`audit_logs`, `platform_config`, `job_queue`) are restricted to service_role.

**Contract**: Structure in order:

```
1. set_tenant_context function
   Signature: (p_property_id uuid, p_session_id uuid DEFAULT NULL) RETURNS void
   Language: plpgsql SECURITY DEFINER
   Body: set_config('app.property_id', p_property_id::text, true)
         IF p_session_id IS NOT NULL THEN set_config('app.session_id', p_session_id::text, true)
   Access: REVOKE ALL ON FUNCTION set_tenant_context FROM PUBLIC;
           GRANT EXECUTE ON FUNCTION set_tenant_context TO service_role;

2. Enable RLS on 9 tenant tables
   ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
   ALTER TABLE hotel_users ENABLE ROW LEVEL SECURITY;
   ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
   ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
   ALTER TABLE qr_codes ENABLE ROW LEVEL SECURITY;
   ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
   ALTER TABLE services ENABLE ROW LEVEL SECURITY;
   ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
   ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;

3. Guest isolation policies (current_setting, FOR SELECT unless noted)

   properties:
     guest_read_own_property FOR SELECT
       USING (id = current_setting('app.property_id', true)::uuid)

   hotel_users, rooms, qr_codes, services, knowledge_chunks:
     guest_read_{table} FOR SELECT
       USING (property_id = current_setting('app.property_id', true)::uuid)

   reservations:
     guest_read_own_reservation FOR SELECT
       USING (property_id = current_setting('app.property_id', true)::uuid
              AND id = (SELECT reservation_id FROM sessions
                        WHERE id = current_setting('app.session_id', true)::uuid
                        AND NOT revoked LIMIT 1))

   sessions:
     guest_read_own_session FOR SELECT
       USING (id = current_setting('app.session_id', true)::uuid)

   orders (guest can read own + insert):
     guest_read_own_orders FOR SELECT
       USING (session_id = current_setting('app.session_id', true)::uuid)
     guest_insert_orders FOR INSERT WITH CHECK
       (property_id = current_setting('app.property_id', true)::uuid
        AND session_id = current_setting('app.session_id', true)::uuid)

4. Staff management policies (FOR ALL, auth.uid() + hotel_users join)
   Per table: FOR ALL USING (
     property_id IN (
       SELECT property_id FROM hotel_users
       WHERE auth_user_id = auth.uid() AND status = 'active'
     )
   )
   Applied to: hotel_users, reservations, rooms, qr_codes, sessions,
               services, orders, knowledge_chunks

   properties (staff scope):
     staff_read_own_property FOR SELECT USING (
       id IN (SELECT property_id FROM hotel_users
              WHERE auth_user_id = auth.uid() AND status = 'active'))
     staff_update_own_property FOR UPDATE USING (same) WITH CHECK (same)

5. Platform table access restriction
   REVOKE ALL ON audit_logs FROM anon, authenticated;
   REVOKE ALL ON platform_config FROM anon, authenticated;
   REVOKE ALL ON job_queue FROM anon, authenticated;
   REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
```

The `is_local = true` flag in `set_config` is load-bearing — see Critical Implementation Details above.

### Success Criteria

#### Automated Verification

- `npx supabase db push` exits 0 (both migration files applied)
- `npm run typecheck` exits 0 (no TypeScript errors; no app code imports DB types yet)

#### Manual Verification

- Supabase dashboard → Authentication → Policies: RLS badge (🔒) shown on all 9 tenant tables
- SQL editor: `SELECT policyname, tablename FROM pg_policies WHERE tablename = 'services';` returns at least `guest_read_services` and `staff_all_services`
- SQL editor: `SELECT routine_name FROM information_schema.routines WHERE routine_name = 'set_tenant_context';` returns one row

**Implementation Note**: Pause for manual review of policies in the Supabase dashboard before Phase 4.

---

## Phase 4: Apply Migrations + TypeScript Types + IT-3 Verification

### Overview

Apply both migrations to the remote project, generate TypeScript types, create minimal Supabase client stubs for S0.3 to extend, create the IT-3 SQL test script, and run it to confirm tenant isolation is airtight.

### Changes Required

#### 1. Apply migrations

**File**: n/a (remote Supabase project state)

**Intent**: Synchronise the remote Supabase project schema with the two migration files.

**Contract**:
```bash
npx supabase db push
```
If the command reports "remote migration history is ahead of local" (e.g. Supabase auto-ran a migration), use `npx supabase db pull` first to reconcile, then `db push`.

#### 2. Generate TypeScript database types

**File**: `lib/supabase/database.types.ts` (new file, auto-generated)

**Intent**: Provide type-safe DB access from S0.3 onward; generated once now, regenerated whenever schema changes.

**Contract**:
```bash
mkdir -p lib/supabase
npx supabase gen types typescript --project-id <project-ref> --schema public > lib/supabase/database.types.ts
```

#### 3. Create Supabase client stubs

**File**: `lib/supabase/server.ts` and `lib/supabase/client.ts`

**Intent**: Establish the two import paths the rest of the codebase will use. These are intentionally minimal now; S0.3 extends `server.ts` with cookie-based session handling and middleware integration.

**Contract**: 
- `server.ts`: export `createServerClient` using `@supabase/ssr` with env vars from `process.env`; import `Database` type from `./database.types`
- `client.ts`: export `createBrowserClient` using `@supabase/ssr` with `NEXT_PUBLIC_*` vars; import `Database` type

Both files follow the `@supabase/ssr` cookie-based patterns; S0.3 wires the actual cookie read/write callbacks.

#### 4. Create IT-3 tenant isolation SQL test

**File**: `supabase/tests/it3_tenant_isolation.sql`

**Intent**: Satisfy the DoD: prove that a query running with `app.property_id = A` returns 0 rows belonging to property B, for every RLS-enabled table. Runs via `psql` against the remote direct-connection URL.

**Contract**: The script runs inside a single transaction that is always rolled back (no persistent test data). It:
1. Inserts two test properties (A and B) and one sample row in each tenant table for property B
2. Calls `set_config('app.property_id', property_a_id::text, true)` (simulates middleware)
3. Uses `SET LOCAL ROLE anon` to engage RLS (postgres superuser bypasses RLS; anon does not)
4. For each of the 9 tenant tables runs `SELECT COUNT(*) WHERE property_id = property_b_id` — asserts result is 0
5. On any failure: `RAISE EXCEPTION 'IT-3 FAILED: <table> leaked <n> rows'`
6. On full success: `RAISE NOTICE 'IT-3 PASSED: tenant isolation verified across 9 tables'`
7. `ROLLBACK` at the end cleans up all test data

Key non-obvious ordering: `set_config` must be called BEFORE `SET LOCAL ROLE anon` within the same transaction — `set_config` as postgres sets the variable at session scope (`is_local=false` in this test context so it survives the role switch); then anon-role queries read it via `current_setting`.

Run command:
```bash
# Direct connection URL (not transaction pooler) — from Supabase dashboard → Settings → Database → Direct connection
psql "postgresql://postgres.<password>@db.<project-ref>.supabase.co:5432/postgres" \
  -f supabase/tests/it3_tenant_isolation.sql
```

### Success Criteria

#### Automated Verification

- `npx supabase db push` idempotent on second run: prints "No changes found, skipping migration"
- `lib/supabase/database.types.ts` exists and is non-empty
- `npm run typecheck` exits 0

#### Manual Verification

- IT-3 SQL script exits 0 and the output contains "IT-3 PASSED: tenant isolation verified across 9 tables"
- Supabase dashboard → Table Editor: all 12 tables visible with the correct columns

---

## Testing Strategy

### Manual Testing Steps

1. Run `npx supabase db push` and confirm 0 errors, both migrations listed as applied
2. Open Supabase dashboard SQL editor; run `SELECT * FROM properties LIMIT 1;` — should return 0 rows (empty table); no error means table exists
3. Run `SELECT policyname, cmd FROM pg_policies ORDER BY tablename, policyname;` — review all policies are present for each of the 9 tenant tables
4. Run IT-3 test script via `psql` as described in Phase 4

## Migration Notes

- This is the first migration; no existing data to migrate or transform
- The `rooms ↔ reservations` circular FK is resolved by the ALTER TABLE pattern in migration 001 — any future schema tool regenerating from scratch must preserve this ordering
- `embedding vector(1536)` column intentionally stays NULL in all rows on MVP; no vector index is created (pgvector must still be enabled for the column type to parse)

## References

- Full SQL definitions: `context/research/synthesis/roadmap-identity-panel.md §2.2`
- RLS patterns and benchmarks: `context/research/session_06/multitenant-patterns.md §3`
- Security patterns for sessions/cookies: `context/research/session_06/security-qr-sessions.md §5`
- Table matrix (RLS vs service_role): `context/foundation/implementation_roadmap.md §3.3`
- Session scope and DoD: `context/foundation/session-plan.md §S0.2`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Supabase Project + CLI + SDK Setup

#### Automated

- [x] 1.1 `npx supabase status` exits 0, prints linked project ref — 3da4d01
- [x] 1.2 `npm run build` exits 0 — 3da4d01
- [x] 1.3 `npm run lint` exits 0 — 3da4d01

#### Manual

- [x] 1.4 Supabase dashboard shows project in EU West (Frankfurt) region — 3da4d01
- [x] 1.5 `.env.local` is not tracked by git — 3da4d01

### Phase 2: Migration 001 — ENUMs + Tables + Indexes

#### Automated

- [x] 2.1 `npx supabase db lint` exits 0 — f3f0606

#### Manual

- [x] 2.2 Migration file reviewed: all 12 tables, correct FKs, `dpa_signed_at` on properties, `embedding vector(1536)` on knowledge_chunks, all indexes present — f3f0606

### Phase 3: Migration 002 — RLS Policies + `set_tenant_context` Function

#### Automated

- [x] 3.1 `npx supabase db push` exits 0 (both migrations applied)
- [x] 3.2 `npm run typecheck` exits 0

#### Manual

- [x] 3.3 Supabase dashboard: RLS active (🔒) on all 9 tenant tables
- [x] 3.4 SQL editor: `pg_policies` returns guest + staff rows for `services`
- [x] 3.5 SQL editor: `set_tenant_context` appears in `information_schema.routines`

### Phase 4: Apply Migrations + TypeScript Types + IT-3 Verification

#### Automated

- [ ] 4.1 `npx supabase db push` idempotent (second run: "No changes found")
- [ ] 4.2 `lib/supabase/database.types.ts` exists and is non-empty
- [ ] 4.3 `npm run typecheck` exits 0

#### Manual

- [ ] 4.4 IT-3 SQL script prints "IT-3 PASSED: tenant isolation verified across 9 tables"
- [ ] 4.5 Supabase Table Editor: all 12 tables visible with correct columns
