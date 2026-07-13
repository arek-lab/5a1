---
change_id: s4-2
title: Integracja GPT-4o-mini + SSE streaming + semantic cache
status: implementing
created: 2026-07-13
updated: 2026-07-13
archived_at: null
---

## Notes

Źródło: `context/foundation/session-plan.md`, sekcja S4.2.

**Scope:** `/api/concierge/stream` (runtime="nodejs", dynamic="force-dynamic"). Payload: SYSTEM PROMPT + HOTEL KB + CONVERSATION 6–10 tur. GPT-4o-mini SSE. Semantic cache Upstash: próg 0,90–0,95, TTL ~1h. Logowanie: tylko `session_id` (brak PII). Cel <1,5 s; alert >5 s.

**DoD:** czat streamuje; semantic cache hit <400 ms; żaden PII do OpenAI.

**Blokery:** S4.1, S3.1.

**Adnotacja (2026-07-13, decyzja HITL podczas `/10x-plan`):** semantic cache (Upstash Vector + embeddings, próg 0,90–0,95) **odroczony poza MVP** — KB pojedynczego hotelu jest na tyle małe, że sam prompt injection jest szybszy i tańszy do wdrożenia teraz; prawdziwe semantyczne dopasowanie wymagałoby nowej infrastruktury (embeddings + Upstash Vector index), której ta sesja nie buduje. Zamiast tego: stub `lib/concierge/semantic-cache.ts` (zawsze cache-miss) zarezerwowany pod przyszłą implementację. Zaktualizowane DoD tej sesji: czat streamuje token-po-tokenie; żaden PII do OpenAI (strukturalnie wymuszone sygnaturą funkcji); brak automatycznego testu latencji (mockowany OpenAI w testach czyniłby taki test bez znaczenia) — weryfikacja manualna zamiast `semantic cache hit <400 ms`. Pełne uzasadnienie: `context/changes/s4-2/plan.md` (sekcja "What We're NOT Doing").
