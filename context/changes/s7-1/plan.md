# Eliminacja sekwencyjnych round-tripów Supabase w aplikacji gościa — Implementation Plan

## Overview

Każda strona aplikacji gościa (wspólny `app/[locale]/(guest)/layout.tsx` wywołuje
`requireGuestSession()` na każdej trasie) dziś wykonuje do 7 sekwencyjnych round-tripów sieciowych
do Supabase przed pierwszym renderem HTML, plus zero streamingu (`loading.tsx`), co razem daje
zgłoszone przez użytkownika ~2s na stronę na produkcji Railway. Ta sesja redukuje liczbę i
sekwencyjność tych round-tripów oraz dodaje Suspense fallback dla natychmiastowej powłoki.

## Current State Analysis

Łańcuch dla dowolnej strony `(guest)/**`:

1. `proxy.ts:51-58` — `admin.from('sessions').select('id, revoked, expires_at, property_id, last_seen_at').eq('id', sessionId).single()` (service-role) — sprawdzenie revoked/expired, aktualizacja `last_seen_at` (fire-and-forget, `void`).
2. `proxy.ts:130` — `supabase.auth.getClaims()` — osobny round-trip do serwera Auth; jedyny cel w tym miejscu to wyciągnięcie `property_id`/`session_id` z `claimsData.claims.app_metadata` do wstrzyknięcia w nagłówki `x-property-id`/`x-session-id` (`proxy.ts:138-143`) — a `property_id` już jest dostępny jako `session.property_id` z kroku 1.
3. `lib/guest/session.ts:26` — `withTenantContext(requestHeaders)` → `lib/supabase/tenant.ts:23-29` — tworzy `service_role` klienta i wywołuje `client.rpc('set_tenant_context', {p_property_id, p_session_id})`. Ten RPC (`supabase/migrations/20260626000002_rls_policies.sql:10-24`) ustawia `current_setting('app.property_id')`/`app.session_id` przez `set_config`, do użytku przez RLS policies (`20260626000002_rls_policies.sql` + `20260710100000_fix_guest_rls_empty_setting.sql`). **Ale** `service_role` w Supabase ma `BYPASSRLS` — RLS nigdy się nie evaluuje dla tego klienta, więc ten RPC nie chroni żadnych danych. Realna izolacja tenantowa to wyłącznie ręczne `.eq('property_id', …)`/`.eq('id', sessionId)` w zapytaniach niżej w tym samym pliku.
4. `lib/guest/session.ts:35-39` — `client.from('sessions').select('id, property_id, auth_level, reservation_id, room_id').eq('id', sessionId).single()` — drugie zapytanie na `sessions` w tym samym requeście (pierwsze było w `proxy.ts` krok 1, ale po inne kolumny).
5. `lib/guest/session.ts:43-47` — `client.from('properties').select(...).eq('id', session.property_id).single()`.
6. `lib/guest/session.ts:54-59` — `client.from('reservations').select(...).eq('id', session.reservation_id).single()` (warunkowo, jeśli `session.reservation_id`).
7. `lib/guest/session.ts:66-70` — `client.from('rooms').select(...).eq('id', session.room_id).single()` (warunkowo, jeśli `session.room_id`).

Kroki 5-7 nie zależą od siebie — wszystkie potrzebują tylko wartości już znanych po kroku 4
(`session.property_id`, `session.reservation_id`, `session.room_id`) — a są `await`owane
sekwencyjnie.

`getGuestSessionContext` jest opakowane w React `cache()`, więc w ramach jednego requestu
wykonuje się raz niezależnie od tego, ile komponentów je wywoła (layout + page) — deduplikacja
międzykomponentowa już działa, problem jest wewnątrz samej funkcji i w middleware.

Brak jakiegokolwiek `loading.tsx` w repo (`find app -iname loading.tsx` → brak wyników) — każda
nawigacja czeka na pełny SSR render.

### Key Discoveries:

- `lib/supabase/service-role.ts` — `createServiceRoleClient()`, klient bez `autoRefreshToken`/
  `persistSession`, używany zarówno w `proxy.ts` jak i `lib/supabase/tenant.ts`.
- `supabase/migrations/20260626000002_rls_policies.sql:27-28` — `GRANT EXECUTE ON FUNCTION
  set_tenant_context(uuid, uuid) TO service_role` — potwierdza, że RPC był projektowany do użycia
  właśnie z `service_role`, ale to właśnie ten Postgres role ma `BYPASSRLS` z definicji Supabase.
- `supabase/migrations/20260710100000_fix_guest_rls_empty_setting.sql` — wszystkie `guest_*`
  policies używają `NULLIF(current_setting('app.property_id', true), '')::uuid` — potwierdza że
  `set_tenant_context` był jedynym miejscem ustawiającym tę wartość, ale skoro nigdy nie jest
  evaluowana dla `service_role`, to i tak nieistotne dla bieżących zapytań gościa (wszystkie w
  `lib/guest/session.ts` idą przez `service_role` klienta zwróconego z `withTenantContext`).
- `proxy.ts:105-124` — osobny `createServerClient` (niekoduje `service_role`) używany wyłącznie do
  `getClaims()`/odświeżania cookies Supabase Auth — to zostaje nietknięte.
- `app/[locale]/(guest)/layout.tsx:8` — jedyne miejsce, przez które KAŻDA strona gościa przechodzi
  przez `requireGuestSession()` — potwierdza, że fix w `lib/guest/session.ts` naprawia wszystkie
  strony gościa jednym miejscem.
- `messages/pl.json`/`en.json` — brak dziś klucza na tekst ładowania; `loading.tsx` może być czysto
  wizualny (skeleton/spinner) bez potrzeby i18n (brak tekstu albo statyczny neutralny spinner).

## Desired End State

Wejście na dowolną stronę `(guest)/**`: middleware wykonuje jedno zapytanie `sessions` (rozszerzone
o `auth_level`/`reservation_id`/`room_id`) + `getClaims()` (zostaje, dla odświeżania cookies Auth) —
oba dziś już równoległe względem siebie w kolejności kodu nie są, ale to poza zakresem tej sesji
(patrz "What We're NOT Doing"). `getGuestSessionContext()` nie wykonuje już żadnego zapytania na
`sessions` ani RPC `set_tenant_context` — czyta `auth_level`/`reservation_id`/`room_id`/
`property_id` z nagłówków ustawionych przez middleware, i pobiera `properties`/`reservations`/
`rooms` jednym równoległym `Promise.all`. Pierwsza nawigacja na stronę gościa renderuje
`loading.tsx` natychmiast, zamiast pustego ekranu do końca łańcucha danych.

**Weryfikacja końcowa:** `npm run typecheck`, `npm run lint`, `npm run test` przechodzą; DevTools
Network na `/` (guest, lokalnie + Railway) pokazuje spadek liczby sekwencyjnych zapytań Supabase z
~7 do ~2-3; manualny test rewokacji sesji (revoke w bazie → kolejne żądanie → natychmiastowy
redirect `session_revoked`); manualny test izolacji tenantowej (gość property A nie widzi danych
property B); manualna obserwacja `loading.tsx` przy pierwszej nawigacji.

## What We're NOT Doing

- Panel hotelowy (`lib/panel/auth.ts`, `app/[locale]/(hotel)/layout.tsx`) — analogiczny problem
  (podwójne `supabase.auth.getUser()`), zarejestrowany jako TODO w `session-plan.md`, osobna sesja.
- Usunięcie `supabase.auth.getClaims()` z `proxy.ts` — poza odczytu claims, wykonuje odświeżanie
  cookies sesji Supabase Auth (istniejący komentarz w pliku); usunięcie wymaga osobnej weryfikacji,
  że nic nie polega na tym side-effect (ryzyko cichego wylogowania gości w trakcie pobytu).
- Weryfikacja/zmiana regionu hostingu Railway względem regionu projektu Supabase — brak dostępu do
  dashboardów z tej sesji; do ręcznego sprawdzenia przez użytkownika.
- Migracja SQL usuwająca funkcję `set_tenant_context` z bazy — funkcja zostaje zdefiniowana w
  Postgresie, tylko przestaje być wywoływana z `withTenantContext()`. Usunięcie funkcji to osobna,
  jawnie opisana decyzja (nie w tej sesji).
- Cache'owanie danych `properties`/tenantowych między requestami (np. `unstable_cache`, Redis) —
  ta sesja ogranicza się do redukcji round-tripów *w ramach* jednego requestu (Promise.all), nie
  wprowadza cache ponad request.
- Cache'owanie stanu `revoked`/`expires_at` sesji — twarde ograniczenie HITL, rewokacja musi
  zostać natychmiastowa na każdym żądaniu.

## Implementation Approach

Cztery niezależne, ale sekwencyjnie bezpieczne do wdrożenia zmiany: (1) usunięcie martwego RPC,
(2) middleware przekazuje pełne dane sesji przez nagłówki, (3) `session.ts` czyta z nagłówków +
`Promise.all`, (4) `loading.tsx`. Jedna faza — zmiany są małe, każdy krok weryfikowalny osobno przez
`npm run typecheck`/`lint`/`test`, ale logicznie tworzą jeden spójny fix i mają być wdrożone razem
(krok 3 zależy od kroku 2).

## Phase 1: Redukcja round-tripów sesji gościa + streaming

### Overview

Usunięcie martwego RPC, deduplikacja zapytania `sessions` przez przekazanie danych z middleware
do `session.ts` przez nagłówki, zrównoleglenie niezależnych zapytań, dodanie `loading.tsx`.

### Changes Required:

#### 1. Usunięcie martwego RPC `set_tenant_context`

**File**: `lib/supabase/tenant.ts`

**Intent**: `service_role` ma `BYPASSRLS`, więc ustawianie `current_setting('app.property_id')`
przez RPC nie chroni żadnych danych dla tego klienta — to czysty, zbędny round-trip.

**Contract**: Usunąć blok `await client.rpc('set_tenant_context', {...})` (`tenant.ts:24-27`).
Walidacja nagłówków (`UUID_RE` na `x-property-id`/`x-session-id`) i tworzenie/zwracanie klienta
`service_role` zostają bez zmian — sygnatura funkcji `withTenantContext(headers):
Promise<SupabaseClient<Database>>` nietknięta. Realna izolacja tenantowa (`.eq('property_id', …)`
w wywołujących miejscach) zostaje jedynym mechanizmem i musi pozostać obecna w każdym zapytaniu,
które dziś polega na `withTenantContext`.

#### 2. Middleware przekazuje pełne dane sesji przez nagłówki

**File**: `proxy.ts`

**Intent**: Uniknąć drugiego zapytania `sessions` w `session.ts` przez przekazanie
`auth_level`/`reservation_id`/`room_id` (już dostępne po jednym zapytaniu w middleware) w
nagłówkach; ustawić `x-property-id` bezpośrednio z wyniku tego zapytania zamiast zależeć od
`getClaims()`.

**Contract**:
- Rozszerzyć `select` w linii ~55 z `'id, revoked, expires_at, property_id, last_seen_at'` na
  `'id, revoked, expires_at, property_id, last_seen_at, auth_level, reservation_id, room_id'`.
- Po bloku walidacji revoked/expired (przed `let supabaseResponse = ...`), jeśli `session` istnieje
  (czyli przeszliśmy przez early-return dla `!session`/`revoked`/`expired`), zbudować
  `guestSessionHeaders: Record<string,string>` z:
  - `x-property-id`: `session.property_id`
  - `x-session-id`: `session.id`
  - `x-session-auth-level`: `String(session.auth_level)`
  - `x-session-reservation-id`: `session.reservation_id` (pominąć jeśli `null`)
  - `x-session-room-id`: `session.room_id` (pominąć jeśli `null`)
- Wstrzyknąć te nagłówki do `requestHeaders` (linia ~134, `new Headers(request.headers)`) **przed**
  istniejącym blokiem `meta = claimsData?.claims.app_metadata` — istniejący blok z `getClaims()`
  może teraz **nadpisywać** `x-property-id`/`x-session-id` tylko jeśli `meta` je dostarcza (zostaje
  jako fallback/potwierdzenie tożsamości z JWT, bez zmiany zachowania dla przypadku gdy oba źródła
  się zgadzają — co jest oczekiwanym stanem, bo oba pochodzą z tej samej `sessions` tabeli).
  `getClaims()` **zostaje wywoływane** (side-effect odświeżenia cookies Auth) — patrz "What We're
  NOT Doing".
- Sekcja bez `sessionId` (gość bez cookie, `!sessionId`) — bez zmian, brak nowych nagłówków.

#### 3. `session.ts`: czytanie z nagłówków + `Promise.all`

**File**: `lib/guest/session.ts`

**Intent**: Wyeliminować drugi `SELECT sessions`; zrównoleglić `properties`/`reservations`/`rooms`.

**Contract**: W `getGuestSessionContext()`:
- Po istniejącym `sessionId`/`propertyId` z nagłówków (`session.ts:31-33`), odczytać dodatkowo:
  `authLevelHeader = requestHeaders.get('x-session-auth-level')`,
  `reservationId = requestHeaders.get('x-session-reservation-id')`,
  `roomId = requestHeaders.get('x-session-room-id')`.
- Zastąpić blok `const { data: session } = await client.from('sessions')...` (linie 35-41)
  walidacją: `if (!sessionId || !propertyId || !authLevelHeader) return null; const authLevel =
  Number(authLevelHeader); if (authLevel < 1) return null;`.
- Zastąpić sekwencyjne `properties`→`reservations`→`rooms` (linie 43-73) jednym:
  ```ts
  const [{ data: property }, reservationResult, roomResult] = await Promise.all([
    client.from('properties').select('name, logo_url, ai_bot_name, phone_reception').eq('id', propertyId).single(),
    reservationId
      ? client.from('reservations').select('guest_first_name, check_in, check_out').eq('id', reservationId).single()
      : Promise.resolve({ data: null }),
    roomId
      ? client.from('rooms').select('room_number').eq('id', roomId).single()
      : Promise.resolve({ data: null }),
  ]);
  if (!property) return null;
  ```
  z dalszym mapowaniem `guestFirstName`/`checkIn`/`checkOut` z `reservationResult.data` i
  `roomNumber` z `roomResult.data`, analogicznie do dzisiejszej logiki.
- Zwracany kształt `GuestSessionContext` (pola `propertyId`, `sessionId`, `authLevel`,
  `guestFirstName`, `checkIn`, `checkOut`, `roomNumber`, `roomId`, `reservationId`, `propertyName`,
  `logoUrl`, `aiBotName`, `phoneReception`) bez zmian — `roomId`/`reservationId` w zwracanym
  obiekcie pochodzą teraz z nagłówków (`roomId`/`reservationId` zmienne), nie z wyniku zapytania
  `sessions`.

#### 4. Streaming fallback dla tras gościa

**File**: `app/[locale]/(guest)/loading.tsx` (nowy)

**Intent**: Natychmiastowa powłoka podczas gdy `GuestLayout`+`page.tsx` czekają na dane sesji.

**Contract**: Prosty Server Component (bez `'use client'`, brak potrzeby interaktywności) — spinner/
skeleton spójny z `data-theme="guest"` i tokenami `--guest-*` ze `style.md` (np. `bg-guest-stone`
tło pełnej wysokości + wyśrodkowany spinner w `--guest-accent`). Brak zależności od danych sesji
(Suspense fallback renderuje się zanim jakiekolwiek dane są dostępne) — czysto statyczny markup.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Unit/integration tests pass: `npm run test`
- [ ] Build passes: `npm run build`

#### Manual Verification:

- [ ] DevTools Network na `/` (guest, dev + prod build lokalnie) pokazuje spadek liczby
      sekwencyjnych zapytań Supabase z ~7 do ~2-3
- [ ] Revoke sesji w bazie (`UPDATE sessions SET revoked = true WHERE id = ...`) → kolejne żądanie
      gościa dostaje natychmiastowy redirect na `/error?type=session_revoked`
- [ ] Gość property A nie widzi danych property B (manualny test z dwoma property/sesjami)
- [ ] Pierwsza nawigacja na dowolną stronę `(guest)/**` pokazuje `loading.tsx` zanim pojawi się
      treść
- [ ] `/my-stay` nadal pokazuje poprawne dane rezerwacji (guestFirstName, roomNumber, checkIn/Out)
      po refaktorze `session.ts`

## Testing Strategy

### Unit Tests:

- Jeśli istnieją testy dla `lib/guest/session.ts`/`lib/supabase/tenant.ts` — zaktualizować pod
  nowy kontrakt (czytanie z nagłówków zamiast zapytania `sessions`, brak RPC). Sprawdzić
  `__tests__` w tych katalogach przed implementacją.

### Integration Tests:

- Istniejące testy IT (np. `lib/scan/__tests__/it-2.test.ts`) nie powinny się zmienić w
  zachowaniu — weryfikują flow skanowania QR, nie wewnętrzną implementację `session.ts`. Uruchomić
  pełne `npm run test` po zmianach jako regression check.

### Manual Testing Steps:

1. Zeskanować QR recepcji + pokoju (flow z S1.2/S3.6), wejść na `/`, `/my-stay`, `/my-orders`,
   `/amenities`, `/discover`, `/concierge` — potwierdzić że wszystkie renderują się poprawnie z tymi
   samymi danymi co przed zmianą.
2. DevTools Network — policzyć round-tripy do Supabase na pierwszym wejściu na `/`.
3. Revoke sesji ręcznie w Supabase Studio → potwierdzić natychmiastowy redirect przy następnym
   żądaniu.
4. Dwie różne property/sesje (jeśli dostępne w danych testowych) → potwierdzić brak przecieku
   danych między nimi.

## Performance Considerations

To jest cała treść tej sesji — patrz Overview/Desired End State. Brak dodatkowych rozważań poza
opisanymi redukcjami round-tripów.

## Migration Notes

Brak migracji SQL — funkcja `set_tenant_context` zostaje zdefiniowana w bazie, tylko przestaje być
wywoływana z aplikacji.

## References

- Session scope: `context/foundation/session-plan.md` (S7.1, sekcja FAZA 7)
- Change record: `context/changes/s7-1/change.md`
- HITL natychmiastowej rewokacji: `context/archive/decisions_log.md:92,577`
- Middleware: `proxy.ts`
- Warstwa sesji gościa: `lib/guest/session.ts`, `lib/guest/require-session.ts`
- Tenant context: `lib/supabase/tenant.ts`
- RLS policies (kontekst RPC): `supabase/migrations/20260626000002_rls_policies.sql`,
  `supabase/migrations/20260710100000_fix_guest_rls_empty_setting.sql`
- Layout gościa (jedyny punkt wejścia `requireGuestSession`): `app/[locale]/(guest)/layout.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not
> rename step titles.

### Phase 1: Redukcja round-tripów sesji gościa + streaming

#### Automated

- [x] 1.1 Type checking passes: `npm run typecheck`
- [x] 1.2 Linting passes: `npm run lint` (2 pre-existing errors unrelated to this session, in `qr-panel.tsx`/`reception-qr-kiosk.tsx`, not touched here)
- [x] 1.3 Unit/integration tests pass: `npm run test` (396/396, incl. updated `proxy.test.ts` + `session.test.ts` and 2 new header-forwarding tests)
- [x] 1.4 Build passes: `npm run build`

#### Manual

- [x] 1.5 DevTools Network pokazuje spadek liczby sekwencyjnych zapytań Supabase
- [x] 1.6 Revoke sesji → natychmiastowy redirect `session_revoked`
- [x] 1.7 Izolacja tenantowa: property A nie widzi danych property B
- [x] 1.8 `loading.tsx` widoczny przy pierwszej nawigacji
- [x] 1.9 `/my-stay` pokazuje poprawne dane po refaktorze `session.ts`

**Uwaga (implementacja):** `loading.tsx` (Krok 4) jest plikiem na poziomie grupy `(guest)` zgodnie
z konwencją App Router — automatycznie owija w Suspense wyłącznie `page.tsx`/dzieci, NIE
`layout.tsx` z tego samego segmentu. Ponieważ `GuestLayout` sam wykonuje `await
requireGuestSession()` (potrzebne do nagłówka z logo/nazwą hotelu i `BottomNav`), ten blokujący
odczyt nie jest objęty tym Suspense boundary — `loading.tsx` realnie skraca odczuwalny czas dla
dodatkowych zapytań stron *po* rozwiązaniu layoutu (np. `getPinnedServices` na stronie głównej),
nie dla samego pierwszego bajtu. Pełne "natychmiastowe show" wymagałoby wydzielenia
header/BottomNav do osobnych komponentów async owiniętych w `<Suspense>` w `GuestLayout` — to
zmieniłoby semantykę `redirect()` przy braku sesji (dziś: czysty serwerowy redirect przed
jakimkolwiek renderem; po zmianie: redirect kliencki po streamowaniu fallbacku) i jest świadomie
poza zakresem tej sesji jako zbyt ryzykowne bez możliwości wizualnej weryfikacji w tym środowisku.

**Uwaga (manualna weryfikacja 1.5-1.9):** odznaczone na wniosek użytkownika przed faktycznym
wykonaniem — użytkownik zrobi push na produkcję (Railway) i zweryfikuje 1.5-1.9 tam bezpośrednio,
zamiast lokalnie w tym środowisku narzędziowym (bez dostępu do żywej sesji gościa/Supabase). Jeśli
weryfikacja na produkcji wykaże regresję, cofnąć te checkboxy i otworzyć fix jako nową zmianę.
