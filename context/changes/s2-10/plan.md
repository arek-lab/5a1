# Dodawanie pokoi + druk QR (rozszerzenie Modułu 4) — Implementation Plan

## Overview

Rozszerzamy istniejący moduł `app/[locale]/(hotel)/qr/` (S2.5, S2.9) o dwie brakujące zdolności:
(1) tworzenie nowego pokoju przez Owner/Admin — dziś jedyny sposób na dodanie wiersza do
`rooms` to bezpośredni zapis service-role/test; (2) podstronę `/qr/print`, która renderuje
skanowalne kody QR wszystkich pokoi z aktywnym QR pokoju jako karty gotowe do wydruku
przeglądarkowego (`window.print()`), dostępną dla każdej roli z dostępem do panelu (odczyt,
zero mutacji). Reszta modułu QR (rotacja recepcji, aktywacja/dezaktywacja QR pokoju,
check-in/edycja rezerwacji) pozostaje nietknięta.

## Current State Analysis

- `lib/qr/generate.ts` — `generateReceptionQR`, `generateRoomQR`, `deactivateRoomQR`,
  `checkDpa`/`DpaNotSignedError`. Wszystkie przez `createServiceRoleClient()`. Brak zmian.
- `lib/qr/image.ts` — `generateQRImage(url: string): Promise<string>` zwraca SVG string
  (pakiet `qrcode`). Reużywane bez zmian dla QR pokoju w widoku druku.
- `lib/panel/rbac.ts` — `PERMISSION_MATRIX` nie ma dziś zasobu dla tworzenia pokoi. Wzorzec
  `hotel_profile`/`services`/`knowledge`: owner=full, admin=full, staff=write/read, viewer=read
  — ale tworzenie pokoju ma być węższe (Staff bez dostępu), więc nowy zasób `rooms_manage`
  wzorem `hotel_profile` (owner: full, admin: full, staff: none, viewer: none).
- RLS: `staff_all_rooms` (property match przez `auth_user_property_ids()`) już pozwala
  zalogowanemu `hotel_users` (dowolna aktywna rola) na `FOR ALL` w obrębie property. To
  defense-in-depth backstop — w praktyce panel operuje przez `createServiceRoleClient()` i
  sam filtruje `.eq('property_id', hotelUser.propertyId)`. Bez zmian.
- `app/[locale]/(hotel)/qr/page.tsx` — już pobiera pełną listę pokoi property
  (`rooms.select('id, room_number, room_type, room_active_reservation_id')`), ale nie
  generuje SVG QR pokoju (tylko QR recepcji ma `generateQRImage`). `qr-panel.tsx` pokazuje
  tylko badge aktywny/nieaktywny + przycisk toggle, bez obrazu.
- Brak modułu tworzenia pokoju gdziekolwiek w `app/`/`lib/` (poza testami/skryptami
  weryfikacyjnymi) — potwierdzone przeszukaniem całego repo.
- `app/api/scan/room/route.ts:29` — odczytuje `room_id` z query stringa
  (`request.nextUrl.searchParams.get('room_id')`) — to jedyny format URL, jaki musi kodować QR
  pokoju: `${NEXT_PUBLIC_APP_URL}/api/scan/room?room_id=<uuid>`.

### Key Discoveries:

- `app/[locale]/(hotel)/qr/actions.ts:25-31` (`requireQrWriteAccess`) — wzorzec guard do
  powielenia jako `requireRoomsWriteAccess` (zasób `rooms_manage`, poziom `write`).
- `app/[locale]/(hotel)/qr/qr-panel.tsx:108-132` (`openReservationForm`/`handleReservationSubmit`,
  stan `editingRoomId`/`checkOutInput`) — gotowy wzorzec inline-formularza w obrębie tej samej
  strony (bez modala, HITL #6) do powielenia dla formularza dodawania pokoju.
- `app/[locale]/(hotel)/qr/page.tsx:84-88` — wzorzec generowania SVG przez `generateQRImage`
  z pełnym URL (`NEXT_PUBLIC_APP_URL` + query param) do powielenia dla QR pokoju w widoku druku.
- `lib/reservations/check-in.ts` — wzorzec własnych klas błędów (`RoomOccupiedError` itd.)
  rzucanych z warstwy domenowej i mapowanych na kody `ActionResult` w `actions.ts`.
- `supabase/tests/s2_5_qr_staff_isolation.sql` — wzorzec testu izolacji RLS
  (`SET LOCAL ROLE authenticated` + `request.jwt.claims`) do sklonowania dla `rooms` (insert).
- Kod Postgres `23505` (unique_violation) — sposób odróżnienia duplikatu `room_number` od innych
  błędów przy insert (Supabase JS zwraca go w `error.code`).

## Desired End State

Owner/Admin widzi w `/qr` nad listą pokoi formularz "Dodaj pokój" (numer pokoju wymagany, typ
opcjonalny); zatwierdzenie tworzy wiersz `rooms` w bieżącym property i odświeża listę. Staff i
Viewer nie widzą tego formularza. Wszystkie role z dostępem do `/qr` widzą link "Drukuj kody QR
pokoi" prowadzący do `/qr/print`: strona pokazuje siatkę kart (QR SVG + numer pokoju) wyłącznie
dla pokoi z aktualnie aktywnym QR pokoju (pokoje bez aktywnego QR pominięte, z licznikiem ile
pominięto), plus przycisk "Drukuj" wołający `window.print()`; CSS `@media print` renderuje jeden
kod QR na kartę/stronę. Próba dodania pokoju z numerem już istniejącym w property zwraca czytelny
błąd bez efektu ubocznego. Test izolacji RLS dla insertu `rooms` przechodzi.

**Weryfikacja końcowa:** `npm run build` przechodzi; `npm run test` (vitest) przechodzi;
`psql "$DATABASE_URL" -f supabase/tests/s2_10_rooms_staff_isolation.sql` kończy się
`S2.10 PASSED`; ręczny test w przeglądarce — Owner dodaje pokój, aktywuje jego QR (istniejąca
funkcja S2.5), otwiera `/qr/print` i widzi skanowalny kod tego pokoju w podglądzie wydruku.

## What We're NOT Doing

- Edycja lub usuwanie/dezaktywacja pokoju (tylko `room_number`/`room_type` przy tworzeniu) —
  poza zakresem tej sesji, TODO na przyszłość jeśli będzie potrzeba.
- Generowanie prawdziwego pliku PDF server-side (biblioteka typu `@react-pdf/renderer`/`pdf-lib`)
  — decyzja z użytkownikiem: druk przez natywny dialog przeglądarki (`window.print()` + CSS
  `@media print`), zero nowych zależności, zgodnie z zasadą projektu "brak infrastruktury ponad
  potrzebę".
- Automatyczne generowanie/aktywacja QR pokoju przy tworzeniu pokoju — pokój po utworzeniu ma
  QR nieaktywny, tak jak dziś każdy nowy wiersz `rooms`; aktywacja to osobny, już istniejący
  krok w `/qr` (S2.5).
- Import CSV pokoi / bulk-tworzenie wielu pokoi naraz — formularz obsługuje jeden pokój na raz,
  zgodnie z minimalnym zakresem zgłoszonej luki.
- Zmiana RLS `staff_all_rooms` na granulację per-rola (dziś `FOR ALL` dla każdego aktywnego
  `hotel_user`) — ograniczenie do Owner/Admin dla tworzenia pokoju żyje wyłącznie w warstwie
  aplikacji (`rooms_manage` w `canPerform`), analogicznie do istniejącego wzorca `qr_manage`/
  `reservations` (S2.5/S2.9). Nie jest to nowa ani pogłębiona luka wprowadzana przez tę sesję.
- Wspólny komponent nawigacji panelu — nie istnieje dziś w żadnym module, link do `/qr/print`
  dodawany bezpośrednio w `qr-panel.tsx`.

## Implementation Approach

Faza 1 buduje warstwę serwerową (RBAC, logika domenowa tworzenia pokoju, server action, test
izolacji RLS) — całość testowalna bez UI. Faza 2 dodaje UI: formularz dodawania pokoju
rozszerzający `qr-panel.tsx` oraz nową podstronę `/qr/print`.

## Phase 1: RBAC, logika domenowa, server action, test RLS

### Overview

Nowy zasób RBAC `rooms_manage`, funkcja domenowa `createRoom`, server action
`createRoomAction`, test integracyjny izolacji tenantowej.

### Changes Required:

#### 1. Nowy zasób RBAC

**File**: `lib/panel/rbac.ts`

**Intent**: Ograniczyć tworzenie pokoju do Owner/Admin, w odróżnieniu od reszty modułu QR
(`qr_manage`), gdzie Staff ma pełny dostęp.

**Contract**: Dodać `'rooms_manage'` do typu `Resource`. Dodać wpis do `PERMISSION_MATRIX`:
`rooms_manage: { owner: 'full', admin: 'full', staff: 'none', viewer: 'none' }`.

#### 2. Logika domenowa tworzenia pokoju

**File**: `lib/rooms/create.ts` (nowy)

**Intent**: Utworzyć pokój w bieżącym property, z walidacją i przyjaznym błędem przy duplikacie
numeru pokoju — wzorzec 1:1 z `lib/qr/generate.ts`/`lib/reservations/check-in.ts` (service-role
client, własne klasy błędów).

**Contract**: `createRoom(propertyId: string, roomNumber: string, roomType: string | null):
Promise<Tables<'rooms'>>`. Kroki: (1) `roomNumber.trim()` puste → rzuć `InvalidRoomNumberError`;
(2) `INSERT INTO rooms (property_id, room_number: roomNumber.trim(), room_type: roomType)` przez
`createServiceRoleClient()`; (3) jeśli `error.code === '23505'` → rzuć `RoomNumberTakenError`,
inne błędy przepuścić. Dwie nowe klasy błędów (`InvalidRoomNumberError`, `RoomNumberTakenError`)
eksportowane, wzorem `DpaNotSignedError`.

#### 3. Server action

**File**: `app/[locale]/(hotel)/qr/actions.ts` (rozszerzenie)

**Intent**: Wystawić `createRoomAction` z tą samą konwencją RBAC/error-mapping co istniejące
akcje modułu.

**Contract**: Nowa lokalna funkcja `requireRoomsWriteAccess(): Promise<HotelUser | null>`
(kopiuje `requireQrWriteAccess`, sprawdza `canPerform(hotelUser.role, 'rooms_manage', 'write')`).
Nowa eksportowana `'use server'` funkcja `createRoomAction(roomNumber: string, roomType: string |
null): Promise<ActionResult>`: `requireRoomsWriteAccess()` → `{error: 'forbidden'}` jeśli brak;
`try/catch` wołające `createRoom(hotelUser.propertyId, roomNumber, roomType)` mapujące
`RoomNumberTakenError → 'roomNumberTaken'`, `InvalidRoomNumberError → 'invalidRoomNumber'`; po
sukcesie `revalidatePath('/qr')`.

#### 4. Test izolacji RLS (klon S2.5)

**File**: `supabase/tests/s2_10_rooms_staff_isolation.sql` (nowy)

**Intent**: Potwierdzić, że staff property A nie może wstawić/odczytać/zmodyfikować wiersza
`rooms` property B — wzorzec "aktywne RLS" wymagany przez `CLAUDE.md`.

**Contract**: Klon `supabase/tests/s2_5_qr_staff_isolation.sql` na tabeli `rooms`: (1) seed
property A i B przez service-role; (2) `SET LOCAL ROLE authenticated` + JWT claims property A →
próba `SELECT`/`UPDATE` wiersza `rooms` property B → zero wierszy / zero efektu; (3) insert
przez JWT property A z `property_id` property B w payloadzie → odrzucone lub zignorowane (RLS
`WITH CHECK`). `BEGIN`/`ROLLBACK` jak w oryginale, `RAISE NOTICE 'S2.10 PASSED'` na końcu.

### Success Criteria:

#### Automated Verification:

- [x] Type checking passes: `npm run typecheck`
- [x] Linting passes: `npm run lint`
- [x] Unit/integration tests pass: `npm run test`
- [x] SQL izolacja RLS: uruchomione w Supabase SQL Editor (zapytanie przepisane na kilka
      top-level bloków `DO $$` — patrz uwaga w pliku testu), zakończone `S2.10 PASSED`

#### Manual Verification:

- [x] `createRoomAction` jako Staff/Viewer zwraca `{error: 'forbidden'}`
- [x] `createRoomAction` z numerem pokoju już istniejącym w property zwraca
      `{error: 'roomNumberTaken'}`
- [x] `createRoomAction` z pustym numerem pokoju zwraca `{error: 'invalidRoomNumber'}`
- [x] Nowy pokój pojawia się w `rooms` z poprawnym `property_id`

---

## Phase 2: UI — formularz dodawania pokoju + strona druku

### Overview

Formularz "Dodaj pokój" w `qr-panel.tsx` (Owner/Admin) i nowa podstrona `/qr/print` renderująca
karty QR do druku (wszystkie role z dostępem do `/qr`).

### Changes Required:

#### 1. Props strony `/qr`

**File**: `app/[locale]/(hotel)/qr/page.tsx`

**Intent**: Przekazać do `<QrPanel>` informację, czy bieżący użytkownik może dodawać pokoje.

**Contract**: Dodać `canManageRooms = canPerform(hotelUser.role, 'rooms_manage', 'write')` i
przekazać jako nowy prop `canManageRooms` do `<QrPanel>`.

#### 2. Formularz dodawania pokoju

**File**: `app/[locale]/(hotel)/qr/qr-panel.tsx`

**Intent**: Inline formularz dodawania pokoju nad listą, spójny wizualnie z istniejącym
formularzem rezerwacji (bez modala/popupu — HITL #6).

**Contract**: Nowy prop `canManageRooms: boolean`. Nowy lokalny stan `isAddingRoom: boolean`,
`newRoomNumber: string`, `newRoomType: string`. Przycisk "Dodaj pokój" (widoczny tylko gdy
`canManageRooms`) otwiera inline `<form>` z dwoma polami (numer wymagany, typ opcjonalny) +
"Zatwierdź"/"Anuluj", wzorem `openReservationForm`/`closeReservationForm`. `onSubmit` →
`startTransition(async () => { const result = await createRoomAction(newRoomNumber, newRoomType
|| null); if (result.error) setError(result.error); else { reset pól, zamknij formularz } })`.
Błąd renderowany istniejącym `role="alert"` bannerem. Dodać link/przycisk "Drukuj kody QR
pokoi" (`<Link href="/qr/print">`) w sekcji pokoi, widoczny niezależnie od `canManageRooms`
(czysty odczyt).

#### 3. Strona druku QR pokoi

**File**: `app/[locale]/(hotel)/qr/print/page.tsx` (nowy, server component)

**Intent**: Wygenerować SVG QR dla każdego pokoju z aktywnym QR pokoju, do wydruku
przeglądarkowego.

**Contract**: `getHotelUser()` → redirect `/login` jeśli brak, wzorem `qr/page.tsx`. Owinięte w
`<RequirePermission role={hotelUser.role} resource="qr_sessions" level="read">` (spójne z `/qr`
— brak dodatkowego ograniczenia, bo to czysty odczyt). Pobiera `rooms` property (`id,
room_number, room_type`) zjoinowane z aktywnym `qr_codes` (`type='room', is_active=true`) —
wzorem zapytań w `qr/page.tsx`. Dla pokoi z aktywnym QR: `generateQRImage(
\`${process.env.NEXT_PUBLIC_APP_URL}/api/scan/room?room_id=${room.id}\`)`. Pokoje bez aktywnego
QR pominięte z listy, ich liczba przekazana jako `skippedCount` prop. Renderuje
`<PrintRoomQrList rooms={roomsWithQrImage} skippedCount={skippedCount} />`.

#### 4. Komponent listy do druku

**File**: `app/[locale]/(hotel)/qr/print/print-room-qr-list.tsx` (nowy, `'use client'`)

**Intent**: Siatka kart QR + kontrolka druku, z CSS dedykowanym pod `@media print` (jeden kod
QR na kartę/stronę), bez żadnej nowej zależności — druk przez natywny `window.print()`.

**Contract**: Props: `rooms: { id: string; roomNumber: string; roomType: string | null; image:
string }[]`, `skippedCount: number`. Przycisk "Drukuj" (`onClick={() => window.print()}`,
`className="print:hidden"` — ukryty w widoku wydruku). Grid kart na ekranie (Tailwind grid),
każda karta: `dangerouslySetInnerHTML` z `image` (SVG) + numer pokoju pod spodem. CSS `@media
print`: `break-after: page` na każdej karcie (Tailwind `print:break-after-page` lub inline
style), tło/obramowania wyłączone w druku. Jeśli `skippedCount > 0`, komunikat nad siatką
(`t('print.skippedRooms', {count: skippedCount})`), `className="print:hidden"`.

#### 5. Tłumaczenia i18n

**File**: `messages/pl.json`, `messages/en.json`

**Intent**: Nowe klucze dla formularza dodawania pokoju i strony druku.

**Contract**: Rozszerzyć `qr.rooms` o: `addRoom`, `roomNumberLabel`, `roomTypeLabel`,
`printLink`. Rozszerzyć `qr.errors` o: `roomNumberTaken`, `invalidRoomNumber`. Nowy namespace
`qr.print`: `title`, `printButton`, `skippedRooms` (z placeholderem `{count}`), `empty` (brak
pokoi z aktywnym QR). Klucze spójne PL/EN.

### Success Criteria:

#### Automated Verification:

- [x] Type checking passes: `npm run typecheck`
- [x] Linting passes: `npm run lint`
- [x] Build passes: `npm run build`

#### Manual Verification:

- [x] Owner dodaje pokój z formularza na `/qr` → pojawia się na liście z podanym numerem/typem
- [x] Staff/Viewer na `/qr` nie widzą formularza "Dodaj pokój"
- [x] Próba dodania pokoju z numerem już istniejącym w property → komunikat błędu, brak
      duplikatu w bazie
- [x] `/qr/print` pokazuje kartę QR wyłącznie dla pokoi z aktywnym QR pokoju; pokoje bez
      aktywnego QR pominięte z widocznym komunikatem liczby pominiętych
- [x] Kliknięcie "Drukuj" otwiera natywny dialog druku przeglądarki; podgląd wydruku pokazuje
      jeden kod QR na kartę/stronę, bez przycisków/komunikatów ekranowych
- [x] Zeskanowanie wydrukowanego/wyświetlonego kodu QR pokoju (po URL) prowadzi do
      `/api/scan/room?room_id=<uuid>` tego pokoju

---

## Testing Strategy

### Unit Tests:

- `createRoom` — pusty numer pokoju → `InvalidRoomNumberError` bez insertu; duplikat
  `room_number` w tym samym property → `RoomNumberTakenError` bez efektu ubocznego; sukces
  zwraca wiersz z poprawnym `property_id`.
- `createRoomAction` — `forbidden` dla Staff/Viewer, mapowanie błędów domenowych na kody
  `ActionResult`, `revalidatePath` wywołane przy sukcesie.

### Integration Tests:

- `supabase/tests/s2_10_rooms_staff_isolation.sql` (Phase 1) — izolacja tenantowa `rooms` przy
  insert/select/update z aktywnym RLS.

### Manual Testing Steps:

1. Zalogować się jako Owner, wejść na `/qr`, dodać pokój (numer + typ) → potwierdzić pojawienie
   się na liście.
2. Zalogować się jako Staff → potwierdzić brak formularza dodawania pokoju, obecność listy i
   linku "Drukuj kody QR pokoi".
3. Aktywować QR nowo dodanego pokoju (istniejąca funkcja S2.5) → otworzyć `/qr/print` →
   potwierdzić obecność karty QR tego pokoju.
4. Otworzyć `/qr/print` dla property z pokojem bez aktywnego QR → potwierdzić pominięcie i
   komunikat liczby pominiętych.
5. Kliknąć "Drukuj" → sprawdzić podgląd wydruku (Ctrl+P) — jeden kod na stronę, bez elementów
   ekranowych (przycisk, komunikaty).
6. Spróbować dodać pokój z numerem już istniejącym w property → potwierdzić błąd bez zmiany
   stanu bazy.

## Performance Considerations

Brak — operacje na pojedynczych wierszach (tworzenie pokoju) i zapytaniach per property (lista
pokoi rzędu dziesiątek, jak S2.5/S2.9), bez paginacji.

## Migration Notes

Brak migracji schematu — wszystkie wymagane kolumny (`rooms.room_number`, `rooms.room_type`,
`rooms.property_id`) już istnieją z S0.2. Unikalność `(property_id, room_number)` już wymuszona
przez istniejący constraint `UNIQUE (property_id, room_number)`.

## References

- Session scope: `context/foundation/session-plan.md` (S2.10)
- Change record: `context/changes/s2-10/change.md`
- Napięcie z roadmapą (PDF jako płatna usługa platformy): `context/foundation/
  implementation_roadmap.md:293,530`
- HITL #6 (zero popupów): `context/archive/decisions_log.md:313`
- HITL #11 (bramka DPA — nietknięta w tej sesji, tworzenie pokoju nie generuje QR): `context/
  foundation/implementation_roadmap.md:537`
- Wzorzec modułu i server actions: `app/[locale]/(hotel)/qr/` (S2.5, `context/changes/s2-5/
  plan.md`; S2.9, `context/changes/s2-9/plan.md`)
- Wzorzec generowania SVG QR: `lib/qr/image.ts`, użycie w `app/[locale]/(hotel)/qr/page.tsx:84-88`
- Format URL skanu pokoju: `app/api/scan/room/route.ts:29`
- Wzorzec testu izolacji RLS: `supabase/tests/s2_5_qr_staff_isolation.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not
> rename step titles. See `references/progress-format.md`.

### Phase 1: RBAC, logika domenowa, server action, test RLS

#### Automated

- [x] 1.1 Type checking passes: `npm run typecheck` — cdbfa51
- [x] 1.2 Linting passes: `npm run lint` — cdbfa51
- [x] 1.3 Unit/integration tests pass: `npm run test` (nowy `lib/rooms/__tests__/create.test.ts`;
      pozostałe 3 niepowiązane failury w `__tests__/proxy.test.ts` to istniejący problem mocka
      `supabase.auth.getClaims`, sprzed tej sesji) — cdbfa51
- [x] 1.4 SQL izolacja RLS: uruchomione przez użytkownika w Supabase SQL Editor (skrypt
      przepisany na kilka top-level bloków `DO $$` bez zagnieżdżonego `BEGIN/EXCEPTION/END`,
      bo edytor Supabase Studio błędnie tnie skrypt na takim zagnieżdżeniu) — zakończone sukcesem,
      brak `FAILED` — cdbfa51

#### Manual

- [x] 1.5 `createRoomAction` jako Staff/Viewer zwraca `{error: 'forbidden'}` — cdbfa51
- [x] 1.6 `createRoomAction` z numerem pokoju już istniejącym w property zwraca
      `{error: 'roomNumberTaken'}` — cdbfa51
- [x] 1.7 `createRoomAction` z pustym numerem pokoju zwraca `{error: 'invalidRoomNumber'}` — cdbfa51
- [x] 1.8 Nowy pokój pojawia się w `rooms` z poprawnym `property_id` — cdbfa51

### Phase 2: UI — formularz dodawania pokoju + strona druku

#### Automated

- [x] 2.1 Type checking passes: `npm run typecheck` — c9e0510
- [x] 2.2 Linting passes: `npm run lint` — c9e0510
- [x] 2.3 Build passes: `npm run build` — c9e0510

#### Manual

- [x] 2.4 Owner dodaje pokój z formularza na `/qr` → pojawia się na liście — c9e0510
- [x] 2.5 Staff/Viewer nie widzą formularza "Dodaj pokój" — c9e0510
- [x] 2.6 Duplikat numeru pokoju → komunikat błędu, brak duplikatu w bazie — c9e0510
- [x] 2.7 `/qr/print` pokazuje kartę QR tylko dla pokoi z aktywnym QR, komunikat liczby
      pominiętych — c9e0510
- [x] 2.8 "Drukuj" otwiera dialog druku, podgląd pokazuje jeden kod na stronę bez elementów
      ekranowych — c9e0510
- [x] 2.9 Zeskanowanie wydrukowanego kodu prowadzi do poprawnego `room_id` — c9e0510
