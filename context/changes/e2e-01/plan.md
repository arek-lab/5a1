# Playwright E2E-01 — happy path gościa: plan implementacji

## Overview

Automatyzacja gate'u przed pilotem (roadmapa §9.3, §9.5; B3 z `context/foundation/mvp-pilot-blockers-plan.md`): jeden deterministyczny test Playwright odtwarzający happy path gościa (skan QR → zamówienie → status „złożone") przeciwko lokalnemu buildowi produkcyjnemu z seedowanym hotelem testowym, plus osobny job w CI.

## Current State Analysis

- Playwright niezainstalowany; zero testów E2E. Happy path weryfikowany manualnie wg `context/foundation/smoke-test-e2e01.md`.
- Przepływ auth gościa (zweryfikowany w kodzie i `lib/scan/__tests__/it-2.test.ts`):
  1. `GET /api/scan/reception?init_token=<token>` → tworzy sesję anonimową (auth_level 1), ustawia cookie `__Host-session`, redirect na `/`.
  2. `GET /api/scan/room?room_id=<uuid>` (z cookie z kroku 1) → step-up do auth_level 2, przypina rezerwację, redirect na `/`.
  Skan pokoju **wymaga** istniejącego cookie — test musi wykonać oba kroki w tej kolejności.
- Strony gościa: `/` (home), `/c/[category]/[service]` (szczegóły usługi + modal `components/guest/order-confirm-modal.tsx`), `/order-success`, `/my-orders`.
- Wzorzec seedu istnieje w `lib/scan/__tests__/it-2.test.ts` (beforeAll/afterAll przez `createServiceRoleClient()`): property (z `dpa_signed_at`!), room, reservation (`checked_in`, okno dat pokrywające now), `rooms.room_active_reservation_id` + `valid_from/valid_until`, qr_codes (reception single-use + room multi-use). Teardown musi najpierw zerwać cykliczny FK `rooms.room_active_reservation_id`.
- `reservations.guest_first_name` (migracja `20260626000001_initial_schema.sql:77`) zasila „Witaj [Imię]" — seed musi go ustawić.
- Vitest (`vitest.config.ts`) używa domyślnego include `**/*.{test,spec}.*` — plik `e2e/*.spec.ts` zostałby złapany przez `npm test`; wymagany exclude `e2e/**`.
- Env: `.env.local` (Supabase URL + klucze) ładowany przez `loadEnv` w vitest; Next ładuje go sam. Skrypt seedu Playwright musi go załadować jawnie — `@next/env` (`loadEnvConfig`) jest dostępny jako zależność Next, bez dodawania `dotenv`.
- CI (`.github/workflows/ci.yml`): joby lint / type-check / test (unit) / bundle-budget; wzorzec: checkout → setup-node 24 + cache npm → `npm ci`. Sekrety Supabase użyte w `bundle-budget`.

## Desired End State

- `npx playwright test` lokalnie: zielony test `e2e/e2e-01-happy-path.spec.ts` przeciwko `next start` (build produkcyjny) na seedowanym hotelu testowym.
- Osobny job `e2e` w CI, niezależny od unit testów, czerwony gdy happy path pada.
- `npm test` (vitest) nie próbuje wykonywać plików z `e2e/`.

### Key Discoveries:

- Dwustopniowe wejście gościa: reception → room (`app/api/scan/room/route.ts:23-26` — brak cookie = redirect na error).
- Cookie `__Host-session` ma atrybut `Secure` — Chromium traktuje `http://localhost` jako trustworthy origin, więc cookie działa w Playwright bez HTTPS.
- Pełny wzorzec fixture + teardown do skopiowania: `lib/scan/__tests__/it-2.test.ts:18-99`.
- Vitest złapałby `*.spec.ts` — exclude konieczny w tej samej zmianie co pierwszy spec.

## What We're NOT Doing

- E2E-02..09 (język, offline, SSE, token wygasły, AI czat, 5xx retry) — SHOULD/COULD wg roadmapy, poza scope.
- Testów SSE inboxu panelu (krok 5-6 checklisty manualnej) — E2E-01 wg roadmapy §9.3 kończy się na „Moje zamówienia" ze statusem „złożone".
- Firefox/WebKit — chromium wystarczy na start (B3 krok 4).
- Zmian w kodzie aplikacji — jeśli test ujawni bug, osobny change.
- Uruchamiania E2E przeciwko prod (Railway) — smoke-test manualny pozostaje procedurą prodową.

## Implementation Approach

Cztery fazy: (1) infrastruktura Playwright + odcięcie vitest, (2) seed/teardown hotelu testowego jako Playwright global setup/teardown, (3) sam test, (4) job CI. Test wchodzi przez URL-e tokenów (bez fizycznego skanu), asercje pokrywają HITL #1 (gość nic nie wpisuje) i HITL #5 (zero pola karty).

## Critical Implementation Details

- **Kolejność wejścia**: reception-token URL musi być odwiedzony przed room URL — inaczej `missing_session_cookie`. Reception token jest single-use; seed musi tworzyć świeży token per przebieg testu (global setup), nie reużywać.
- **Rate limit skanu**: `checkScanRateLimit` (Upstash) — zweryfikować, że bez env Upstash przepuszcza (fallback). Jeśli w `.env.local` są klucze Upstash, powtarzane przebiegi lokalne mogą wpaść w limit — w razie potrzeby dedykowany bypass NIE wchodzi w grę (bez zmian w kodzie aplikacji); wystarczy odstęp/limit tolerancyjny.
- **Współdzielona baza**: seed używa tej samej bazy Supabase co testy integracyjne — identyfikuj fixture po unikalnej nazwie property (np. `E2E-01 Test Property`), teardown kasuje wyłącznie po property_id, wzorem `it-2.test.ts` (najpierw `room_active_reservation_id = null`).
- **Serwer pod test**: build produkcyjny (`npm run build` + `npm run start`), nie dev — HMR/webpack dev nie jest reprezentatywny i wolniejszy. `webServer` w playwright.config z `reuseExistingServer: !process.env.CI`.

## Phase 1: Infrastruktura Playwright

### Overview

Instalacja i konfiguracja @playwright/test; vitest przestaje widzieć katalog `e2e/`.

### Changes Required:

#### 1. Zależność + skrypty

**File**: `package.json`

**Intent**: `@playwright/test` w devDependencies; skrypt `test:e2e` = `playwright test`.

**Contract**: `npm i -D @playwright/test`; nowy skrypt nie zmienia istniejących (`test`, `test:unit`).

#### 2. Konfiguracja Playwright

**File**: `playwright.config.ts`

**Intent**: chromium-only, baseURL z env, webServer uruchamiający build produkcyjny, global setup/teardown (Faza 2).

**Contract**: `baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000'`; `testDir: 'e2e'`; projekt `chromium` (Desktop Chrome lub Pixel — mobilny viewport bliższy realowi, decyzja implementera); `webServer: { command: 'npm run start', url: baseURL, reuseExistingServer: !process.env.CI }` (build wykonywany osobno przed testem — lokalnie ręcznie/skryptem, w CI osobnym krokiem); `globalSetup`/`globalTeardown` wskazują na `e2e/fixtures/seed.ts`. Trace/screenshot on-failure.

#### 3. Odcięcie vitest od e2e/

**File**: `vitest.config.ts`

**Intent**: `npm test` nie może próbować wykonywać speców Playwright.

**Contract**: `test.exclude` = domyślne excludy vitest + `e2e/**` (importować `configDefaults.exclude` z `vitest/config`).

### Success Criteria:

#### Automated Verification:

- `npm run typecheck` przechodzi
- `npm test` przechodzi i nie wykonuje żadnego pliku z `e2e/` (liczba plików testowych bez zmian)
- `npx playwright test --list` nie zgłasza błędu konfiguracji

#### Manual Verification:

- brak

---

## Phase 2: Seed i teardown hotelu testowego

### Overview

Global setup tworzy kompletny hotel testowy przez service-role (poza RLS — to przygotowanie fixture, sam test przechodzi przez realny auth flow gościa); global teardown sprząta po property_id.

### Changes Required:

#### 1. Seed/teardown

**File**: `e2e/fixtures/seed.ts`

**Intent**: Odtworzyć fixture z `it-2.test.ts` + usługa zamawialna + imię gościa; przekazać do testu reception token i room_id.

**Contract**: `loadEnvConfig(process.cwd())` z `@next/env` przed importem klienta service-role. Seed: property (`dpa_signed_at` ustawione), room, reservation (`status: 'checked_in'`, `guest_first_name` np. „Anna", okno dat pokrywające now), aktualizacja rooms (`room_active_reservation_id`, `valid_from`, `valid_until`), reception QR (świeży `init_token`, TTL 15 min), room QR (multi-use), min. 1 usługa w `services` (kolumny wg `lib/supabase/database.types.ts`; dostępna/aktywna, z ceną). Wynik (init_token, room_id, category/service slug do nawigacji) zapisany do `e2e/fixtures/.seed-state.json` (gitignored) — spec czyta plik. Teardown: delete wg property_id w kolejności z `it-2.test.ts:90-99` + orders + services.

#### 2. Gitignore stanu seedu

**File**: `.gitignore`

**Intent**: `.seed-state.json` oraz artefakty Playwright (`playwright-report/`, `test-results/`) poza repo.

**Contract**: trzy wpisy.

### Success Criteria:

#### Automated Verification:

- Skrypt seedu odpalony samodzielnie (`npx tsx` lub przez `playwright test --list` z globalSetup) tworzy i sprząta fixture bez błędów; po teardown zero wierszy z property testowego

#### Manual Verification:

- brak

---

## Phase 3: Test e2e/e2e-01-happy-path.spec.ts

### Overview

Jeden spec odtwarzający E2E-01 z roadmapy §9.3.

### Changes Required:

#### 1. Spec

**File**: `e2e/e2e-01-happy-path.spec.ts`

**Intent**: Pełny happy path z asercjami HITL #1 i #5.

**Contract**: Kroki (jeden test, sekwencyjny):
1. `page.goto('/api/scan/reception?init_token=<token>')` → oczekiwany landing na home (`/` lub `/{locale}`).
2. `page.goto('/api/scan/room?room_id=<id>')` → landing na home, sesja auth_level 2.
3. Home: widoczne powitanie z imieniem z seedu („Witaj Anna" / odpowiednik i18n — selektor po roli/tekście z `messages/pl.json`), widoczne kategorie.
4. Nawigacja: kategoria → usługa → szczegóły (nazwa + cena z seedu).
5. Modal zamówienia: CTA „Dopisz do rachunku" (tekst z `messages/pl.json`); **asercja HITL #5**: w modalu brak `input` typu card/number (zero pól płatności); złożenie zamówienia.
6. `/order-success` widoczny; przejście do „Moje zamówienia": zamówienie ze statusem „złożone".
7. **Asercja HITL #1**: przez cały przebieg test nie wykonał żadnego `fill()`/`type()` — strukturalnie zagwarantowane (brak takich wywołań w specu) + jawna asercja, że ścieżka zamówienia nie zawiera wymaganych pustych pól formularza.
Selektory: user-facing (getByRole/getByText wg `messages/pl.json`), nie klasy CSS. Timeout per-step domyślny Playwrighta; bez arbitrary sleepów — auto-waiting.

### Success Criteria:

#### Automated Verification:

- `npm run build` a potem `npx playwright test` lokalnie: 1 passed
- Test powtórzony drugi raz z rzędu: passed (determinizm — świeży token z seedu per run)
- `npm test` nadal zielony

#### Manual Verification:

- Przejrzenie trace/report Playwrighta: kroki odpowiadają checkliście `smoke-test-e2e01.md` poz. 1-4 i „Moje zamówienia"

---

## Phase 4: Job e2e w CI

### Overview

Osobny job, niezależny od unit testów, wg wzorca istniejących jobów.

### Changes Required:

#### 1. Workflow

**File**: `.github/workflows/ci.yml`

**Intent**: Job `e2e`: checkout → setup-node 24 + cache → `npm ci` → `npx playwright install chromium --with-deps` → `npm run build` (z sekretami Supabase jak w `bundle-budget`) → `npx playwright test` (te same env + `SUPABASE_SECRET_KEY` dla seedu). Upload `playwright-report/` jako artifact przy porażce.

**Contract**: `continue-on-error` nie ustawione (twardy gate od razu — test jest jeden i deterministyczny, B3 krok 6). Uwaga: CI używa tej samej bazy Supabase co lokalnie — teardown po property_id zapobiega śmieciom; kolizje nazw property między równoległymi runami CI/lokalnymi są akceptowalnym ryzykiem MVP (unikalna nazwa per run z sufiksem np. run id mile widziana).

### Success Criteria:

#### Automated Verification:

- Job `e2e` zielony na PR z tym change'em

#### Manual Verification:

- Sprawdzenie w UI GitHub Actions, że job jest osobny od `test` i że artifact reportu pojawia się przy porażce (można zweryfikować wymuszając porażkę na gałęzi roboczej — opcjonalne)

---

## Testing Strategy

### Unit Tests:

- Brak nowych — change dodaje warstwę E2E; istniejące 411 testów musi pozostać zielone.

### Integration Tests:

- Bez zmian; seed E2E nie może kolidować z fixture'ami IT (osobna nazwa property).

### Manual Testing Steps:

1. `npm run build && npx playwright test` — 1 passed, obejrzeć report.
2. `npm test` — pakiet vitest bez zmian ilościowych.
3. Push gałęzi → job `e2e` zielony w Actions.

## Performance Considerations

Jeden test, build + start + seed: budżet ~5-8 min w CI. Bez wpływu na runtime aplikacji.

## Migration Notes

Brak migracji. Po zielonym CI: checklista manualna `smoke-test-e2e01.md` pozostaje procedurą prodową (E2E nie biega przeciw prod), ale przestaje być jedynym gate'em regresji — odnotować w `mvp-pilot-blockers-plan.md` B3 DoD (post-start) jako spełnione.

## References

- B3: `context/foundation/mvp-pilot-blockers-plan.md:71-89`
- Scenariusz + asercje: `context/foundation/implementation_roadmap.md:687` (E2E-01), §9.3, §9.5
- Checklista manualna: `context/foundation/smoke-test-e2e01.md`
- Wzorzec seedu: `lib/scan/__tests__/it-2.test.ts:18-99`
- Wejście auth: `app/api/scan/room/route.ts`, `app/api/scan/reception/route.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Infrastruktura Playwright

#### Automated

- [x] 1.1 `npm run typecheck` przechodzi — 06d7610
- [x] 1.2 `npm test` przechodzi bez wykonywania plików z `e2e/` — 06d7610
- [x] 1.3 `npx playwright test --list` bez błędu konfiguracji — 06d7610

### Phase 2: Seed i teardown hotelu testowego

#### Automated

- [x] 2.1 Seed + teardown przebiegają czysto; po teardown zero wierszy property testowego — 6ef1327

### Phase 3: Test e2e-01-happy-path

#### Automated

- [x] 3.1 `npx playwright test` lokalnie: 1 passed — 4cd5efc
- [x] 3.2 Drugi przebieg z rzędu: passed (determinizm) — 4cd5efc
- [x] 3.3 `npm test` nadal zielony — 4cd5efc

#### Manual

- [ ] 3.4 Trace/report odpowiada checkliście smoke-test poz. 1-4 + „Moje zamówienia"

### Phase 4: Job e2e w CI

#### Automated

- [x] 4.1 Job `e2e` zielony na PR — 79567ab

#### Manual

- [ ] 4.2 Job osobny od `test` w Actions; artifact reportu przy porażce
