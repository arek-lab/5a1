# GPT-4o-mini Concierge Integration + SSE Streaming — Plan Brief

> Full plan: `context/changes/s4-2/plan.md`

## What & Why

Give the guest a working AI concierge: a `/api/concierge/stream` route that streams GPT-4o-mini answers grounded in the hotel's Knowledge Base (prompt-injection architecture, HITL #12), plus a real chat UI at `/concierge` replacing the S3.1 placeholder. This is the first of 3 AI Concierge sessions (S4.1 built the KB pipeline; S4.3 will add fallback/escalation UX polish).

## Starting Point

S4.1 (`getOrComposeKb()`) already renders a property's Markdown KB and caches it in Redis — that's the sole KB integration point here. `/concierge` is a static placeholder page; the floating Concierge button already links to it. No OpenAI client, no chat persistence, and no semantic cache exist anywhere in the codebase yet.

## Desired End State

A guest opens `/concierge`, asks a question, and sees GPT-4o-mini's answer stream in token-by-token. The OpenAI payload never contains guest name/email/room/reservation data. Rate-limit and error conditions degrade gracefully to a single fallback bubble pointing the guest to reception — never a hung UI or raw error.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Semantic (Q&A) cache | **Skipped for MVP** — stub call site only | HITL call during planning: KB is small, prompt-only ships faster/cheaper; true semantic caching needs new embeddings+Vector infra not worth building yet | Plan (HITL) |
| Transport | POST + `fetch` ReadableStream, not `EventSource` | `EventSource` can't send a request body; each turn needs a variable-length question + history | Plan |
| Conversation history | Stateless, client-held (no new table) | Matches prompt-injection philosophy; avoids scope-creeping into retention/RLS/export design this session doesn't have time for | Plan |
| PII guard | Structural — payload composer's function signature only accepts systemPrompt+KB+free-text history | No guest/reservation field is ever fetched in this code path, so there's nothing to forget to redact | Plan |
| Chat UI scope | Build the real chat UI now, not just the API | DoD ("czat streamuje") needs a human-verifiable surface; establishes the component S4.3 extends | Plan |
| Rate limiting | Per-session sliding window (new `lib/rate-limit/concierge.ts`) | Bounds OpenAI spend per guest session, matches the existing S1.3 pattern | Plan |
| Latency alerting | Sentry breadcrumb/message on >5s | Reuses already-live monitoring infra; no new alerting channel | Plan |
| Stream error handling | Catch → single `[FALLBACK]`-style SSE error event → close | Guest never sees a raw error or hung spinner; one fallback code path for both model- and infra-triggered fallback | Plan |
| System prompt storage | Versioned code constant (`lib/concierge/system-prompt.ts`) | Platform owns prompt correctness (HITL #9); no admin UI needed or built | Plan |
| Test strategy | Mock OpenAI stream in all automated tests | Avoids costly/flaky real API calls in CI, matches no-other-paid-API-in-tests convention | Plan |

## Scope

**In scope:** `/api/concierge/stream` (POST, SSE), system prompt + payload composer, session-keyed rate limiter, semantic-cache stub (unwired-but-present), guest chat UI at `/concierge`, i18n strings, Sentry latency signal, `openai` dependency + env vars.

**Out of scope:** semantic/embedding caching (deferred, stub only), conversation persistence, fallback escalation / 3-strike routing / Quick Reply chips / richer transparency UI (all S4.3), admin-editable system prompt, RAG/pgvector/embeddings, CAPTCHA on rate limit.

## Architecture / Approach

Client (`concierge-chat.tsx`) POSTs `{question, history}` → route authenticates via existing header-injection pattern (`withTenantContext`) → rate-limit check → `getOrComposeKb()` for KB markdown → compose OpenAI messages (system prompt + KB + history, PII-free by construction) → stream GPT-4o-mini response as custom SSE JSON frames → client reads via `fetch` + `ReadableStreamDefaultReader`, rendering tokens progressively and swapping to a fallback bubble on `[FALLBACK]`/error.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Concierge Core (lib) | System prompt, payload composer, cache stub, rate limiter, OpenAI client wrapper — all unit-tested | Payload composer's PII-free contract must hold by construction, not just by test |
| 2. `/api/concierge/stream` Route | Authenticated, rate-limited, streaming route with clean error/fallback framing | Getting the mocked-OpenAI test setup right without ever hitting the real API in CI |
| 3. Guest Chat UI | Real streaming chat replacing the `/concierge` placeholder | Correctly detecting `[FALLBACK]` mid-stream without flashing raw model text first |
| 4. Wiring & Verification | Dependency/env wiring, full suite, manual PII/latency/fallback checks | Manual PII inspection is the only real guardrail against a payload-composer regression later |

**Prerequisites:** S4.1 (KB composer) — done. S3.1 (guest session guard, floating Concierge button) — Phases 1-4 done (Phase 5 polish still open, not a blocker).
**Estimated effort:** ~1 session, 4 phases.

## Open Risks & Assumptions

- No conversation persistence means the roadmap's "AI chat → checkout+7d" retention cron (§7.3, IT-8) has nothing to act on yet for chat data — an explicit gap for whoever adds persistence later.
- No automated latency regression protection (mocking OpenAI in tests makes a latency assertion meaningless); the <1.5s/>5s budget relies on manual spot-checks and the Sentry breadcrumb in production.
- If a guest volunteers PII in free text (e.g. types their email), it reaches OpenAI as-is — no free-text scrubbing is added this session (matches how guest input isn't sanitized elsewhere in the app either).

## Success Criteria (Summary)

- Guest sees GPT-4o-mini's answer stream in token-by-token at `/concierge`.
- OpenAI payload provably contains zero guest-identifying fields.
- Rate-limit and error paths degrade to one graceful fallback bubble, never a raw error or hang.
