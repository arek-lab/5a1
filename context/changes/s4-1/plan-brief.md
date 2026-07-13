# KB Composition Pipeline + Redis Cache — Plan Brief

> Full plan: `context/changes/s4-1/plan.md`

## What & Why

The AI concierge (S4.2) needs a single Markdown "Hotel Knowledge Base" block to inject into its SYSTEM PROMPT (prompt-injection architecture, HITL #12 — no RAG on MVP). This session builds the pipeline that assembles that block from the property's FAQ, area info, services, menu, and policy content, and caches it in Redis so every concierge turn doesn't re-query and re-render from scratch.

## Starting Point

`knowledge_chunks` (FAQ + area/"okolica" only, written by S2.4) and `services` (S2.3) already hold the raw content, each with its own RLS policies. Nothing composes them into one document yet, and no cache layer exists — this is greenfield. Menu and policy categories are modeled in the schema but nothing writes them yet.

## Desired End State

Any part of the codebase (starting with S4.2) can call one function and get back the current, correctly-ordered, correctly-filtered Markdown KB for a property — freshly rendered if anything changed since the last call, served from cache if nothing did.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Cache invalidation | Lazy hash-compare on every read | Avoids wiring explicit invalidation calls into S2.3/S2.4/future editors — correctness by construction instead of by remembering hooks |
| Tenant data access | RLS-scoped client via existing `withTenantContext()` | Matches CLAUDE.md's RLS-not-service-role rule and reuses the pattern already used by other guest routes |
| Cached value | Fully rendered Markdown string | S4.2 just reads-and-injects; matches the roadmap's literal framing |
| Cache TTL | 24h backstop on top of hash invalidation | Bounds any latent invalidation bug to at most a day, at negligible cost |
| Services → hash | Hash serialized fields on read (no schema change) | Keeps this session's scope to the composer; `services` gets no new column |
| Empty sections | Omit heading entirely | Keeps token budget tight and avoids the AI reading an empty section as meaningful |
| IT-9 scope | Seed all 5 conceptual sections synthetically | Proves the full §6.1 ordering now, so future menu/policy editor sessions don't need to revisit composer logic |
| Services included | All active services, not just pinned "Polecamy" | The concierge must answer about anything on offer, not just the 3 featured picks |

## Scope

**In scope:** fetch + validity-window filter + fixed ordering + composite hash + Markdown render + Redis cache wrapper + IT-9.

**Out of scope:** `/api/concierge/*` route, SYSTEM PROMPT assembly, semantic (Q&A) cache — all S4.2. Menu/policy editor UI. Any `services` schema migration. pgvector/embeddings.

## Architecture / Approach

Two layers: (1) pure functions — fetch, hash, render — independently unit-testable without DB or Redis; (2) a thin `getOrComposeKb(headers)` wrapper that always fetches+hashes fresh, compares against the Redis-cached hash, and only re-renders/re-stores when they differ.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. KB Composer Core | Pure fetch/hash/render functions, unit tested | Getting the composite-hash row ordering deterministic |
| 2. Redis Cache Layer + IT-9 | `getOrComposeKb()` wired to real RLS client + Redis, full IT-9 | Redis env/config must already work in test env (should, since S1.3 already exercises it) |

**Prerequisites:** S2.4 (knowledge_chunks + hashing) must be done — it is (`status: implemented`). Upstash Redis env vars already configured from S1.3.
**Estimated effort:** ~1 session, 2 phases.

## Open Risks & Assumptions

- Every `getOrComposeKb` call still does one DB read even on a cache hit (accepted tradeoff, not a bug).
- Menu/policies sections have zero production data until a future session builds their editors — IT-9 seeds them synthetically to validate ordering ahead of that.

## Success Criteria (Summary)

- IT-9 passes with active RLS.
- Editing a FAQ row changes the hash and forces a fresh render on the next call.
- Composed Markdown always follows FAQ→services→menu→policies→area ordering, with empty sections omitted.
