# Inbox zamówień (Moduł 5) — Implementation Plan

## Overview

Budujemy panelowy inbox zamówień gości: listę zamówień z zakładkami aktywne/historyczne, zmianę statusu (`new→confirmed→fulfilled/rejected`, RBAC Staff+), live update przez SSE oparty o Postgres `LISTEN`/`NOTIFY` (pierwsza implementacja tego wzorca w repo — zaprojektowana pod reużycie w S3.3), oraz eksport CSV do rozliczeń (RBAC: Owner/Admin/Viewer, nie Staff). Powiadomienie email o nowym zamówieniu jest **poza zakresem** tej sesji (TODO, patrz "What We're NOT Doing").

## Current State Analysis

- Tabela `orders` i ENUM `order_status ('new','confirmed','fulfilled','rejected')` już istnieją (`supabase/migrations/20260626000001_initial_schema.sql:20,144-156`) z indeksami `(property_id)`, `(property_id, status)`, `(session_id)`.
- RLS: `staff_all_orders` (`property_id IN (SELECT auth_user_property_ids())`, `supabase/migrations/20260626000003_fix_rls_recursion.sql:73-76`) już pozwala zalogowanemu `hotel_users` na pełny odczyt/zapis zamówień własnego property. `guest_read_own_orders`/`guest_insert_orders` (`...002_rls_policies.sql:97-104`) obsługują ścieżkę gościa (poza zakresem tej sesji).
- RBAC (`lib/panel/rbac.ts:9-11,27-29`) już definiuje `orders_view` (staff: `full`, viewer: `read`), `orders_status` (staff: `full`, viewer: `none`), `orders_export` (staff: `none`, viewer: `full`) — bez zmian.
- **SSE/LISTEN-NOTIFY nie istnieje nigdzie w repo** — brak `app/api/*/stream`, brak triggerów NOTIFY, brak zależności `pg`. To pierwsza implementacja tego wzorca (T4).
- CSV export nie ma precedensu w repo.
- `.env.example` ma wpis `RESEND_API_KEY` oznaczony `# Email / Resend (S2.6)` — świadomie NIE aktywowany w tej sesji (patrz decyzja HITL poniżej); zmienna zostaje niewykorzystana do czasu przyszłej sesji.
- `SUPABASE_DB_URL` już istnieje w `.env.example` — to bezpośredni connection string (nie przez pgbouncer/transaction pooler), wymagany dla `LISTEN`, ponieważ Supabase pgbouncer nie wspiera poleceń session-level.
- Wzorzec modułu panelu do powielenia: `app/[locale]/(hotel)/qr/` (`actions.ts` + `page.tsx` + `*-panel.tsx` client), świeżo ukończony w S2.5.

### Key Discoveries:

- `lib/panel/auth.ts` (`getHotelUser`) + `lib/panel/rbac.ts:36-39` (`canPerform`) to jedyne źródło roli/property w panelu — każda akcja/strona/route handler tego modułu je wywołuje.
- `app/[locale]/(hotel)/qr/actions.ts:15-21` (`requireQrWriteAccess`) to wzorzec do powielenia jako `requireOrdersStatusAccess` (resource `orders_status`, level `write`) i `requireOrdersExportAccess` (resource `orders_export`, level `read`).
- `app/api/scan/room/route.ts:1-97` to wzorzec Route Handler z `NextRequest`/`NextResponse`, service-role client i cookie-scoped auth — model do naśladowania dla `/api/orders/stream` i `/api/orders/export` (nowe route handlers, nie server actions, bo oba zwracają long-lived stream / plik do pobrania, nie prosty rezultat formularza).
- `supabase/tests/s2_4_knowledge_staff_isolation.sql` to wzorzec testu RLS izolacji tenantowej (`SET LOCAL ROLE authenticated` + `request.jwt.claims`) — **ale ten wzorzec nie wystarcza dla SSE**, bo `LISTEN`/`NOTIFY` nie respektuje RLS w ogóle (to zwykły mechanizm pub/sub Postgresa, wysyła payload do każdego, kto `LISTEN`uje na kanale, niezależnie od roli). Izolacja property musi być wymuszona w aplikacji (filtrowanie w fan-out), nie w bazie — stąd dedykowany test bezpieczeństwa w Fazie 2.
- `lib/scan/__tests__/it-2.test.ts` to wzorzec testu integracyjnego "IT-N" z realnym Supabase (seed przez `createServiceRoleClient()` w `beforeAll`, cleanup w `afterAll`).
- Next.js Route Handler ze streamem SSE wymaga `export const runtime = 'nodejs'` i `export const dynamic = 'force-dynamic'`, zgodnie z decyzją T4 (Vercel wykluczony właśnie z powodu długożyjących połączeń SSE; Railway jako serwer persystentny to obsłuży).

## Desired End State

Staff/Admin/Owner widzi w panelu stronę `/orders`: domyślnie zakładkę "Aktywne" (statusy `new`/`confirmed`) i zakładkę "Historia" (`fulfilled`/`rejected`), z przyciskami zmiany statusu zgodnymi z RBAC i dozwolonymi przejściami. Nowe zamówienie gościa i każda zmiana statusu pojawia się na liście operatora **bez odświeżania strony** (SSE). Viewer widzi listę w trybie tylko-odczyt i ma dostęp do przycisku "Eksportuj CSV" (Staff nie ma). Eksport generuje plik CSV zgodny z aktualnie zastosowanym filtrem zakładki/zakresu dat.

**Weryfikacja końcowa:** `npm run build` przechodzi; `npm run test` (vitest) przechodzi łącznie z nowym `it-7.test.ts`; `psql "$DATABASE_URL" -f supabase/tests/s2_6_orders_staff_isolation.sql` kończy się `S2.6 PASSED`; `psql "$DATABASE_URL" -f supabase/tests/s2_6_sse_tenant_isolation.sql` kończy się `S2.6 SSE PASSED`; ręczny test w przeglądarce — dwa okna panelu (dwa różne property) potwierdzają, że zdarzenie SSE dociera tylko do właściwego property.

## What We're NOT Doing

- Powiadomienie email o nowym zamówieniu (MUST w roadmapie Modułu 5) — TODO poza tą sesją. `RESEND_API_KEY` w `.env.example` jest rezerwacją nazwy na przyszłość, nie zobowiązaniem w tej sesji; DoD z `change.md` go nie wymienia. Docelowa sekcja: przyszła sesja budująca `job_queue`/pipeline powiadomień (okolice S5.2) lub dedykowana sesja email — do zaplanowania osobno.
- Widok "Moje zamówienia" gościa + `EventSource` po stronie gościa (S3.3) — ta sesja buduje wyłącznie stronę panelu; infrastruktura SSE (trigger, listener, fan-out) jest zaprojektowana pod reużycie, ale kanał/endpoint dla gościa to zakres S3.3.
- Polling fallback dla panelu operatora — tylko natywny `EventSource` reconnect + banner "połączenie przerwane" (decyzja HITL); polling 10s jest zarezerwowany dla ścieżki gościa w S3.3.
- Paginacja listy zamówień — płaska lista w obrębie zakładki (aktywne/historia), zgodnie z wzorcem braku paginacji z innych modułów panelu na MVP.
- Optimistic concurrency control przy zmianie statusu — last-write-wins (decyzja HITL); brak `WHERE status = expected`.
- Zmiany w RBAC matrix, RLS policies `orders`, czy schemacie tabeli `orders` — wszystkie już wystarczające.
- Multi-instance fan-out (np. Redis pub/sub między instancjami Railway) — MVP jest single-instance (T4), in-process `EventEmitter` wystarcza.

## Implementation Approach

Faza 1 buduje warstwę danych: trigger `NOTIFY` na `orders`, współdzielony singleton połączenia `pg` z fan-outem w procesie, walidację przejść statusu, RBAC-owane server actions zmiany statusu i testy jednostkowe — całość testowalna bez UI i bez SSE. Faza 2 dodaje endpoint SSE (`/api/orders/stream`) konsumujący fan-out z Fazy 1, wraz z testem IT-7 (pełny roundtrip HTTP) i dedykowanym testem bezpieczeństwa izolacji tenantowej dla ścieżki, która omija RLS. Faza 3 dodaje UI panelu (lista z zakładkami, przyciski statusu, klient SSE z bannerem reconnect) i eksport CSV (RBAC-owany route handler + przycisk związany z filtrem listy), wzorowane na `qr/`.

## Critical Implementation Details

**Współdzielone połączenie `pg` i unikanie duplikacji przy Next.js dev hot-reload:** Next.js w trybie `dev` przeładowuje moduły serwerowe przy każdej zmianie pliku, co bez zabezpieczenia tworzyłoby nowe połączenie `LISTEN` przy każdym hot-reloadzie (wyciek połączeń do bazy). Singleton musi być trzymany na `globalThis` (wzorzec identyczny do tego, jak Prisma/inne ORMy radzą sobie z tym problemem w Next.js dev), nie jako zwykła zmienna modułowa.

**Limit rozmiaru payloadu `NOTIFY`:** Postgres ogranicza payload `NOTIFY` do 8000 bajtów. Trigger wysyła `row_to_json(NEW)` — bezpieczne przy obecnym schemacie `orders` (brak dużych pól tekstowych poza `note`), ale jeśli `note` kiedyś urośnie (np. długie uwagi gościa), payload może przekroczyć limit i `NOTIFY` rzuci błąd w triggerze, co zablokuje zapis zamówienia. Rozważyć `LEFT(NEW.note, 500)` w payloadzie triggera jako zabezpieczenie (nie wpływa na zapisaną wartość w tabeli, tylko na payload eventu).

**LISTEN/NOTIFY nie respektuje RLS:** Fan-out w aplikacji musi jawnie filtrować `property_id` odebranego eventu przeciwko `property_id` zalogowanego operatora (z `getHotelUser()`), zanim event trafi do jego strumienia SSE. To jedyna granica izolacji tenantowej dla tej ścieżki — stąd wymagany dedykowany test bezpieczeństwa w Fazie 2, osobny od standardowego testu RLS.

## Phase 1: Warstwa danych — trigger, listener, walidacja statusu

### Overview

Migracja SQL z triggerem `NOTIFY`, współdzielony moduł `pg`-listenera z fan-outem w procesie, domain logic walidacji przejść statusu, RBAC-owana server action zmiany statusu, testy jednostkowe.

### Changes Required:

#### 1. Migracja: trigger NOTIFY na `orders`

**File**: `supabase/migrations/20260707000001_orders_notify_trigger.sql` (nowy)

**Intent**: Po każdym `INSERT` lub `UPDATE` na `orders` wysłać `pg_notify` z pełnym zaktualizowanym wierszem jako JSON na stały kanał, żeby listener aplikacji mógł go odebrać i rozesłać do właściwych klientów SSE.

**Contract**: `CREATE OR REPLACE FUNCTION notify_order_change() RETURNS TRIGGER` wywołująca `PERFORM pg_notify('orders_changed', row_to_json(NEW)::text);` i `RETURN NEW;`. `CREATE TRIGGER orders_notify_change AFTER INSERT OR UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION notify_order_change();`. Kanał `orders_changed` jest jeden, globalny (nie per-property) — filtrowanie po `property_id` dzieje się w fan-out aplikacji (patrz Critical Implementation Details), zgodnie z decyzją HITL o jednym współdzielonym połączeniu.

#### 2. Singleton listener + fan-out w procesie

**File**: `lib/orders/listener.ts` (nowy)

**Intent**: Utrzymać dokładnie jedno długożyjące połączenie `pg` (direct, `SUPABASE_DB_URL`) na cały proces Next.js, nasłuchujące kanału `orders_changed`, i rozgłaszać odebrane eventy do subskrybentów w procesie (przyszły route handler SSE) filtrowanych po `property_id`.

**Contract**: Eksportuje `subscribeToOrderChanges(propertyId: string, onEvent: (order: OrderRow) => void): () => void` (funkcja czyszcząca). Wewnętrznie: singleton `pg.Client` trzymany na `globalThis` (patrz Critical Implementation Details), nawiązuje `LISTEN orders_changed` raz przy pierwszym imporcie modułu (lazy init), parsuje `payload` z `notification` eventu jako JSON, emituje przez współdzielony `EventEmitter` z nazwą eventu równą `order.property_id`; `subscribeToOrderChanges` dodaje/usuwa listenera na tym evencie. Reconnect: jeśli połączenie `pg` zgłosi `error`/zamknięcie, spróbować ponownego `connect()` + `LISTEN` z prostym retry (np. po 1s) — bez tego jedno zerwanie połączenia do bazy ubija SSE dla całej aplikacji.

#### 3. Walidacja przejść statusu

**File**: `lib/orders/status.ts` (nowy)

**Intent**: Wymusić dozwolone przejścia (`new→{confirmed,rejected}`, `confirmed→{fulfilled,rejected}`) niezależnie od warstwy RBAC — to walidacja domenowa, nie uprawnień.

**Contract**: `isValidTransition(from: OrderStatus, to: OrderStatus): boolean` + `ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]>` (mapa jak wyżej; `fulfilled`/`rejected` → `[]`, stany końcowe).

#### 4. Server action zmiany statusu

**File**: `app/[locale]/(hotel)/orders/actions.ts` (nowy)

**Intent**: RBAC-owana (`orders_status`, `write`) zmiana statusu zamówienia z walidacją przejścia, wzorowana na `requireQrWriteAccess` z `qr/actions.ts:15-21`.

**Contract**: `updateOrderStatus(orderId: string, newStatus: OrderStatus): Promise<ActionResult>`. `requireOrdersStatusAccess()` → `{error: 'forbidden'}` jeśli brak. Pobiera bieżący status zamówienia (service-role, filtrowane po `property_id` operatora), sprawdza `isValidTransition`; jeśli nieprawidłowe → `{error: 'invalidTransition'}`. Last-write-wins: zwykły `UPDATE ... SET status = $newStatus WHERE id = $orderId AND property_id = $propertyId` (decyzja HITL, bez `WHERE status = expected`). Po sukcesie `revalidatePath('/orders')` — UI i tak dostanie też event SSE, ale `revalidatePath` zapewnia spójność dla operatora, który sam kliknął.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Unit tests pass: `npm run test` (`lib/orders/status.test.ts`, `lib/orders/__tests__/listener.test.ts` z mockiem `pg`)
- [ ] Migracja aplikuje się czysto: `supabase db push` / lokalny `supabase migration up`

#### Manual Verification:

- [ ] Ręczny `UPDATE orders SET status = 'confirmed' WHERE id = ...` w `psql` po `LISTEN orders_changed` w drugiej sesji `psql` pokazuje notification z pełnym JSON wiersza
- [ ] `updateOrderStatus` jako Staff z `new`→`confirmed` zwraca sukces; z `new`→`fulfilled` zwraca `{error: 'invalidTransition'}`
- [ ] `updateOrderStatus` jako Viewer zwraca `{error: 'forbidden'}`

---

## Phase 2: Endpoint SSE i testy bezpieczeństwa

### Overview

Route handler `/api/orders/stream` konsumujący fan-out z Fazy 1, z heartbeatem i RBAC gate; test IT-7 (pełny roundtrip); dedykowany test izolacji tenantowej dla ścieżki, która omija RLS.

### Changes Required:

#### 1. Route handler SSE

**File**: `app/api/orders/stream/route.ts` (nowy)

**Intent**: Otworzyć długożyjące połączenie SSE dla zalogowanego operatora panelu, subskrybować `subscribeToOrderChanges` dla jego `property_id`, streamować eventy jako `data: <json>\n\n`, z heartbeatem `: ping\n\n` co ~20s (decyzja HITL) i cleanupem subskrypcji przy zamknięciu połączenia przez klienta.

**Contract**: `export const runtime = 'nodejs'`, `export const dynamic = 'force-dynamic'`. `GET(request: NextRequest)`: `getHotelUser()` → 401 jeśli brak; `canPerform(role, 'orders_view', 'read')` → 403 jeśli brak. Tworzy `ReadableStream` — w `start(controller)` woła `subscribeToOrderChanges(propertyId, order => controller.enqueue(...))`, ustawia `setInterval` do heartbeatu, w `cancel()` (wywoływane gdy klient się rozłącza / `request.signal` abortuje) czyści interval i subskrypcję. Nagłówki odpowiedzi: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`.

#### 2. Test integracyjny IT-7 (pełny roundtrip SSE)

**File**: `lib/orders/__tests__/it-7.test.ts` (nowy)

**Intent**: Zweryfikować end-to-end na realnym Supabase, że łańcuch trigger→NOTIFY→listener→fan-out→SSE faktycznie dostarcza event do strumienia HTTP — zgodnie z decyzją HITL (pełny roundtrip, nie tylko warstwa publikacji).

**Contract**: Wzorzec `beforeAll`/`afterAll` z `lib/scan/__tests__/it-2.test.ts`. Scenariusz: (1) seed property + hotel_user + zamówienie `status='new'`; (2) `fetch('http://localhost:.../api/orders/stream', {headers: {cookie: ...}})` z symulowaną sesją operatora (lub bezpośrednie wywołanie route handlera przez `GET()` z mockowanym `NextRequest`, jeśli uruchamianie pełnego serwera HTTP w teście vitest jest niepraktyczne — do rozstrzygnięcia przy implementacji w ramach istniejących narzędzi testowych repo); (3) równolegle, drugim klientem service-role, `UPDATE orders SET status = 'confirmed'`; (4) assert (z timeoutem, np. 3s) że strumień odebrał event z `id` zamówienia i `status: 'confirmed'`.

#### 3. Test izolacji tenantowej dla SSE (bypass RLS)

**File**: `supabase/tests/s2_6_sse_tenant_isolation.sql` (nowy — poziom SQL, weryfikuje trigger/payload) + asercja w `it-7.test.ts` (poziom aplikacji, weryfikuje filtrowanie fan-out)

**Intent**: Ponieważ `LISTEN`/`NOTIFY` całkowicie omija RLS, standardowy wzorzec `*_staff_isolation.sql` (który testuje SQL-owe `SELECT`/`UPDATE`) nie wykrywa tej klasy przecieku. Potrzebny osobny test potwierdzający, że operator property A nie otrzymuje SSE eventu dla zamówienia property B.

**Contract**: Część SQL: potwierdza, że trigger wysyła `pg_notify` z poprawnym `property_id` w payloadzie (weryfikowalne przez `LISTEN`+`NOTIFY` wewnątrz jednej sesji `psql`, bez potrzeby symulacji RLS — to nie jest test RLS, to test kontraktu payloadu). Część aplikacyjna (w `it-7.test.ts`): dwie równoległe subskrypcje `subscribeToOrderChanges` dla dwóch różnych `propertyId`; `UPDATE` zamówienia property A; assert że tylko subskrypcja property A dostała event, subskrypcja property B — nic (po timeout guard).

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Testy przechodzą: `npm run test` (obejmuje `it-7.test.ts` z asercją izolacji fan-out)
- [ ] `psql "$DATABASE_URL" -f supabase/tests/s2_6_sse_tenant_isolation.sql` kończy się `S2.6 SSE PASSED`

#### Manual Verification:

- [ ] Otwarcie `/api/orders/stream` jako Viewer (ma `orders_view: read`) zwraca strumień (nie 403)
- [ ] Otwarcie `/api/orders/stream` bez sesji zwraca 401
- [ ] Dwa okna przeglądarki zalogowane jako operatorzy dwóch różnych property — zmiana statusu w property A nie pojawia się w oknie property B

---

## Phase 3: UI panelu i eksport CSV

### Overview

Strona `/orders` z zakładkami aktywne/historia, przyciski zmiany statusu, klient SSE z bannerem reconnect, eksport CSV (RBAC-owany route handler + przycisk zgodny z filtrem).

### Changes Required:

#### 1. Strona modułu zamówień

**File**: `app/[locale]/(hotel)/orders/page.tsx` (nowy)

**Intent**: Server component wzorowany na `qr/page.tsx` / `services/page.tsx` — pobiera `hotelUser`, początkową listę zamówień (zakładka "Aktywne" domyślnie), `canEdit`/`canExport` z RBAC, renderuje `<OrdersPanel />`.

**Contract**: `getHotelUser()` → redirect `/login` jeśli brak. Pobiera zamówienia property (join do `rooms`, `services` dla nazwy/pokoju/ceny wyświetlanej), domyślnie filtrowane `status IN ('new','confirmed')`. `canEditStatus = canPerform(role, 'orders_status', 'write')`, `canExport = canPerform(role, 'orders_export', 'read')`.

#### 2. Panel kliencki zamówień

**File**: `app/[locale]/(hotel)/orders/orders-panel.tsx` (nowy, `'use client'`)

**Intent**: Lista zamówień z zakładkami, przyciski zmiany statusu (tylko dozwolone przejścia z `lib/orders/status.ts`), połączenie `EventSource('/api/orders/stream')` aktualizujące listę live, banner "połączenie przerwane" przy `onerror`/ukrywany przy `onopen`.

**Contract**: Props: `initialOrders`, `canEditStatus`, `canExport`, `propertyId`. `useEffect` otwiera `new EventSource('/api/orders/stream')`; `onmessage` merguje/insertuje zamówienie do lokalnego stanu (po `id`); `onerror` ustawia `connectionLost = true` (banner), `onopen` czyści. Przyciski statusu wołają `updateOrderStatus` przez `useTransition`, disabled gdy `!canEditStatus` lub przejście niedozwolone (`isValidTransition`). Zakładki filtrują lokalnie po `status` (bez dodatkowego zapytania — dane już są w pamięci klienta po SSE).

#### 3. Route handler eksportu CSV

**File**: `app/api/orders/export/route.ts` (nowy)

**Intent**: RBAC-owany (`orders_export`, `read`) route handler zwracający plik CSV zgodny z parametrami query odpowiadającymi filtrowi UI (status, zakres dat).

**Contract**: `GET(request)`: `getHotelUser()` → 401; `canPerform(role, 'orders_export', 'read')` → 403. Parsuje `?status=` (opcjonalne, wielokrotne) i `?from=`/`?to=` (ISO daty, opcjonalne) z `request.nextUrl.searchParams`. Pobiera zamówienia property (service-role, filtrowane po `property_id` + parametrach). Buduje CSV ręcznie (kolumny: data, pokój, usługa, cena, status, uwagi; escaping przecinków/cudzysłowów standardowym RFC 4180 — bez nowej zależności npm, plik jest mały). Zwraca `NextResponse` z `Content-Type: text/csv; charset=utf-8` i `Content-Disposition: attachment; filename="zamowienia-<property>-<data>.csv"`.

#### 4. Przycisk eksportu w UI

**File**: `app/[locale]/(hotel)/orders/orders-panel.tsx` (rozszerzenie z pkt. 2)

**Intent**: Przycisk "Eksportuj CSV" widoczny tylko gdy `canExport`, buduje URL `/api/orders/export?status=...` zgodny z aktualnie aktywną zakładką i nawiguje do niego (natywne pobranie pliku przez przeglądarkę, bez `fetch`+blob).

**Contract**: `<a href={exportUrl} download>` lub `window.location.href = exportUrl` w handlerze — prosty link wystarcza, bo endpoint sam ustawia `Content-Disposition`.

#### 5. Tłumaczenia i18n

**File**: `messages/pl.json`, `messages/en.json`

**Intent**: Nowy namespace `orders` (tytuł strony, nazwy statusów, etykiety zakładek, przyciski przejść, banner reconnect, przycisk eksportu), wzorowany na strukturze `qr`/`services`.

**Contract**: Nowy top-level klucz `"orders": { "page": {...}, "status": {...}, "tabs": {...}, "actions": {...}, "connection": {...}, "export": {...} }` w obu plikach.

#### 6. Test izolacji RLS dla `orders` (klon S2.4)

**File**: `supabase/tests/s2_6_orders_staff_isolation.sql` (nowy)

**Intent**: Standardowy test read/write leak dla ścieżki SQL-owej (server actions, route handler eksportu) — komplementarny do testu SSE z Fazy 2, wymagany przez `CLAUDE.md` dla każdej tabeli tenantowej.

**Contract**: Klon `supabase/tests/s2_4_knowledge_staff_isolation.sql` z podmienioną tabelą na `orders` (kolumny: `service_id`, `room_id`, `status` zamiast `category`/`question`/`content`). Scenariusze: read leak, update leak (próba zmiany `status` cudzego zamówienia). Bez scenariusza DELETE (aplikacja nigdy nie usuwa wierszy `orders` — retencja 5 lat).

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build passes: `npm run build`
- [ ] `psql "$DATABASE_URL" -f supabase/tests/s2_6_orders_staff_isolation.sql` kończy się `S2.6 PASSED`

#### Manual Verification:

- [ ] Wejście na `/orders` jako Staff pokazuje zakładkę "Aktywne" z zamówieniami `new`/`confirmed`
- [ ] Kliknięcie przycisku zmiany statusu wykonuje dozwolone przejście i UI aktualizuje się natychmiast (przez `revalidatePath` + event SSE)
- [ ] Nowe zamówienie złożone przez gościa (symulowany insert) pojawia się na liście operatora bez odświeżania strony
- [ ] Rozłączenie sieci (np. DevTools offline) pokazuje banner "połączenie przerwane"; przywrócenie sieci chowa banner i wznawia aktualizacje
- [ ] Viewer widzi listę tylko-do-odczytu (brak przycisków statusu) i widzi przycisk "Eksportuj CSV"; Staff widzi odwrotnie (przyciski statusu, brak eksportu)
- [ ] Eksport CSV z zakładki "Historia" zwraca plik zawierający wyłącznie zamówienia `fulfilled`/`rejected`

---

## Testing Strategy

### Unit Tests:

- `lib/orders/status.ts` — wszystkie dozwolone i niedozwolone przejścia z macierzy HITL.
- `lib/orders/listener.ts` — mock `pg.Client`; subskrypcja/odsubskrypcja, filtrowanie po `property_id`, reconnect po symulowanym błędzie połączenia.
- Server action `updateOrderStatus` — `forbidden` dla viewer, `invalidTransition` dla niedozwolonego przejścia, `revalidatePath` wywołane przy sukcesie.
- CSV builder — poprawny escaping przecinków/cudzysłowów/nowych linii w polu `note`.

### Integration Tests:

- `lib/orders/__tests__/it-7.test.ts` (Faza 2) — pełny roundtrip trigger→NOTIFY→listener→fan-out→SSE, plus asercja izolacji tenantowej fan-out.
- `supabase/tests/s2_6_orders_staff_isolation.sql` (Faza 3) — izolacja tenantowa ścieżki SQL.
- `supabase/tests/s2_6_sse_tenant_isolation.sql` (Faza 2) — kontrakt payloadu NOTIFY.

### Manual Testing Steps:

1. Otworzyć `/orders` w dwóch przeglądarkach zalogowanych jako operatorzy dwóch różnych property → zmiana statusu w jednym property nie pojawia się w drugim.
2. Złożyć zamówienie jako gość (istniejący flow z S3.2, jeśli już zaimplementowany, lub bezpośredni insert testowy) → potwierdzić, że pojawia się na liście operatora bez odświeżania.
3. Zmienić status `new→confirmed→fulfilled` klikając przyciski → potwierdzić, że niedozwolone przejścia (np. `fulfilled→new`) nie są dostępne w UI.
4. Wyeksportować CSV z różnymi filtrami zakładek → otworzyć w arkuszu kalkulacyjnym, sprawdzić kolumny i poprawność danych.
5. Zalogować się jako Staff → potwierdzić brak przycisku eksportu; jako Viewer → potwierdzić brak przycisków zmiany statusu.
6. Zamknąć kartę przeglądarki z otwartym `/orders` → sprawdzić w logach serwera, że subskrypcja SSE i heartbeat interval zostały posprzątane (brak wiszących timerów).

## Performance Considerations

Jedno współdzielone połączenie `pg` na proces (nie per-operator) ogranicza obciążenie bazy niezależnie od liczby jednocześnie zalogowanych operatorów panelu — kluczowe dla limitów połączeń Supabase przy skalowaniu do wielu hoteli. Fan-out w pamięci procesu (`EventEmitter`) nie skaluje się na wiele instancji serwera, ale MVP jest single-instance (Railway, decyzja T4).

## Migration Notes

Jedna nowa migracja SQL (`20260707000001_orders_notify_trigger.sql`) dodająca trigger — bez zmian w istniejących kolumnach/RLS. Nowa zależność npm: `pg` (+ `@types/pg` dev) do bezpośredniego połączenia `LISTEN`. Nowa zmienna środowiskowa wykorzystana: `SUPABASE_DB_URL` (już zarezerwowana w `.env.example`, dotąd nieużywana).

## References

- Session scope: `context/foundation/session-plan.md` (S2.6, linie 100–103)
- Moduł 5 (funkcje + priorytety): `context/foundation/implementation_roadmap.md` (linie 296–303)
- RBAC macierz zamówień: `context/foundation/implementation_roadmap.md` (linie 325–327), `lib/panel/rbac.ts:27-29`
- SSE + LISTEN/NOTIFY (decyzja T4): `context/foundation/implementation_roadmap.md` (linie 423, 539-540)
- Schemat `orders`: `context/foundation/implementation_roadmap.md` (linia 224), `supabase/migrations/20260626000001_initial_schema.sql:20,144-156`
- RLS `staff_all_orders`: `supabase/migrations/20260626000003_fix_rls_recursion.sql:73-76`
- Wzorzec modułu panelu: `app/[locale]/(hotel)/qr/`
- Wzorzec testu izolacji RLS: `supabase/tests/s2_4_knowledge_staff_isolation.sql`
- Wzorzec testu integracyjnego real-DB: `lib/scan/__tests__/it-2.test.ts`
- Wzorzec Route Handler: `app/api/scan/room/route.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Warstwa danych — trigger, listener, walidacja statusu

#### Automated

- [x] 1.1 Type checking passes: `npm run typecheck` — ae1c819
- [x] 1.2 Linting passes: `npm run lint` — ae1c819
- [x] 1.3 Unit tests pass: `npm run test` — ae1c819
- [x] 1.4 Migracja aplikuje się czysto: `supabase db push` / lokalny `supabase migration up` — ae1c819

#### Manual

- [x] 1.5 Ręczny `UPDATE orders SET status = 'confirmed'` po `LISTEN orders_changed` pokazuje notification z pełnym JSON wiersza — c774718
- [x] 1.6 `updateOrderStatus` jako Staff z `new`→`confirmed` zwraca sukces; z `new`→`fulfilled` zwraca `{error: 'invalidTransition'}` — c774718
- [x] 1.7 `updateOrderStatus` jako Viewer zwraca `{error: 'forbidden'}` — c774718

### Phase 2: Endpoint SSE i testy bezpieczeństwa

#### Automated

- [x] 2.1 Type checking passes: `npm run typecheck` — 63384ef
- [x] 2.2 Linting passes: `npm run lint` — 63384ef
- [x] 2.3 Testy przechodzą: `npm run test` (obejmuje `it-7.test.ts`) — 63384ef
- [x] 2.4 `psql "$DATABASE_URL" -f supabase/tests/s2_6_sse_tenant_isolation.sql` kończy się `S2.6 SSE PASSED` — 63384ef

#### Manual

- [x] 2.5 Otwarcie `/api/orders/stream` jako Viewer zwraca strumień (nie 403) — 63384ef
- [x] 2.6 Otwarcie `/api/orders/stream` bez sesji zwraca 401 — 63384ef
- [x] 2.7 Dwa okna przeglądarki (dwa property) — zmiana statusu w A nie pojawia się w B — 63384ef

### Phase 3: UI panelu i eksport CSV

#### Automated

- [x] 3.1 Type checking passes: `npm run typecheck` — c774718
- [x] 3.2 Linting passes: `npm run lint` — c774718
- [x] 3.3 Build passes: `npm run build` — c774718
- [x] 3.4 `psql "$DATABASE_URL" -f supabase/tests/s2_6_orders_staff_isolation.sql` kończy się `S2.6 PASSED` — c774718

#### Manual

- [x] 3.5 Wejście na `/orders` jako Staff pokazuje zakładkę "Aktywne" z zamówieniami `new`/`confirmed` — c774718
- [x] 3.6 Kliknięcie przycisku zmiany statusu wykonuje dozwolone przejście i UI aktualizuje się natychmiast — c774718
- [x] 3.7 Nowe zamówienie gościa pojawia się na liście operatora bez odświeżania strony — c774718
- [x] 3.8 Rozłączenie sieci pokazuje banner "połączenie przerwane"; przywrócenie chowa banner i wznawia aktualizacje — c774718
- [x] 3.9 Viewer widzi listę tylko-do-odczytu + przycisk eksportu; Staff odwrotnie — c774718
- [x] 3.10 Eksport CSV z zakładki "Historia" zwraca plik z wyłącznie `fulfilled`/`rejected` — c774718
