# KB Composition Pipeline + Redis Cache — Implementation Plan

## Overview

Build the pipeline that turns a property's raw knowledge (`knowledge_chunks` rows + active `services`) into the single Markdown "Hotel Knowledge Base" block that S4.2 will inject into the concierge SYSTEM PROMPT. The pipeline filters by `property_id` and validity window, orders sections per roadmap §6.1 (FAQ → usługi → menu → polityki → okolica), computes a composite content hash, and caches the rendered Markdown in Upstash Redis keyed by `property_id` — invalidating itself automatically whenever the underlying data changes.

## Current State Analysis

- `knowledge_chunks` (`supabase/migrations/20260626000001_initial_schema.sql:159-171`) holds `property_id, category, question, content, language, valid_from, valid_until, content_hash, embedding`. Only `category IN ('faq', 'local')` is written today (S2.4); `restaurant` and `policies` are documented in the roadmap frontmatter but nothing writes them yet.
- Services live in a separate `services` table (`supabase/migrations/20260626000001_initial_schema.sql:126-141`: `property_id, name, description, category, price_cents, currency, is_active, is_pinned, available_from, available_to, is_time_sensitive, ...`) — not in `knowledge_chunks`.
- Per-row `content_hash` already exists for `knowledge_chunks` (`lib/panel/knowledge-hash.ts`, SHA-256 of `content`), computed on every insert/update from the panel. `services` has no equivalent column.
- RLS: `guest_read_knowledge_chunks` policy already scopes guest reads to `current_setting('app.property_id')` (`supabase/migrations/20260626000002_rls_policies.sql:73-76`). The established pattern for obtaining an RLS-scoped client from `x-property-id`/`x-session-id` request headers is `withTenantContext(headers)` (`lib/supabase/tenant.ts`), already used by other guest-facing routes.
- Redis is already wired: `getRedis()` (`lib/rate-limit/client.ts`) is a lazy singleton over `@upstash/redis`'s REST client. S4.1 reuses it directly — no new client needed.
- Fully greenfield otherwise: no `lib/kb/` directory, no composer/cache/render code exists.

## Desired End State

A `lib/kb/` module exposes `getOrComposeKb(headers)` returning `{ markdown, hash, cacheHit }` for the calling property. Editing any FAQ, area, service, menu, or policy row changes the composite hash on the next call, which forces a fresh render and Redis write; unchanged data returns the cached Markdown without re-rendering. IT-9 exercises this against a real Supabase branch + real Upstash Redis instance, seeding all 5 conceptual sections (even the two — menu/policies — that no other session writes yet) to prove ordering.

Verification: `npm run test -- lib/kb` passes, including IT-9; `npm run typecheck` and `npm run lint` pass.

### Key Discoveries:

- `services` rows need a hash computed on read (no stored column) — serialize the fields that affect rendering (`name, description, price_cents, currency, category, available_from, available_to`) and hash that string per row.
- `withTenantContext(headers)` already returns a client with `app.property_id`/`app.session_id` set via the `set_tenant_context` RPC (`supabase/migrations/20260626000002_rls_policies.sql:10`) — reuse it rather than building a parallel access path.
- IT tests in this codebase are real-infrastructure integration tests (`lib/<domain>/__tests__/it-N.test.ts`, Vitest, seed via `createServiceRoleClient()`, exercise real app code) — see `lib/orders/__tests__/it-7.test.ts` for the pattern this plan follows.

## What We're NOT Doing

- No `/api/concierge/*` route or SYSTEM PROMPT assembly — that's S4.2.
- No semantic (question→answer) cache — that's a separate Upstash Redis cache built in S4.2, not this pipeline.
- No UI for editing menu/policies categories — those categories remain writable only via direct DB insert (as IT-9 does) until a future session builds their editors.
- No schema migration on `services` (no `content_hash` column added) — the composite hash treats it as a derived, on-read hash instead.
- No embeddings/pgvector activation — `knowledge_chunks.embedding` stays NULL per HITL #12.

## Implementation Approach

Split the composer into pure, DB-free logic (fetch → order → hash → render, each independently unit-testable) and a thin caching wrapper that ties it to `withTenantContext` + `getRedis()`. The cache wrapper always re-fetches and re-hashes on every call (no invalidation hooks to wire into S2.3/S2.4/future editors), but only re-renders Markdown when the hash actually changed versus what's cached — avoiding both stale-cache bugs and wasted render work on true cache hits.

## Critical Implementation Details

**State sequencing**: `getOrComposeKb` must fetch raw rows and compute the hash *before* deciding whether to render. Order: (1) fetch filtered `knowledge_chunks` + `services` rows via the RLS-scoped client, (2) compute the composite hash from per-row hashes in the fixed section order, (3) `GET` the cached `{hash, markdown}` from Redis, (4) if `cached.hash === freshHash`, return `cached.markdown` with `cacheHit: true` and skip rendering entirely; otherwise render fresh Markdown, `SET` it to Redis with a 24h TTL, and return `cacheHit: false`.

## Phase 1: KB Composer Core (pure logic)

### Overview

Fetch, filter, order, hash, and render — all as pure functions taking an already-scoped Supabase client and returning data structures / strings. No Redis involved yet.

### Changes Required:

#### 1. Types

**File**: `lib/kb/types.ts`

**Intent**: Shared shape for a "section" (one conceptual group: faq / services / restaurant / policies / local) and its rendered rows, used by fetch, hash, and render.

**Contract**: `KbSectionKey = 'faq' | 'services' | 'restaurant' | 'policies' | 'local'`; `KB_SECTION_ORDER: KbSectionKey[]` fixed to `['faq', 'services', 'restaurant', 'policies', 'local']` per roadmap §6.1. A `KbRow` carries whatever fields render/hash need (`content`, optional `question`, and either a stored `hash` or enough raw fields to derive one).

#### 2. Fetch

**File**: `lib/kb/fetch.ts`

**Intent**: Query `knowledge_chunks` (categories `faq`, `local`, `restaurant`, `policies`) and `services` (`is_active = true`) for a property, filtering each row by its validity window (`valid_from`/`valid_until` for `knowledge_chunks`, `available_from`/`available_to` for `services`) against the current timestamp — `NULL` on either bound means unbounded on that side.

**Contract**: `fetchKbSections(client, propertyId): Promise<Record<KbSectionKey, KbRow[]>>`, ordered within each section by `created_at` ascending.

#### 3. Hash

**File**: `lib/kb/hash.ts`

**Intent**: Composite content hash over the whole composed KB, so any change to any row (add/edit/remove, or a row crossing its validity window) changes the hash.

**Contract**: `computeCompositeHash(sections: Record<KbSectionKey, KbRow[]>): string` — walks sections in `KB_SECTION_ORDER`, and within each section in fetch order, using each `knowledge_chunks` row's existing stored `content_hash` and, for `services` rows, a freshly computed SHA-256 of the serialized fields (`name|description|price_cents|currency|category|available_from|available_to`); concatenates all per-row hashes in that fixed order and SHA-256s the result.

#### 4. Render

**File**: `lib/kb/render.ts`

**Intent**: Produce the final Markdown block matching the §6.1 frontmatter/body style, one `##` heading per non-empty section; a row with a non-null `question` renders as a Q&A pair (`**Q:** ...` / answer), a row without one renders its `content` as-is (whole-document style, matching the roadmap's menu/policy example). Sections with zero rows are omitted entirely (no heading).

**Contract**: `renderKbMarkdown(sections: Record<KbSectionKey, KbRow[]>): string`.

#### 5. Compose orchestrator

**File**: `lib/kb/compose.ts`

**Intent**: Tie fetch → hash → render together for callers (Phase 2's cache layer, and Phase 1's own tests) that need the full pipeline without caching.

**Contract**: `composeKb(client, propertyId): Promise<{ sections: Record<KbSectionKey, KbRow[]>; hash: string; markdown: string }>`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test -- lib/kb/hash lib/kb/render`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- None — this phase is pure logic with no external dependencies; unit tests are sufficient.

---

## Phase 2: Redis Cache Layer + IT-9

### Overview

Wire the Phase 1 composer to `withTenantContext` (RLS-scoped read) and `getRedis()` (cache), implementing the lazy hash-compare invalidation with a 24h TTL backstop, and prove the whole pipeline end-to-end with IT-9.

### Changes Required:

#### 1. Cache wrapper

**File**: `lib/kb/cache.ts`

**Intent**: Public entry point other sessions (S4.2) call to get the current KB Markdown for the requesting property, transparently handling caching and invalidation.

**Contract**: `getOrComposeKb(headers: Pick<Headers, 'get'>): Promise<{ markdown: string; hash: string; cacheHit: boolean }>`. Internally: obtain `client = await withTenantContext(headers)` and `propertyId` from the validated `x-property-id` header; fetch + hash per the Critical Implementation Details sequencing above; Redis key `kb:<property_id>`, value `{ hash, markdown }` JSON, `EX 86400`.

#### 2. Integration test IT-9

**File**: `lib/kb/__tests__/it-9.test.ts`

**Intent**: Prove ordering across all 5 sections (seeding synthetic `restaurant`/`policies` rows directly since no editor writes them yet), validity-window filtering, tenant isolation, hash-change-triggers-re-render, and true cache-hit-skips-render — following the `createServiceRoleClient()` seed + real-infra pattern from `lib/orders/__tests__/it-7.test.ts`.

**Contract**: Seed two properties (A, B). For A: seed `faq` (2 rows), `local` (1 row), `restaurant` (1 row), `policies` (1 row) into `knowledge_chunks`, including one expired row (`valid_until` in the past) to prove exclusion; seed `services` with one active-and-current row, one `is_active=false` row, and one outside its `available_from/available_to` window. For B: seed one distinct `faq` row. Assertions:
  - First `getOrComposeKb` call for A: markdown contains all 5 section headings in the fixed §6.1 order (assert via relative `indexOf`), excludes the expired/inactive/out-of-window rows, and contains none of B's content; `cacheHit` is `false`.
  - Second immediate call for A with no data changes: `cacheHit` is `true` and returned `markdown`/`hash` are identical to the first call.
  - After updating one FAQ row's `content` (and its `content_hash`, mirroring what the panel action does) via `createServiceRoleClient()`: next call returns a different `hash`, updated `markdown`, and `cacheHit: false`.
  - Redis TTL: after any `SET`, `getRedis().ttl('kb:<propertyId>')` is `> 0` and `<= 86400`.
  - Cleanup in `afterAll`: delete seeded rows and the Redis key for both properties.

### Success Criteria:

#### Automated Verification:

- Integration test passes: `npm run test -- lib/kb/__tests__/it-9.test.ts`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- Run IT-9 locally against the real Supabase branch + Upstash Redis instance and eyeball the composed Markdown for a seeded test property to confirm section order and Q&A formatting read naturally as concierge-ready context.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `hash.ts`: same input sections produce the same hash; changing any single row's content/hash changes the composite hash; empty sections don't crash.
- `render.ts`: Q&A rows vs whole-document rows render differently; empty sections produce no heading; section order is always `KB_SECTION_ORDER` regardless of input map key order.

### Integration Tests:

- IT-9 (see Phase 2) — the full fetch→hash→render→cache→invalidate roundtrip against real Supabase + real Upstash Redis.

### Manual Testing Steps:

1. Run IT-9 and manually inspect the composed Markdown output for readability.
2. Confirm no property-B content ever appears in property-A's composed KB.

## Performance Considerations

Every `getOrComposeKb` call does one DB round-trip (fetch + hash) regardless of cache state — an accepted tradeoff (see plan-brief) to avoid wiring invalidation hooks into every KB-writing session. Rendering (the more expensive step) is skipped on true cache hits.

## Migration Notes

None — no schema changes in this session.

## References

- Roadmap KB pipeline spec: `context/foundation/implementation_roadmap.md:439-469` (§6.1)
- IT-9 definition: `context/foundation/implementation_roadmap.md:682`
- Session scope: `context/foundation/session-plan.md` (S4.1)
- Similar IT pattern: `lib/orders/__tests__/it-7.test.ts`
- RLS tenant context helper: `lib/supabase/tenant.ts`
- Redis client: `lib/rate-limit/client.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: KB Composer Core (pure logic)

#### Automated

- [x] 1.1 Unit tests pass: `npm run test -- lib/kb/hash lib/kb/render`
- [x] 1.2 Type checking passes: `npm run typecheck`
- [x] 1.3 Linting passes: `npm run lint`

### Phase 2: Redis Cache Layer + IT-9

#### Automated

- [ ] 2.1 Integration test passes: `npm run test -- lib/kb/__tests__/it-9.test.ts`
- [ ] 2.2 Type checking passes: `npm run typecheck`
- [ ] 2.3 Linting passes: `npm run lint`

#### Manual

- [ ] 2.4 Run IT-9 locally against real Supabase + Upstash Redis and eyeball composed Markdown for section order and Q&A formatting
