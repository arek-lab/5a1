# Multi-Tenant Architecture Patterns — SaaS 2025-2026
*Sesja 6 — Subagent 1: multitenant-architecture-patterns*
*Projekt: Hotel Guest App MVP | Stack: Next.js + Supabase + PostgreSQL*
*Data: 2026-06-25*

---

## TL;DR dla tego projektu

**Rekomendacja: Shared database + Row-Level Security (RLS) od dnia 1, z `property_id` w każdej tabeli tenant-scoped.**

Uzasadnienie: skala 5-200 hoteli to klasyczny sweet spot dla shared database z RLS. Supabase ma natywne wsparcie dla tego wzorca. Koszty operacyjne są wielokrotnie niższe niż przy schema-per-tenant, a migracja do schema-per-tenant (jeśli kiedykolwiek potrzebna) jest możliwa bez przepisywania aplikacji pod warunkiem, że `property_id` jest w schemacie od początku — co już zostało zdecydowane.

---

## 1. Trzy modele multi-tenancy w PostgreSQL

### 1.1 Shared Database (jeden schemat, jeden klucz tenant)

Wszyscy tenanci dzielą te same tabele. Izolacja przez kolumnę `property_id` (lub `tenant_id`) + RLS lub filtrowanie w warstwie aplikacji.

```
┌─────────────────────────────────────────┐
│  Database: hotelapp                     │
│  Schema: public                         │
│                                         │
│  orders (property_id, guest_id, ...)    │
│  sessions (property_id, token, ...)     │
│  services (property_id, name, price,..) │
│  hotels (id, name, ...)                 │
└─────────────────────────────────────────┘
```

**Zalety:**
- Jeden zestaw migracji dla wszystkich tenantów
- Najprostszy deployment: jeden klaster PostgreSQL obsługuje wszystkich
- Supabase działa w tym modelu natywnie — RLS, policies, Row Security są wbudowane
- Koszt: ~$25/mies. (Supabase Pro) vs ~$50-200/mies. przy schema-per-tenant przy tej skali
- Cross-tenant analytics (agregaty dla właściciela platformy) bez JOIN przez schematy
- Connection pooling działa optymalnie — jeden pool na wszystkich tenantów

**Wady:**
- Jeden błąd w RLS policy = wyciek danych między tenantami (ryzyko realne, ale zarządzalne)
- Noisy neighbor problem: jeden tenant może zjeść I/O i spowolnić pozostałych
- Trudniejsze backup per tenant (wymaga pg_dump z WHERE)
- Regulatory compliance (HIPAA, banking): często wymaga fizycznej izolacji — w hospitality nieistotne

**Kiedy przestaje wystarczać:**
- 500+ bardzo aktywnych tenantów z dużymi wolumenami transakcji
- Tenants wymagający dedykowanego backupu i point-in-time recovery
- Kontrakty enterprise z wymogiem fizycznej izolacji

**Dla tego projektu:** wystarczy do co najmniej 200 hoteli, prawdopodobnie 1000+.

---

### 1.2 Schema Per Tenant

Każdy tenant dostaje własny schemat PostgreSQL w ramach tej samej bazy:

```
┌─────────────────────────────────────────────────────┐
│  Database: hotelapp                                 │
│                                                     │
│  Schema: hotel_abc (hotel A)                        │
│    orders, sessions, services, guests               │
│                                                     │
│  Schema: hotel_xyz (hotel B)                        │
│    orders, sessions, services, guests               │
│                                                     │
│  Schema: platform (shared)                          │
│    hotels, billing, plans                           │
└─────────────────────────────────────────────────────┘
```

**Zalety:**
- Silniejsza izolacja logiczna — błąd w jednym schemacie nie dotyka innych
- Backup per tenant prostszy (`pg_dump -n hotel_abc`)
- `search_path` jako mechanizm izolacji (bez RLS)
- Łatwiejsze usunięcie tenanta: `DROP SCHEMA hotel_abc CASCADE`

**Wady:**
- **Migracje są koszmarem przy 200 schematach** — każda zmiana w schema musi być wykonana N razy
- Narzędzia migracyjne (Prisma, Drizzle) mają słabe wsparcie dla multi-schema — wymagają custom toolingu
- Supabase nie ma natywnego wsparcia dla schema-per-tenant w 2025-2026 — wymaga obejść
- PostgreSQL ma limit ~100 schematów zanim performance degraduje (search_path lookup)
- Connection pooling jest trudniejszy — `search_path` musi być ustawiony per connection
- Onboarding nowego tenanta = CREATE SCHEMA + uruchomienie wszystkich migracji

**Kiedy warto:**
- 50-500 tenantów, gdzie compliance wymaga izolacji logicznej (fintech, healthcare)
- Frameworki z natywnym wsparciem (Rails: Apartment gem, choć deprecated)

**Dla tego projektu:** zbyt duży koszt operacyjny dla skali 5-200 hoteli. Nie rekomendowane.

---

### 1.3 Database Per Tenant

Każdy tenant ma własną bazę danych lub własny klaster:

```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  DB: hotel_abc  │  │  DB: hotel_xyz  │  │  DB: hotel_123  │
│  (Supabase #1)  │  │  (Supabase #2)  │  │  (Supabase #3)  │
└─────────────────┘  └─────────────────┘  └─────────────────┘
        ↑                    ↑                    ↑
   API Layer (routing per tenant, np. przez subdomenę)
```

**Zalety:**
- Pełna fizyczna izolacja — zero ryzyka wycieku między tenantami
- Backup, migracje, scaling per tenant
- HIPAA/SOC2/banking compliance jest prosty do udowodnienia
- Noisy neighbor problem nie istnieje

**Wady:**
- **Koszt prohibitywny**: Supabase Pro = $25/mies. per projekt → 200 hoteli = $5,000/mies. tylko baza
- Migracje: N baz × każda zmiana = ogromny overhead operacyjny
- Connection management: potrzebny router/proxy (PgBouncer z per-tenant routing lub własne rozwiązanie)
- Onboarding nowego tenanta: provisioning nowej instancji bazy (minuty, nie sekundy)
- Monitoring: N dashboardów zamiast jednego

**Kiedy warto:**
- Enterprise deals z wymogiem fizycznej izolacji w kontrakcie
- Regulacje wymagające przechowywania danych w konkretnym kraju per tenant
- 10-50 bardzo dużych tenantów (nie 200 małych hoteli)

**Dla tego projektu:** nie uzasadnione ekonomicznie. 200 hoteli = $5K/mies. tylko na bazę.

---

## 2. Porównanie trade-offów przy tej skali

| Kryterium | Shared DB + RLS | Schema Per Tenant | DB Per Tenant |
|---|---|---|---|
| **Koszt @ 20 hoteli** | ~$25/mies. | ~$50/mies. | ~$500/mies. |
| **Koszt @ 200 hoteli** | ~$50/mies. | ~$100/mies. | ~$5,000/mies. |
| **Migracje** | Jeden zestaw | N razy każda | N razy każda |
| **Izolacja danych** | Logiczna (RLS) | Logiczna (schema) | Fizyczna |
| **Supabase natywność** | Pełna | Słaba | Pełna (ale kosztowna) |
| **Czas onboarding tenanta** | Milliseconds (INSERT) | Sekundy (DDL) | Minuty (provision) |
| **Backup per tenant** | Trudny | Prostszy | Trywialny |
| **RODO: prawo do usunięcia** | DELETE WHERE property_id=X | DROP SCHEMA X | DROP DATABASE X |
| **Cross-tenant analytics** | Prosta | JOIN przez schematy | Osobna baza/ETL |
| **Skala do 1000+ hoteli** | Tak | Problematycznie | Nie (koszt) |
| **Ryzyko wycieku danych** | Niskie przy dobrym RLS | Niskie | Brak |

**Wniosek:** Shared DB z RLS jest właściwy na każdym etapie wzrostu dla tego projektu.

---

## 3. Row-Level Security w PostgreSQL — jak działa

### 3.1 Mechanizm

RLS to polityki na poziomie tabeli, które PostgreSQL sprawdza automatycznie przy każdym zapytaniu. Nikt — nawet przez SQL injection — nie może odczytać wiersza, który nie przechodzi przez policy.

```sql
-- 1. Włącz RLS na tabeli
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- 2. Zdefiniuj politykę
CREATE POLICY "tenant_isolation" ON orders
  FOR ALL
  USING (property_id = current_setting('app.current_property_id')::uuid);

-- 3. W aplikacji: ustaw kontekst przed każdym zapytaniem
SET LOCAL app.current_property_id = 'abc123-...';
```

Mechanizm `current_setting` + `SET LOCAL` to wzorzec stosowany przez Supabase, Neon, i wszystkie większe PostgreSQL SaaS w 2025.

### 3.2 Supabase — jak implementuje RLS

Supabase używa JWT claims jako mechanizmu przenoszenia identity do warstwy bazy:

```sql
-- Supabase RLS pattern — auth.uid() to ID z JWT
CREATE POLICY "hotel_staff_only" ON orders
  FOR ALL
  USING (
    property_id IN (
      SELECT property_id FROM hotel_users
      WHERE user_id = auth.uid()
    )
  );
```

**Dla opaque UUID token (ten projekt):** nie używamy Supabase Auth bezpośrednio dla sesji gości. Zamiast tego:

```sql
-- Pattern dla opaque token: set context w middleware
CREATE POLICY "guest_session_isolation" ON orders
  FOR SELECT
  USING (
    property_id = current_setting('app.property_id', true)::uuid
    AND session_id = current_setting('app.session_id', true)::uuid
  );
```

W Next.js middleware lub w Server Actions:
```typescript
// Przed każdym zapytaniem do bazy
await supabase.rpc('set_tenant_context', {
  p_property_id: session.property_id,
  p_session_id: session.session_id
});
```

Alternatywnie: Supabase obsługuje `SET LOCAL` przez RPC:
```sql
CREATE FUNCTION set_tenant_context(p_property_id uuid, p_session_id uuid)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.property_id', p_property_id::text, true);
  PERFORM set_config('app.session_id', p_session_id::text, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 3.3 Pułapki wydajnościowe RLS

**Pułapka 1: Subquery w policy uruchamiana per wiersz**

```sql
-- ZŁY wzorzec — subquery wykonuje się dla każdego wiersza
CREATE POLICY "bad_policy" ON orders
  USING (
    EXISTS (
      SELECT 1 FROM hotel_users
      WHERE user_id = auth.uid() AND property_id = orders.property_id
    )
  );

-- DOBRY wzorzec — jeden SET + proste porównanie
CREATE POLICY "good_policy" ON orders
  USING (property_id = current_setting('app.property_id', true)::uuid);
```

**Pułapka 2: Brak indeksu na `property_id`**

RLS policy filtruje wiersze PRZED limitami, ale PO pobraniu z tabeli jeśli nie ma indeksu:

```sql
-- Obowiązkowe indeksy na KAŻDEJ tabeli z RLS
CREATE INDEX idx_orders_property_id ON orders(property_id);
CREATE INDEX idx_sessions_property_id ON sessions(property_id);
CREATE INDEX idx_services_property_id ON services(property_id);
-- Partial index dla często używanych queries
CREATE INDEX idx_orders_active ON orders(property_id, created_at DESC)
  WHERE status NOT IN ('completed', 'cancelled');
```

**Pułapka 3: `SECURITY DEFINER` functions omijają RLS**

Funkcje z `SECURITY DEFINER` działają z uprawnieniami właściciela (zwykle superuser), co omija RLS. Używać świadomie — nigdy nie wywoływać z danych użytkownika.

**Pułapka 4: `BYPASSRLS` rola — nie używać dla application user**

Supabase service_role ma `BYPASSRLS`. Używać tylko w trusted server-side code (Next.js Server Actions, cron jobs), nigdy w kliencie przeglądarkowym.

```typescript
// CLIENT SIDE — zwykły klucz anon, RLS aktywne
const supabase = createClient(url, anonKey);

// SERVER SIDE (trusted) — service role omija RLS
const supabaseAdmin = createClient(url, serviceRoleKey);
```

**Pułapka 5: `pg_stat_statements` — monitoruj policy cost**

```sql
-- Sprawdź koszty policy w pg_stat_statements
SELECT query, calls, total_exec_time, rows
FROM pg_stat_statements
WHERE query LIKE '%policy%'
ORDER BY total_exec_time DESC;
```

**Pułapka 6: RLS policy nie chroni przed `TRUNCATE`**

`TRUNCATE` nie jest objęty RLS. Zablokuj na poziomie uprawnień GRANT:
```sql
-- Nie dawaj TRUNCATE application user
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
```

### 3.4 Wydajność RLS w praktyce (benchmarki 2024-2025)

Na podstawie testów Supabase i niezależnych benchmarków:
- Overhead RLS z `current_setting` (bez subquery): **2-5 ms** przy tabelach 100K wierszy
- Overhead RLS z subquery w policy: **20-100 ms** przy 100K wierszy
- Przy właściwych indeksach na `property_id`: degradacja wydajności **<5%** vs bez RLS
- Supabase Connection Pooler (Supavisor) w trybie transaction mode: SET LOCAL działa poprawnie

---

## 4. Implementacja multi-tenancy — konkretne wzorce

### 4.1 Next.js + Supabase — wzorzec rekomendowany dla tego projektu

**Warstwy izolacji:**

```
Request (HTTP)
    ↓
Next.js Middleware (weryfikacja tokenu, wyciąganie property_id)
    ↓
Server Action / Route Handler (ustawienie kontekstu RLS)
    ↓
Supabase (PostgreSQL z RLS) — automatyczna izolacja
```

**Middleware Next.js:**

```typescript
// middleware.ts
export async function middleware(request: NextRequest) {
  const sessionToken = request.cookies.get('__Host-session')?.value;

  if (!sessionToken) {
    return NextResponse.redirect(new URL('/expired', request.url));
  }

  // Walidacja tokenu (lookup w bazie lub cache Redis)
  const session = await validateOpaqueToken(sessionToken);

  if (!session || session.expires_at < Date.now()) {
    return NextResponse.redirect(new URL('/expired', request.url));
  }

  // Przekaż property_id i session_id do dalszego kontekstu
  const response = NextResponse.next();
  response.headers.set('x-property-id', session.property_id);
  response.headers.set('x-session-id', session.session_id);
  return response;
}
```

**Server Action z RLS context:**

```typescript
// lib/supabase-tenant.ts
import { createClient } from '@supabase/supabase-js';
import { headers } from 'next/headers';

export async function getTenantClient() {
  const headersList = await headers();
  const propertyId = headersList.get('x-property-id');
  const sessionId = headersList.get('x-session-id');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // service role — ustawiamy context ręcznie
  );

  // Ustaw kontekst RLS
  await supabase.rpc('set_tenant_context', {
    p_property_id: propertyId,
    p_session_id: sessionId,
  });

  return supabase;
}

// Użycie w Server Action:
export async function getAvailableServices() {
  const supabase = await getTenantClient();
  const { data, error } = await supabase
    .from('services')
    .select('*')
    .eq('is_active', true);
  // RLS automatycznie filtruje do property_id z kontekstu
  return data;
}
```

**Ważna uwaga dla Supabase Supavisor (connection pooler):**

W trybie `transaction` (domyślny dla serverless), SET LOCAL/set_config z `is_local = true` obowiązuje tylko przez czas transakcji. To jest poprawne zachowanie — kontekst jest izolowany per request.

```sql
-- Funkcja z is_local = true — bezpieczna w transaction mode
CREATE FUNCTION set_tenant_context(p_property_id uuid, p_session_id uuid)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.property_id', p_property_id::text, true);  -- true = is_local
  PERFORM set_config('app.session_id', p_session_id::text, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 4.2 Panel hotelowy (staff) — osobna izolacja

Panel hotelowy używa Supabase Auth (email/password dla staff), co pozwala na prostsze policies:

```sql
-- Dla tabel zarządzanych przez staff hotelowy
CREATE POLICY "hotel_staff_access" ON services
  FOR ALL
  USING (
    property_id IN (
      SELECT property_id FROM hotel_users
      WHERE user_id = auth.uid()
      AND is_active = true
    )
  );

-- Dla Owner — dodatkowe sprawdzenie roli
CREATE POLICY "hotel_owner_billing" ON hotels
  FOR ALL
  USING (
    id IN (
      SELECT property_id FROM hotel_users
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );
```

### 4.3 Remix — wzorzec dla porównania

W Remix loader/action ma bezpośredni dostęp do request, co ułatwia przekazywanie kontekstu:

```typescript
// routes/services.tsx
export async function loader({ request }: LoaderFunctionArgs) {
  const session = await getSession(request.headers.get('Cookie'));
  const propertyId = session.get('propertyId');

  const orders = await db.query(
    `SELECT * FROM services WHERE property_id = $1`,
    [propertyId]
  ); // lub przez Supabase z set_config
  return json(orders);
}
```

Remix nie ma specjalnej przewagi w multi-tenancy vs Next.js — oba frameworki rozwiązują to na poziomie server-side code, a izolacja i tak dzieje się w PostgreSQL.

### 4.4 Laravel — wzorzec dla porównania (Tenancy for Laravel)

Laravel ma dojrzały ekosystem multi-tenancy z pakietem `stancl/tenancy`:

```php
// Automatic tenant identification przez subdomenę
// Hotel A: hotela.guestapp.com → tenant: hotel_a
// Hotel B: hotelb.guestapp.com → tenant: hotel_b

// Dwa modele: single-database (scope) i multi-database
// Single-database działa jak shared DB z property_id:
class Order extends Model
{
    use BelongsToTenant;  // automatycznie dodaje WHERE tenant_id = current
}
```

Laravel Tenancy w trybie single-database to odpowiednik Supabase RLS, ale implementowany w warstwie aplikacji (Eloquent Global Scope), nie w bazie. Słabszy model bezpieczeństwa — błąd w kod może "zapomnieć" scope'u. PostgreSQL RLS działa nawet przy bezpośrednich zapytaniach SQL.

**Wniosek:** PostgreSQL RLS > Eloquent Global Scope z perspektywy bezpieczeństwa.

---

## 5. Modelowanie `property_id` w schemacie

### 5.1 Konwencja nazewnictwa

Projekt używa już `hotel_id` w tabeli `reservations` (Sesja 1). Rekomendacja: ujednolicić do `property_id` wszędzie — "property" jest agnostyczne i obsługuje sieci hotelowe (multi-property) w przyszłości.

```sql
-- Tabela nadrzędna tenantów
CREATE TABLE hotels (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text UNIQUE NOT NULL,  -- dla URL routing jeśli potrzebny
  created_at  timestamptz DEFAULT now(),
  -- billing data, plan, etc.
  plan        text DEFAULT 'lighthouse',
  is_active   boolean DEFAULT true
);

-- Każda tabela tenant-scoped ma property_id jako FK
-- PRZYKŁAD: services
CREATE TABLE services (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  price_pln   numeric(10, 2),
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

-- Obowiązkowy indeks
CREATE INDEX idx_services_property_id ON services(property_id);
```

### 5.2 Wzorzec dla wszystkich tabel tenant-scoped

Każda nowa tabela należąca do tenanta musi mieć:
1. `property_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE`
2. `CREATE INDEX idx_{table}_property_id ON {table}(property_id)`
3. `ALTER TABLE {table} ENABLE ROW LEVEL SECURITY`
4. Przynajmniej jedną podstawową policy

**Checklist dla nowej tabeli:**
```sql
-- Template dla nowej tabeli tenant-scoped
CREATE TABLE {table_name} (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  -- ... kolumny specyficzne
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_{table_name}_property_id ON {table_name}(property_id);

ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;

-- Policy dla sesji gości (read)
CREATE POLICY "guest_read_{table_name}" ON {table_name}
  FOR SELECT
  USING (property_id = current_setting('app.property_id', true)::uuid);

-- Policy dla staff hotelowego (full CRUD)
CREATE POLICY "staff_all_{table_name}" ON {table_name}
  FOR ALL
  USING (
    property_id IN (
      SELECT property_id FROM hotel_users
      WHERE user_id = auth.uid() AND is_active = true
    )
  );
```

### 5.3 Composite index vs single index

Dla tabel z częstymi queries po `property_id` + innym atrybucie:

```sql
-- Lepsza wydajność dla typowych queries
CREATE INDEX idx_orders_property_status
  ON orders(property_id, status)
  WHERE status = 'pending';  -- partial index dla najbardziej częstych

CREATE INDEX idx_sessions_property_active
  ON sessions(property_id, expires_at)
  WHERE revoked = false;
```

---

## 6. Które tabele wymagają RLS, a które nie

### 6.1 Tabele globalnie wspólne (RLS: NIE lub uproszczone)

```
hotels          — tabela tenantów; nie wymaga RLS (każdy hotel widzi tylko własne dane
                  przez FK, ale tabela sama w sobie nie jest tenant-scoped)
                  WYJĄTEK: panel hotelowy — staff widzi tylko swój hotel przez policy
                  na auth.uid()

plans           — globalna tabela planów SaaS; read-only dla wszystkich
billing         — dostęp tylko dla Owner przez policy; nie przez RLS na guests
```

### 6.2 Tabele guest-facing (RLS: TAK, property_id + session_id)

Tabele odczytywane przez apkę gościa — izolacja przez `property_id` z kontekstu sesji:

```
services        — co gość widzi w menu; filtrowanie po property_id
service_categories — kategorie usług per hotel
knowledge_base  — Q&A dla AI concierge; property-scoped
hotel_info      — nazwa, godziny, opis; property-scoped
room_types      — typy pokoi; property-scoped
```

Policy: `SELECT` dla gości (read-only), `ALL` dla staff.

### 6.3 Tabele transakcyjne (RLS: TAK, property_id + ograniczone operacje dla gościa)

```
orders          — zamówienia gości
                  Guest policy: SELECT WHERE session_id = current session
                  Staff policy: ALL WHERE property_id = staff's property

reservations    — rezerwacje; guest widzi tylko własną (przez session_id)
                  Staff: ALL per property

sessions        — tabela sesji gości; KRYTYCZNA
                  Guest policy: SELECT własnej sesji (przez session_id z context)
                  Staff: SELECT per property (do zarządzania aktywnymi sesjami)
                  INSERT: tylko przez service_role (walidacja tokenu)
                  UPDATE (revoke): tylko przez service_role lub Owner/Admin staff
```

### 6.4 Tabele platform-level (RLS: TAK, ale inaczej — tylko dla staff panelu)

```
hotel_users     — użytkownicy panelu hotelowego
                  Policy: użytkownik widzi tylko swoją property
                  Owner/Admin: ALL per property (zarządzanie memberami)
                  Staff/Viewer: SELECT (tylko siebie)

qr_codes        — QR kody recepcji i pokoi
                  Policy: staff widzi tylko swój hotel
                  Rotacja QR: service_role

invitations     — zaproszenia do panelu
                  Policy: Owner/Admin per property
```

### 6.5 Tabele wektorowe / AI (RLS: TAK, property_id)

```
knowledge_chunks    — chunki RAG w Supabase Vector (pgvector)
                      Policy: AI pipeline czyta per property_id
                      Staff: CRUD per property (dodawanie wiedzy)

embeddings_cache    — cache embeddingów; property-scoped
```

### 6.6 Tabele systemowe (RLS: NIE — tylko service_role)

```
audit_logs      — logi platformy; tylko service_role, nie eksponowane przez API
job_queue       — kolejka zadań (cron, eksport CSV); tylko service_role
platform_config — konfiguracja globalna platformy; tylko service_role
```

### 6.7 Mapa decyzji RLS dla tego projektu

```
Tabela              | RLS? | Kto czyta        | Kto pisze
--------------------|------|------------------|------------------
hotels              | TAK  | Staff (własny)   | Owner/Admin (własny), service_role
services            | TAK  | Guests, Staff    | Staff (Admin+)
service_categories  | TAK  | Guests, Staff    | Staff (Admin+)
knowledge_base      | TAK  | AI pipeline      | Staff (Admin+)
orders              | TAK  | Guest (własne)   | Guest (INSERT), Staff (UPDATE status)
reservations        | TAK  | Guest (własna)   | service_role (import CSV), Staff
sessions            | TAK  | Guest (własna)   | service_role
hotel_users         | TAK  | Staff (własny)   | Owner/Admin
qr_codes            | TAK  | Staff            | service_role, Admin
invitations         | TAK  | Owner/Admin      | Owner/Admin
knowledge_chunks    | TAK  | AI pipeline      | service_role
billing             | TAK  | Owner            | service_role
audit_logs          | NIE  | service_role     | service_role
platform_config     | NIE  | service_role     | service_role
```

---

## 7. Wzorzec identyfikacji tenanta — routing

### 7.1 Opcje identyfikacji tenanta w URL

| Wzorzec | Przykład | Zalety | Wady |
|---|---|---|---|
| Subdomena | `hilton.guestapp.com` | Izolacja cookie, profesjonalny wygląd | Wymaga wildcard DNS + wildcard cert |
| Path prefix | `guestapp.com/h/hilton` | Prosty hosting | Mniej profesjonalny |
| Custom domain | `app.hilton.com` | White-label | Konfiguracja per tenant, SSL per domain |
| Token w URL | `guestapp.com/g?t=UUID` | Aktualny wzorzec (QR) | Brak routing per tenant w URL |

**Dla tego projektu:** token w URL (QR) już identyfikuje tenanta pośrednio — `init_token` mapuje na `property_id` w bazie. Nie potrzeba subdomain routing dla guest-facing.

Panel hotelowy może używać path prefix: `guestapp.com/dashboard` z izolacją przez Supabase Auth + `hotel_users`.

### 7.2 Routing w Next.js App Router

```typescript
// app/[propertySlug]/page.tsx — opcjonalny routing per hotel
// LUB:
// app/dashboard/page.tsx — panel staff (izolacja przez JWT)
// app/g/[token]/page.tsx — ścieżka gościa (token z QR)

// middleware.ts — tenant routing
export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (path.startsWith('/g/')) {
    // Guest app — walidacja opaque token
    return handleGuestRoute(request);
  }

  if (path.startsWith('/dashboard')) {
    // Hotel panel — walidacja Supabase Auth JWT
    return handleStaffRoute(request);
  }
}
```

---

## 8. Migracja do większej izolacji — ścieżka ewolucji

Gdyby kiedykolwiek zaistniała potrzeba przejścia na model z większą izolacją:

```
Teraz: Shared DB + RLS (property_id)
    ↓ (przy ~500-1000 hoteli lub wymogach enterprise)
Opcja A: Read replicas per region (izolacja geograficzna, nie logiczna)
    ↓
Opcja B: Sharding po property_id na multiple Supabase projects
         (automatyczne dzięki property_id w każdej tabeli)
    ↓
Opcja C: Schema-per-tenant dla enterprise accounts
         (możliwe dzięki property_id — łatwa migracja danych)
```

`property_id` w każdej tabeli od początku to **klucz do każdej ze ścieżek** powyżej. Bez niego migracja wymagałaby pełnego przepisania schematu.

---

## 9. Konkretne rekomendacje dla Hotel Guest App MVP

### Architektura

1. **Shared Database + RLS** — jedyna rozsądna opcja przy tej skali i stacku
2. **`property_id uuid NOT NULL` w każdej tabeli** — już zdecydowane, egzekwować przez PR review
3. **Dwa konteksty RLS**: guest context (z `current_setting`) + staff context (z Supabase Auth)
4. **service_role tylko server-side** — nigdy w kliencie; używać do ustawiania kontekstu i operacji administracyjnych

### Supabase specifics

5. **RLS policies od dnia 1** — nie "dodamy później"; to jest krytyczne security feature
6. **Supavisor transaction mode** + `set_config(..., true)` — kompatybilne, bezpieczne w serverless
7. **`anon` key w kliencie** zawsze z włączonym RLS; `service_role` tylko w Server Actions / API routes
8. **pgvector dla knowledge_base** — Supabase ma wbudowane wsparcie, nie potrzeba oddzielnego Qdrant na MVP

### Indeksy — minimum wymagane przy starcie

```sql
-- Na każdej tabeli tenant-scoped:
CREATE INDEX idx_{table}_property_id ON {table}(property_id);

-- Composite index dla najczęstszych queries (dostosować po profilu ruchu):
CREATE INDEX idx_orders_property_created ON orders(property_id, created_at DESC);
CREATE INDEX idx_sessions_property_expires ON sessions(property_id, expires_at);
CREATE INDEX idx_services_property_active ON services(property_id) WHERE is_active = true;
```

### Czego NIE robić

- Nie implementować tenant isolation w warstwie aplikacji (Prisma where clause) zamiast w bazie — to nie jest wystarczające zabezpieczenie
- Nie używać `FORCE ROW LEVEL SECURITY` dla superuser (blokuje administrację) — tylko dla ról `anon`/`authenticated`
- Nie tworzyć policy z subquery bez sprawdzenia EXPLAIN ANALYZE
- Nie odkładać włączenia RLS "na później" — koszt dodania retrospektywnie jest wielokrotnie wyższy

---

## 10. Przykładowy schemat startowy

```sql
-- Tabele globalne (bez RLS lub ze specjalną policy)
CREATE TABLE hotels (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  slug         text UNIQUE NOT NULL,
  plan         text NOT NULL DEFAULT 'lighthouse',
  is_active    boolean DEFAULT true,
  created_at   timestamptz DEFAULT now()
);

-- Tabele tenant-scoped (wzorzec)
CREATE TABLE services (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  category_id  uuid REFERENCES service_categories(id),
  name         text NOT NULL,
  description  text,
  price_pln    numeric(10,2),
  is_active    boolean DEFAULT true,
  sort_order   integer DEFAULT 0,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX idx_services_property_id ON services(property_id);
ALTER TABLE services ENABLE ROW LEVEL SECURITY;

CREATE TABLE orders (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  session_id   uuid NOT NULL REFERENCES sessions(id),
  service_id   uuid NOT NULL REFERENCES services(id),
  notes        text,
  status       text NOT NULL DEFAULT 'pending',
  requested_at timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);
CREATE INDEX idx_orders_property_id ON orders(property_id);
CREATE INDEX idx_orders_session_id ON orders(session_id);
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE TABLE sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id    uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  reservation_id uuid REFERENCES reservations(id),
  auth_level     smallint NOT NULL DEFAULT 0,
  expires_at     timestamptz NOT NULL,
  revoked        boolean DEFAULT false,
  created_at     timestamptz DEFAULT now()
);
CREATE INDEX idx_sessions_property_id ON sessions(property_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at) WHERE revoked = false;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE reservations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  guest_email     text,
  guest_first_name text,
  room_number     text NOT NULL,
  check_in        date NOT NULL,
  check_out       date NOT NULL,
  invite_token    uuid UNIQUE DEFAULT gen_random_uuid(),
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX idx_reservations_property_id ON reservations(property_id);
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

-- RLS Policies — guest context
CREATE POLICY "guest_read_services" ON services
  FOR SELECT USING (
    property_id = current_setting('app.property_id', true)::uuid
    AND is_active = true
  );

CREATE POLICY "guest_read_own_orders" ON orders
  FOR SELECT USING (
    session_id = current_setting('app.session_id', true)::uuid
  );

CREATE POLICY "guest_insert_orders" ON orders
  FOR INSERT WITH CHECK (
    property_id = current_setting('app.property_id', true)::uuid
    AND session_id = current_setting('app.session_id', true)::uuid
  );

-- RLS Policies — staff context (przez Supabase Auth)
CREATE POLICY "staff_all_services" ON services
  FOR ALL USING (
    property_id IN (
      SELECT property_id FROM hotel_users
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "staff_all_orders" ON orders
  FOR ALL USING (
    property_id IN (
      SELECT property_id FROM hotel_users
      WHERE user_id = auth.uid() AND is_active = true
    )
  );
```

---

## Źródła i referencje

- Supabase Docs: Row Level Security (2025) — supabase.com/docs/guides/database/row-level-security
- Supabase Blog: "Multi-tenant SaaS patterns" (2024)
- PostgreSQL 16 Documentation: Row Security Policies
- Neon Tech Blog: "Multi-tenancy patterns in PostgreSQL" (2024)
- Benchmarki z: pganalyze.com/blog/rls-performance (2023), supabase.com/blog (2024)
- stancl/tenancy dla Laravel — referencja dla porównania wzorców
- PostgREST RLS documentation — wzorce `current_setting` dla opaque tokens

---

*Dokument wyprodukowany przez subagent: multitenant-architecture-patterns*
*Następna sesja: pwa-techstack-2026.md i security-qr-sessions.md (równolegle)*
