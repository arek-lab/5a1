# Browse + flow zamówienia (3–4 tapy) — Plan implementacji (S3.2)

## Overview

Budujemy trzon guest-facing flow zamówienia z §5 roadmapy: listę usług per kategoria, kartę usługi z CTA „Zamów", modal potwierdzenia, zapis zamówienia (`POST /api/orders`, Network Only) i pełnoekranowy ekran sukcesu. To domyka E2E-01 (gate przed pilotem) razem z S3.1 (splash/welcome/home) i S3.3 (SSE statusu w `/orders`, poza zakresem tej sesji).

## Current State Analysis

- S3.1 (`context/changes/s3-1/plan.md`, status `implementing`) dostarczył: `requireGuestSession()`/`getGuestSessionContext()` (`lib/guest/session.ts`), layout gościa z guardem (`app/[locale]/(guest)/layout.tsx`), `CategoryGrid` (`components/guest/category-grid.tsx` — statyczny, renderuje wszystkie 5 kategorii, **stringi na sztywno po polsku, nie next-intl**), `getPinnedServices` (`lib/guest/services.ts`). Faza 5 S3.1 (tłumaczenia) jest jeszcze niezamknięta — traktujemy to jako założenie do zweryfikowania na starcie tej sesji (patrz Open Risks w brief).
- `GuestSessionContext` (`lib/guest/session.ts:5-13`) ma `roomNumber: string | null`, ale **nie eksponuje `roomId`/`reservationId`** — `orders.room_id`/`orders.reservation_id` (nullable FK) potrzebują surowych ID, nie tylko wyświetlanego numeru pokoju.
- `services` (`supabase/migrations/20260626000001_initial_schema.sql:126-141`): `category`, `price_cents` (NULL = „W cenie pobytu"), `is_active`, `is_pinned`, `available_from`/`available_to` (TIME, godziny dostępności usługi — **nie** flaga time-sensitive). RLS: `guest_read_services` (SELECT, property-scoped) już istnieje.
- `orders` (tamże, linie 144-156): `property_id`, `session_id`, `reservation_id`, `room_id`, `service_id`, `price_cents`, `note`, `status` (`order_status` enum, default `'new'`), `scheduled_at`. RLS: `guest_insert_orders` i `guest_read_own_orders` już istnieją (`supabase/migrations/20260626000002_rls_policies.sql:96-106`) — **żadna zmiana RLS nie jest potrzebna**. Trigger `orders_notify_change` (`20260707000001_orders_notify_trigger.sql`) już wysyła `pg_notify('orders_changed', ...)` przy INSERT — panel (S2.6) już nasłuchuje.
- Wzorzec CRUD panelu (`app/[locale]/(hotel)/services/{actions.ts,service-form.tsx,service-list.tsx}`, `lib/panel/service-validation.ts`) to ustalony wzorzec: `'use server'` + `getHotelUser()` + `canPerform()` gate + ręczna walidacja stringów (bez zod) + `revalidatePath`. Klient: `'use client'` + `useState`/`useTransition`, next-intl `useTranslations`, surowy HTML (brak biblioteki komponentów).
- Guest-facing zapisy krytyczne (scan) używają Route Handlerów, nie Server Actions (`app/api/scan/*`, S1.2) — wzorzec do powielenia dla `POST /api/orders`, spójny też z regułą Workbox „Network Only" (S3.5) łatwiejszą do wyrażenia po URL route handlera.
- Test framework: Vitest, mock `@/lib/supabase/*`/`@/lib/supabase/tenant` per istniejące testy (`app/[locale]/(hotel)/services/__tests__/actions.test.ts`, `lib/guest/__tests__/*.test.ts`). Brak E2E tooling w repo (potwierdzone w S3.1) — bez zmian w tej sesji.
- `properties.timezone` (default `Europe/Warsaw`) istnieje w schemacie, ale nie jest potrzebny w tej sesji — sloty godzin liczone są z okna `available_from`–`available_to` usługi, bez porównania z bieżącym czasem (decyzja HITL: „niedostępność" = wyłącznie `is_active=false`).

## Desired End State

Gość z ważną sesją (`auth_level >= 1`) może: wejść na `/`, zobaczyć siatkę kategorii ograniczoną do tych, w których property ma aktywne usługi; wejść w kategorię (`/c/[category]`) i zobaczyć karty usług z ceną (lub „W cenie pobytu"), przy czym nieaktywne usługi są wyszarzone z etykietą „Tymczasowo niedostępne", ale nadal widoczne i nieklikalne; wejść w usługę (`/c/[category]/[service]`) i zobaczyć szczegóły + CTA „Zamów" (+ picker godziny co 30 min w oknie `available_from`–`available_to`, tylko dla usług oznaczonych `is_time_sensitive`); kliknąć „Zamów" → modal z opcjonalnym polem „Uwagi" (max 500 znaków) i przyciskiem „Dopisz do rachunku pokoju"; po potwierdzeniu — `POST /api/orders` tworzy wiersz w `orders` (RLS-scoped, bez żadnego inputu gościa poza uwagami/godziną); błąd sieci/5xx pokazuje inline komunikat z przyciskiem „Spróbuj ponownie", bez utraty wpisanych danych; sukces prowadzi do pełnoekranowego ekranu z podsumowaniem, linkiem do `/orders` (istnieje dopiero po S3.3 — link poprawny, strona doda się tam) i przyciskiem powrotu do listy usług. Hotel może oznaczyć usługę jako „wymaga godziny" w panelu (`/services`, checkbox obok istniejących pól).

### Key Discoveries:

- `guest_insert_orders`/`guest_read_own_orders` i trigger NOTIFY już istnieją — S3.2 to czysto warstwa aplikacyjna nad gotowym zapisem, poza jedną migracją dla `is_time_sensitive`.
- `CategoryGrid` (S3.1) trzeba przerobić z komponentu bezstanowego na taki, który przyjmuje listę widocznych kategorii jako prop — zapytanie o liczbę aktywnych usług per kategoria robi strona `/` (i analogicznie `/c/[category]` samo nie potrzebuje tej listy, tylko `page.tsx` na home).
- `GuestSessionContext` wymaga rozszerzenia o `roomId`/`reservationId` (surowe UUID), bo `session.ts:29-33` już pobiera `session.room_id`/`session.reservation_id` z bazy, tylko ich nie eksponuje w zwracanym obiekcie.

## What We're NOT Doing

- Bez Service Workera / strategii cache Workbox (S3.5) — „Network Only" w tej sesji oznacza tylko: route handler, żadnego SW jeszcze nie ma.
- Bez `/orders` (lista zamówień gościa + SSE) — to S3.3; link z ekranu sukcesu wskazuje na przyszłą trasę.
- Bez ekranów błędów P0/P1 (token wygasły, offline toast, 5xx generyczny) — to S3.4; obsługujemy tylko błąd POST-a zamówienia inline w modalu, bo to część flow zamówienia z roadmapy §5.4.
- Bez automatyzacji E2E-01 (Playwright) — zostaje weryfikacją manualną, zgodnie z decyzją HITL i wzorcem S3.1.
- Bez zmiany definicji „niedostępności" o logikę czasową (`available_from/to` vs. bieżący czas) — wyłącznie `is_active=false`, zgodnie z decyzją HITL.
- Bez auto-tłumaczenia treści usług (poza zakresem, jak w S2.3).
- Bez koszyka / wielu pozycji w jednym zamówieniu — jedna usługa = jedno zamówienie (§5.5 anti-pattern „Koszyk/cart" zakazany wprost).

## Implementation Approach

Warstwowo od dołu: najpierw migracja + panelowa obsługa `is_time_sensitive` (Faza 1), potem warstwa danych gościa (zapytania, sloty godzin, rozszerzenie sesji) bez UI (Faza 2), potem trasy przeglądania (Faza 3), potem sam zapis zamówienia + ekran sukcesu (Faza 4), na końcu tłumaczenia/testy/weryfikacja manualna (Faza 5). Każda faza daje działający, testowalny wycinek.

## Critical Implementation Details

### Zależność od stanu S3.1

Faza 5 planu S3.1 (tłumaczenia `guest.*` w `messages/{pl,en}.json`, przełącznik języka wpływający na `CategoryGrid`) jest odnotowana jako niezamknięta w `context/changes/s3-1/plan.md` (checkboxy 5.1–5.7 puste). Ta sesja zakłada, że do czasu implementacji S3.2 klucze `guest.*` z S3.1 już istnieją (przerabiamy `CategoryGrid` na next-intl w Fazie 3 niezależnie od tego, czy S3.1 to zrobił — jeśli klucze już są, dodajemy do nich; jeśli nie, tworzymy blok `guest` od zera). Nie blokuje to Fazy 1–2.

## Phase 1: Schemat — `is_time_sensitive` + obsługa w panelu

### Overview

Dodajemy kolumnę i minimalny sposób jej ustawiania przez hotel — bez tego guest UI nie ma na czym testować pickera godziny.

### Changes Required:

#### 1. Migracja `is_time_sensitive`

**File**: `supabase/migrations/20260710110000_services_time_sensitive.sql`

**Intent**: Dodać kolumnę oznaczającą usługi wymagające pickera godziny przy zamówieniu (śniadanie, masaż, wake-up, transfer).

**Contract**: `ALTER TABLE services ADD COLUMN is_time_sensitive BOOLEAN NOT NULL DEFAULT false;` — bez zmian RLS (istniejące polityki `staff_all_services`/`guest_read_services` operują na całym wierszu).

#### 2. Walidacja + akcje panelu

**File**: `lib/panel/service-validation.ts`, `app/[locale]/(hotel)/services/actions.ts`

**Intent**: `validateServiceInput` przyjmuje i przepuszcza `isTimeSensitive: boolean` (zawsze poprawny — checkbox, brak walidacji do zawężenia); `createCustomService`/`createServiceFromTemplate`/`updateService` zapisują `is_time_sensitive` z `formData.get('is_time_sensitive') === 'on'`.

**Contract**: `ServiceInput`/`ServiceInputValue` (`service-validation.ts:3-15`) zyskują pole `isTimeSensitive: boolean`; trzy `insert`/`update` w `actions.ts` dopisują `is_time_sensitive: validated.value.isTimeSensitive`.

#### 3. Formularz i lista panelu

**File**: `app/[locale]/(hotel)/services/service-form.tsx`, `app/[locale]/(hotel)/services/service-list.tsx`

**Intent**: Checkbox „Wymaga wyboru godziny" obok istniejącego `included` (wzorzec identyczny — `useState<boolean>` + `formData.set`). Lista pokazuje krótką etykietę/badge przy usługach z `is_time_sensitive=true`, analogicznie do istniejącego badge'a `pinned`.

**Contract**: `ServiceRecord` (`service-list.tsx:10-20`) zyskuje `is_time_sensitive: boolean`; strona `page.tsx` (server component pobierający listę) dopisuje kolumnę do `select(...)`.

#### 4. Tłumaczenia panelu

**File**: `messages/pl.json`, `messages/en.json`

**Intent**: Nowe klucze `services.form.fields.timeSensitive` i `services.list.timeSensitiveLabel`, w istniejącym bloku `services` (linie ~74+ w `pl.json`).

### Success Criteria:

#### Automated Verification:

- Migracja aplikuje się: `npx supabase db reset` (lub `supabase migration up` wg lokalnego workflow)
- Unit testy przechodzą: `npm run test -- lib/panel/service-validation app/\[locale\]/\(hotel\)/services`
- Type checking: `npm run typecheck`
- Linting: `npm run lint`

#### Manual Verification:

- W panelu `/services` zaznaczenie „Wymaga wyboru godziny" przy zapisie usługi trwale ustawia flagę (widoczne po odświeżeniu)
- Usługa bez zaznaczenia ma `is_time_sensitive=false` (weryfikacja przez podgląd danych w Supabase Studio)

---

## Phase 2: Warstwa danych gościa

### Overview

Zapytania i logika bez UI: lista kategorii z licznikiem aktywnych usług, usługi per kategoria, pojedyncza usługa, generowanie slotów godzin, rozszerzenie kontekstu sesji o surowe ID.

### Changes Required:

#### 1. Rozszerzenie `GuestSessionContext`

**File**: `lib/guest/session.ts`

**Intent**: Wystawić `roomId`/`reservationId` (surowe UUID), potrzebne przy tworzeniu zamówienia (`orders.room_id`/`orders.reservation_id`) — dane już są pobierane (`session.room_id`, `session.reservation_id`), brakuje tylko przekazania ich w zwracanym obiekcie.

**Contract**: `GuestSessionContext` zyskuje `roomId: string | null` i `reservationId: string | null`; `return` na końcu `getGuestSessionContext` dopisuje te dwa pola z już posiadanych `session.room_id`/`session.reservation_id`.

#### 2. Kategorie z licznikiem aktywnych usług

**File**: `lib/guest/services.ts`

**Intent**: `getVisibleCategories(client, propertyId)` zwraca podzbiór `SERVICE_CATEGORIES`, dla których istnieje ≥1 aktywna usługa — do ukrywania pustych kategorii na home (§5.1 roadmapy).

**Contract**: Jedno zapytanie `select('category').eq('property_id', propertyId).eq('is_active', true)`, deduplikacja w JS do `ServiceCategory[]` zachowującej kolejność `SERVICE_CATEGORIES`. Brak `GROUP BY`/`count` po stronie SQL — wystarczy zbiór unikalnych kategorii, prostsze niż agregacja.

#### 3. Usługi per kategoria

**File**: `lib/guest/services.ts`

**Intent**: `getServicesByCategory(client, propertyId, category)` zwraca wszystkie usługi property'ego w danej kategorii (aktywne i nieaktywne — nieaktywne renderują się wyszarzone, nie są ukrywane, zgodnie z §5.5 anti-pattern #3).

**Contract**: `.eq('property_id', propertyId).eq('category', category).order('is_active', {ascending: false}).order('name')` — aktywne usługi pierwsze, nieaktywne na końcu listy (naturalne "greyed at the bottom" bez dodatkowego sortowania po stronie klienta).

#### 4. Pojedyncza usługa + sloty godzin

**File**: `lib/guest/services.ts`, `lib/guest/time-slots.ts`

**Intent**: `getServiceById(client, propertyId, serviceId)` zwraca jedną usługę (`null` gdy nie istnieje / inny property — RLS + jawny `.eq('property_id', ...)`). `generateTimeSlots(availableFrom: string | null, availableTo: string | null, stepMinutes = 30)` — czysta funkcja zwracająca `string[]` (`"HH:MM"`) między godzinami; pusta tablica gdy któraś z godzin jest `null` (fallback: usługa `is_time_sensitive=true` bez wypełnionego okna dostępności nie pokazuje pickera, CTA „Zamów" działa bez wyboru godziny — brak awaryjnego zablokowania zamówienia z powodu braku danych w panelu).

**Contract**: `generateTimeSlots` — czysta funkcja, testowalna bez mocków; parsuje `TIME` (`"HH:MM:SS"`) z Supabase, generuje kroki co `stepMinutes` inclusive od-do.

### Success Criteria:

#### Automated Verification:

- Unit testy przechodzą: `npm run test -- lib/guest/services lib/guest/time-slots lib/guest/session`
- Type checking: `npm run typecheck`
- Linting: `npm run lint`

#### Manual Verification:

- `getVisibleCategories` dla property z usługami tylko w 2 z 5 kategorii zwraca dokładnie te 2 (zweryfikowane tymczasowym console.log, usuniętym przed końcem fazy)

---

## Phase 3: Trasy przeglądania — lista + szczegóły + puste kategorie na home

### Overview

`/c/[category]` (karty usług), `/c/[category]/[service]` (szczegóły + CTA), przebudowa `CategoryGrid` na next-intl + filtr widocznych kategorii, aktualizacja home page.

### Changes Required:

#### 1. `CategoryGrid` — next-intl + filtr widoczności

**File**: `components/guest/category-grid.tsx`

**Intent**: Zamienić statyczne polskie stringi na `useTranslations('guest.categories')` (spójnie z wzorcem panelu `tCategories(c)`); komponent przyjmuje `visibleCategories: ServiceCategory[]` jako prop zamiast iterować po pełnym `SERVICE_CATEGORIES`.

**Contract**: Props: `{ visibleCategories: ServiceCategory[] }`; ikony (`CATEGORY_ICON`) zostają statyczną mapą lokalną, etykiety idą przez `t(category)`.

#### 2. Home page — przekazanie widocznych kategorii

**File**: `app/[locale]/(guest)/page.tsx`

**Intent**: Wywołać `getVisibleCategories` obok istniejącego `getPinnedServices` i przekazać wynik do `CategoryGrid`.

**Contract**: Jedno dodatkowe wywołanie w istniejącym Server Component, wzorzec identyczny do już istniejącego pobrania `PinnedService[]`.

#### 3. Lista usług `/c/[category]`

**File**: `app/[locale]/(guest)/c/[category]/page.tsx`, `components/guest/service-card.tsx`

**Intent**: Server Component: `requireGuestSession()` → walidacja `category` param względem `SERVICE_CATEGORIES` (404/`notFound()` dla nieznanej wartości) → `getServicesByCategory` → render kart. `ServiceCard`: nazwa, cena (`price_cents === null` → „W cenie pobytu”, inaczej sformatowana kwota), wyszarzenie + etykieta „Tymczasowo niedostępne” gdy `!is_active`, link do `/c/[category]/[id]` (nieaktywne karty renderują się jako `<div>` nieklikalne, nie `<Link>` — zapobiega wejściu na stronę zamówienia niedostępnej usługi).

**Contract**: `ServiceCard` props: `{ service: ServiceListItem, category: ServiceCategory }` gdzie `ServiceListItem` to zwężony typ z `getServicesByCategory` (`id`, `name`, `priceCents`, `isActive`, `imageUrl`).

#### 4. Karta usługi `/c/[category]/[service]`

**File**: `app/[locale]/(guest)/c/[category]/[service]/page.tsx`, `components/guest/order-cta.tsx`

**Intent**: Server Component: `requireGuestSession()` → `getServiceById` (`notFound()` gdy `null` lub `!is_active` — niedostępna usługa nie ma dostępnej strony szczegółów, tylko wyszarzoną kartę na liście) → render opisu/ceny + `OrderCta` (client component: CTA „Zamów”, jeśli `is_time_sensitive` render `<select>` slotów z `generateTimeSlots`, otwiera modal z Fazy 4).

**Contract**: `OrderCta` props: `{ service: ServiceDetail, guestContext: { propertyId, sessionId, roomId, reservationId } }` — przekazuje dalej do modalu Fazy 4 bez własnej logiki zapisu.

### Success Criteria:

#### Automated Verification:

- Unit testy przechodzą: `npm run test -- components/guest/category-grid components/guest/service-card`
- Type checking: `npm run typecheck`
- Linting: `npm run lint`

#### Manual Verification:

- Home pokazuje tylko kategorie z aktywnymi usługami dla testowego property
- `/c/[category]` z nieznanym segmentem (spoza `SERVICE_CATEGORIES`) zwraca 404
- Nieaktywna usługa jest wyszarzona na liście, nieklikalna, i jej strona szczegółów (bezpośredni URL) zwraca 404
- Usługa z `is_time_sensitive=true` i wypełnionym `available_from/to` pokazuje select ze slotami co 30 min; bez wypełnionych godzin CTA działa bez selecta

---

## Phase 4: Flow zamówienia — modal, zapis, ekran sukcesu

### Overview

Modal potwierdzenia z polem „Uwagi”, `POST /api/orders`, obsługa błędu z retry, pełnoekranowy ekran sukcesu.

### Changes Required:

#### 1. Route handler zapisu zamówienia

**File**: `app/api/orders/route.ts`

**Intent**: `POST` — mirror wzorca `/api/scan/*` (S1.2): odczyt `x-property-id`/`x-session-id` z żądania → `withTenantContext` → walidacja body (`serviceId` UUID, `note` opcjonalny string ≤500 znaków, `scheduledTime` opcjonalny `"HH:MM"`) → weryfikacja, że usługa istnieje, należy do property'ego i jest `is_active` (obrona przed zamówieniem usługi wyszarzonej między renderem a submitem) → `insert` do `orders` z `session_id`/`property_id`/`room_id`/`reservation_id` z sesji (nigdy z body — gość nic nie wpisuje, HITL #1) → `201` z `{ orderId }`, lub `4xx`/`5xx` z komunikatem błędu.

**Contract**: Request body: `{ serviceId: string; note?: string; scheduledTime?: string }`. Response sukcesu: `{ orderId: string }`. `scheduled_at` w bazie budowany z dzisiejszej daty (serwer, strefa `properties.timezone`) + `scheduledTime`, `null` gdy brak.

#### 2. Modal potwierdzenia

**File**: `components/guest/order-confirm-modal.tsx`

**Intent**: `'use client'`, otwierany z `OrderCta` (Fazy 3): podsumowanie usługi + textarea „Uwagi” (opcjonalna, licznik znaków, cap 500 wymuszony `maxLength`) + przycisk „Dopisz do rachunku pokoju” → `fetch('/api/orders', { method: 'POST', ... })`. Stan błędu: modal zostaje otwarty, pokazuje inline komunikat + przycisk „Spróbuj ponownie” (ponawia ten sam fetch, `note`/`scheduledTime` zachowane w stanie komponentu). Sukces: `router.push('/order-success?orderId=...')`.

**Contract**: Props: `{ service: ServiceDetail, guestContext: {...}, scheduledTime?: string, onClose: () => void }`.

#### 3. Ekran sukcesu

**File**: `app/[locale]/(guest)/order-success/page.tsx`

**Intent**: Pełnoekranowa strona (nie toast, zgodnie z §5.2/§5.5): podsumowanie zamówienia (nazwa usługi — dociągnięta po `orderId` z query param przez server-side query do `orders`+`services`), status „Złożone”, link do `/orders` (trasa z S3.3, jeszcze nieistniejąca — link poprawny, 404 do czasu S3.3) i przycisk „Wróć do listy usług” (do `/`).

**Contract**: `searchParams: { orderId?: string }`; `requireGuestSession()` + zapytanie `orders` scoped przez RLS (`guest_read_own_orders` — zamówienie musi należeć do bieżącej sesji, inaczej `notFound()`).

### Success Criteria:

#### Automated Verification:

- Unit testy przechodzą: `npm run test -- app/api/orders components/guest/order-confirm-modal`
- Type checking: `npm run typecheck`
- Linting: `npm run lint`

#### Manual Verification:

- Pełny happy path: kategoria → usługa → „Zamów” → modal → „Dopisz do rachunku” → ekran sukcesu → wiersz widoczny w `orders` z poprawnym `session_id`/`property_id`/`room_id` (E2E-01 z roadmapy, weryfikacja manualna)
- Wyłączenie sieci (DevTools offline) podczas submitu pokazuje inline błąd + „Spróbuj ponownie” w modalu, bez utraty wpisanych „Uwag”
- Usługa time-sensitive: wybrana godzina trafia do `orders.scheduled_at`
- RLS: property A nie widzi zamówień property B po `orderId` z innego property (`guest_read_own_orders` scoped po `session_id`, dodatkowo zweryfikować manualnie)

---

## Phase 5: Tłumaczenia, testy, weryfikacja manualna

### Overview

Klucze PL/EN dla wszystkiego z Faz 3–4, uzupełnienie pokrycia testów, pełny przebieg build + manualny E2E-01.

### Changes Required:

#### 1. Klucze tłumaczeń

**File**: `messages/pl.json`, `messages/en.json`

**Intent**: Blok `guest` (nowy lub rozszerzenie istniejącego z S3.1) obejmujący: nazwy kategorii (`guest.categories.*`), etykiety karty usługi („W cenie pobytu”, „Tymczasowo niedostępne”), modal potwierdzenia (pole Uwagi, przycisk, błąd + retry), ekran sukcesu, panel „Wymaga wyboru godziny” (jeśli nie dodane w Fazie 1).

**Contract**: Nested obiekty wzorem `services.list`/`services.form`.

#### 2. Pozostałe testy jednostkowe

**File**: `lib/guest/__tests__/time-slots.test.ts`, `lib/guest/__tests__/services.test.ts` (rozszerzenie), `app/api/orders/__tests__/route.test.ts`, `components/guest/__tests__/order-confirm-modal.test.tsx`

**Intent**: Pokrycie: `generateTimeSlots` (pełne okno, `null` wejścia, krok 30 min), `getVisibleCategories`/`getServicesByCategory` (puste property, mix aktywne/nieaktywne), route handler `/api/orders` (happy path insert, usługa nieaktywna → odrzucone, brak sesji → 401, `note` >500 znaków → odrzucone), modal (stan błędu + retry zachowuje `note`).

**Contract**: Mocking `@/lib/supabase/tenant`, `@/lib/supabase/server` per istniejący wzorzec z `lib/guest/__tests__/*.test.ts`.

### Success Criteria:

#### Automated Verification:

- Pełny zestaw testów przechodzi: `npm run test`
- Type checking: `npm run typecheck`
- Linting: `npm run lint`
- Build produkcyjny przechodzi: `npm run build`

#### Manual Verification:

- E2E-01 pełny przebieg (QR scan → splash → welcome → home → kategoria → usługa → modal → „Dopisz do rachunku” → ekran sukcesu) zweryfikowany ręcznie, zgodnie z asercjami roadmapy (gość nic nie wpisał poza opcjonalnymi Uwagami; zero pola karty)
- Przełącznik PL|EN zmienia wszystkie nowe stringi z tej sesji

---

## Testing Strategy

### Unit Tests:

- `generateTimeSlots`: pełne okno, brakujące `available_from`/`available_to`, krok 30 min, granice (np. 07:00–10:00 → 7 slotów)
- `getVisibleCategories`/`getServicesByCategory`: puste property, wszystkie nieaktywne, mix
- Route handler `/api/orders`: happy path, usługa cudza/nieaktywna/nieistniejąca, brak nagłówków sesji, `note` za długi
- `validateServiceInput` z `isTimeSensitive`: zawsze `ok: true` niezależnie od wartości (boolean, brak reguł do złamania)

### Integration Tests:

- Nie dotyczy w tej sesji (brak E2E tooling, zgodnie z decyzją HITL i wzorcem S3.1) — pełny flow to E2E-01, weryfikowany manualnie.

### Manual Testing Steps:

1. W panelu oznaczyć jedną usługę jako `is_time_sensitive` z wypełnionym `available_from/to`, jedną dezaktywować.
2. Zeskanować QR (recepcja + pokój), przejść przez `/` → kategoria z aktywnymi usługami → usługa time-sensitive → wybrać godzinę → „Zamów” → wpisać Uwagi → „Dopisz do rachunku” → potwierdzić ekran sukcesu.
3. Sprawdzić w Supabase Studio wiersz `orders`: `session_id`, `room_id`, `reservation_id`, `scheduled_at`, `note` poprawne.
4. Wejść na `/c/[category]` z kategorią bez aktywnych usług spoza grida (bezpośredni URL) i potwierdzić, że karty nieaktywnych usług są wyszarzone, nie ukryte.
5. Wyłączyć sieć w DevTools, spróbować złożyć zamówienie, potwierdzić inline błąd + retry bez utraty Uwag.
6. Przełączyć język, potwierdzić tłumaczenie wszystkich nowych ekranów.

## Performance Considerations

- `getServicesByCategory`/`getVisibleCategories` to pojedyncze zapytania RLS-scoped, bez N+1 — analogicznie do `getPinnedServices` z S3.1.
- Brak nowego client-side JS poza modalem i selectem slotów — initial JS budget z S3.1 (<150 KB) nietknięty przez tę sesję (S3.5 dopiero mierzy końcowo).

## Migration Notes

Jedna migracja addytywna (`is_time_sensitive` z `DEFAULT false`) — bez wpływu na istniejące wiersze `services`, bez rollbacku specjalnego (odwracalna przez `DROP COLUMN` gdyby była potrzebna).

## References

- Plan sesji: `context/foundation/session-plan.md` (S3.2)
- Roadmap: `context/foundation/implementation_roadmap.md` §5.2–5.5, HITL #1, HITL #6, E2E-01 (§7.1)
- Zależność: `context/changes/s3-1/plan.md` (guest session/layout/category-grid/pinned services)
- Wzorzec route handler: `app/api/scan/*` (S1.2)
- Wzorzec CRUD panelu: `app/[locale]/(hotel)/services/{actions.ts,service-form.tsx,service-list.tsx}`, `lib/panel/service-validation.ts`
- RLS istniejące: `supabase/migrations/20260626000002_rls_policies.sql:96-106`
- Trigger NOTIFY istniejący: `supabase/migrations/20260707000001_orders_notify_trigger.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Schemat — is_time_sensitive + obsługa w panelu

#### Automated

- [x] 1.1 Migracja aplikuje się: `npx supabase db reset` — b0a7fe1
- [x] 1.2 Unit testy przechodzą — b0a7fe1
- [x] 1.3 Type checking przechodzi — b0a7fe1
- [x] 1.4 Linting przechodzi — b0a7fe1

#### Manual

- [x] 1.5 Zaznaczenie „Wymaga wyboru godziny" trwale ustawia flagę — b0a7fe1
- [x] 1.6 Usługa bez zaznaczenia ma `is_time_sensitive=false` — b0a7fe1

### Phase 2: Warstwa danych gościa

#### Automated

- [x] 2.1 Unit testy przechodzą — 117869f
- [x] 2.2 Type checking przechodzi — 117869f
- [x] 2.3 Linting przechodzi — 117869f

#### Manual

- [x] 2.4 `getVisibleCategories` zwraca tylko kategorie z aktywnymi usługami — 117869f

### Phase 3: Trasy przeglądania — lista + szczegóły + puste kategorie na home

#### Automated

- [x] 3.1 Unit testy przechodzą — 71e0f0c
- [x] 3.2 Type checking przechodzi — 71e0f0c
- [x] 3.3 Linting przechodzi — 71e0f0c

#### Manual

- [x] 3.4 Home pokazuje tylko kategorie z aktywnymi usługami — 71e0f0c
- [x] 3.5 `/c/[category]` z nieznanym segmentem zwraca 404 — 71e0f0c
- [x] 3.6 Nieaktywna usługa wyszarzona, nieklikalna, bezpośredni URL szczegółów → 404 — 71e0f0c
- [x] 3.7 Picker slotów działa dla time-sensitive z wypełnionymi godzinami, CTA działa bez selecta gdy brak godzin — 71e0f0c

### Phase 4: Flow zamówienia — modal, zapis, ekran sukcesu

#### Automated

- [x] 4.1 Unit testy przechodzą — 825598f
- [x] 4.2 Type checking przechodzi — 825598f
- [x] 4.3 Linting przechodzi — 825598f

#### Manual

- [x] 4.4 Pełny happy path E2E-01 tworzy poprawny wiersz w `orders` — 825598f
- [x] 4.5 Błąd sieci → inline retry bez utraty Uwag — 825598f
- [x] 4.6 `scheduled_at` poprawny dla usługi time-sensitive — 825598f
- [ ] 4.7 RLS: property A nie widzi zamówień property B — pominięte tej sesji (decyzja użytkownika); pokryte istniejącymi politykami RLS + testami jednostkowymi route handlera, brak manualnej weryfikacji cross-property

### Phase 5: Tłumaczenia, testy, weryfikacja manualna

#### Automated

- [x] 5.1 Pełny zestaw testów przechodzi: `npm run test` — 425823b
- [x] 5.2 Type checking przechodzi — 425823b
- [x] 5.3 Linting przechodzi — 425823b
- [x] 5.4 Build produkcyjny przechodzi: `npm run build` — 425823b

#### Manual

- [x] 5.5 E2E-01 pełny przebieg zweryfikowany ręcznie — 425823b
- [x] 5.6 Przełącznik PL|EN zmienia wszystkie nowe stringi — 425823b
