# Nawigacja główna (gość + panel) — Implementation Plan

## Overview

Budujemy brakującą, trwałą strukturę nawigacyjną dla obu aplikacji platformy — dolną nawigację
gościa (5 zakładek) i lewą szynę panelu hotelowego (6 pozycji filtrowanych przez RBAC) — na
dzisiejszym stylu Tailwind (gray/blue), bez design tokenów/shadcn (to zadanie S6.1, wykonywane po
tej sesji). Luka została odkryta 2026-07-14 podczas planowania S6.1: `style.md` §1.3/§2.3
definiuje strukturę nawigacji od dawna, ale żadna sesja nigdy jej nie zbudowała — S3.1 dostarczył
tylko statyczny grid kategorii na stronie głównej, a każda sesja Fazy 2 dodawała kolejną stronę
panelu bez wspólnego menu.

Zero zmian w logice biznesowej/RBAC/RLS/routingu istniejących stron — wyłącznie nowy chrome
nawigacyjny i trzy nowe strony treściowe gościa (`/amenities`, `/my-stay`, `/discover`).

## Current State Analysis

- **Gość**: `app/[locale]/(guest)/layout.tsx:1-27` renderuje header (logo/nazwa property +
  `LanguageSwitcher`) + `{children}` + `FloatingConciergeButton` (fixed bottom-4 right-4) +
  `OfflineToast` (fixed top-20, brak konfliktu pozycyjnego z przyszłym nav). Strony:
  `/` (home, `page.tsx:1-31`), `/c/[category]`, `/c/[category]/[service]`, `/concierge`,
  `/my-orders`, `/order-success`, `/scan` (bez `requireGuestSession()` — punkt wejścia przed
  istnieniem sesji). `/error` jest **poza** grupą `(guest)` (`app/[locale]/error/page.tsx`),
  więc nie renderuje layoutu gościa w ogóle — nie wymaga osobnego wykluczenia w nav.
- **`requireGuestSession()`** (`lib/guest/require-session.ts:4-8`) deleguje do
  `getGuestSessionContext()` (`lib/guest/session.ts:19-82`, `cache()`-wrapped), zwraca
  `GuestSessionContext` bez `check_in`/`check_out` — tabela `reservations` ma te kolumny
  (`supabase/migrations/20260626000001_initial_schema.sql:80-81`, `TIMESTAMPTZ NOT NULL`), ale
  dziś jest pytana wyłącznie o `guest_first_name` (`session.ts:51-54`).
- **`CategoryGrid`** (`components/guest/category-grid.tsx:13-30`) — komponent kliencki, props
  `{ visibleCategories: ServiceCategory[] }`, używany dziś tylko na home
  (`app/[locale]/(guest)/page.tsx:26`). Gotowy do bezpośredniego re-użycia na `/amenities`.
- **`FloatingConciergeButton`** (`components/guest/floating-concierge-button.tsx`) — jedyne
  miejsce użycia to `app/[locale]/(guest)/layout.tsx:3,23`. Do usunięcia (decyzja HITL tej sesji:
  Concierge staje się zakładką nav, floating button jest zbędnym duplikatem wejścia).
- **Panel**: `app/[locale]/(hotel)/layout.tsx:1-34` renderuje tylko `<header>` z przyciskiem
  wylogowania — zero markupu nawigacyjnego. `hotelUser` (z `role: HotelRole`) jest już pobierany
  na linii 13, ale nieużywany do nawigacji. Strony: `/dashboard`, `/services`, `/knowledge`, `/qr`
  (+ `/qr/print`), `/orders`, `/users`, `/onboarding` — wszystkie pod `(hotel)`. `/admin` żyje
  całkowicie poza `app/[locale]` (własny, niezlokalizowany route tree z osobnym loginem
  `app/admin/login/`) — strukturalnie nieosiągalny przez layout `(hotel)`, więc wykluczenie z menu
  nie wymaga dodatkowej logiki, tylko braku linku.
- **`lib/panel/rbac.ts:1-42`** — `canPerform(role: HotelRole, resource: Resource, level:
  Permission): boolean`. Zasoby istotne dla 6 pozycji menu: `dashboard`, `services`, `knowledge`,
  `qr_manage` (dla pozycji "QR" — decyzja HITL tej sesji), `orders_view` (dla "Zamówienia"),
  `users`. Brak pojedynczych zasobów `qr`/`orders` — trzeba użyć dokładnie tych nazw.
  `getHotelUser()` (`lib/panel/auth.ts:14-36`, `react cache`) już jest wywoływane w layoucie —
  ponowne wywołanie w komponencie nav jest tanie (dedup).
- **`/onboarding`** jest pod `(hotel)`, ale reachable tylko przez CTA na dashboardzie
  (`app/[locale]/(hotel)/dashboard/page.tsx:41`) — zgodnie z decyzją HITL z `session-plan.md`
  celowo poza szyną (tranzytywny wizard), nadal osiągalny przez URL.
- **`knowledge_chunks`** (kategoria `local` = "okolica" w UI) jest dziś pytana wyłącznie przez
  `fetchKbSections()` (`lib/kb/fetch.ts:54-127`) — funkcja zbiorcza dla promptu AI concierge,
  pobiera też `services` i liczy `content_hash`/okna czasowe. Zbyt ciężka do re-użycia na
  `/discover` (niepotrzebne zapytanie do `services` przy każdym wejściu na stronę) — potrzebna
  lżejsza, dedykowana funkcja.
- **i18n**: `next-intl`, `messages/pl.json` + `messages/en.json`, `localePrefix: 'never'`
  (`i18n/routing.ts:3-7`). Wzorzec: jeden top-level namespace per feature (`guest.categories`,
  `users.list`, `qr`, itd.), używany przez `useTranslations()` (klient) lub
  `getTranslations()` (serwer). Brak dziś namespace `nav`/`sidebar`/`menu` w żadnym pliku.
- **Testy**: `vitest`, wzorzec `lib/panel/__tests__/rbac.test.ts` — proste `describe`/`it` per
  zasób, `canPerform(role, resource, level)` assertions. `npm run test` = `vitest run
  --passWithNoTests`.

### Key Discoveries:

- Rozszerzenie `getGuestSessionContext` (zamiast osobnego zapytania) było jawną decyzją HITL tej
  sesji — jeden cache'owany punkt prawdy o sesji gościa, dostępny wszędzie bez dodatkowego query.
- `FloatingConciergeButton` ma logikę "✕ zamknij" gdy `pathname === '/concierge'`
  (`floating-concierge-button.tsx:12-22`) — ta funkcja zamknięcia staje się zbędna, bo nawigacja
  dolna jest trwała i użytkownik przechodzi na inną zakładkę, nie "zamyka" ekranu.
- `qr_manage` ma `viewer: 'none'` w macierzy RBAC (`rbac.ts:26`) — świadoma konsekwencja decyzji
  HITL: rola `viewer` nie zobaczy pozycji "QR" w szynie, mimo że ma `qr_sessions: 'read'`.

## Desired End State

Obie aplikacje mają trwały, RBAC-świadomy (panel) i stanowo świadomy (aktywna zakładka/sekcja)
chrome nawigacyjny widoczny na każdej odpowiedniej stronie. Weryfikacja: `npm run build && npm run
lint && npm run typecheck && npm run test` przechodzą bez regresji; manualny przegląd obu
interfejsów potwierdza DoD z `session-plan.md` §S6.0.

### Key Discoveries:

(patrz Current State Analysis powyżej — zebrane tam, żeby uniknąć duplikacji)

## What We're NOT Doing

- Design tokeny, shadcn/ui, retrofit wizualny — to S6.1, wykonywany **po** tej sesji.
- Żadne zmiany w RBAC matrix, RLS policies, guardach stron (`requireGuestSession()`,
  `RequirePermission`) — nav tylko **czyta** istniejące uprawnienia/sesję.
- `/admin` nie dostaje żadnej nawigacji ani zmian — pozostaje osobnym route tree.
- Onboarding nie trafia do szyny panelu (decyzja HITL już zapadła w `session-plan.md`).
- Brak nowej treści redakcyjnej dla `/discover` — strona renderuje to, co już istnieje w
  `knowledge_chunks` kategorii `local`; pusty stan gdy brak treści.
- Brak zmian w `OfflineToast` — jego pozycja (`top-20`) nie koliduje z dolną nawigacją.
- Smoke testy renderowania nowych stron `/amenities`/`/my-stay`/`/discover` — decyzja HITL tej
  sesji ogranicza automatyczne testy do RBAC filtering + aktywny stan nav (patrz Testing Strategy).

## Implementation Approach

Pięć faz, każda kończy się działającym stanem: (1) szyna panelu — najprostszy komponent, jeden
punkt integracji, ustanawia wzorzec RBAC-filtered nav; (2) dolna nawigacja gościa + `/amenities` —
usuwa FAB, wprowadza wzorzec ukrywania wg ścieżki, re-używa `CategoryGrid`; (3) `/my-stay` —
rozszerza sesję gościa, jedyna faza dotykająca zapytania SQL; (4) `/discover` — nowe, lekkie
zapytanie do `knowledge_chunks`; (5) testy + weryfikacja końcowa. Kolejność: panel przed gościem,
bo panel nie ma żadnych konfliktów UI (FAB) do rozplątania — szybki, bezpieczny pierwszy krok
ustanawiający wzorzec przed bardziej złożoną fazą 2.

## Critical Implementation Details

### Timing & lifecycle

Oba komponenty nav muszą znać bieżącą ścieżkę do podświetlenia aktywnej pozycji — wymaga to
`usePathname()` z `next/navigation`, więc **oba komponenty są `'use client'`**, mimo że dane
wejściowe (RBAC-filtrowana lista pozycji dla panelu, `authLevel`/sesja dla gościa — nieużywana
bezpośrednio, bo nav renderuje się identycznie niezależnie od `auth_level` per DoD) są liczone
server-side w layoucie nadrzędnym i przekazywane jako props. Wzorzec: layout (server) pobiera dane
→ przekazuje gotową, przefiltrowaną listę pozycji jako prop do klienckiego komponentu nav, który
tylko odczytuje `usePathname()` do podświetlenia. To ten sam podział odpowiedzialności co istniejący
`FloatingConciergeButton` (klient, `usePathname()`).

## Phase 1: Panel — szyna nawigacyjna

### Overview

Buduje `components/panel/sidebar-nav.tsx` i wpina ją w `app/[locale]/(hotel)/layout.tsx`. Sześć
pozycji filtrowanych przez `canPerform(role, resource, 'read')`, aktywna sekcja podświetlona.

### Changes Required:

#### 1. RBAC-filtered lista pozycji menu

**File**: `lib/panel/nav-items.ts` (nowy)

**Intent**: Statyczna definicja 6 pozycji menu (href, translation key, wymagany `Resource`) plus
funkcja `getVisibleNavItems(role: HotelRole)`, która filtruje przez `canPerform(role, resource,
'read')`. Oddzielenie definicji od komponentu ułatwia unit testing filtrowania bez renderowania
Reacta (zgodnie z decyzją HITL o testach RBAC filtering).

**Contract**: Mapowanie pozycja → zasób: Dashboard→`dashboard`, Usługi→`services`, Baza
wiedzy→`knowledge`, QR→`qr_manage`, Zamówienia→`orders_view`, Użytkownicy→`users`. Eksportuje
`NavItem { href: string; labelKey: string; resource: Resource }[]` i
`getVisibleNavItems(role: HotelRole): NavItem[]`.

#### 2. Komponent szyny

**File**: `components/panel/sidebar-nav.tsx` (nowy)

**Intent**: Kliencki komponent — przyjmuje już przefiltrowaną listę `NavItem[]` jako prop, renderuje
stałą 240px lewą szynę (`style.md` §2.3), podświetla aktywną pozycję przez `usePathname()`
(dokładne dopasowanie prefiksu ścieżki, np. `/qr/print` podświetla "QR").

**Contract**: Props `{ items: NavItem[] }`. Layout Tailwind: `<aside>` szerokości `w-60`
(240px), lista `<Link>` z etykietami z `getTranslations('panelNav')`/`useTranslations('panelNav')`.

#### 3. Integracja w layoucie panelu

**File**: `app/[locale]/(hotel)/layout.tsx`

**Intent**: Po pobraniu `hotelUser` (linia 13, już istnieje) obliczyć `getVisibleNavItems(hotelUser.role)`
i przekazać do `<SidebarNav items={...} />`, opakowując `<header>` + `{children}` w flex container
(`<div className="flex">`) z szyną po lewej i treścią po prawej.

**Contract**: Struktura JSX zmienia się z `<>{header}{children}</>` na
`<div className="flex min-h-screen"><SidebarNav items={items} /><div className="flex-1">{header}
{children}</div></div>`. Żadna logika przekierowań (linie 6-15) się nie zmienia.

#### 4. Tłumaczenia

**File**: `messages/pl.json`, `messages/en.json`

**Intent**: Nowy top-level namespace `panelNav` z 6 kluczami (dashboard/services/knowledge/qr/orders/users).

**Contract**: `panelNav.dashboard`, `panelNav.services`, `panelNav.knowledge`, `panelNav.qr`,
`panelNav.orders`, `panelNav.users` w obu plikach.

### Success Criteria:

#### Automated Verification:

- Unit testy filtrowania RBAC w `lib/panel/__tests__/nav-items.test.ts` przechodzą: `npm run test`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- Zalogowany jako `owner`/`admin`: widoczne wszystkich 6 pozycji, aktywna sekcja podświetlona na
  każdej stronie `(hotel)`.
- Zalogowany jako `viewer`: pozycja "QR" **niewidoczna** (zgodnie z `qr_manage: viewer='none'`),
  pozostałe zgodnie z macierzą RBAC.
- `/onboarding` i `/admin` osiągalne przez bezpośredni URL, nieobecne w szynie.

---

## Phase 2: Gość — dolna nawigacja + strona `/amenities`

### Overview

Buduje `components/guest/bottom-nav.tsx`, wpina w `app/[locale]/(guest)/layout.tsx`, usuwa
`FloatingConciergeButton`, dodaje stronę `/amenities` re-używającą `CategoryGrid`.

### Changes Required:

#### 1. Komponent dolnej nawigacji

**File**: `components/guest/bottom-nav.tsx` (nowy)

**Intent**: Kliencki komponent, 5 stałych zakładek (Dziś/Udogodnienia/Concierge/Mój
pobyt/Odkrywaj), identyczny niezależnie od `auth_level` (każda strona docelowa ma własny guard).
Ukryty na `/scan` (pełnoekranowy skaner, nawigacja myląca przed uzyskaniem sesji).

**Contract**: Props `{}` (bez propsów — statyczna lista tras `/`, `/amenities`, `/concierge`,
`/my-stay`, `/discover`). Wewnętrznie `usePathname()` do: (a) ukrycia komponentu całkowicie gdy
`pathname === '/scan'`, (b) podświetlenia aktywnej zakładki. Touch targets ≥44px (budżet
dostępności z S3.1/S3.5).

#### 2. Integracja w layoucie gościa + usunięcie FAB

**File**: `app/[locale]/(guest)/layout.tsx`

**Intent**: Zastąpić `<FloatingConciergeButton />` przez `<BottomNav />`. Usunąć import
`FloatingConciergeButton`.

**Contract**: Linia 3 (import) i linia 23 (`<FloatingConciergeButton />`) zamienione na import i
użycie `BottomNav`. `OfflineToast` zostaje bez zmian (top-20, brak konfliktu).

#### 3. Usunięcie pliku FAB

**File**: `components/guest/floating-concierge-button.tsx`

**Intent**: Usunąć plik — jedyne miejsce użycia (layout) zostało zastąpione przez `BottomNav`.

**Contract**: Plik usunięty. Weryfikacja braku innych referencji: `grep -r
FloatingConciergeButton` zwraca 0 wyników.

#### 4. Strona `/amenities`

**File**: `app/[locale]/(guest)/amenities/page.tsx` (nowy)

**Intent**: Bezpośrednie przeglądanie 5 kategorii bez przewijania przez powitanie/Polecamy — wywołuje
`requireGuestSession()` + `getVisibleCategories()` (już istnieje, używane na home) i renderuje
`<CategoryGrid visibleCategories={...} />` pod prostym nagłówkiem strony.

**Contract**: Server component, wzorzec identyczny do fragmentu `app/[locale]/(guest)/page.tsx:12-19,26`
(minus `WelcomeBanner`/`PolecamySection`/`SplashScreen`).

#### 5. Tłumaczenia

**File**: `messages/pl.json`, `messages/en.json`

**Intent**: Nowy namespace `guest.nav` (5 etykiet zakładek) + `guest.amenities.title` (nagłówek
strony).

**Contract**: `guest.nav.today`, `guest.nav.amenities`, `guest.nav.concierge`, `guest.nav.myStay`,
`guest.nav.discover`, `guest.amenities.title`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Build passes: `npm run build`
- `grep -r FloatingConciergeButton --include="*.tsx" --include="*.ts" .` zwraca 0 wyników

#### Manual Verification:

- Dolna nawigacja widoczna i funkcjonalna na `/`, `/c/[category]`, `/c/[category]/[service]`,
  `/concierge`, `/my-orders`, `/order-success`, `/amenities`, `/my-stay` (po fazie 3),
  `/discover` (po fazie 4).
- Dolna nawigacja **niewidoczna** na `/scan`.
- `/amenities` renderuje identyczny grid 5 kategorii co dziś na home, bez powitania/Polecamy.
- Touch targets zakładek ≥44px (sprawdzone w devtools).

---

## Phase 3: Gość — `/my-stay`

### Overview

Rozszerza `getGuestSessionContext` o `check_in`/`check_out`, dodaje stronę `/my-stay` z danymi
rezerwacji (imię, numer pokoju w mono, daty w mono) + link do `/my-orders`.

### Changes Required:

#### 1. Rozszerzenie kontekstu sesji gościa

**File**: `lib/guest/session.ts`

**Intent**: Dodać `check_in`/`check_out` do zapytania `reservations` (linia 51-54) i do typu
`GuestSessionContext` (linia 5-17) oraz do zwracanego obiektu (linia 69-81).

**Contract**: `.select('guest_first_name')` → `.select('guest_first_name, check_in,
check_out')`; typ dostaje `checkIn: string | null; checkOut: string | null` (ISO timestamptz jako
string, formatowanie daty po stronie widoku); `guestFirstName` destructuring rozszerzony o
`checkIn`/`checkOut` z `reservation?.check_in ?? null` / `reservation?.check_out ?? null`.

#### 2. Strona `/my-stay`

**File**: `app/[locale]/(guest)/my-stay/page.tsx` (nowy)

**Intent**: Wywołuje `requireGuestSession()`, renderuje imię (lub fallback gdy `null`), numer
pokoju w `font-mono` (wzorzec z `WelcomeBanner`), daty check-in/check-out w formacie bezwzględnym
(`DD.MM.YYYY`) w `font-mono` (decyzja HITL: spójność z numerem pokoju, zero lokalizacji względnych
opisów czasu), link do `/my-orders`.

**Contract**: Server component. Formatowanie daty: `Intl.DateTimeFormat(locale, { day:
'2-digit', month: '2-digit', year: 'numeric' })` na `checkIn`/`checkOut` (gdy nie `null` — sesje
bez rezerwacji, np. `auth_level` niski, mogą mieć `reservationId: null`, wtedy sekcja dat
pominięta, nie pusty stan błędu).

#### 3. Tłumaczenia

**File**: `messages/pl.json`, `messages/en.json`

**Intent**: Nowy namespace `guest.myStay` (nagłówki: imię, numer pokoju, check-in, check-out, link
do zamówień).

**Contract**: `guest.myStay.title`, `guest.myStay.roomLabel`, `guest.myStay.checkInLabel`,
`guest.myStay.checkOutLabel`, `guest.myStay.ordersLink`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Build passes: `npm run build`
- Existing tests referencing `GuestSessionContext` shape still pass: `npm run test`

#### Manual Verification:

- `/my-stay` pokazuje imię, numer pokoju (mono), daty check-in/check-out (mono, format
  `DD.MM.YYYY`) dla sesji z aktywną rezerwacją.
- Sesja bez `reservationId` (np. tylko `roomId`) nie wywala błędu — sekcja dat pominięta.
- Link do `/my-orders` działa.

---

## Phase 4: Gość — `/discover`

### Overview

Nowe, lekkie zapytanie do `knowledge_chunks` kategorii `local`, strona `/discover` renderująca
treść "okolica" lub pusty stan.

### Changes Required:

#### 1. Zapytanie o treść "okolica"

**File**: `lib/guest/discover.ts` (nowy)

**Intent**: Dedykowana, lekka funkcja `getLocalAreaContent(client, propertyId, now?)` — pyta
wyłącznie `knowledge_chunks` z `category = 'local'`, filtruje przez to samo okno dat
(`valid_from`/`valid_until`) co `fetchKbSections` (`lib/kb/fetch.ts:8-12`), ale **bez** dodatkowego
zapytania do `services` (którego `fetchKbSections` potrzebuje do promptu AI, a `/discover` nie
używa). Uzasadnienie decyzji: unikanie zbędnego obciążenia bazy przy każdym wejściu gościa na tę
stronę.

**Contract**: `getLocalAreaContent(client: SupabaseClient<Database>, propertyId: string, now?:
Date): Promise<{ question: string | null; content: string }[]>`. Query: `.from('knowledge_chunks')
.select('question, content, valid_from, valid_until').eq('property_id', propertyId).eq('category',
'local').order('created_at', { ascending: true })`, filtrowane in-memory przez lokalną kopię
logiki `isWithinDateWindow` (duplikacja 4-liniowej funkcji z `lib/kb/fetch.ts:8-12` — zbyt mała,
żeby uzasadniać eksport/refaktor współdzielonego modułu).

#### 2. Strona `/discover`

**File**: `app/[locale]/(guest)/discover/page.tsx` (nowy)

**Intent**: Wywołuje `requireGuestSession()` + `getLocalAreaContent()`, renderuje listę
pytanie/treść (Frank Ruhl Libre nagłówki, Public Sans treść — zgodnie ze stylem §1.2) lub pusty
stan gdy tablica pusta.

**Contract**: Server component, wzorzec zapytania identyczny do `/amenities` (Phase 2.4).

#### 3. Tłumaczenia

**File**: `messages/pl.json`, `messages/en.json`

**Intent**: Nowy namespace `guest.discover` (nagłówek strony, komunikat pustego stanu).

**Contract**: `guest.discover.title`, `guest.discover.empty`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- `/discover` renderuje treść kategorii `local` gdy istnieje w bazie dla property.
- `/discover` renderuje pusty stan (zaproszenie do działania, nie przeprosiny — zgodnie z §1.6
  stylu) gdy brak treści `local` dla property.

---

## Phase 5: Testy + weryfikacja końcowa

### Overview

Domyka sesję: unit testy RBAC filtering (panel) i aktywnego stanu (oba nav), pełny przebieg
`build`/`lint`/`typecheck`/`test`, manualna weryfikacja DoD z `session-plan.md` §S6.0.

### Changes Required:

#### 1. Testy filtrowania RBAC

**File**: `lib/panel/__tests__/nav-items.test.ts` (nowy)

**Intent**: Dla każdej z 4 ról (`owner`/`admin`/`staff`/`viewer`) zweryfikować, że
`getVisibleNavItems(role)` zwraca dokładnie oczekiwany podzbiór 6 pozycji, ze szczególnym naciskiem
na `viewer` nie widzący "QR" (`qr_manage: 'none'`).

**Contract**: Wzorzec `describe`/`it` jak w `lib/panel/__tests__/rbac.test.ts` — assercje na
`.map(i => i.resource)` lub `.map(i => i.href)` zwróconej listy.

#### 2. Testy aktywnego stanu nav

**File**: `components/panel/__tests__/sidebar-nav.test.tsx`, `components/guest/__tests__/bottom-nav.test.tsx` (nowe)

**Intent**: Zweryfikować, że komponent podświetla poprawną pozycję dla danej ścieżki (mockowany
`usePathname()`), oraz że `BottomNav` nie renderuje się (zwraca `null`) na `/scan`.

**Contract**: `@testing-library/react` (jeśli już w projekcie — sprawdzić `package.json`
devDependencies przed implementacją; jeśli brak, dodać jako dev dependency) + mock
`next/navigation`'s `usePathname` przez `vi.mock`.

### Success Criteria:

#### Automated Verification:

- `npm run test` — wszystkie nowe i istniejące testy przechodzą
- `npm run typecheck` przechodzi bez błędów
- `npm run lint` przechodzi bez ostrzeżeń
- `npm run build` przechodzi

#### Manual Verification:

- Pełny przegląd DoD z `session-plan.md` §S6.0: gość — 5 zakładek z poprawnym stanem aktywnym na
  każdej stronie `(guest)` poza `/scan`; `/my-stay` pokazuje dane rezerwacji (numer pokoju w
  mono); `/discover` renderuje treść lub pusty stan; touch targets ≥44px.
- Panel — szyna 240px na każdej stronie `(hotel)`; 6 pozycji filtrowanych przez RBAC; aktywna
  sekcja podświetlona; onboarding/`/admin` nieobecne w menu, osiągalne przez URL.
- Zero regresji w istniejących stronach obu aplikacji (manualny smoke test głównych flow: skan →
  home → zamówienie → concierge; panel: login → dashboard → services).

---

## Testing Strategy

### Unit Tests:

- RBAC filtering: wszystkie 4 role × 6 pozycji menu (Phase 5.1).
- Aktywny stan: reprezentatywne ścieżki dla obu komponentów nav, w tym edge case `/scan` (Phase 5.2).

### Integration Tests:

- Brak nowych — sesja nie dotyka logiki biznesowej wymagającej integration coverage (RLS/RBAC
  matrix niezmieniona).

### Manual Testing Steps:

1. Zalogować się jako każda z 4 ról panelu, sprawdzić widoczność 6 pozycji menu.
2. Przejść przez wszystkie strony `(guest)` sprawdzając widoczność i aktywny stan dolnej nawigacji.
3. Zeskanować kod QR (`/scan`) i potwierdzić brak dolnej nawigacji na tym ekranie.
4. Sprawdzić `/my-stay` dla sesji z rezerwacją i bez rezerwacji (edge case `reservationId: null`).
5. Sprawdzić `/discover` dla property z i bez treści kategorii `local`.

## Performance Considerations

`getLocalAreaContent` (Phase 4) celowo unika zapytania do `services`, którego wymaga
`fetchKbSections` — jedno mniejsze zapytanie zamiast dwóch przy każdym wejściu na `/discover`.

## Migration Notes

Brak migracji bazy danych — `check_in`/`check_out` już istnieją w schemacie `reservations`
(`supabase/migrations/20260626000001_initial_schema.sql:80-81`), sesja tylko rozszerza
`SELECT`.

## References

- Session spec: `context/foundation/session-plan.md` sekcja S6.0
- Style guide: `context/foundation/style.md` §1.3, §1.6, §2.3, §3
- Gap discovery: `context/changes/s6-1/plan.md:178`, `context/foundation/session-plan.md:342-346`
- RBAC pattern: `lib/panel/rbac.ts:1-42`, `lib/panel/__tests__/rbac.test.ts`
- Guest session: `lib/guest/session.ts:19-82`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Panel — szyna nawigacyjna

#### Automated

- [x] 1.1 Unit testy filtrowania RBAC przechodzą: `npm run test` — 2d552e6
- [x] 1.2 Type checking passes: `npm run typecheck` — 2d552e6
- [x] 1.3 Linting passes: `npm run lint` — 2d552e6
- [x] 1.4 Build passes: `npm run build` — 2d552e6

#### Manual

- [x] 1.5 Owner/admin widzą wszystkich 6 pozycji, aktywna sekcja podświetlona — 2d552e6
- [x] 1.6 Viewer nie widzi "QR" — 2d552e6
- [x] 1.7 Onboarding/`/admin` osiągalne przez URL, nieobecne w szynie — 2d552e6

### Phase 2: Gość — dolna nawigacja + `/amenities`

#### Automated

- [x] 2.1 Type checking passes: `npm run typecheck` — c3a54b8
- [x] 2.2 Linting passes: `npm run lint` — c3a54b8
- [x] 2.3 Build passes: `npm run build` — c3a54b8
- [x] 2.4 `grep -r FloatingConciergeButton` zwraca 0 wyników — c3a54b8

#### Manual

- [x] 2.5 Dolna nawigacja widoczna i funkcjonalna na stronach `(guest)` — c3a54b8
- [x] 2.6 Dolna nawigacja niewidoczna na `/scan` — c3a54b8
- [x] 2.7 `/amenities` renderuje grid 5 kategorii bez powitania/Polecamy — c3a54b8
- [x] 2.8 Touch targets ≥44px — c3a54b8

### Phase 3: Gość — `/my-stay`

#### Automated

- [x] 3.1 Type checking passes: `npm run typecheck` — 300c01e
- [x] 3.2 Linting passes: `npm run lint` — 300c01e
- [x] 3.3 Build passes: `npm run build` — 300c01e
- [x] 3.4 Existing tests pass: `npm run test` — 300c01e

#### Manual

- [x] 3.5 `/my-stay` pokazuje imię, numer pokoju (mono), daty (mono, DD.MM.YYYY) — 300c01e
- [x] 3.6 Sesja bez `reservationId` nie wywala błędu — 300c01e
- [x] 3.7 Link do `/my-orders` działa — 300c01e

### Phase 4: Gość — `/discover`

#### Automated

- [x] 4.1 Type checking passes: `npm run typecheck` — ffb3143
- [x] 4.2 Linting passes: `npm run lint` — ffb3143
- [x] 4.3 Build passes: `npm run build` — ffb3143

#### Manual

- [x] 4.4 `/discover` renderuje treść kategorii `local` gdy istnieje — ffb3143
- [x] 4.5 `/discover` renderuje pusty stan gdy brak treści — ffb3143

### Phase 5: Testy + weryfikacja końcowa

#### Automated

- [x] 5.1 `npm run test` — wszystkie testy przechodzą
- [x] 5.2 `npm run typecheck` przechodzi
- [x] 5.3 `npm run lint` przechodzi
- [x] 5.4 `npm run build` przechodzi

#### Manual

- [ ] 5.5 Pełny przegląd DoD §S6.0 (gość + panel)
- [ ] 5.6 Zero regresji w istniejących flow (guest smoke test, panel smoke test)
