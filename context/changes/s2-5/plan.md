# Zarządzanie QR (Moduł 4) — Implementation Plan

## Overview

Budujemy panel zarządzania QR w module hotelowym: kartę QR recepcji z auto-rotacją co 5 min i rotacją ręczną, listę pokoi z przełącznikiem aktywności QR pokojowego, licznik aktywnych sesji na bieżącym QR recepcji, oraz blokadę całego modułu gdy `properties.dpa_signed_at IS NULL` (HITL #11). Backend (`generateReceptionQR`, `generateRoomQR`, `deactivateRoomQR`, bramka DPA) już istnieje z S1.1 — ta sesja dodaje warstwę server actions z RBAC, UI panelu oraz test IT-6.

## Current State Analysis

- `lib/qr/generate.ts` — kompletna logika S1.1: `generateReceptionQR`, `generateRoomQR`, `deactivateRoomQR`, `checkDpa`/`DpaNotSignedError`. Wszystkie używają `createServiceRoleClient()` (operacja uprzywilejowana po stronie panelu, nie ścieżka gościa). Brak zmian potrzebnych w tym pliku.
- `lib/qr/image.ts` — `generateQRImage(url)` zwraca SVG string.
- `lib/panel/rbac.ts` — macierz uprawnień już zawiera `qr_manage` (owner/admin/staff: `full`, viewer: `none`) i `qr_sessions` (viewer: `read`). Brak zmian.
- RLS: `staff_all_qr_codes` (property match przez `auth_user_property_ids()`) i `staff_all_rooms` już istnieją i pozwalają zalogowanemu `hotel_users` na odczyt/zapis w obrębie własnego property.
- Brak modułu `/qr` w panelu — katalog `app/[locale]/(hotel)/qr/` nie istnieje. Wzorzec do skopiowania: `app/[locale]/(hotel)/services/` (`page.tsx` + `*-list.tsx` client + `actions.ts`).
- Tabela `sessions` nie ma FK do `qr_codes` — licznik aktywnych sesji będzie liczony po `reception_scan_at >= created_at` bieżącego aktywnego QR recepcji (patrz Key Discoveries).
- Brak wspólnego komponentu nawigacji panelu — każdy moduł jest niezależną stroną, więc `/qr` nie wymaga wpięcia w istniejący nav.

### Key Discoveries:

- `lib/panel/auth.ts:14` (`getHotelUser`) i `lib/panel/rbac.ts:36` (`canPerform`) to jedyne źródła roli/property w panelu — każda strona/akcja modułu je wywołuje.
- `app/[locale]/(hotel)/services/actions.ts:12-18` (`requireServicesWriteAccess`) to wzorzec do powielenia jako `requireQrWriteAccess` (resource `qr_manage`, level `write`).
- `app/[locale]/(hotel)/services/service-list.tsx:51-57` (`handleToggleActive` + `useTransition`) to gotowy wzorzec przełącznika `is_active` — analogiczny dla QR pokoju.
- `supabase/tests/s2_4_knowledge_staff_isolation.sql` to najnowszy wzorzec testu RLS (staff read/update/delete leak, `SET LOCAL ROLE authenticated` + `request.jwt.claims`), bezpośrednio powielany dla `qr_codes`.
- `lib/scan/__tests__/it-2.test.ts` to wzorzec testu integracyjnego "IT-N" z realnym Supabase (seed przez service-role w `beforeAll`, `ROLLBACK`/cleanup w `afterAll`) — analogiczny wzorzec dla `it-6.test.ts`.
- `lib/qr/__tests__/generate.test.ts:129,175` już testuje `DpaNotSignedError` na poziomie unit (mock) — IT-6 dokłada realny test integracyjny (bez mocków) tego samego zachowania plus test izolacji tenantowej.

## Desired End State

Staff/Admin/Owner widzi w panelu stronę `/qr` z: (1) kartą QR recepcji pokazującą aktualny kod, licznik czasu do następnej auto-rotacji, przycisk ręcznej rotacji; (2) licznikiem aktywnych sesji na bieżącym QR recepcji; (3) listą wszystkich pokoi property z przełącznikiem aktywuj/dezaktywuj QR pokoju. Gdy `dpa_signed_at IS NULL`, cała strona pokazuje komunikat blokady zamiast UI. Viewer nie ma dostępu do zapisu (przyciski niewidoczne/disabled zgodnie z `qr_manage: none`). Test IT-6 (nowy plik integracyjny + klon SQL izolacji) przechodzi.

**Weryfikacja końcowa:** `npm run build` przechodzi; `npm run test` (vitest) przechodzi łącznie z nowym `it-6.test.ts`; `psql "$DATABASE_URL" -f supabase/tests/s2_5_qr_staff_isolation.sql` kończy się `S2.5 PASSED`; ręczny test w przeglądarce — rotacja ręczna generuje nowy QR i unieważnia poprzedni, dezaktywacja pokoju blokuje `/api/scan/room`, licznik sesji zgadza się z liczbą aktywnych `sessions`.

## What We're NOT Doing

- Generowanie PDF z QR pokoi do druku (SHOULD, płatna opcja zespołu platformy) — TODO poza tą sesją.
- Podgląd/rewokacja pojedynczych aktywnych sesji (COULD) — TODO poza tą sesją.
- Real-time odświeżanie licznika sesji (SSE/polling) — licznik odświeża się tylko przy przeładowaniu strony.
- Revokowanie istniejących sesji gościa przy ręcznej dezaktywacji QR pokoju (to zachowanie early check-out z S1.3, nie tej sesji) — dezaktywacja blokuje tylko nowe skany.
- Wspólny komponent nawigacji panelu — nie istnieje dziś w żadnym module, nie wprowadzamy go tutaj.
- Zmiany w `lib/qr/generate.ts`, `lib/scan/*`, RBAC matrix czy RLS policies — wszystkie są już gotowe i wystarczające.

## Implementation Approach

Faza 1 buduje warstwę serwerową (server actions opakowujące istniejące funkcje S1.1 w RBAC + obsługę błędu DPA, zapytanie licznika sesji) oraz test IT-6 — całość testowalna bez UI. Faza 2 dodaje UI panelu konsumujący tę warstwę, wzorowany 1:1 na module `services/`.

## Phase 1: Server actions, session counter i test IT-6

### Overview

Warstwa serwerowa modułu QR: RBAC-owane server actions do rotacji/aktywacji/dezaktywacji QR, zapytanie liczące aktywne sesje na bieżącym QR recepcji, oraz test integracyjny IT-6 (bramka DPA) i klon testu izolacji RLS dla `qr_codes`.

### Changes Required:

#### 1. Server actions modułu QR

**File**: `app/[locale]/(hotel)/qr/actions.ts` (nowy)

**Intent**: Opakować `generateReceptionQR`, `generateRoomQR`, `deactivateRoomQR` z `lib/qr/generate.ts` w RBAC (`qr_manage`, poziom `write`) i zwrócić przyjazny błąd `{error: 'dpaNotSigned'}` zamiast rzucać `DpaNotSignedError` do klienta — analogicznie do `requireServicesWriteAccess` + `ActionResult` w `services/actions.ts`.

**Contract**: Trzy eksportowane `'use server'` funkcje: `rotateReceptionQR(): Promise<ActionResult>`, `activateRoomQR(roomId: string): Promise<ActionResult>`, `deactivateRoomQR(roomId: string): Promise<ActionResult>` (nazwa lokalna inna niż import z `lib/qr/generate` żeby uniknąć konfliktu — np. re-eksport funkcji lib jako `deactivateRoomQRLib`). Każda: `requireQrWriteAccess()` → jeśli brak, `{error: 'forbidden'}`; wywołanie funkcji z `lib/qr/generate.ts` w `try/catch`; `catch (e) { if (e instanceof DpaNotSignedError) return {error: 'dpaNotSigned'}; throw e }`; po sukcesie `revalidatePath('/qr')`.

#### 2. Licznik aktywnych sesji

**File**: `lib/qr/session-count.ts` (nowy)

**Intent**: Policzyć aktywne sesje gościa powiązane z bieżącym aktywnym QR recepcji, zgodnie z decyzją: brak FK sessions→qr_codes, więc liczymy po czasie utworzenia bieżącego QR.

**Contract**: `getActiveReceptionSessionCount(propertyId: string): Promise<number>`. Kroki: (1) pobierz `qr_codes` gdzie `property_id`, `type='reception'`, `is_active=true`, weź `created_at` (jeśli brak wiersza, zwróć `0`); (2) `COUNT` z `sessions` gdzie `property_id`, `auth_level >= 1`, `revoked = false`, `expires_at > now()`, `reception_scan_at >= <created_at z kroku 1>`. Używa `createServerClient()` (user-scoped, RLS) — czytane w kontekście strony panelu, więc `staff_all_sessions`/`staff_all_qr_codes` (property match) muszą wystarczyć; nie wymaga service-role.

#### 3. Test integracyjny IT-6 (bramka DPA, real DB)

**File**: `lib/qr/__tests__/it-6.test.ts` (nowy)

**Intent**: Zweryfikować end-to-end na realnym Supabase (nie mock), że property bez `dpa_signed_at` nie może aktywować QR, a po podpisaniu DPA — może. Domyka DoD "IT-6 przechodzi" ponad istniejące unit testy (mockowane) w `generate.test.ts`.

**Contract**: Wzorzec `beforeAll`/`afterAll` z `lib/scan/__tests__/it-2.test.ts` (seed przez `createServiceRoleClient()`, sprzątanie po teście). Scenariusze: (1) seed property z `dpa_signed_at: null` → `generateReceptionQR(propertyId)` rzuca `DpaNotSignedError`; (2) `UPDATE properties SET dpa_signed_at = now()` → kolejne wywołanie `generateReceptionQR` zwraca wiersz `qr_codes` z `is_active: true`; (3) analogiczny test dla `generateRoomQR` na seed pokoju.

#### 4. Test izolacji RLS dla `qr_codes` (klon S2.4)

**File**: `supabase/tests/s2_5_qr_staff_isolation.sql` (nowy)

**Intent**: Potwierdzić, że staff property A nie widzi/nie modyfikuje `qr_codes` property B — wzorzec "aktywne RLS" wymagany przez `CLAUDE.md` dla wszystkich tabel tenantowych.

**Contract**: Dosłowny klon `supabase/tests/s2_4_knowledge_staff_isolation.sql` z podmienioną tabelą na `qr_codes` (kolumny: `type`, `room_id` zamiast `category`/`question`/`content`). Bez scenariusza DELETE (aplikacja nigdy nie usuwa wierszy `qr_codes`, tylko `is_active=false`) — zamiast tego trzeci scenariusz to próba `UPDATE ... SET is_active = false` na cudzym wierszu (leak zapisu dezaktywacji). `BEGIN`/`SET LOCAL session_replication_role = 'replica'`/`ROLLBACK` jak w oryginale.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Unit/integration tests pass: `npm run test` (obejmuje nowy `it-6.test.ts`)
- [ ] SQL izolacja RLS: `psql "$DATABASE_URL" -f supabase/tests/s2_5_qr_staff_isolation.sql` kończy się `RAISE NOTICE 'S2.5 PASSED'`

#### Manual Verification:

- [ ] Wywołanie `rotateReceptionQR()` jako viewer zwraca `{error: 'forbidden'}`
- [ ] Wywołanie `rotateReceptionQR()` na property bez DPA zwraca `{error: 'dpaNotSigned'}`
- [ ] `getActiveReceptionSessionCount` zwraca poprawną liczbę po ręcznym seedzie sesji w lokalnej bazie Supabase

---

## Phase 2: UI panelu QR

### Overview

Strona `/qr` w panelu hotelowym: blokada DPA, karta QR recepcji z auto-rotacją i rotacją ręczną, lista pokoi z przełącznikiem aktywności, licznik sesji.

### Changes Required:

#### 1. Strona modułu QR

**File**: `app/[locale]/(hotel)/qr/page.tsx` (nowy)

**Intent**: Server component wzorowany 1:1 na `services/page.tsx` — pobiera `hotelUser`, sprawdza `dpa_signed_at`, pobiera dane (aktywny QR recepcji, pokoje + ich aktywny QR, licznik sesji) i renderuje blokadę DPA albo panel.

**Contract**: `getHotelUser()` → redirect `/login` jeśli brak. `createServerClient()` odczytuje `properties.dpa_signed_at` dla `hotelUser.propertyId`; jeśli `null`, renderuje wewnątrz `RequirePermission` blok z komunikatem blokady (i18n `qr.dpaBlocked.*`) zamiast reszty UI — bez przekierowania na `/unauthorized` (to inny stan niż brak uprawnień). Jeśli DPA podpisane: pobiera aktywny QR recepcji (`qr_codes` gdzie `type='reception', is_active=true`), listę `rooms` (`id, room_number, room_type`) z dołączonym aktywnym QR pokoju (osobne zapytanie lub `select` z joinem), `getActiveReceptionSessionCount(propertyId)`. `canEdit = canPerform(hotelUser.role, 'qr_manage', 'write')`. Renderuje `<QrPanel />` (client) z tymi danymi jako props.

#### 2. Panel kliencki QR

**File**: `app/[locale]/(hotel)/qr/qr-panel.tsx` (nowy, `'use client'`)

**Intent**: Interaktywna karta QR recepcji (obraz, countdown, przycisk rotacji ręcznej + auto-rotacja co 5 min) i lista pokoi z przełącznikiem aktywności, wzorowane na `service-list.tsx` (`useTransition` + `startTransition` wołające server actions, error banner `role="alert"`, `statusBadgeClass`-style pigułki dla `is_active`).

**Contract**: Props: `receptionQr: {id, created_at, expires_at} | null`, `rooms: {id, room_number, activeQr: {id} | null}[]`, `sessionCount: number`, `canEdit: boolean`. Auto-rotacja: `useEffect` z `setInterval(() => startTransition(() => rotateReceptionQR()), 5*60*1000)` (czyszczony w cleanup), niezależnie od tego czy `canEdit` — jeśli `!canEdit`, przycisk ręcznej rotacji i przełączniki pokoi nie renderują się (analogicznie do `canEdit &&` w `service-list.tsx`). Countdown liczony po stronie klienta z `receptionQr.expires_at` (bez dodatkowego zapytania). Obraz QR: `generateQRImage` z `lib/qr/image.ts` wywołane po stronie serwera w `page.tsx` (SVG string przekazany jako prop, nie generowany w kliencie).

#### 3. Tłumaczenia i18n

**File**: `messages/pl.json`, `messages/en.json`

**Intent**: Dodać namespace `qr` z etykietami strony (tytuł, karta recepcji, countdown, przycisk rotacji, blokada DPA, lista pokoi, aktywuj/dezaktywuj, licznik sesji), wzorowane na strukturze namespace `services`.

**Contract**: Nowy top-level klucz `"qr": { "page": {...}, "reception": {...}, "rooms": {...}, "dpaBlocked": {...} }` w obu plikach, spójne klucze PL/EN.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build passes: `npm run build`

#### Manual Verification:

- [ ] Wejście na `/qr` jako Owner/Admin/Staff pokazuje kartę QR recepcji, listę pokoi i licznik sesji
- [ ] Wejście na `/qr` gdy `dpa_signed_at IS NULL` pokazuje komunikat blokady zamiast UI
- [ ] Kliknięcie "Rotuj teraz" generuje nowy QR recepcji i poprzedni staje się `is_active=false`
- [ ] Po 5 minutach QR recepcji rotuje automatycznie bez akcji użytkownika (obserwacja w dev, można skrócić interwał tymczasowo do testu manualnego)
- [ ] Dezaktywacja QR pokoju → kolejny skan `/api/scan/room` dla tego pokoju zwraca błąd `room_qr_not_found`
- [ ] Viewer widzi stronę w trybie tylko-odczyt (brak przycisków rotacji/przełączników)

---

## Testing Strategy

### Unit Tests:

- `getActiveReceptionSessionCount` — brak aktywnego QR recepcji → `0`; sesje sprzed rotacji nieuwzględnione; sesje `revoked`/wygasłe nieuwzględnione.
- Server actions `qr/actions.ts` — `forbidden` dla viewer, `dpaNotSigned` przy braku DPA, `revalidatePath` wywołane przy sukcesie.

### Integration Tests:

- `lib/qr/__tests__/it-6.test.ts` (Phase 1) — bramka DPA na realnej bazie.
- `supabase/tests/s2_5_qr_staff_isolation.sql` (Phase 1) — izolacja tenantowa `qr_codes`.

### Manual Testing Steps:

1. Zalogować się jako Staff property bez podpisanego DPA → potwierdzić blokadę strony `/qr`.
2. Podpisać DPA (ustawić `dpa_signed_at` ręcznie w bazie) → odświeżyć `/qr` → potwierdzić dostęp do UI.
3. Kliknąć "Rotuj teraz" → zeskanować stary QR (po URL/tokenie) → potwierdzić odrzucenie (token unieważniony).
4. Dezaktywować QR wybranego pokoju → zeskanować → potwierdzić odrzucenie skanu.
5. Zalogować się jako Viewer → potwierdzić brak przycisków akcji na `/qr`.

## Performance Considerations

Brak — moduł operuje na pojedynczych zapytaniach per property (liczba pokoi rzędu dziesiątek), zgodnie z rekomendacją braku paginacji na tę sesję.

## Migration Notes

Brak migracji schematu — wszystkie wymagane kolumny (`qr_codes.*`, `properties.dpa_signed_at`) już istnieją z S0.2/S1.1.

## References

- Session scope: `context/foundation/session-plan.md` (S2.5, linie 95–98)
- Moduł 4 (funkcje + priorytety): `context/foundation/implementation_roadmap.md` (linie 287–294)
- HITL #11 (DPA gate): `context/foundation/implementation_roadmap.md` (linia 537, 568)
- IT-6 (definicja testu): `context/foundation/implementation_roadmap.md` (linia 679)
- RBAC macierz QR: `context/foundation/implementation_roadmap.md` (linia 323–324), `lib/panel/rbac.ts:25-26`
- Wzorzec modułu: `app/[locale]/(hotel)/services/`
- Wzorzec testu izolacji RLS: `supabase/tests/s2_4_knowledge_staff_isolation.sql`
- Wzorzec testu integracyjnego real-DB: `lib/scan/__tests__/it-2.test.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Server actions, session counter i test IT-6

#### Automated

- [x] 1.1 Type checking passes: `npm run typecheck`
- [x] 1.2 Linting passes: `npm run lint`
- [x] 1.3 Unit/integration tests pass: `npm run test` (obejmuje nowy `it-6.test.ts`)
- [x] 1.4 SQL izolacja RLS: `psql "$DATABASE_URL" -f supabase/tests/s2_5_qr_staff_isolation.sql` kończy się `S2.5 PASSED`

#### Manual

- [ ] 1.5 Wywołanie `rotateReceptionQR()` jako viewer zwraca `{error: 'forbidden'}`
- [ ] 1.6 Wywołanie `rotateReceptionQR()` na property bez DPA zwraca `{error: 'dpaNotSigned'}`
- [ ] 1.7 `getActiveReceptionSessionCount` zwraca poprawną liczbę po ręcznym seedzie sesji w lokalnej bazie Supabase

### Phase 2: UI panelu QR

#### Automated

- [ ] 2.1 Type checking passes: `npm run typecheck`
- [ ] 2.2 Linting passes: `npm run lint`
- [ ] 2.3 Build passes: `npm run build`

#### Manual

- [ ] 2.4 Wejście na `/qr` jako Owner/Admin/Staff pokazuje kartę QR recepcji, listę pokoi i licznik sesji
- [ ] 2.5 Wejście na `/qr` gdy `dpa_signed_at IS NULL` pokazuje komunikat blokady zamiast UI
- [ ] 2.6 Kliknięcie "Rotuj teraz" generuje nowy QR recepcji i poprzedni staje się `is_active=false`
- [ ] 2.7 Po 5 minutach QR recepcji rotuje automatycznie bez akcji użytkownika
- [ ] 2.8 Dezaktywacja QR pokoju → kolejny skan `/api/scan/room` dla tego pokoju zwraca błąd `room_qr_not_found`
- [ ] 2.9 Viewer widzi stronę w trybie tylko-odczyt (brak przycisków rotacji/przełączników)
