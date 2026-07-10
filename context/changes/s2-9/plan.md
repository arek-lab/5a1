# Zarządzanie rezerwacją pokoju: check-in + edycja check-out — Implementation Plan

## Overview

S2.9 domyka lukę odkrytą podczas audytu (2026-07-10): `validateRoomScan` (`lib/scan/room.ts:45-53`) odrzuca każdy skan QR pokoju, dopóki `rooms.valid_from`/`valid_until` są `NULL` — a żadna sesja w planie (S0–S2.8) nigdy tych pól nie ustawia. Ta sesja daje recepcji (Staff+) minimalny CRUD: przypisanie pokoju do aktywnej rezerwacji (check-in) oraz edycję `check_out` istniejącej rezerwacji, z automatycznym przeliczeniem okna ważności pokoju i wygaśnięcia aktywnych sesji gościa (formuła HITL #2 nietknięta).

## Current State Analysis

- Schemat `reservations`/`rooms` istnieje od S0.2 — brak migracji w tej sesji. `reservations.status` (enum `pending|checked_in|checked_out|cancelled`) dziś ustawia wyłącznie `process_early_checkout` (→ `checked_out`); nic nie ustawia `checked_in`.
- RLS `staff_all_reservations`/`staff_all_rooms` (`supabase/migrations/20260626000002_rls_policies.sql:123-140`, zawężone do property w `20260626000003_fix_rls_recursion.sql`) to dziś ALL-access per property dla każdego aktywnego `hotel_user`, niezależnie od roli — ograniczenie ról jest wyłącznie w warstwie aplikacji. To ten sam wzorzec co przy `qr_codes`/`rooms` w S2.5 — nie jest to nowa lub pogłębiona luka wprowadzana przez tę sesję, więc nie jest w jej zakresie (patrz "What We're NOT Doing").
- Istnieje już `app/api/panel/reservations/[id]/checkout/route.ts` (wczesny checkout, S1.3/S2.1) — reużywa zasób RBAC `qr_manage` (`canPerform(role, 'qr_manage', 'full')`), nie dedykowany zasób `reservations`. To ustalony precedens do powielenia.
- `lib/panel/rbac.ts` nie ma zasobu `reservations` — S2.9 reużywa `qr_manage` (poziom `write`), zgodnie z precedensem z checkout route.
- `app/[locale]/(hotel)/qr/` to w pełni działający moduł (S2.5): `page.tsx` (server, DPA gate + `RequirePermission`) + `qr-panel.tsx` (client, `useTransition` + server actions) + `actions.ts` (`requireQrWriteAccess()` → `ActionResult`). Ten moduł jest miejscem rozszerzenia (patrz Key Discoveries).
- `lib/qr/generate.ts` ma prywatną funkcję `checkDpa(propertyId)` (rzuca eksportowany `DpaNotSignedError`) używaną przez wszystkie mutacje QR. S2.9 potrzebuje tej samej bramki dla check-in/edycji check-out (aktywacja dostępu gościa do pokoju) — wymaga jej eksportu.
- `lib/scan/room.ts:78` (`upgradeSession`) zawiera jedyną dziś istniejącą implementację formuły HITL #2: `expiresAt = checkOut + 2h`. S2.9 musi tę samą formułę zastosować przy edycji `check_out`, nie zmieniając jej kształtu.
- `lib/anomaly/detect.ts:9-14` i `supabase/migrations/20260626000006_early_checkout_fn.sql:38-44` to dwa istniejące wzorce zapisu do `audit_logs` — zawsze przez `createServiceRoleClient()` lub `SECURITY DEFINER`, nigdy bezpośrednio z klienta (RLS na `audit_logs` jest wyłączone, `anon`/`authenticated` nie mają dostępu).
- Testy integracyjne `lib/scan/__tests__/it-2.test.ts` już seedują `reservations` z `source: 'direct'`, `status: 'checked_in'` — potwierdza to konwencję wartości do użycia w tej sesji (nie `'csv'`, mimo że to wartość domyślna kolumny — CSV import to osobna, niezaimplementowana ścieżka).
- **Decyzja HITL tej sesji:** formularz check-in nie zbiera imienia gościa. `guest_first_name` pozostaje `NULL` (jest nullable w schemacie) — numer pokoju jest jedynym identyfikatorem rezerwacji w UI i audit logu. Domyka to możliwie najwęższy zakres PII w tej sesji; wypełnienie `guest_first_name` (dla powitania z HITL #1 na home gościa) zostaje TODO poza tą sesją.

### Key Discoveries:

- `app/[locale]/(hotel)/qr/actions.ts:15-21` (`requireQrWriteAccess`) — wzorzec guard do powielenia dla nowych akcji `checkInRoom`/`updateCheckOut`.
- `app/[locale]/(hotel)/qr/qr-panel.tsx:80-88,142-171` (`handleToggleRoom`, sekcja `rooms`) — wzorzec wiersza pokoju z akcją per-room do rozszerzenia o pola rezerwacji.
- `app/[locale]/(hotel)/qr/page.tsx:37-65` — wzorzec równoległego pobierania danych (`Promise.all`) do rozszerzenia o join z `reservations` przez `room_active_reservation_id`.
- `supabase/tests/s2_5_qr_staff_isolation.sql` — dosłowny wzorzec testu izolacji RLS (property A nie widzi/nie modyfikuje wierszy property B) do sklonowania dla `reservations`.
- `lib/scan/__tests__/it-2.test.ts` — wzorzec testu integracyjnego z realnym Supabase (`beforeAll` seed przez service-role, `afterAll` cleanup).

## Desired End State

Staff/Admin/Owner (RBAC `qr_manage`, poziom `write`; Viewer: tylko odczyt) widzi w istniejącej stronie `/qr`, w liście pokoi, dla każdego pokoju bez aktywnej rezerwacji przycisk "Zamelduj" otwierający inline formularz (bez modala/popupu — HITL #6) z jednym polem: data/godzina check-out. Zatwierdzenie tworzy `reservations` (`check_in = now()`, `status = 'checked_in'`, `source = 'direct'`, `guest_first_name = NULL`), ustawia `rooms.room_active_reservation_id/valid_from/valid_until`. Pokój z aktywną rezerwacją pokazuje datę check-out i przycisk "Edytuj check-out" (inline formularz z nową datą) — zatwierdzenie aktualizuje `reservations.check_out`, `rooms.valid_until`, oraz `sessions.expires_at = nowy_check_out + 2h` dla wszystkich niezrewokowanych sesji `auth_level=2` powiązanych z tą rezerwacją. Obie akcje zapisują wpis w `audit_logs` (`reservation_check_in` / `reservation_checkout_edit`). Próba przypisania rezerwacji do pokoju już zajętego zwraca błąd bez efektu ubocznego. Test izolacji RLS i test integracyjny przeliczenia sesji przechodzą.

**Weryfikacja końcowa:** `npm run typecheck`, `npm run lint`, `npm run test` (nowe testy) przechodzą; `psql "$DATABASE_URL" -f supabase/tests/s2_9_reservations_staff_isolation.sql` kończy się `S2.9 PASSED`; ręczny test w przeglądarce — check-in pokoju bez rezerwacji, edycja check-out z aktywną sesją gościa (auth_level 2) pokazuje przeliczone `expires_at`.

## What We're NOT Doing

- Zbieranie/edycja `guest_first_name`, `guest_email`, `external_id` — poza zakresem tej sesji (patrz decyzja HITL powyżej).
- Import CSV rezerwacji z systemu hotelowego (`reservations.source = 'csv'`) — osobna, nieplanowana sesja.
- Zawężanie RLS `staff_all_reservations`/`staff_all_rooms` do granulacji per-rola (dziś ALL dla każdego aktywnego `hotel_user`) — istniejący wzorzec sprzed tej sesji (jak `qr_codes` w S2.5), nie jest to nowa luka wprowadzana przez S2.9.
- Ręczne/natychmiastowe wymeldowanie ("check-out teraz") — istnieje już `POST /api/panel/reservations/[id]/checkout` (`process_early_checkout`, S1.3/S2.1); S2.9 nie duplikuje tej ścieżki, tylko odrzuca `check_out <= now()` w edycji z komunikatem odsyłającym do istniejącej funkcji.
- Zmiana przypisania pokoju rezerwacji już zajętego pokoju bez uprzedniego wymeldowania — blokada z błędem, brak automatycznego cichego checkout.
- Dedykowany zasób RBAC `reservations` w macierzy — reużycie `qr_manage`, zgodnie z precedensem `app/api/panel/reservations/[id]/checkout/route.ts`.
- Nowa zakładka/moduł panelu — rozszerzenie istniejącej strony `/qr`.
- Nawigacja panelu (nie istnieje dziś w żadnym module) — nie wprowadzamy jej tutaj.

## Implementation Approach

Faza 1 buduje warstwę serwerową: logikę domenową w `lib/reservations/` (walidacja, bramka DPA, blokada konfliktu pokoju, przeliczenie sesji, audit log), server actions w istniejącym `app/[locale]/(hotel)/qr/actions.ts`, test integracyjny formuły przeliczenia i klon testu izolacji RLS — całość testowalna bez UI. Faza 2 rozszerza `qr-panel.tsx`/`page.tsx` o UI check-in/edycji check-out oraz i18n.

## Phase 1: Warstwa serwerowa, przeliczenie sesji i testy

### Overview

Logika domenowa check-in/edycji check-out, server actions RBAC-owane, test integracyjny przeliczenia `sessions.expires_at`, test izolacji RLS.

### Changes Required:

#### 1. Eksport bramki DPA

**File**: `lib/qr/generate.ts`

**Intent**: `checkDpa`/`DpaNotSignedError` muszą być reużywalne poza tym plikiem — S2.9 aktywuje dostęp gościa do pokoju tak samo jak QR, więc podlega tej samej bramce HITL #11.

**Contract**: Dodać `export` przed `async function checkDpa`. Sygnatura i zachowanie bez zmian.

#### 2. Logika domenowa rezerwacji

**File**: `lib/reservations/check-in.ts` (nowy)

**Intent**: Przypisać nową rezerwację do pokoju bez aktywnej rezerwacji — check-in walk-in (check_in = teraz).

**Contract**: `checkInRoom(propertyId: string, roomId: string, checkOut: string): Promise<Tables<'reservations'>>`. Kroki: (1) `checkDpa(propertyId)`; (2) `SELECT room_active_reservation_id FROM rooms WHERE id = roomId AND property_id = propertyId` — jeśli brak wiersza, rzuć `RoomNotFoundError`; jeśli `room_active_reservation_id IS NOT NULL`, rzuć `RoomOccupiedError`; (3) walidacja `new Date(checkOut) > new Date()`, inaczej `InvalidCheckOutError`; (4) `INSERT INTO reservations` (`property_id`, `room_id: roomId`, `check_in: now()`, `check_out: checkOut`, `status: 'checked_in'`, `source: 'direct'`, `guest_first_name: null`); (5) `UPDATE rooms SET room_active_reservation_id, valid_from: check_in, valid_until: check_out WHERE id = roomId`; (6) insert `audit_logs` (`event_type: 'reservation_check_in'`, `target_id: reservation.id`, `metadata: { room_id: roomId, check_out: checkOut }`). Wszystko przez `createServiceRoleClient()` (operacja uprzywilejowana z warstwy panelu, jak `lib/qr/generate.ts`). Trzy nowe błędy (`RoomNotFoundError`, `RoomOccupiedError`, `InvalidCheckOutError`) eksportowane jako klasy `Error` (wzorzec `DpaNotSignedError`).

**File**: `lib/reservations/update-checkout.ts` (nowy)

**Intent**: Edytować `check_out` istniejącej rezerwacji, przesuwając okno ważności pokoju i wygaśnięcie wszystkich aktywnych sesji gościa powiązanych z tą rezerwacją — formuła HITL #2 (`checkOut + 2h`) nietknięta, zmienia się tylko jej input.

**Contract**: `updateReservationCheckOut(propertyId: string, reservationId: string, newCheckOut: string): Promise<void>`. Kroki: (1) `checkDpa(propertyId)`; (2) `SELECT id, room_id, check_out FROM reservations WHERE id = reservationId AND property_id = propertyId` — brak wiersza → `ReservationNotFoundError`; (3) walidacja `new Date(newCheckOut) > new Date()`, inaczej `InvalidCheckOutError` (odrzuca skrócenie do przeszłości/teraz — recepcja używa istniejącego `POST /api/panel/reservations/[id]/checkout` do natychmiastowego wymeldowania, patrz "What We're NOT Doing"); (4) `UPDATE reservations SET check_out = newCheckOut WHERE id = reservationId`; (5) jeśli `reservation.room_id` niepusty: `UPDATE rooms SET valid_until = newCheckOut WHERE id = room_id AND room_active_reservation_id = reservationId`; (6) `expiresAt = new Date(new Date(newCheckOut).getTime() + 2*60*60*1000).toISOString()` (formuła identyczna z `lib/scan/room.ts:78`); `UPDATE sessions SET expires_at = expiresAt WHERE reservation_id = reservationId AND revoked = false AND auth_level = 2` (obejmuje wszystkich współgości pokoju z osobnymi sesjami, nie tylko ostatni skan); (7) insert `audit_logs` (`event_type: 'reservation_checkout_edit'`, `target_id: reservationId`, `metadata: { old_check_out: reservation.check_out, new_check_out: newCheckOut }`).

#### 3. Server actions modułu QR (rozszerzenie)

**File**: `app/[locale]/(hotel)/qr/actions.ts`

**Intent**: Wystawić `checkInRoom`/`updateCheckOut` z tą samą konwencją RBAC/error-mapping co istniejące akcje QR.

**Contract**: Dwie nowe `'use server'` funkcje: `checkInRoomAction(roomId: string, checkOut: string): Promise<ActionResult>`, `updateCheckOutAction(reservationId: string, checkOut: string): Promise<ActionResult>` (nazwy z sufiksem `Action` żeby uniknąć konfliktu z importami z `lib/reservations/*`). Każda: `requireQrWriteAccess()` → `{error: 'forbidden'}` jeśli brak; `try/catch` mapujące `DpaNotSignedError → 'dpaNotSigned'`, `RoomOccupiedError → 'roomOccupied'`, `InvalidCheckOutError → 'invalidCheckOut'`, `RoomNotFoundError`/`ReservationNotFoundError → 'notFound'`; po sukcesie `revalidatePath('/qr')`.

#### 4. Test integracyjny przeliczenia sesji

**File**: `lib/reservations/__tests__/checkout-recalc.test.ts` (nowy)

**Intent**: Zweryfikować end-to-end na realnym Supabase, że edycja `check_out` przelicza `expires_at` dla wszystkich aktywnych sesji rezerwacji wg formuły HITL #2, i że sesje zrewokowane/o innym `auth_level` nie są dotykane.

**Contract**: Wzorzec `beforeAll`/`afterAll` z `lib/scan/__tests__/it-2.test.ts` (seed property z `dpa_signed_at`, room, reservation, ≥2 sesje `auth_level=2` na tej samej rezerwacji + 1 sesja `revoked=true`). Scenariusze: (1) `checkInRoom` na pokoju bez rezerwacji → tworzy wiersz, `RoomOccupiedError` przy drugiej próbie na tym samym pokoju; (2) `updateReservationCheckOut` z nową datą → obie aktywne sesje mają `expires_at === newCheckOut + 2h`, zrewokowana sesja bez zmian; (3) `updateReservationCheckOut` z datą `<= now()` → rzuca `InvalidCheckOutError`, brak zmian w bazie.

#### 5. Test izolacji RLS (klon S2.5)

**File**: `supabase/tests/s2_9_reservations_staff_isolation.sql` (nowy)

**Intent**: Potwierdzić, że staff property A nie widzi/nie modyfikuje `reservations`/`rooms` property B (wzorzec "aktywne RLS" wymagany przez `CLAUDE.md`).

**Contract**: Klon `supabase/tests/s2_5_qr_staff_isolation.sql` ze scenariuszami na `reservations` (seed rezerwacji property B, próba `SELECT`/`UPDATE check_out` z JWT property A) — sprawdza dzisiejszy stan `staff_all_reservations`/`staff_all_rooms` (property-level, nie per-rola — patrz "What We're NOT Doing"), więc oczekiwany wynik to zero leaku między property, niezależnie od roli.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Unit/integration tests pass: `npm run test` (obejmuje nowy `checkout-recalc.test.ts`)
- [ ] SQL izolacja RLS: `psql "$DATABASE_URL" -f supabase/tests/s2_9_reservations_staff_isolation.sql` kończy się `RAISE NOTICE 'S2.9 PASSED'`

#### Manual Verification:

- [ ] `checkInRoomAction` jako viewer zwraca `{error: 'forbidden'}`
- [ ] `checkInRoomAction` na property bez DPA zwraca `{error: 'dpaNotSigned'}`
- [ ] `checkInRoomAction` na pokoju z aktywną rezerwacją zwraca `{error: 'roomOccupied'}`
- [ ] `updateCheckOutAction` z datą w przeszłości zwraca `{error: 'invalidCheckOut'}`

---

## Phase 2: UI panelu — check-in i edycja check-out

### Overview

Rozszerzenie istniejącej listy pokoi w `/qr` o stan rezerwacji: przycisk "Zamelduj" (pokój bez rezerwacji) lub datę check-out + "Edytuj check-out" (pokój z aktywną rezerwacją), oba jako inline formularz w wierszu (bez popupu — HITL #6).

### Changes Required:

#### 1. Pobieranie danych rezerwacji

**File**: `app/[locale]/(hotel)/qr/page.tsx`

**Intent**: Dołączyć do listy pokoi informację o aktywnej rezerwacji (id, check_out), żeby `qr-panel.tsx` mógł zdecydować, czy pokazać "Zamelduj" czy "Edytuj check-out".

**Contract**: Rozszerzyć równoległe zapytanie o `rooms.room_active_reservation_id` w `select` istniejącego zapytania `rooms`, oraz dodać zapytanie `reservations` (`id, room_id, check_out`) filtrowane po `room_id IN (...)` dla pokoi z niepustym `room_active_reservation_id`. Zmapować do rozszerzonego `RoomWithQr` (`activeReservation: {id, checkOut} | null`) przekazywanego do `<QrPanel>`.

#### 2. Panel kliencki — sekcja rezerwacji per pokój

**File**: `app/[locale]/(hotel)/qr/qr-panel.tsx`

**Intent**: Dodać w każdym wierszu pokoju stan rezerwacji i akcję (check-in lub edycja check-out) jako inline formularz z jednym polem daty, spójny wizualnie z istniejącym `rowButtonClass`/`statusBadgeClass`.

**Contract**: Props `RoomWithQr` rozszerzone o `activeReservation: {id: string, checkOut: string} | null`. Nowy lokalny stan `editingRoomId: string | null` (który wiersz ma otwarty formularz). Wiersz bez `activeReservation`: przycisk "Zamelduj" → otwiera inline `<input type="datetime-local">` + "Zatwierdź"/"Anuluj", `onSubmit` woła `checkInRoomAction(room.id, checkOut)` w `startTransition`, błąd renderowany tym samym `role="alert"` co istniejący error banner. Wiersz z `activeReservation`: wyświetla sformatowaną datę check-out + przycisk "Edytuj check-out" → analogiczny inline formularz wołający `updateCheckOutAction(activeReservation.id, checkOut)`. Oba formularze ukryte gdy `!canEdit` (jak istniejące przyciski QR).

#### 3. Tłumaczenia i18n

**File**: `messages/pl.json`, `messages/en.json`

**Intent**: Rozszerzyć namespace `qr.rooms` o etykiety check-in/edycji check-out i nowe kody błędów.

**Contract**: Dodać do `qr.rooms`: `checkIn`, `checkOutLabel`, `editCheckOut`, `confirm`, `cancel`. Dodać do `qr.errors`: `roomOccupied`, `invalidCheckOut`, `notFound`. Klucze spójne PL/EN, wzorowane na istniejącej strukturze `qr.rooms`/`qr.errors` (linie 227-241 `messages/pl.json`).

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build passes: `npm run build`

#### Manual Verification:

- [ ] Kliknięcie "Zamelduj" na pokoju bez rezerwacji, wpisanie daty check-out i zatwierdzenie tworzy rezerwację i pokazuje ją w wierszu
- [ ] Kliknięcie "Edytuj check-out" na pokoju z aktywną rezerwacją, zmiana daty i zatwierdzenie aktualizuje wyświetlaną datę
- [ ] Próba check-in na już zajętym pokoju (np. w drugiej karcie przeglądarki) pokazuje komunikat błędu bez zmiany stanu
- [ ] Viewer widzi datę check-out, ale nie widzi przycisków "Zamelduj"/"Edytuj check-out"
- [ ] Brak jakiegokolwiek modala/popupu w całym flow (tylko inline formularz w wierszu)

---

## Testing Strategy

### Unit Tests:

- `checkInRoom`/`updateReservationCheckOut` — błędy walidacji (`RoomOccupiedError`, `InvalidCheckOutError`, `RoomNotFoundError`, `ReservationNotFoundError`) bez efektu ubocznego w bazie.
- Server actions — `forbidden` dla viewer, mapowanie błędów domenowych na kody `ActionResult`.

### Integration Tests:

- `lib/reservations/__tests__/checkout-recalc.test.ts` (Phase 1) — przeliczenie `sessions.expires_at` na realnej bazie, w tym przypadek wielu współgości i sesji zrewokowanej.
- `supabase/tests/s2_9_reservations_staff_isolation.sql` (Phase 1) — izolacja tenantowa `reservations`/`rooms`.

### Manual Testing Steps:

1. Zalogować się jako Staff, wejść na `/qr`, zameldować pokój bez rezerwacji (podać tylko check-out) → potwierdzić utworzenie rezerwacji i zaktualizowanie `rooms.valid_from/until`.
2. Zeskanować QR tego pokoju (po `init_token`) → potwierdzić powodzenie skanu (auth_level 1→2), wcześniej niemożliwe z powodu `outside_window`.
3. Edytować check_out istniejącej rezerwacji → potwierdzić, że `sessions.expires_at` aktywnej sesji gościa zmienia się zgodnie z formułą `nowy_check_out + 2h`.
4. Spróbować zameldować już zajęty pokój → potwierdzić błąd `roomOccupied`.
5. Spróbować ustawić check_out w przeszłości → potwierdzić błąd `invalidCheckOut`.
6. Zalogować się jako Viewer → potwierdzić brak przycisków akcji przy sekcji rezerwacji.

## Performance Considerations

Brak — operacje na pojedynczych wierszach per akcja, liczba pokoi rzędu dziesiątek (jak S2.5).

## Migration Notes

Brak migracji schematu — wszystkie wymagane kolumny (`reservations.*`, `rooms.valid_from/until/room_active_reservation_id`) już istnieją z S0.2.

## References

- Session scope: `context/foundation/session-plan.md` (S2.9, linie 118-122)
- Change record: `context/changes/s2-9/change.md`
- HITL #2 (fixed expiry): `context/archive/decisions_log.md:114`
- HITL #1 (imię gościa wyłącznie UX): `context/archive/decisions_log.md:113,240`
- HITL #6 (zero popupów): `context/archive/decisions_log.md:313`
- HITL #11 (bramka DPA): `context/archive/decisions_log.md:475`
- Wzorzec modułu i server actions: `app/[locale]/(hotel)/qr/` (S2.5, `context/changes/s2-5/plan.md`)
- Precedens reużycia `qr_manage` dla mutacji rezerwacji: `app/api/panel/reservations/[id]/checkout/route.ts`
- Wzorzec testu izolacji RLS: `supabase/tests/s2_5_qr_staff_isolation.sql`
- Wzorzec testu integracyjnego real-DB: `lib/scan/__tests__/it-2.test.ts`
- Formuła sesji (referencja, nietknięta): `lib/scan/room.ts:70-92`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Warstwa serwerowa, przeliczenie sesji i testy

#### Automated

- [x] 1.1 Type checking passes: `npm run typecheck` — 508291d
- [x] 1.2 Linting passes: `npm run lint` — 508291d
- [x] 1.3 Unit/integration tests pass: `npm run test` (obejmuje nowy `checkout-recalc.test.ts`) — 508291d
- [x] 1.4 SQL izolacja RLS: `psql "$DATABASE_URL" -f supabase/tests/s2_9_reservations_staff_isolation.sql` kończy się `S2.9 PASSED` — 508291d

#### Manual

- [x] 1.5 `checkInRoomAction` jako viewer zwraca `{error: 'forbidden'}`
- [x] 1.6 `checkInRoomAction` na property bez DPA zwraca `{error: 'dpaNotSigned'}`
- [x] 1.7 `checkInRoomAction` na pokoju z aktywną rezerwacją zwraca `{error: 'roomOccupied'}`
- [x] 1.8 `updateCheckOutAction` z datą w przeszłości zwraca `{error: 'invalidCheckOut'}`

### Phase 2: UI panelu — check-in i edycja check-out

#### Automated

- [x] 2.1 Type checking passes: `npm run typecheck`
- [x] 2.2 Linting passes: `npm run lint`
- [x] 2.3 Build passes: `npm run build`

#### Manual

- [x] 2.4 Kliknięcie "Zamelduj" na pokoju bez rezerwacji, wpisanie daty check-out i zatwierdzenie tworzy rezerwację i pokazuje ją w wierszu
- [x] 2.5 Kliknięcie "Edytuj check-out" na pokoju z aktywną rezerwacją, zmiana daty i zatwierdzenie aktualizuje wyświetlaną datę
- [x] 2.6 Próba check-in na już zajętym pokoju pokazuje komunikat błędu bez zmiany stanu
- [x] 2.7 Viewer widzi datę check-out, ale nie widzi przycisków "Zamelduj"/"Edytuj check-out"
- [x] 2.8 Brak jakiegokolwiek modala/popupu w całym flow
