# Moje zamówienia + SSE + fallback polling — Implementation Plan (S3.3)

## Overview

Budujemy `/orders` — stronę gościa pokazującą jego własne zamówienia z live statusem. Reużywamy infrastrukturę SSE/LISTEN-NOTIFY zbudowaną w S2.6 (`lib/orders/listener.ts`), ale dodajemy nową ścieżkę autoryzacji i filtrowania: gość (sesja anonimowa, nagłówki `x-session-id`/`x-property-id`) zamiast operatora panelu (`getHotelUser()`), i scoping do **własnych** zamówień gościa, nie całego property. Dodajemy fallback polling 10s przy zerwaniu SSE oraz toast przy statusie `rejected`, zgodnie z §5.4/§7.4 roadmapy.

## Current State Analysis

- `lib/orders/listener.ts:51-60` (`subscribeToOrderChanges(propertyId, onEvent)`) fan-outuje eventy `orders_changed` po `property_id` — **bez filtrowania po sesji/rezerwacji**. To już działa dla panelu (S2.6); dla gościa trzeba dodać filtr aplikacyjny po `session_id`, bo inaczej gość widziałby zamówienia innych gości tego samego property (LISTEN/NOTIFY całkowicie omija RLS — ten sam problem, który S2.6 rozwiązał dla panelu przez izolację po `property_id`, ale gość potrzebuje węższej granicy).
- `app/api/orders/stream/route.ts:11-18` to istniejący wzorzec route handlera SSE, ale autoryzuje przez `getHotelUser()` (cookie/JWT panelu) — nie pasuje do gościa. Gość autoryzuje się przez `withTenantContext(headers)` + walidację `sessions` (wzorzec `lib/guest/session.ts:17-37`).
- `app/[locale]/(guest)/layout.tsx` (wywołuje `requireGuestSession()`, `lib/guest/require-session.ts:4-8`) już jest auth-guardem dla każdej strony pod `(guest)` — nowa strona `/orders` dostaje go za darmo, bez dodatkowej pracy.
- `app/[locale]/(guest)/order-success/page.tsx:17-31` pokazuje istniejący wzorzec zapytania: dwa osobne `select` (orders, potem services po `service_id`) — **nie ma kolumny `status`** w tym zapytaniu; nowa strona listy potrzebuje `status` + `created_at`.
- `orders` (`supabase/migrations/20260626000001_initial_schema.sql:144-156`): kolumny `id, property_id, session_id, reservation_id, room_id, service_id, price_cents, note, status, scheduled_at, created_at`. RLS `guest_read_own_orders` już istnieje i scope'uje po `session_id` — bez zmian RLS potrzebnych dla initial load.
- i18n: `messages/{pl,en}.json` mają top-level `guest` (dzieci: `categories`, `service`, `orderModal`, `orderSuccess`) — **brak `guest.orders`**, trzeba dodać. Panel ma już `orders.status.*` (`pl.json:322-327` — "Nowe/Potwierdzone/Zrealizowane/Odrzucone") i `orders.connection.lost/restored` (`pl.json:334-337`) z S2.6, ale to copy dla staffu — zgodnie z decyzją HITL tej sesji, gość dostaje osobne, przyjazne tłumaczenia pod `guest.orders.status.*` (nie reużywamy `orders.status.*`).
- **Brak jakiegokolwiek komponentu toast w repo** (potwierdzone grepem) — trzeba zbudować minimalny, jednorazowego użytku, scoped do tej strony (nie globalny system).
- **Brak wzorca pollingu** w repo (żadne `setInterval` z 10s) — nowy kod.
- `components/guest/order-confirm-modal.tsx` to wzorzec stylu klienckiego komponentu gościa: `'use client'`, `useTranslations`, `useState` na `submitting`/`error`, `fetch` w try/catch/finally.

## Desired End State

Gość z ważną sesją (`auth_level >= 1`) wchodzi na `/orders` i widzi listę własnych zamówień (najnowsze pierwsze), każde z nazwą usługi, godziną (jeśli `scheduled_at`) i statusem w przyjaznym języku ("Złożone"/"Przyjęte"/"Zrealizowane"/"Odrzucone"). Zmiana statusu w panelu hotelowym (S2.6) pojawia się na liście gościa **bez odświeżania strony** — przez SSE, a jeśli połączenie SSE się zerwie, strona przełącza się na odpytywanie co 10s bez przerywania działania funkcji. Gdy zamówienie zmienia status na `rejected` podczas gdy gość jest na `/orders`, pojawia się toast. Gość bez żadnych zamówień widzi przyjazny pusty stan z linkiem powrotu do przeglądania usług.

**Weryfikacja końcowa:** `npm run build` przechodzi; `npm run test` przechodzi (włącznie z nowym testem izolacji SSE gościa); `psql "$DATABASE_URL" -f supabase/tests/s3_3_guest_orders_sse_isolation.sql` kończy się `S3.3 PASSED`; ręczny test: dwóch gości tego samego property w dwóch przeglądarkach — zmiana statusu zamówienia gościa A nie pojawia się u gościa B.

### Key Discoveries:

- `subscribeToOrderChanges` nie wymaga zmian — filtrowanie po `session_id` dzieje się w nowym route handlerze gościa, analogicznie do tego jak S2.6 filtrowało po `property_id` na poziomie `emitter.on(propertyId, ...)`.
- `withTenantContext` (`lib/supabase/tenant.ts:10-30`) już parsuje `x-property-id`/`x-session-id` z nagłówków żądania — reużywalne wprost w nowym route handlerze SSE (który czyta je z `NextRequest.headers`, nie z `headers()` z `next/headers`, bo to Route Handler, nie Server Component).
- Guest layout już auth-guarduje `/orders` — nie potrzeba dodatkowego guarda w `page.tsx` poza standardowym `requireGuestSession()` do pobrania `sessionId`.

## What We're NOT Doing

- Reużycie/zmiana `app/api/orders/stream/route.ts` (panel) — zostaje nietknięty; nowy endpoint gościa to osobny plik.
- Zmiany w `lib/orders/listener.ts` lub triggerze `NOTIFY` — fan-out nadal kluczowany wyłącznie po `property_id`; filtrowanie po sesji dzieje się wyłącznie w nowym route handlerze (decyzja HITL tej sesji).
- Globalny system toastów dostępny w całej aplikacji gościa — toast jest lokalny dla `/orders`, widoczny tylko gdy strona jest otwarta (decyzja HITL: "jeśli aktywny" z roadmapy).
- Zakładki aktywne/historia na `/orders` gościa (wzorem panelu S2.6) — jedna chronologiczna lista (decyzja HITL tej sesji).
- Paginacja listy zamówień gościa — wolumen zamówień jednego gościa podczas pobytu jest mały.
- Push notifications / powiadomienia poza aktywną kartą przeglądarki — iOS hard constraint (brak wsparcia bez instalacji), poza zakresem MVP.
- Automatyczne wznowienie SSE po przełączeniu na polling w ramach tej samej wizyty na stronie — po przełączeniu na polling, strona zostaje na pollingu do czasu odświeżenia strony (prostszy model, zgodny z rekomendacją HITL).
- Reużycie `orders.status.*`/`orders.connection.*` (i18n panelu) dla gościa — osobne klucze pod `guest.orders.*` (decyzja HITL, ton dla gościa różni się od tonu operacyjnego dla staffu).

## Implementation Approach

Faza 1 buduje warstwę danych i endpoint SSE gościa (bez UI) — zapytanie o własne zamówienia, nowy route handler z autoryzacją gościa i filtrowaniem po `session_id`, test izolacji tenantowej analogiczny do S2.6 ale dla granicy sesji zamiast property. Faza 2 dodaje stronę `/orders` i kliencki panel z SSE i pustym stanem. Faza 3 dodaje fallback polling, toast, tłumaczenia i domyka testy + weryfikację manualną.

## Critical Implementation Details

**Granica izolacji SSE dla gościa:** `subscribeToOrderChanges` emituje po `property_id` — jeden gość subskrybuje cały strumień property'ego swojego pobytu, tak jak operator panelu. Różnica: callback przekazany do `subscribeToOrderChanges` w nowym route handlerze gościa musi odrzucać (nie enqueue'ować) każdy event, którego `order.session_id !== guestSessionId`, zanim trafi do strumienia SSE tego gościa. To jedyna granica izolacji dla tej ścieżki (LISTEN/NOTIFY nie zna RLS) — analogicznie do `s2_6_sse_tenant_isolation.sql`, potrzebny dedykowany test na granicy sesji, nie tylko property.

## Phase 1: Warstwa danych gościa + endpoint SSE

### Overview

Zapytanie o listę własnych zamówień gościa, nowy route handler SSE z autoryzacją gościa i filtrowaniem po `session_id`, test izolacji.

### Changes Required:

#### 1. Zapytanie o zamówienia gościa

**File**: `lib/guest/orders.ts` (nowy)

**Intent**: Zwrócić listę własnych zamówień gościa (najnowsze pierwsze) z nazwą usługi, do renderu strony i do inicjalnego stanu klienckiego panelu przed podłączeniem SSE.

**Contract**: `getGuestOrders(client, sessionId: string): Promise<GuestOrder[]>` gdzie `GuestOrder = { id, status, createdAt, scheduledAt, note, serviceName }`. Jedno zapytanie `.from('orders').select('id, status, created_at, scheduled_at, note, services(name)').eq('session_id', sessionId).order('created_at', { ascending: false })` — używa embedded select przez FK (`services(name)`), inaczej niż dwa osobne zapytania w `order-success/page.tsx` (tu jest to lista, więc N+1 dwóch zapytań per wiersz byłby marnotrawny).

#### 2. Route handler SSE gościa

**File**: `app/api/orders/stream/guest/route.ts` (nowy)

**Intent**: Otworzyć długożyjące połączenie SSE dla gościa z ważną sesją, subskrybować `subscribeToOrderChanges` dla jego `property_id`, ale przepuszczać do strumienia wyłącznie eventy jego własnej sesji.

**Contract**: `export const runtime = 'nodejs'`, `export const dynamic = 'force-dynamic'`. `GET(request: NextRequest)`: czyta `x-property-id`/`x-session-id` z `request.headers`; `withTenantContext(request.headers)` (wzorzec `lib/supabase/tenant.ts:10-30`) → 401 jeśli brak/nieprawidłowe nagłówki; dodatkowo waliduje, że `sessions` z tym `id` istnieje i `auth_level >= 1` (mirror `getGuestSessionContext`, ale bez pełnego property/reservation lookup — tylko potrzebne pola). `ReadableStream` identyczny wzorcem do `app/api/orders/stream/route.ts` (heartbeat 20s, cleanup w `cancel()`/`abort`), ale callback do `subscribeToOrderChanges(propertyId, order => { if (order.session_id !== sessionId) return; controller.enqueue(...) })`.

#### 3. Test izolacji tenantowej SSE gościa

**File**: `supabase/tests/s3_3_guest_orders_sse_isolation.sql` (nowy) + asercja aplikacyjna w nowym teście integracyjnym

**Intent**: Potwierdzić, że filtrowanie po `session_id` w nowym route handlerze faktycznie blokuje dostęp do zamówień innej sesji tego samego property — analogicznie do `s2_6_sse_tenant_isolation.sql`, ale granica to sesja, nie property.

**Contract**: Część SQL: potwierdza payload triggera zawiera `session_id` (już wysyłany, bez zmian triggera — weryfikacja kontraktu). Część aplikacyjna: `lib/orders/__tests__/it-guest-sse.test.ts` (nowy, wzorzec `it-7.test.ts`) — dwie równoległe subskrypcje przez wywołanie route handlera gościa z dwoma różnymi `sessionId` tego samego property; `UPDATE orders` dla zamówienia sesji A; assert że tylko strumień sesji A dostał event.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Unit/integration tests pass: `npm run test` (`lib/guest/__tests__/orders.test.ts`, `lib/orders/__tests__/it-guest-sse.test.ts`)
- [ ] `psql "$DATABASE_URL" -f supabase/tests/s3_3_guest_orders_sse_isolation.sql` kończy się `S3.3 PASSED`

#### Manual Verification:

- [ ] Otwarcie `/api/orders/stream/guest` z ważnymi nagłówkami sesji zwraca strumień SSE
- [ ] Otwarcie `/api/orders/stream/guest` bez `x-session-id`/`x-property-id` zwraca 401
- [ ] Ręczny `UPDATE orders SET status='confirmed'` dla zamówienia sesji A, podłączony strumień sesji B (ten sam property) nie odbiera eventu

---

## Phase 2: Strona `/orders` + kliencki panel z SSE

### Overview

Server component `/orders` + kliencki komponent z listą, podłączeniem SSE, mergem eventów do lokalnego stanu, pustym stanem, przyjaznymi etykietami statusu.

### Changes Required:

#### 1. Strona zamówień gościa

**File**: `app/[locale]/(guest)/orders/page.tsx` (nowy)

**Intent**: Server component wzorowany na `order-success/page.tsx` — `requireGuestSession()` → `getGuestOrders` → render `<GuestOrdersPanel />` z initial data lub pusty stan.

**Contract**: `requireGuestSession()` daje `sessionId`; `getGuestOrders(client, sessionId)`; przekazuje `initialOrders` + `sessionId` do klienckiego panelu.

#### 2. Kliencki panel zamówień gościa

**File**: `components/guest/guest-orders-panel.tsx` (nowy, `'use client'`)

**Intent**: Renderuje listę zamówień (lub pusty stan z linkiem do `/`), podłącza `EventSource('/api/orders/stream/guest')`, mergując przychodzące zamówienia do lokalnego stanu po `id` (update istniejącego lub insert na początek listy jeśli nowe — chociaż w praktyce gość widzi tylko update'y własnych już złożonych zamówień, nie nowe inserty spoza tej karty).

**Contract**: Props: `{ initialOrders: GuestOrder[] }`. `useState<GuestOrder[]>(initialOrders)`; `useEffect` otwiera `EventSource`, `onmessage` parsuje JSON i aktualizuje stan przez `id`; status renderowany przez mapę etykiet `guest.orders.status.*` (next-intl). Pusty stan (`initialOrders.length === 0` i żaden event jeszcze nie przyszedł) pokazuje komunikat + link do `/`.

#### 3. Tłumaczenia — lista i statusy

**File**: `messages/pl.json`, `messages/en.json`

**Intent**: Nowy blok `guest.orders` z tytułem strony, etykietami statusu (przyjazne dla gościa, osobne od `orders.status.*` panelu), pustym stanem, formatem daty/godziny.

**Contract**: `guest.orders: { title, empty: { message, cta }, status: { new, confirmed, fulfilled, rejected } }` — wartości `status.*` wzorem roadmapy §7.4/419: "Złożone"/"Przyjęte"/"Zrealizowane"/"Odrzucone" (PL), analogiczne EN.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Unit tests pass: `npm run test` (`components/guest/__tests__/guest-orders-panel.test.tsx`)

#### Manual Verification:

- [ ] Gość z zamówieniami widzi listę chronologiczną (najnowsze pierwsze) z poprawnymi statusami po polsku
- [ ] Gość bez zamówień widzi pusty stan z linkiem do strony głównej
- [ ] Zmiana statusu w panelu hotelowym (S2.6) pojawia się na `/orders` gościa bez odświeżania strony

---

## Phase 3: Fallback polling + toast + i18n + testy końcowe

### Overview

Przełączenie na polling 10s po `onerror` EventSource, minimalny toast lokalny dla `/orders` przy statusie `rejected`, dopełnienie tłumaczeń, pełny przebieg testów i weryfikacja manualna E2E.

### Changes Required:

#### 1. Polling fallback w panelu klienckim

**File**: `components/guest/guest-orders-panel.tsx` (rozszerzenie z Fazy 2)

**Intent**: Gdy `EventSource.onerror` wystrzeli, zamknąć połączenie SSE (`eventSource.close()`, żeby zapobiec natywnemu auto-reconnect) i uruchomić `setInterval` co 10s odpytujący `GET /api/orders` (istniejący endpoint listy — potrzebne dodanie trybu zwracania własnych zamówień gościa, patrz punkt 2) zamiast SSE, do końca życia komponentu (bez próby powrotu do SSE w ramach tej samej wizyty na stronie, decyzja HITL).

**Contract**: `useRef` na `EventSource`/interval do cleanupu w `useEffect` return. Stan `connectionMode: 'sse' | 'polling'` steruje, które źródło aktualizuje listę.

#### 2. Endpoint odczytu zamówień gościa (dla pollingu)

**File**: `app/api/orders/guest/route.ts` (nowy)

**Intent**: `GET` zwracający aktualną listę zamówień gościa — używany wyłącznie jako fallback pollingu, reużywa `getGuestOrders` z Fazy 1.

**Contract**: `GET(request)`: czyta `x-session-id`/`x-property-id` z nagłówków (te same nagłówki co inne guest route handlery, np. `app/api/orders/route.ts`), `withTenantContext` → 401 jeśli brak; `getGuestOrders(client, sessionId)` → `NextResponse.json({ orders })`.

#### 3. Toast przy statusie `rejected`

**File**: `components/guest/guest-orders-panel.tsx` (rozszerzenie), `components/guest/order-toast.tsx` (nowy)

**Intent**: Gdy merge nowego stanu zamówienia wykrywa przejście na `rejected` (poprzedni status w lokalnym stanie ≠ `rejected`, nowy = `rejected`), pokazać lokalny toast (auto-znikający po ~5s, jeden na raz, bez zewnętrznej biblioteki) — widoczny wyłącznie gdy `/orders` jest otwarte (zarówno przez SSE, jak i przez polling — działa tożsamo niezależnie od źródła aktualizacji, bo oba aktualizują ten sam lokalny stan).

**Contract**: `OrderToast` props: `{ message: string; onDismiss: () => void }` — proste pozycjonowanie fixed/absolute, `useEffect` z `setTimeout` na auto-dismiss. Panel trzyma `toastMessage: string | null` w stanie, ustawiany przy wykrytym przejściu na `rejected`.

#### 4. Tłumaczenia — connection/toast

**File**: `messages/pl.json`, `messages/en.json`

**Intent**: Rozszerzenie `guest.orders` o komunikat toastu przy odrzuceniu.

**Contract**: `guest.orders.toast.rejected` (np. "Twoje zamówienie zostało odrzucone").

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build passes: `npm run build`
- [ ] Pełny zestaw testów przechodzi: `npm run test`

#### Manual Verification:

- [ ] Rozłączenie sieci (DevTools offline) na `/orders` powoduje przełączenie na polling po pierwszym `onerror`; przywrócenie sieci — lista nadal aktualizuje się (przez polling, nie wraca do SSE w tej samej wizycie)
- [ ] Zmiana statusu zamówienia na `rejected` w panelu hotelowym, podczas gdy gość ma otwarte `/orders`, pokazuje toast; toast znika automatycznie
- [ ] Przełącznik PL|EN zmienia wszystkie nowe stringi tej sesji
- [ ] Pełny E2E: złożenie zamówienia (S3.2) → `/orders` pokazuje "Złożone" → zmiana statusu w panelu na `confirmed`→`fulfilled` → gość widzi update na żywo bez odświeżania

---

## Testing Strategy

### Unit Tests:

- `getGuestOrders` — zwraca posortowaną listę, pusty wynik dla sesji bez zamówień, poprawne mapowanie `services(name)` do `serviceName`.
- `GuestOrdersPanel` — merge eventu SSE do stanu po `id`, wykrycie przejścia na `rejected` wyzwala toast, pusty stan renderuje się gdy brak zamówień i brak eventów.
- Route handler `/api/orders/stream/guest` — 401 bez nagłówków sesji, filtrowanie eventu innej sesji (nie trafia do `enqueue`).
- Route handler `/api/orders/guest` — 401 bez nagłówków, zwraca tylko zamówienia własnej sesji.

### Integration Tests:

- `lib/orders/__tests__/it-guest-sse.test.ts` (Faza 1) — pełny roundtrip trigger→NOTIFY→listener→fan-out→SSE gościa, plus asercja izolacji między dwiema sesjami tego samego property.
- `supabase/tests/s3_3_guest_orders_sse_isolation.sql` (Faza 1) — kontrakt payloadu triggera zawiera `session_id`.

### Manual Testing Steps:

1. Złożyć zamówienie jako gość (flow S3.2) → wejść na `/orders` → potwierdzić widoczność z statusem "Złożone".
2. W drugiej karcie/urządzeniu, jako operator panelu (S2.6), zmienić status `new→confirmed` → potwierdzić, że gość widzi update bez odświeżania.
3. Otworzyć `/orders` jako dwóch różnych gości tego samego property (dwie różne sesje/pokoje) → zmiana statusu zamówienia gościa A nie pojawia się u gościa B.
4. Wyłączyć sieć w DevTools na stronie `/orders` gościa → potwierdzić przełączenie na polling po ok. 10s od pierwszego błędu; zmiana statusu w panelu nadal dociera (wolniej, przez polling).
5. Zmienić status zamówienia na `rejected` podczas gdy `/orders` otwarte → potwierdzić toast.
6. Wejść na `/orders` jako gość bez żadnych zamówień → potwierdzić pusty stan z linkiem do strony głównej.
7. Przełączyć język PL|EN → potwierdzić tłumaczenie wszystkich nowych ekranów.

## Performance Considerations

Reużycie jednego współdzielonego połączenia `pg` na proces (z S2.6) — dodanie subskrybentów gości nie zwiększa liczby połączeń do bazy, tylko liczbę listenerów w `EventEmitter` (bez limitu, `setMaxListeners(0)` już ustawione w `lib/orders/listener.ts:19`). Filtrowanie po `session_id` w callbacku jest tanie (porównanie stringów) — bez wpływu na wydajność przy skali MVP.

## Migration Notes

Bez migracji SQL — schemat `orders` i trigger NOTIFY (S2.6) już wystarczające; `session_id` jest już częścią payloadu `row_to_json(NEW)`.

## References

- Session scope: `context/foundation/session-plan.md` (S3.3, linie 144-147)
- Roadmap: `context/foundation/implementation_roadmap.md` linie 392-393, 406, 419, 423, 469, 618, 687-688, 693
- Zależność SSE/listener: `context/changes/s2-6/plan.md`, `lib/orders/listener.ts`, `app/api/orders/stream/route.ts`
- Zależność order creation: `context/changes/s3-2/plan.md`, `app/[locale]/(guest)/order-success/page.tsx`
- Guest session/auth guard: `lib/guest/session.ts`, `lib/guest/require-session.ts`, `app/[locale]/(guest)/layout.tsx`
- Wzorzec komponentu klienckiego gościa: `components/guest/order-confirm-modal.tsx`
- Wzorzec testu izolacji SSE: `supabase/tests/s2_6_sse_tenant_isolation.sql`, `lib/orders/__tests__/it-7.test.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Warstwa danych gościa + endpoint SSE

#### Automated

- [x] 1.1 Type checking passes: `npm run typecheck` — 36631e1
- [x] 1.2 Linting passes: `npm run lint` — 36631e1
- [x] 1.3 Unit/integration tests pass: `npm run test` — 36631e1
- [x] 1.4 `psql "$DATABASE_URL" -f supabase/tests/s3_3_guest_orders_sse_isolation.sql` kończy się `S3.3 PASSED` — 36631e1

#### Manual

- [x] 1.5 Otwarcie `/api/orders/stream/guest` z ważnymi nagłówkami sesji zwraca strumień SSE — 36631e1
- [x] 1.6 Otwarcie `/api/orders/stream/guest` bez nagłówków sesji zwraca 401 — 36631e1
- [x] 1.7 Update zamówienia sesji A nie dociera do strumienia sesji B (ten sam property) — 36631e1

### Phase 2: Strona `/orders` + kliencki panel z SSE

#### Automated

- [x] 2.1 Type checking passes: `npm run typecheck` — e4b18d5
- [x] 2.2 Linting passes: `npm run lint` — e4b18d5
- [x] 2.3 Unit tests pass: `npm run test` — e4b18d5

#### Manual

- [x] 2.4 Lista chronologiczna z poprawnymi statusami PL — e4b18d5
- [x] 2.5 Pusty stan z linkiem do strony głównej — e4b18d5
- [x] 2.6 Zmiana statusu w panelu pojawia się bez odświeżania — e4b18d5

### Phase 3: Fallback polling + toast + i18n + testy końcowe

#### Automated

- [x] 3.1 Type checking passes: `npm run typecheck`
- [x] 3.2 Linting passes: `npm run lint`
- [x] 3.3 Build passes: `npm run build`
- [x] 3.4 Pełny zestaw testów przechodzi: `npm run test` (poza 3 pre-istniejącymi, niezwiązanymi awariami w `__tests__/proxy.test.ts` — `getClaims` brakuje w mocku Supabase, potwierdzone przez stash że występują też bez zmian tej fazy)

#### Manual

- [x] 3.5 Przełączenie na polling po `onerror`; przywrócenie sieci nie wraca do SSE w tej samej wizycie
- [x] 3.6 Toast przy statusie `rejected`, znika automatycznie
- [x] 3.7 Przełącznik PL|EN zmienia wszystkie nowe stringi
- [x] 3.8 Pełny E2E: złożenie → `/orders` → zmiana statusu w panelu → live update
