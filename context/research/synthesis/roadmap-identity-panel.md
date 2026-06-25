# Roadmap implementacji — Tożsamość, Sesja Gościa i Panel Hotelowy
*Fragment roadmapu (Subagent 1 / Etap 2 syntezy) — Hotel Guest App MVP*
*Źródła: decisions_log.md (Sesje 1–2, HITL #1–#4, #11, decyzje tech T1–T5), research/session_01/*, research/session_02/*
*Data: 2026-06-25 · Status: gotowe do przekazania developerowi*

---

## 0. Założenia wynikające z decyzji HITL (explicite)

Każda decyzja poniżej jest twardym wejściem do architektury. Nie podlega ponownej dyskusji na poziomie implementacji.

| HITL | Treść decyzji | Implikacja techniczna |
|---|---|---|
| **#1** | Token anonimowy + DPA z każdym hotelem + imię gościa wyłącznie do personalizacji UX | Platforma nie przechowuje PII gościa poza `guest_first_name`. Brak nazwiska/maila gościa w tabelach operacyjnych poza `reservations`. |
| **#2** | Czas życia sesji gościa = `checkout_datetime + 2h` (fixed expiry, NIE sliding window) | Kolumna `sessions.expires_at` ustawiana raz przy tworzeniu sesji na podstawie `reservations.check_out`. |
| **#3** | Owner = billing = administrator danych (ADM). Osoba zakładająca konto podpisuje DPA. | Rola `owner` w `hotel_users` jest jedyną z dostępem do billingu; wymuszenie transferu ownership przed dezaktywacją. |
| **#4** | Maksymalny self-service + wsparcie jako opcja płatna | Panel musi być template-first + guided wizard. Onboarding (call, seeding FAQ, generowanie PDF QR) to płatna opcja, nie zależność systemu. |
| **#11** | Hotel = ADM, platforma = procesor. DPA obowiązkowe przed pierwszym wdrożeniem. UUID nie zwalnia z DPA. | Logiczna izolacja tenantów (RLS po `property_id`); rejestr czynności przetwarzania per tenant; audit trail. |
| **T1** | Next.js 15 App Router + TS + Tailwind + next-intl | Panel i guest UI w jednym repo Next.js; SSR/RSC. |
| **T2** | Supabase (Postgres + Auth + Storage) + RLS multi-tenant (`property_id` + `current_setting`) | Wzorzec RLS opisany w §4. |
| **T3** | GPT-4o-mini + prompt injection; pgvector jako ścieżka upgradu | Tabela `knowledge_chunks` z RLS, kolumna `embedding vector` przygotowana, nieaktywna na MVP. |
| **T4** | Railway (MVP) → Fly.io waw; custom SSE (Route Handler nodejs + LISTEN/NOTIFY); Vercel wykluczony | Sesje wymagają serwera persystentnego; brak serverless timeoutów. |
| **T5** | Solo + Claude Code + Spec Driven Development | Roadmapa maksymalnie szczegółowa i opinionated. |

---

## 1. Architektura tenantów i model sesji gościa

### 1.1 Multi-tenancy — Shared Database + RLS

**Wzorzec:** jedna baza Postgres, izolacja logiczna przez Row-Level Security z dyskryminatorem `property_id`.

- Każda tabela tenantowa ma kolumnę `property_id UUID NOT NULL REFERENCES properties(id)`.
- RLS policy używa **wzorca `current_setting`** (NIE subquery — subquery jest 10–20x wolniejsze):

```sql
-- Wzorzec polityki RLS (powielany na każdej tabeli tenantowej)
ALTER TABLE services ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON services
  USING (property_id = current_setting('app.property_id', true)::uuid);
```

- `current_setting('app.property_id', true)` — drugi argument `true` (`missing_ok`) zwraca NULL zamiast błędu, gdy ustawienie nie istnieje (np. kontekst service_role). NULL = brak dopasowania = zero wierszy, czyli fail-closed.
- Nazwa kolumny **`property_id` wszędzie** (agnostyczne wobec sieci hotelowych; `hotels`/`properties` to ten sam byt fizyczny — patrz §2).

**Ustawienie kontekstu** (w warstwie aplikacji, per request, w transakcji):
- Dla gościa: `property_id` pochodzi z claima JWT (Custom Access Token Hook — §1.2). Supabase automatycznie mapuje claim do RLS przez `auth.jwt()`. Alternatywnie aplikacja wykonuje `SET LOCAL app.property_id = '<uuid>'` na początku transakcji.
- Dla panelu hotelowego: `property_id` ustawiany z sesji zalogowanego `hotel_user` po walidacji przynależności.

> **Założenie (T2):** wszystkie zapytania gościa i panelu idą przez połączenie z aktywnym RLS. `service_role` (omijający RLS) używany WYŁĄCZNIE w job_queue, audit_logs i operacjach platformowych — nigdy w ścieżce żądania użytkownika.

### 1.2 Tożsamość gościa — Supabase Auth Anonymous + Custom Access Token Hook

Model identyfikacji (Sesja 1): hotel wgrywa dane gości (CSV/manual) → gość otrzymuje dostęp przez QR/magic link → token weryfikuje przynależność do rezerwacji. Platforma operuje na **opaque UUID**, niepowiązanym z PII po swojej stronie.

**Flow uwierzytelnienia:**

```
[QR URL] ──► /scan?init_token=<one_time_uuid>   (init_token TTL 15 min, single-use)
   │
   ▼
[Route Handler /api/scan/*]
   1. Waliduje init_token (ważny, nieużyty, nie wygasł, rezerwacja aktywna)
   2. Unieważnia init_token (single-use)
   3. supabase.auth.signInAnonymously()        ← Supabase Auth Anonymous Sign-In
   4. Custom Access Token Hook wstrzykuje do JWT:
        - property_id  (dla RLS)
        - session_id   (opaque UUID z tabeli sessions)
        - auth_level   (0/1/2)
   5. Tworzy rekord w sessions (opaque session_id, expires_at = checkout+2h)
   6. Set-Cookie: __Host-session=<session_id>; HttpOnly; Secure; SameSite=Strict; Path=/
   7. 302 redirect do / (token NIE pozostaje w URL)
```

**Custom Access Token Hook** (Postgres function rejestrowana w Supabase Auth): przy wydaniu/refreshu JWT dla anonimowego użytkownika dokleja claim `property_id` (i `session_id`, `auth_level`) na podstawie powiązania `auth.uid()` → `sessions`. Dzięki temu RLS gościa działa na podstawie zweryfikowanego claima, nie danych z klienta.

**Dwa identyfikatory — rozdział odpowiedzialności:**
- **JWT (Supabase)** — krótkotrwały access token + refresh; nośnik `property_id` dla RLS; wygodny dla supabase-js po stronie klienta.
- **Opaque `session_id` (UUID, tabela `sessions`)** — źródło prawdy o sesji: rewokacja, audyt, `auth_level`, `expires_at`. Przechowywany w cookie `__Host-session`. **To on, nie JWT, decyduje o ważności sesji** (uzasadnienie w §5).

### 1.3 Cookie i atrybuty

| Atrybut | Wartość | Uzasadnienie |
|---|---|---|
| Nazwa | `__Host-session` | Prefix wymusza Secure + Path=/ + brak Domain → eliminuje cookie injection i HTTP downgrade na hotelowym WiFi |
| `HttpOnly` | true | Brak dostępu JS → ochrona przed XSS token theft |
| `Secure` | true | Tylko HTTPS (HSTS z preload) |
| `SameSite` | `Strict` | PWA nie potrzebuje cross-site; ochrona CSRF |
| `Path` | `/` | Wymuszone przez `__Host-` |
| Wartość | opaque `session_id` (UUID v4) | Nigdy session token w URL |

### 1.4 Model czasów życia tokenów

```
init_token (w URL/QR)   = 15 min (QR recepcji), do końca pobytu (QR pokoju, statyczny)
                          single-use przy QR recepcji; rate-limited przy QR pokoju
session (opaque UUID)   = checkout_datetime + 2h   [HITL #2, fixed expiry]
max_session_duration    = 14 dni (górny limit długości pobytu)
idle_timeout            = BRAK (fixed expiry, nie sliding)
```

### 1.5 Step-Up Auth (`auth_level` 0 → 1 → 2)

Dwuetapowa weryfikacja przez dwa QR (implementacja step-up authentication, analogia RFC 9470 — fizyczna obecność jako faktor):

| `auth_level` | Stan | Jak osiągnąć | Dostępne funkcje (MVP) |
|---|---|---|---|
| 0 | UNAUTHENTICATED | brak | landing / informacje ogólne |
| 1 | RECEPTION_VERIFIED | skan QR recepcji (rotujący 5 min) | przeglądanie usług, menu, FAQ, AI concierge |
| 2 | ROOM_VERIFIED | skan QR pokoju (statyczny) — `room_id` z QR musi pasować do `room_active_reservation` | składanie zamówień "charge to room", powiązanie z pokojem |

- Przejście 1→2 możliwe TYLKO jeśli `room_id` z QR == aktywna rezerwacja pokoju w oknie `valid_from`/`valid_until` (§2). Niezgodność → odmowa + alert.
- QR pokoju jest statyczny i wielorazowy → służy też do **silent re-auth** (np. iOS usuwa cookie po 7 dniach bez interakcji; ponowny skan przywraca `auth_level=2` bez wizyty w recepcji).

> **Uwaga MVP:** ponieważ na MVP nie ma digital key ani płatności (HITL #5), realna różnica funkcjonalna 1 vs 2 jest niewielka — `auth_level` jest jednak modelowany od początku, bo determinuje, czy zamówienie może być powiązane z pokojem. Cała baza schematu jest gotowa pod rozszerzenia.

---

## 2. Schemat bazy danych

Konwencje: PK = `id UUID DEFAULT gen_random_uuid()`. Wszystkie timestampy `TIMESTAMPTZ`. FK z `ON DELETE` dobranym per relacja (poniżej). **RLS = tabela tenantowa z polityką po `property_id`.** **service_role only = brak RLS dla użytkowników, dostęp tylko z kontekstu platformowego.**

### 2.1 Macierz tabel — RLS vs service_role + indeksy

| Tabela | RLS (`property_id`)? | Obowiązkowy indeks | Uwaga |
|---|:--:|---|---|
| `hotels` / `properties` | częściowo* | PK | byt tenanta; sam wiersz filtrowany po `id`, nie `property_id` |
| `hotel_users` | ✅ | `(property_id)`, `(property_id, role)` | 4 role |
| `reservations` | ✅ | `(property_id)`, `(property_id, check_out)`, `(invite_token)` | zawiera PII gościa |
| `sessions` | ✅ | `(property_id)`, `(reservation_id)`, `(expires_at)` | rewokacja po `reservation_id` |
| `rooms` | ✅ | `(property_id)`, `(property_id, room_number)` | + osadzone okno aktywnej rezerwacji |
| `qr_codes` | ✅ | `(property_id)`, `(property_id, type)`, `(init_token)` | recepcji + pokoju |
| `services` | ✅ | `(property_id)`, `(property_id, category, is_active)` | katalog usług |
| `orders` | ✅ | `(property_id)`, `(property_id, status)`, `(session_id)` | inbox zamówień |
| `knowledge_chunks` | ✅ | `(property_id)`, `(property_id, category)` | + `embedding` (nieaktywne MVP) |
| `audit_logs` | ❌ service_role | `(property_id, created_at)`, `(actor_id)` | append-only, RODO/SoD |
| `platform_config` | ❌ service_role | PK / `(key)` | globalne ustawienia platformy |
| `job_queue` | ❌ service_role | `(status, run_at)` | cron retencji, CSV import, email |

\* `properties` jest tabelą-rodzicem tenanta. Izolację realizuje się przez to, że pozostałe tabele filtrują po `property_id`; dostęp `hotel_user` do własnego property kontrolowany przez join do `hotel_users`.

### 2.2 Definicje tabel

```sql
-- ───────────────────────── TENANT ROOT ─────────────────────────
-- Jednolita nazwa property_id wszędzie; "hotels" i "properties" to ten sam byt.
-- Nazwa tabeli: properties (agnostyczne wobec sieci hotelowych).
CREATE TABLE properties (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  address         TEXT,
  phone_reception TEXT,                       -- numer recepcji (fallback w stanach P0/P1)
  logo_url        TEXT,                        -- Supabase Storage
  timezone        TEXT NOT NULL DEFAULT 'Europe/Warsaw',
  check_in_time   TIME,
  check_out_time  TIME,
  default_locale  TEXT NOT NULL DEFAULT 'pl',  -- 'pl' | 'en'
  ai_bot_name     TEXT,                        -- opcjonalne imię bota (HITL #8)
  setup_completed BOOLEAN NOT NULL DEFAULT false, -- tryb setup vs operacje (§3.5)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────── UŻYTKOWNICY PANELU ─────────────────────────
CREATE TYPE hotel_role AS ENUM ('owner', 'admin', 'staff', 'viewer');

CREATE TABLE hotel_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  auth_user_id  UUID REFERENCES auth.users(id),     -- Supabase Auth (po przyjęciu zaproszenia)
  email         TEXT NOT NULL,
  full_name     TEXT,
  role          hotel_role NOT NULL DEFAULT 'staff', -- least privilege (RBAC research)
  status        TEXT NOT NULL DEFAULT 'invited',     -- 'invited'|'active'|'deactivated'
  invite_token  UUID,                                -- zaproszenie e-mail
  invite_expires_at TIMESTAMPTZ,                     -- 72h
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (property_id, email)
);
-- Offboarding = status='deactivated' (NIE DELETE) → audit trail, RODO, rotacja 30-50%/rok.
-- Zakaz dezaktywacji ostatniego ownera bez transferu (enforce w warstwie aplikacji + constraint trigger).

-- ───────────────────────── REZERWACJE (PII GOŚCIA) ─────────────────────────
CREATE TYPE reservation_status AS ENUM ('pending','checked_in','checked_out','cancelled');

CREATE TABLE reservations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  external_id     TEXT,                       -- ID z PMS (gdy webhook post-MVP), NULL dla CSV/manual
  source          TEXT NOT NULL DEFAULT 'csv',-- 'csv'|'manual'|'mews'|'apaleo'
  guest_first_name TEXT,                      -- HITL #1: tylko personalizacja UX
  guest_email     TEXT,                       -- do wysłania magic link; PII -> retencja
  room_id         UUID REFERENCES rooms(id),  -- nullable: pokój przydzielany przy check-in
  check_in        TIMESTAMPTZ NOT NULL,
  check_out       TIMESTAMPTZ NOT NULL,
  status          reservation_status NOT NULL DEFAULT 'pending',
  invite_token    UUID DEFAULT gen_random_uuid(),  -- magic link (jednorazowy/ograniczony czasowo)
  invite_token_expires_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────── POKOJE + OKNO AKTYWNEJ REZERWACJI ─────────────────────────
CREATE TABLE rooms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  room_number   TEXT NOT NULL,
  room_type     TEXT,
  -- Osadzone okno aktywnej rezerwacji: kontroluje, czy skan QR pokoju nadaje auth_level=2.
  room_active_reservation_id UUID REFERENCES reservations(id),
  valid_from    TIMESTAMPTZ,                  -- = check_in aktywnej rezerwacji
  valid_until   TIMESTAMPTZ,                  -- = check_out + 2h; przy early check-out: zamknięte natychmiast
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (property_id, room_number)
);
-- QR pokoju koduje room_id (statyczny). Powiązanie z rezerwacją odbywa się przez room_active_reservation
-- (valid_from/valid_until), NIE przez reservation_id w QR — patrz uzasadnienie §4.

-- ───────────────────────── KODY QR ─────────────────────────
CREATE TYPE qr_type AS ENUM ('reception','room');

CREATE TABLE qr_codes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  type          qr_type NOT NULL,
  room_id       UUID REFERENCES rooms(id),    -- tylko dla type='room'
  init_token    UUID NOT NULL DEFAULT gen_random_uuid(), -- token zakodowany w URL
  rotates_every INTERVAL,                      -- '5 minutes' dla recepcji; NULL dla pokoju (statyczny)
  expires_at    TIMESTAMPTZ,                   -- recepcja: now()+15min; pokój: NULL/koniec pobytu
  used_at       TIMESTAMPTZ,                   -- single-use dla recepcji
  is_active     BOOLEAN NOT NULL DEFAULT true, -- dezaktywacja QR pokoju (early check-out, zmiana pokoju)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────── SESJE GOŚCIA ─────────────────────────
CREATE TABLE sessions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- opaque session_id w cookie
  property_id        UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  reservation_id     UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  room_id            UUID REFERENCES rooms(id),  -- wypełniane po skan. QR pokoju
  auth_user_id       UUID REFERENCES auth.users(id), -- Supabase anonymous user
  auth_level         SMALLINT NOT NULL DEFAULT 0,    -- 0|1|2
  reception_scan_at  TIMESTAMPTZ,
  room_scan_at       TIMESTAMPTZ,
  device_fingerprint TEXT,                          -- UA + tz + screen hash (sygnał anomalii, nie security)
  last_asn           INTEGER,                        -- do anomaly detection (§4)
  expires_at         TIMESTAMPTZ NOT NULL,           -- HITL #2: checkout+2h
  revoked            BOOLEAN NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────── USŁUGI ─────────────────────────
CREATE TABLE services (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  template_key  TEXT,                           -- z biblioteki szablonów (late_checkout, parking...)
  name          TEXT NOT NULL,
  description   TEXT,
  category      TEXT NOT NULL,                  -- restaurant|room_service|spa|transport|info
  price_cents   INTEGER,                        -- NULL => "Included" (nie "0 PLN")
  currency      TEXT NOT NULL DEFAULT 'PLN',
  image_url     TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,  -- toggle dostępności (nie usuwać)
  is_pinned     BOOLEAN NOT NULL DEFAULT false, -- sekcja "Polecamy" (HITL #6, max 3)
  available_from TIME, available_to TIME,       -- opcjonalna dostępność godzinowa
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────── ZAMÓWIENIA ─────────────────────────
CREATE TYPE order_status AS ENUM ('new','confirmed','fulfilled','rejected');

CREATE TABLE orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  session_id    UUID REFERENCES sessions(id),
  reservation_id UUID REFERENCES reservations(id),
  room_id       UUID REFERENCES rooms(id),
  service_id    UUID NOT NULL REFERENCES services(id),
  price_cents   INTEGER,                        -- snapshot ceny w momencie zamówienia
  note          TEXT,                           -- opcjonalne uwagi gościa
  status        order_status NOT NULL DEFAULT 'new',
  scheduled_at  TIMESTAMPTZ,                    -- usługi time-sensitive (masaż, śniadanie)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Retencja: dane zamówień 5 lat (obowiązek podatkowy) — niezależnie od wygaśnięcia sesji.

-- ───────────────────────── BAZA WIEDZY AI ─────────────────────────
CREATE TABLE knowledge_chunks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  category      TEXT,                           -- faq|menu|rooms|policies|area
  question      TEXT,                           -- format Q&A z panelu (Sesja 2/4)
  content       TEXT NOT NULL,
  language      TEXT NOT NULL DEFAULT 'pl',
  valid_from    TIMESTAMPTZ, valid_until TIMESTAMPTZ, -- treści sezonowe
  content_hash  TEXT,                           -- incremental update (hash compare)
  embedding     vector(1536),                   -- pgvector: KOLUMNA GOTOWA, NIEAKTYWNA na MVP (HITL #12)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- MVP: prompt injection (cała KB w kontekście GPT-4o-mini). embedding pozostaje NULL.

-- ───────────────────────── AUDIT (service_role only) ─────────────────────────
CREATE TABLE audit_logs (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  property_id   UUID,                           -- nullable dla zdarzeń platformowych
  actor_id      UUID,                           -- hotel_user.id lub NULL (system)
  event_type    TEXT NOT NULL,                  -- user_invited|deactivated|role_changed|login_*|qr_*|session_revoked|early_checkout
  target_id     UUID,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Append-only. Brak RLS: dostęp tylko service_role (oddzielenie platform admin od hotel admin).

-- ───────────────────────── PLATFORM CONFIG (service_role only) ─────────────────────────
CREATE TABLE platform_config (
  key           TEXT PRIMARY KEY,
  value         JSONB NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────── JOB QUEUE (service_role only) ─────────────────────────
CREATE TABLE job_queue (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type      TEXT NOT NULL,                  -- csv_import|send_invite|retention_purge|qr_rotate
  payload       JSONB,
  property_id   UUID,
  status        TEXT NOT NULL DEFAULT 'pending',-- pending|running|done|failed
  run_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts      INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Obsługuje retencję RODO (sesja->checkout+48h, logi serwera->30 dni), CSV import, e-mail zaproszeń, rotację QR.
```

### 2.3 Diagram relacji (FK)

```
properties (1) ──┬──< hotel_users
                 ├──< reservations >──┐
                 ├──< rooms ──────────┤ (rooms.room_active_reservation_id → reservations.id)
                 ├──< qr_codes >── rooms
                 ├──< sessions >── reservations, rooms
                 ├──< services ──< orders >── sessions, reservations, rooms
                 └──< knowledge_chunks

audit_logs / platform_config / job_queue  — poza RLS (service_role)
```

> **Indeksy obowiązkowe (T2):** każda tabela tenantowa MUSI mieć indeks na `property_id` (lub złożony zaczynający się od `property_id`). Bez tego RLS + filtrowanie po tenancie degraduje wydajność liniowo do rozmiaru całej bazy.

---

## 3. Panel hotelowy

### 3.1 6 modułów MVP — ekrany i funkcje z priorytetem

Legenda: **MUST** (bez tego produkt nie działa) · **SHOULD** (mocno podnosi wartość, ale da się odpalić bez) · **COULD** (nice-to-have).

#### Moduł 1 — Profil hotelu *(setup, jednorazowy)*
| Funkcja | Priorytet |
|---|---|
| Nazwa, adres, telefon recepcji, strefa czasowa | MUST |
| Godziny check-in / check-out | MUST |
| Logo + zdjęcie główne (Supabase Storage) | SHOULD |
| Języki obsługi (PL + EN) | SHOULD |
| Imię bota AI (HITL #8 — informacja "wirtualny asystent" obowiązkowa) | COULD |

#### Moduł 2 — Zarządzanie usługami *(core operacyjny)*
| Funkcja | Priorytet |
|---|---|
| Lista usług + CRUD (nazwa, opis, cena/`Included`, kategoria, toggle aktywności) | MUST |
| **Biblioteka szablonów** (15–20 gotowych usług — wybierz + wpisz cenę; eliminuje "syndrom pustego pola") | MUST |
| Pin do sekcji "Polecamy" (max 3, HITL #6) | SHOULD |
| Dostępność godzinowa (available_from/to) | COULD |
| Zdjęcie usługi | COULD |

#### Moduł 3 — Baza wiedzy AI concierge
| Funkcja | Priorytet |
|---|---|
| Edytor FAQ (lista Q&A) | MUST |
| Gotowe szablony FAQ (godziny, parking, WiFi, checkout, polityka zwierząt) | MUST |
| Pole "informacje o okolicy" (tekst) | SHOULD |
| Seeding inicjalny ze strony www (realizuje team platformy — płatna opcja, HITL #4) | SHOULD |
| Auto-tłumaczenie PL→EN treści | COULD |

#### Moduł 4 — Zarządzanie QR
| Funkcja | Priorytet |
|---|---|
| Generowanie QR recepcji (button; rotacja 5 min auto + ręczna) | MUST |
| Dezaktywacja QR pokoju (per pokój — early check-out / zmiana pokoju) | MUST |
| Status: liczba aktywnych sesji na bieżącym QR recepcji | SHOULD |
| Generowanie PDF z QR pokoi do druku (realizuje team platformy — płatna opcja) | SHOULD |
| Podgląd / rewokacja pojedynczych aktywnych sesji | COULD |

#### Moduł 5 — Zamówienia gości *(operations inbox)*
| Funkcja | Priorytet |
|---|---|
| Lista zamówień (data, pokój, usługa, status) | MUST |
| Zmiana statusu (new→confirmed→fulfilled / rejected) | MUST |
| Powiadomienie (email) o nowym zamówieniu | MUST |
| Live update statusu inbox (SSE / LISTEN-NOTIFY) | SHOULD |
| Export CSV (rozliczenia) | SHOULD |

#### Moduł 6 — Użytkownicy panelu
| Funkcja | Priorytet |
|---|---|
| Zaproszenie przez token email (72h), domyślna rola Staff | MUST |
| Dezaktywacja konta (NIE usunięcie) | MUST |
| Lista użytkowników + data ostatniego logowania | MUST |
| Wymuszony transfer ownership przed dezaktywacją Ownera (HITL #3) | MUST |
| Reset hasła | SHOULD |
| Zmiana roli przez Admin/Owner | SHOULD |

### 3.2 Role i uprawnienia — 4 role (Owner/Admin/Staff/Viewer)

Wzorzec z Stripe/Slack/Linear; separacja obowiązków (SoD): billing tylko Owner, user-management bez billingu = Admin, operacje = Staff, raporty = Viewer.

### 3.3 Macierz uprawnień per moduł

Legenda: ✅ pełny · ✏️ edycja (bez usuwania/krytycznych) · 👁 odczyt · ❌ brak.

| Moduł / akcja | Owner | Admin | Staff | Viewer |
|---|:--:|:--:|:--:|:--:|
| **Profil hotelu** | ✅ | ✅ | 👁 | 👁 |
| **Usługi — CRUD** | ✅ | ✅ | ✏️ | 👁 |
| **Baza wiedzy AI** | ✅ | ✅ | ✏️ | 👁 |
| **QR — generuj/dezaktywuj** | ✅ | ✅ | ✅ | ❌ |
| **QR — podgląd sesji** | ✅ | ✅ | ✅ | 👁 |
| **Zamówienia — podgląd** | ✅ | ✅ | ✅ | 👁 |
| **Zamówienia — zmiana statusu** | ✅ | ✅ | ✅ | ❌ |
| **Zamówienia — export CSV** | ✅ | ✅ | ❌ | ✅ |
| **Użytkownicy — zarządzanie** | ✅ | ✅ | ❌ | ❌ |
| **Dashboard / raporty** | ✅ | ✅ | 👁 | ✅ |
| **Billing / subskrypcja** | ✅ | ❌ | ❌ | ❌ |
| **Transfer ownership** | ✅ | ❌ | ❌ | ❌ |

Zasady twarde:
1. Nikt poza Owner/Admin nie zaprasza użytkowników.
2. Front Desk (Staff) nie dotyka billingu.
3. Viewer (Revenue Manager / właściciel nieoperacyjny) widzi raporty i export, nie zmienia konfiguracji ani operacji.
4. Owner nieusuwalny bez transferu (HITL #3).

### 3.4 Dashboard — 3 widoki (GM / F&B / Recepcja)

Trzy radykalnie różne potrzeby ról (Sesja 2 analytics). MVP — zakres:

| Widok | Zawartość MVP | Priorytet |
|---|---|---|
| **GM** | RevPAR + ADR + Occupancy (vs LY) + Booking pace 7 dni (KPI tiles + sparkline) | MUST |
| **Recepcja** | Lista arrivals/departures (operacyjna, bez wykresów); pokoje OOO; early/late requesty | MUST |
| **F&B** | Revenue per outlet / capture rate | WONT na MVP (wymaga integracji POS) |

> **Uwaga:** metryki RevPAR/ADR/Occupancy wymagają danych z PMS lub ręcznego importu (CSV) — na MVP bez PMS część z nich może być zasilana z importowanych rezerwacji (occupancy, booking pace), reszta odroczona. Nie zgaduję dostępności danych — to do potwierdzenia przy implementacji modułu dashboard.

### 3.5 Tryb setup vs operacje

Dwa odrębne tryby panelu (wzorzec ze wszystkich benchmarków CMS):
- **Setup** (jednorazowy): profil hotelu, aktywacja usług z szablonów, seeding FAQ, generowanie QR. Może go wykonać team platformy (płatna opcja, HITL #4). Flaga `properties.setup_completed`.
- **Operacje** (codzienne): inbox zamówień, zmiana statusów, generowanie QR recepcji, edycja FAQ. Musi być ekstremalnie prosty — obsługiwany przez recepcjonistę między rozmowami.
- **Guided wizard + procent gotowości** ("Hotel gotowy w 70%") — obowiązkowy (HITL #4, wzorzec Duve). Template-first eliminuje syndrom pustego pola.

---

## 4. Decyzje architektoniczne z uzasadnieniem

### D1 — Opaque UUID dla `session_id`, nie JWT
**Decyzja:** ważność sesji rozstrzyga opaque `session_id` w tabeli `sessions`, nie JWT.
**Uzasadnienie:**
- **Rewokacja natychmiastowa** — przy utracie telefonu / early check-out recepcja musi unieważnić dostęp natychmiast. JWT jest ważny do wygaśnięcia (stateless), rewokacja wymagałaby blacklisty, co niweluje jego zalety.
- **Prostszy audyt** — serwer wie dokładnie, kto ma aktywną sesję (`revoked`, `expires_at`).
- **Brak klasy ataków JWT** (alg:none, RS256→HS256 downgrade).
- **Mniejszy QR** — UUID (36 znaków) vs JWT (300+).
- Backend i tak istnieje (Supabase) → lookup do DB nie jest dodatkowym kosztem.
- JWT Supabase Auth pełni rolę pomocniczą (nośnik `property_id` dla RLS po stronie klienta), ale nie jest źródłem prawdy o sesji.

### D2 — Shared Database + RLS (nie schema/DB-per-tenant)
**Uzasadnienie:** koszt przy skali 200 hoteli: Shared DB ~$25–50/mies vs schema-per-tenant ~$100 vs DB-per-tenant ~$5000. RLS w Postgres jest dojrzały, a wzorzec `current_setting` daje izolację bez narzutu subquery. RODO wymaga logicznej izolacji — RLS po `property_id` ją zapewnia (fail-closed gdy brak kontekstu). Migracja do silniejszej izolacji możliwa później bez zmiany modelu danych (`property_id` już wszędzie).

### D3 — QR koduje `room_id`, nie `reservation_id`
**Uzasadnienie:** QR pokoju jest **statyczny przez cały okres eksploatacji pokoju** (jak karta hotelowa — drukowany raz, np. przed sezonem). Gdyby kodował `reservation_id`, trzeba by przeklejać QR przy każdej nowej rezerwacji. Kodując `room_id`, kontrolę przynależności realizuje okno `room_active_reservation(valid_from, valid_until)` w tabeli `rooms`: skan QR pokoju nadaje `auth_level=2` tylko jeśli `now()` mieści się w aktywnym oknie. To rozwiązuje też współdzielenie pokoju (dwie rezerwacje → walidacja po stronie serwera) i zmianę pokoju (zamknięcie okna).

### D4 — Anomaly detection po ASN (nie po IP)
**Uzasadnienie:** hotelowe WiFi to NAT — wielu gości za jednym publicznym IP. Detekcja po surowym IP dawałaby fałszywe alarmy. Reguła: `COUNT(DISTINCT asn) > 2` w oknie 30 min dla jednej sesji → alert; **country jump → auto-revoke** (`sessions.revoked=true` + wpis audit). `sessions.last_asn` aktualizowane przy żądaniach. IP w logach = dane pseudonimowe (TSUE Breyer) → anonimizacja ostatniego oktetu na load balancerze (RODO best practice).

### D5 — Rate limiting (Upstash Redis middleware)
**Uzasadnienie:** ochrona `/api/scan/*` przed token harvesting. Limit bazowy **5 prób / 15 min / IP**, podwyższony do **100 dla NAT hotelowego** (rozpoznawanie po ASN/known-range hotelu). Init_token recepcji single-use + 15 min TTL domyka okno replay. CAPTCHA po 3 nieudanych próbach.

### D6 — Import CSV zamiast integracji PMS na MVP
**Uzasadnienie:** ekosystem PMS jest sfragmentowany; integracje legacy (Opera, Protel) to 6–18 mies. i partnerstwa. Wszystkie benchmarki (Duve, Canary, ALICE) startowały bez PMS. **MVP: CSV import (`imię, email, nr pokoju, check_in, check_out`) + manual entry.** Platforma parsuje CSV → tworzy `reservations` + generuje `invite_token` + sesje. Webhook Mews/apaleo to enhancement post-MVP (kolumny `external_id`, `source` już gotowe). Model jest "PMS-optional by design" — integracja to pluggable enrichment, nie zależność.

> Powiązane założenie (HITL #5): "charge to room", zero bramki płatniczej, brak PCI DSS scope. `orders.price_cents` to snapshot do rozliczenia przez POS hotelu / przy checkout.

---

## 5. Krytyczne ścieżki do testów integracyjnych

Minimum obowiązkowe przed każdym deploymentem MVP. Framework zgodny z T1/T2 (np. Vitest + Supabase test client / Playwright dla e2e). Każdy test musi działać z aktywnym RLS (nie service_role), by realnie weryfikować izolację tenantów.

### IT-1 — Generowanie QR
- **QR recepcji (rotujący 5 min):** generacja przez button w panelu tworzy `qr_codes(type='reception', init_token, expires_at=now()+15min, rotates_every='5 min')`. Test: po 5 min poprzedni token nieaktywny; ręczna rotacja unieważnia poprzedni; tylko role z uprawnieniem QR (Owner/Admin/Staff) mogą generować.
- **QR pokoju (statyczny):** `qr_codes(type='room', room_id, rotates_every=NULL, is_active=true)`. Test: token stały między żądaniami; dezaktywacja (`is_active=false`) blokuje skan.

### IT-2 — Walidacja tokenu i token exchange
- `init_token` ważny + nieużyty + rezerwacja aktywna → `signInAnonymously` → Custom Hook wstrzykuje `property_id` do JWT → tworzy `sessions` → Set-Cookie `__Host-session` → 302 (token NIE w URL).
- Negatywne: token wygasły / już użyty (recepcja) / rezerwacja nieaktywna → odmowa, brak sesji.
- Replay init_token recepcji → odrzucony (single-use).
- Sprawdzenie atrybutów cookie (`HttpOnly`, `Secure`, `SameSite=Strict`, prefix `__Host-`).
- Step-up: skan QR pokoju z `room_id` spoza aktywnego okna `valid_from/valid_until` → odmowa + alert; z poprawnym → `auth_level` 1→2, `sessions.room_id` ustawione.

### IT-3 — Onboarding tenanta (utworzenie hotelu + import CSV gości)
- Utworzenie `properties` + Owner (`hotel_users.role='owner'`, `auth_user_id` po przyjęciu zaproszenia).
- Import CSV: parsowanie `imię,email,nr_pokoju,check_in,check_out` → tworzy `reservations` + dowiązuje/tworzy `rooms` + generuje `invite_token`. Test: wiersze błędne raportowane, poprawne utworzone (transakcyjnie/atomowo per plik lub per wiersz z raportem).
- **Izolacja tenantów:** zapytanie z kontekstem property A NIE zwraca wierszy property B (RLS) — krytyczny test bezpieczeństwa, obowiązkowy dla `reservations`, `services`, `orders`, `sessions`, `knowledge_chunks`, `hotel_users`, `qr_codes`.

### IT-4 — Early check-out (jedna transakcja unieważnia sesje i zamyka okno pokoju)
Pojedyncza transakcja SQL musi atomowo:
1. `UPDATE reservations SET status='checked_out' WHERE id=...`
2. `UPDATE sessions SET revoked=true WHERE reservation_id=... AND revoked=false`
3. `UPDATE rooms SET valid_until=now(), room_active_reservation_id=NULL WHERE id=...`
4. `UPDATE qr_codes SET is_active=false WHERE room_id=... AND type='room'` (opcjonalnie, jeśli QR per-rezerwacja)
5. `INSERT INTO audit_logs(event_type='early_checkout', ...)`

Test: po transakcji żądanie z cookie unieważnionej sesji → 401; skan QR pokoju → odmowa (okno zamknięte); częściowy rollback przy błędzie kroku → cała transakcja cofnięta (brak stanu pośredniego).

### IT-5 (SHOULD) — Cykl użytkownika panelu i ownership
- Zaproszenie (token 72h) → przyjęcie → `status='active'`.
- Dezaktywacja Staff → brak logowania, treści zachowane, audit wpis.
- Próba dezaktywacji ostatniego Ownera bez transferu → zablokowana (HITL #3).

---

## Załącznik — mapowanie decyzji HITL na artefakty implementacji

| HITL | Gdzie widoczne w roadmapie |
|---|---|
| #1 | `reservations.guest_first_name` (tylko UX); brak nazwiska gościa w tabelach operacyjnych |
| #2 | `sessions.expires_at = checkout+2h`, §1.4, IT-2 |
| #3 | rola `owner`, transfer ownership, §3.1 M6, §3.3, IT-5 |
| #4 | tryb setup vs operacje §3.5, szablony, guided wizard, seeding jako płatna opcja |
| #11 | RLS po `property_id`, izolacja tenantów IT-3, audit_logs, rejestr przetwarzania |
| T1–T5 | §0, stack w całym dokumencie (Next.js/Supabase/RLS/Railway/SSE/prompt-injection) |

*Koniec fragmentu. Wejście do Etapu 3 — sekcje 3, 4, 9 docelowego `implementation_roadmap.md`.*
