# Playwright E2E-01 — Plan Brief

> Full plan: `context/changes/e2e-01/plan.md`

## What & Why

Automatyzacja happy path gościa (skan QR → zamówienie → status „złożone") jako test Playwright + osobny job CI. To B3 (część docelowa) z `mvp-pilot-blockers-plan.md`; roadmapa nazywa E2E-01 „MUST, gate przed pilotem". Dziś jedyną weryfikacją jest manualna checklista na prodzie.

## Starting Point

Playwright niezainstalowany, zero E2E. Istnieje kompletny wzorzec seedu fixture w `lib/scan/__tests__/it-2.test.ts` i dwustopniowy przepływ auth (reception token → room step-up), przez który test wejdzie URL-ami, bez fizycznego skanu.

## Desired End State

`npx playwright test` lokalnie i w CI: 1 zielony test odtwarzający pełną ścieżkę gościa na buildzie produkcyjnym z seedowanym hotelem testowym. Czerwony job blokuje PR.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Zakres | Tylko E2E-01 (happy path), bez SSE panelu i E2E-02..09 | Roadmapa §9.3: E2E-01 kończy się na „Moje zamówienia"; reszta to SHOULD/COULD | Roadmapa |
| Przeglądarka | Chromium only | B3 krok 4: „chromium wystarczy na start" | Blockers-plan |
| Serwer pod test | `npm run build` + `next start`, nie dev | Reprezentatywność + szybkość; webServer z `reuseExistingServer` lokalnie | Plan |
| Seed | Playwright globalSetup przez service-role, teardown po property_id | Wzorzec `it-2.test.ts`; test sam przechodzi realny auth flow | Plan |
| Env | `.env.local` ładowany przez `@next/env` (bez nowego pakietu `dotenv`) | `@next/env` już dostępne jako zależność Next | Plan |
| Vitest vs spec | Exclude `e2e/**` w vitest.config | Domyślny include vitest złapałby `*.spec.ts` | Plan |
| CI | Osobny job `e2e`, twardy gate (bez continue-on-error) | B3 krok 6: test jest jeden i deterministyczny | Blockers-plan |

## Scope

**In scope:** instalacja @playwright/test, `playwright.config.ts`, seed/teardown (`e2e/fixtures/seed.ts`), `e2e/e2e-01-happy-path.spec.ts` (z asercjami HITL #1 „gość nic nie wpisał" i HITL #5 „zero pola karty"), job `e2e` w CI.

**Out of scope:** E2E-02..09, testy SSE inboxu, Firefox/WebKit, jakiekolwiek zmiany w kodzie aplikacji, E2E przeciw prod.

## Architecture / Approach

globalSetup seeduje hotel (property z DPA + pokój + rezerwacja z imieniem + QR recepcji/pokoju + usługa) i zapisuje token/id do pliku stanu → spec wchodzi `GET /api/scan/reception?init_token=…`, potem `/api/scan/room?room_id=…`, dalej klika przez UI (selektory user-facing wg `messages/pl.json`) aż do „Moje zamówienia" → globalTeardown kasuje po property_id.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Infrastruktura | Playwright + config, vitest odcięty od `e2e/` | vitest include złapie spec, jeśli exclude pominięty |
| 2. Seed/teardown | Powtarzalny hotel testowy | kolizje ze wspólną bazą Supabase (mitygacja: unikalna nazwa property, sprzątanie po id) |
| 3. Spec E2E-01 | Zielony happy path lokalnie | rate-limit Upstash przy powtórnych przebiegach; i18n selektory |
| 4. Job CI | Twardy gate na PR | czas jobu (build+seed, ~5-8 min); sekrety Supabase w env jobu |

**Prerequisites:** `.env.local` z kluczami Supabase (jest); sekrety Supabase w GitHub (są — używa ich `bundle-budget`).
**Estimated effort:** ~1 sesja (4 fazy, największa: Faza 3).

## Open Risks & Assumptions

- Zakładamy, że `checkScanRateLimit` przepuszcza bez env Upstash / nie blokuje powtórnych przebiegów lokalnych — do weryfikacji w Fazie 3.
- CI i lokalne przebiegi współdzielą jedną bazę Supabase — akceptowalne dla MVP przy sprzątaniu po property_id.

## Success Criteria (Summary)

- `npx playwright test`: 1 passed, dwa razy z rzędu (determinizm).
- Job `e2e` zielony na PR; czerwony gdy happy path pada.
- `npm test` (411 testów) bez zmian.
