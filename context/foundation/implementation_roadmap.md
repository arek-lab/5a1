# Implementation Roadmap — Hotel Guest App MVP

*Dokument finalny fazy syntezy. Powstał z 7 sesji badawczych + 15 decyzji HITL + 5 decyzji tech stack (HITL-T).*
*Wersja 1.0 — 2026-06-25. Status: gotowy do przekazania zespołowi deweloperskiemu (solo + Claude Code, SDD).*

> **Jak czytać ten dokument:** każda sekcja jest samodzielna i gotowa do implementacji. Decyzje HITL są wyłożone explicite jako twarde założenia (nie podlegają reinterpretacji na etapie kodowania). Priorytety **MUST / SHOULD / COULD / WONT** towarzyszą każdej liście funkcji. Szacunki czasowe podawane są wyłącznie tam, gdzie wynikają z researchu — nigdzie nie zgadywane.

---

## Spis treści

1. [Kontekst i założenia](#1-kontekst-i-założenia)
2. [Tech Stack](#2-tech-stack)
3. [Architektura systemu](#3-architektura-systemu)
4. [Panel hotelowy](#4-panel-hotelowy)
5. [Interfejs gościa](#5-interfejs-gościa)
6. [AI Concierge](#6-ai-concierge)
7. [Onboarding hotelu i model SaaS](#7-onboarding-hotelu-i-model-saas)
8. [Plan wdrożenia MVP](#8-plan-wdrożenia-mvp)
9. [Strategia testowania](#9-strategia-testowania)
10. [Walidacja MVP](#10-walidacja-mvp)
11. [Otwarte ryzyka i decyzje odroczone](#11-otwarte-ryzyka-i-decyzje-odroczone)

---

## 1. Kontekst i założenia

### 1.1 Czym jest produkt

Platforma SaaS dwustronna dla hoteli (PWA). **Hotel** (operator) zarządza ofertą, treścią i danymi przez panel; **gość** korzysta z aplikacji jako rozszerzenia obsługi hotelowej: przegląda usługi, zamawia je „na rachunek pokoju" i rozmawia z AI concierge. **Platforma** dostarcza infrastrukturę, AI i interfejs gościa jako jedną instancję multi-tenant.

Aplikacja gościa jest quasi-usługą uzupełniającą SaaS — bez niej SaaS nie ma wartości, bez panelu hotel nie może wdrożyć produktu. **MVP wymaga zbudowania obu końców jednocześnie.**

### 1.2 Filozofia (niezmienne „dlaczego")

**Guest-first jest strategią sprzedaży do hoteli, nie altruizmem.** Hotel kupuje wyniki (upsell, recenzje, odciążenie recepcji); gość kupuje doświadczenie (wygoda, dostępność, opieka). Zasada nadrzędna: **doświadczenie gościa nigdy nie jest poświęcane na rzecz celów sprzedażowych.** Aplikacja, która „pachnie" sprzedażą, traci zaufanie gościa i przestaje generować wyniki.

**Filar 5A** (Access, Assistance, Amenities, Activities, AI) to architektura wartości i język komunikacji B2B + komunikat powitalny dla gościa — **nie** struktura nawigacji interfejsu.

### 1.3 Zamknięte decyzje HITL — skrót (twarde założenia)

Wszystkie 15 decyzji produktowych + 5 tech (T1–T5) mają status ✅ zamknięta. Pełne uzasadnienia w `context/foundation/decisions_log.md`.

| # | Obszar | Decyzja (skrót) |
|---|---|---|
| #1 | Identity | Token anonimowy + DPA z każdym hotelem; imię gościa wyłącznie do personalizacji UX |
| #2 | Identity | Czas sesji = `checkout_datetime + 2h` (fixed expiry) |
| #3 | Panel | Owner = billing = administrator danych (ADM), podpisuje DPA; wymuszony transfer ownership |
| #4 | Panel | Maksymalny self-service + wsparcie jako płatna opcja (dodatkowa monetyzacja) |
| #5 | Interfejs | „Charge to room" — zero bramki płatniczej na MVP, brak PCI DSS scope |
| #6 | Interfejs | Sekcja „Polecamy" (3 kafelki poniżej nawigacji); zero pop-upów; AI nie inicjuje sprzedaży |
| #7 | AI | Concierge tylko informuje/sugeruje — gość sam składa zamówienie w UI |
| #8 | AI | Zawsze transparentny („wirtualny asystent") — EU AI Act |
| #9 | AI | Hotel = właściciel treści (poprawność KB); platforma = operator (uptime/delivery) |
| #10 | SaaS | Lighthouse Program: 3–5 hoteli gratis 3–6 mies. za case study; potem €99–179/mies. lub per-room €5–8 (min €150) |
| #11 | SaaS | Hotel = ADM, platforma = procesor; DPA obowiązkowe przed każdym wdrożeniem |
| #12 | Tech | Prompt injection na MVP (cała KB w kontekście GPT-4o-mini); pgvector jako ścieżka upgradu |
| #13 | Tech | Solo + Claude Code + Spec Driven Development; stack opinionated; Railway > Fly.io na start |
| #14 | Metryki | Rygorystyczny sukces 3/3: ≥30% QR adoption/dobę + ≥10% upsell + hotel kontynuuje 3 mies. |
| #15 | Metryki | Pilot: 3 hotele × 6 tygodni (2 boutique + 1 mid-size) |
| **T1** | Tech | Frontend: Next.js 15 App Router + TS + Tailwind + next-intl |
| **T2** | Tech | Backend/DB: Supabase (Postgres + Auth + Storage) + RLS po `property_id` |
| **T3** | Tech | AI: GPT-4o-mini + prompt injection; Upstash Redis semantic cache; pgvector upgrade path |
| **T4** | Tech | Hosting: Railway (MVP) → Fly.io Warsaw; custom SSE; Vercel wykluczony |
| **T5** | Tech | Zespół: Solo + Claude Code + SDD |

---

## 2. Tech Stack

### 2.1 Stack ostateczny (decyzje HITL-T1 do T5)

```
Frontend:   Next.js 15 App Router + TypeScript + Tailwind CSS + next-intl (PL/EN)   [T1]
Auth:       Supabase Auth (Anonymous Sign-In + Custom Access Token Hook)            [T2]
Database:   Supabase Postgres + RLS (property_id = current_setting wzorzec)          [T2]
Realtime:   Custom SSE via Next.js Route Handler (runtime=nodejs) + LISTEN/NOTIFY    [T4]
Cache:      Upstash Redis (serverless, EU) — semantic cache AI + rate limiting       [T3]
AI:         GPT-4o-mini + prompt injection (cała KB hotelu w kontekście)             [T3]
Vector DB:  pgvector w Supabase (gotowe w schemacie, NIEAKTYWNE na MVP)              [T3]
Hosting:    Railway (MVP) → Fly.io waw (wzrost)                                      [T4]
CI/CD:      GitHub Actions + Railway preview deployments                             [T4]
Monitoring: Sentry + PostHog EU Cloud + Better Stack                                [T4]
Zespół:     Solo + Claude Code + Spec Driven Development                             [T5]
```

### 2.2 Diagram warstw

```
┌──────────────────────────────────────────────────────────────────┐
│  KLIENCI                                                           │
│  ┌────────────────────┐         ┌────────────────────────┐        │
│  │  Interfejs gościa   │         │   Panel hotelowy        │        │
│  │  (PWA, App Shell    │         │   (SSR/RSC, RBAC 4 role)│        │
│  │   <150 KB)          │         │                         │        │
│  └─────────┬──────────┘         └───────────┬────────────┘         │
└────────────┼───────────────────────────────┼──────────────────────┘
             │  HTTPS (__Host-session cookie) │
┌────────────▼───────────────────────────────▼──────────────────────┐
│  FRONTEND / BACKEND — Next.js 15 (Railway, serwer persystentny)    │
│  • RSC + Route Handlers (runtime=nodejs)                           │
│  • SSE: /api/orders/stream, /api/concierge/stream (LISTEN/NOTIFY)  │
│  • Middleware: rate limiting (Upstash), RLS context setup          │
└──────┬───────────────────┬────────────────────┬───────────────────┘
       │                   │                    │
┌──────▼──────┐   ┌────────▼────────┐   ┌───────▼────────┐
│  Supabase   │   │  Upstash Redis  │   │   OpenAI       │
│  Postgres   │   │  • semantic     │   │   GPT-4o-mini  │
│  + Auth     │   │    cache (AI)   │   │   (sub-proc.   │
│  + Storage  │   │  • rate limit   │   │    → DPA)      │
│  + RLS      │   │                 │   │                │
│  + pgvector │   └─────────────────┘   └────────────────┘
│   (uśpione) │
└─────────────┘
       ▲
       │  obserwowalność (od dnia 1)
┌──────┴──────────────────────────────────────────────────────────┐
│  Sentry (błędy)  •  PostHog EU (analityka)  •  Better Stack (SLA) │
└───────────────────────────────────────────────────────────────────┘
```

### 2.3 Koszt infrastruktury (z researchu, Sesja 6)

| Pozycja | MVP | Skala (200 hoteli / 100 hoteli AI) |
|---|---|---|
| Railway (hosting) | $40–60/mies. | wyżej / migracja do Fly.io waw |
| Supabase Pro | $25/mies. | $25–50/mies. (Shared DB + RLS) |
| Upstash Redis | $10–20/mies. | skaluje z ruchem |
| AI (GPT-4o-mini) | ~$2,59/hotel/mies. | ~$259/mies. (100 hoteli) |
| Better Stack | $24/mies. | — |
| Sentry, PostHog EU | Free tier | upgrade PostHog przy >3 hotelach (Group Analytics) |
| **Razem infra (bez AI)** | **~$75–105/mies.** | rośnie sublinearnie |

**Kluczowe wykluczenie (T4):** Vercel odpada — long-lived SSE powoduje timeouty w serverless. Architektura zakłada serwer persystentny.

---

## 3. Architektura systemu

*Źródło: `context/research/synthesis/roadmap-identity-panel.md`*

### 3.1 Multi-tenancy — Shared Database + RLS

Jedna baza Postgres, izolacja logiczna przez Row-Level Security z dyskryminatorem `property_id` (nazwa jednolita wszędzie — agnostyczna wobec sieci hotelowych).

```sql
-- Wzorzec polityki RLS (powielany na każdej tabeli tenantowej)
ALTER TABLE services ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON services
  USING (property_id = current_setting('app.property_id', true)::uuid);
```

- **Wzorzec `current_setting`**, NIE subquery (subquery jest 10–20× wolniejsze).
- Drugi argument `true` (`missing_ok`) → NULL zamiast błędu, gdy brak kontekstu (np. service_role) → fail-closed (zero wierszy).
- Kontekst ustawiany per request: dla gościa `property_id` z claima JWT (Custom Access Token Hook); dla panelu z sesji zalogowanego `hotel_user`.
- `service_role` (omijający RLS) używany **wyłącznie** w `job_queue`, `audit_logs`, operacjach platformowych — nigdy w ścieżce żądania użytkownika.

### 3.2 Tożsamość gościa — Supabase Auth Anonymous + Custom Access Token Hook

```
[QR URL] ──► /scan?init_token=<one_time_uuid>   (TTL 15 min, single-use dla recepcji)
   │
   ▼  [Route Handler /api/scan/*]
   1. Waliduje init_token (ważny, nieużyty, nie wygasł, rezerwacja aktywna)
   2. Unieważnia init_token (single-use)
   3. supabase.auth.signInAnonymously()
   4. Custom Access Token Hook wstrzykuje do JWT: property_id, session_id, auth_level
   5. Tworzy rekord sessions (opaque session_id, expires_at = checkout+2h)
   6. Set-Cookie: __Host-session=<session_id>; HttpOnly; Secure; SameSite=Strict; Path=/
   7. 302 redirect do / (token NIE pozostaje w URL)
```

**Dwa identyfikatory — rozdział odpowiedzialności:**
- **JWT (Supabase)** — krótkotrwały nośnik `property_id` dla RLS po stronie klienta.
- **Opaque `session_id` (UUID, tabela `sessions`)** — **źródło prawdy o sesji**: rewokacja, audyt, `auth_level`, `expires_at`. To on, nie JWT, decyduje o ważności sesji (uzasadnienie: D1 poniżej).

**Cookie `__Host-session`:** `HttpOnly` + `Secure` + `SameSite=Strict` + `Path=/`; prefix `__Host-` eliminuje cookie injection i HTTP downgrade na hotelowym WiFi. Wartość = opaque `session_id` (nigdy token w URL).

**Czasy życia:** `init_token` = 15 min (QR recepcji, single-use) / do końca pobytu (QR pokoju, statyczny); sesja = `checkout+2h` (fixed expiry, brak sliding); max długość pobytu 14 dni.

**Step-Up Auth (`auth_level` 0→1→2):**

| `auth_level` | Stan | Jak osiągnąć | Funkcje MVP |
|---|---|---|---|
| 0 | UNAUTHENTICATED | brak | landing / info ogólne |
| 1 | RECEPTION_VERIFIED | skan QR recepcji (rotujący 5 min) | przeglądanie usług, menu, FAQ, AI |
| 2 | ROOM_VERIFIED | skan QR pokoju (statyczny); `room_id` musi pasować do `room_active_reservation` | składanie zamówień „charge to room" |

Przejście 1→2 tylko jeśli `now()` mieści się w oknie `valid_from`/`valid_until` aktywnej rezerwacji pokoju. QR pokoju (statyczny) służy też do **silent re-auth** (np. iOS kasuje cookie po 7 dniach).

### 3.3 Schemat bazy danych

**Macierz tabel — RLS vs service_role + obowiązkowe indeksy:**

| Tabela | RLS (`property_id`)? | Obowiązkowy indeks | Uwaga |
|---|:--:|---|---|
| `properties` | częściowo* | PK | byt tenanta; filtr po `id` |
| `hotel_users` | ✅ | `(property_id)`, `(property_id, role)` | 4 role |
| `reservations` | ✅ | `(property_id)`, `(property_id, check_out)`, `(invite_token)` | zawiera PII gościa |
| `sessions` | ✅ | `(property_id)`, `(reservation_id)`, `(expires_at)` | rewokacja po `reservation_id` |
| `rooms` | ✅ | `(property_id)`, `(property_id, room_number)` | + okno aktywnej rezerwacji |
| `qr_codes` | ✅ | `(property_id)`, `(property_id, type)`, `(init_token)` | recepcji + pokoju |
| `services` | ✅ | `(property_id)`, `(property_id, category, is_active)` | katalog usług |
| `orders` | ✅ | `(property_id)`, `(property_id, status)`, `(session_id)` | inbox zamówień |
| `knowledge_chunks` | ✅ | `(property_id)`, `(property_id, category)` | + `embedding` (uśpione MVP) |
| `audit_logs` | ❌ service_role | `(property_id, created_at)`, `(actor_id)` | append-only, RODO/SoD |
| `platform_config` | ❌ service_role | PK / `(key)` | globalne ustawienia |
| `job_queue` | ❌ service_role | `(status, run_at)` | cron retencji, CSV import, email |

\* `properties` jest rodzicem tenanta; izolację realizują tabele dzieci filtrujące po `property_id`.

> **Indeksy obowiązkowe (T2):** każda tabela tenantowa MUSI mieć indeks na `property_id` (lub złożony zaczynający się od `property_id`). Bez tego RLS degraduje wydajność liniowo do rozmiaru całej bazy.

**Pełne definicje SQL** — patrz `context/research/synthesis/roadmap-identity-panel.md §2.2`. Kluczowe elementy:

- `properties` — `name, address, phone_reception, logo_url, timezone (default 'Europe/Warsaw'), check_in/out_time, default_locale, ai_bot_name, setup_completed`.
- `hotel_users` — `role hotel_role ENUM('owner','admin','staff','viewer')`, `status ('invited'|'active'|'deactivated')`, `invite_token` + `invite_expires_at` (72h). **Offboarding = dezaktywacja, NIE DELETE** (audit trail, RODO, rotacja 30–50%/rok). Zakaz dezaktywacji ostatniego ownera bez transferu.
- `reservations` — `guest_first_name` (HITL #1, tylko UX), `guest_email` (magic link), `external_id`/`source` (gotowe pod webhook PMS post-MVP), `invite_token` + expiry.
- `rooms` — osadzone okno `room_active_reservation_id` + `valid_from`/`valid_until` (kontroluje, czy skan QR pokoju nadaje `auth_level=2`).
- `qr_codes` — `type qr_type ENUM('reception','room')`, `init_token`, `rotates_every INTERVAL` (5 min recepcja / NULL pokój), `used_at` (single-use), `is_active` (dezaktywacja per pokój).
- `sessions` — opaque `id`, `auth_level`, `reception_scan_at`/`room_scan_at`, `device_fingerprint`, `last_asn` (anomaly detection), `expires_at` (checkout+2h), `revoked`.
- `services` — `template_key`, `price_cents` (NULL ⇒ „Included"), `is_active`, `is_pinned` (sekcja „Polecamy", max 3), `available_from/to`.
- `orders` — `session_id`, `reservation_id`, `room_id`, `service_id`, `price_cents` (snapshot), `note` (opcjonalne uwagi), `status order_status ENUM('new','confirmed','fulfilled','rejected')`, `scheduled_at`. **Retencja 5 lat** (obowiązek podatkowy).
- `knowledge_chunks` — `category, question, content, language, valid_from/until, content_hash`, `embedding vector(1536)` **NIEAKTYWNE na MVP** (prompt injection).
- `audit_logs` (append-only), `platform_config`, `job_queue` (cron retencji, CSV import, email, rotacja QR) — wszystkie service_role.

**Diagram relacji:**

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

### 3.4 Decyzje architektoniczne z uzasadnieniem

| # | Decyzja | Uzasadnienie (skrót) |
|---|---|---|
| **D1** | Opaque UUID dla `session_id`, nie JWT | Rewokacja natychmiastowa (utrata telefonu, early check-out); prostszy audyt; brak klasy ataków JWT; mniejszy QR. JWT pomocniczy (nośnik `property_id`). |
| **D2** | Shared DB + RLS (nie schema/DB-per-tenant) | Koszt 200 hoteli: ~$25–50 vs ~$100 vs ~$5000/mies. RLS dojrzały; migracja możliwa później (`property_id` już wszędzie). |
| **D3** | QR koduje `room_id`, nie `reservation_id` | QR pokoju statyczny przez cały okres eksploatacji (jak karta hotelowa); przynależność kontrolowana oknem `room_active_reservation`. Rozwiązuje współdzielenie/zmianę pokoju. |
| **D4** | Anomaly detection po ASN, nie IP | Hotelowe WiFi = NAT; detekcja po IP = false positives. `COUNT(DISTINCT asn) > 2`/30 min → alert; country jump → auto-revoke. IP anonimizowane na LB (RODO). |
| **D5** | Rate limiting (Upstash middleware) | `/api/scan/*`: 5 prób/15 min/IP, podwyższone do 100 dla NAT hotelowego (po ASN). CAPTCHA po 3 nieudanych. |
| **D6** | Import CSV zamiast PMS na MVP | Ekosystem PMS sfragmentowany; integracje legacy = 6–18 mies. „PMS-optional by design" — webhook Mews/apaleo to enrichment post-MVP (`external_id`, `source` gotowe). |

---

## 4. Panel hotelowy

*Źródło: `context/research/synthesis/roadmap-identity-panel.md §3`*

### 4.1 Sześć modułów MVP — ekrany i funkcje z priorytetem

#### Moduł 1 — Profil hotelu *(setup, jednorazowy)*
| Funkcja | Priorytet |
|---|---|
| Nazwa, adres, telefon recepcji, strefa czasowa | MUST |
| Godziny check-in / check-out | MUST |
| Logo + zdjęcie główne (Supabase Storage) | SHOULD |
| Języki obsługi (PL + EN) | SHOULD |
| Imię bota AI (informacja „wirtualny asystent" obowiązkowa, HITL #8) | COULD |

#### Moduł 2 — Zarządzanie usługami *(core operacyjny)*
| Funkcja | Priorytet |
|---|---|
| Lista usług + CRUD (nazwa, opis, cena/`Included`, kategoria, toggle aktywności) | MUST |
| **Biblioteka szablonów** (15–20 gotowych usług — wybierz + wpisz cenę) | MUST |
| Pin do sekcji „Polecamy" (max 3, HITL #6) | SHOULD |
| Dostępność godzinowa (`available_from/to`) | COULD |
| Zdjęcie usługi | COULD |

#### Moduł 3 — Baza wiedzy AI concierge
| Funkcja | Priorytet |
|---|---|
| Edytor FAQ (lista Q&A) | MUST |
| Gotowe szablony FAQ (godziny, parking, WiFi, checkout, zwierzęta) | MUST |
| Pole „informacje o okolicy" (tekst) | SHOULD |
| Seeding inicjalny ze strony www (team platformy — płatna opcja, HITL #4) | SHOULD |
| Auto-tłumaczenie PL→EN treści | COULD |

#### Moduł 4 — Zarządzanie QR
| Funkcja | Priorytet |
|---|---|
| Generowanie QR recepcji (button; rotacja 5 min auto + ręczna) | MUST |
| Dezaktywacja QR pokoju (per pokój — early check-out / zmiana pokoju) | MUST |
| Status: liczba aktywnych sesji na bieżącym QR recepcji | SHOULD |
| Generowanie PDF z QR pokoi do druku (team platformy — płatna opcja) | SHOULD |
| Podgląd / rewokacja pojedynczych aktywnych sesji | COULD |

#### Moduł 5 — Zamówienia gości *(operations inbox)*
| Funkcja | Priorytet |
|---|---|
| Lista zamówień (data, pokój, usługa, status) | MUST |
| Zmiana statusu (new→confirmed→fulfilled / rejected) | MUST |
| Powiadomienie email o nowym zamówieniu | MUST |
| Live update inbox (SSE / LISTEN-NOTIFY) | SHOULD |
| Export CSV (rozliczenia) | SHOULD |

#### Moduł 6 — Użytkownicy panelu
| Funkcja | Priorytet |
|---|---|
| Zaproszenie przez token email (72h), domyślna rola Staff | MUST |
| Dezaktywacja konta (NIE usunięcie) | MUST |
| Lista użytkowników + data ostatniego logowania | MUST |
| Wymuszony transfer ownership przed dezaktywacją Ownera (HITL #3) | MUST |
| Reset hasła; zmiana roli przez Admin/Owner | SHOULD |

### 4.2 Role i uprawnienia — 4 role

Wzorzec Stripe/Slack/Linear; separacja obowiązków (SoD): billing tylko Owner, user-management bez billingu = Admin, operacje = Staff, raporty = Viewer.

| Moduł / akcja | Owner | Admin | Staff | Viewer |
|---|:--:|:--:|:--:|:--:|
| Profil hotelu | ✅ | ✅ | 👁 | 👁 |
| Usługi — CRUD | ✅ | ✅ | ✏️ | 👁 |
| Baza wiedzy AI | ✅ | ✅ | ✏️ | 👁 |
| QR — generuj/dezaktywuj | ✅ | ✅ | ✅ | ❌ |
| QR — podgląd sesji | ✅ | ✅ | ✅ | 👁 |
| Zamówienia — podgląd | ✅ | ✅ | ✅ | 👁 |
| Zamówienia — zmiana statusu | ✅ | ✅ | ✅ | ❌ |
| Zamówienia — export CSV | ✅ | ✅ | ❌ | ✅ |
| Użytkownicy — zarządzanie | ✅ | ✅ | ❌ | ❌ |
| Dashboard / raporty | ✅ | ✅ | 👁 | ✅ |
| Billing / subskrypcja | ✅ | ❌ | ❌ | ❌ |
| Transfer ownership | ✅ | ❌ | ❌ | ❌ |

Legenda: ✅ pełny · ✏️ edycja (bez usuwania) · 👁 odczyt · ❌ brak.

Zasady twarde: (1) tylko Owner/Admin zaprasza; (2) Staff nie dotyka billingu; (3) Viewer nie zmienia konfiguracji ani operacji; (4) Owner nieusuwalny bez transferu (HITL #3).

### 4.3 Dashboard — 3 widoki

| Widok | Zawartość MVP | Priorytet |
|---|---|---|
| **GM** | RevPAR + ADR + Occupancy (vs LY) + Booking pace 7 dni (KPI tiles + sparkline) | MUST |
| **Recepcja** | Lista arrivals/departures (operacyjna, bez wykresów); pokoje OOO; early/late requesty | MUST |
| **F&B** | Revenue per outlet / capture rate | WONT na MVP (wymaga integracji POS) |

> **Uwaga:** metryki RevPAR/ADR/Occupancy wymagają danych z PMS lub importu CSV. Na MVP bez PMS część (occupancy, booking pace) zasilana z importowanych rezerwacji; reszta odroczona. Dostępność danych **do potwierdzenia przy implementacji** — nie zgadywana (patrz §11).

### 4.4 Tryb setup vs operacje

- **Setup** (jednorazowy, flaga `properties.setup_completed`): profil, aktywacja usług z szablonów, seeding FAQ, generowanie QR. Może wykonać team platformy (płatna opcja, HITL #4).
- **Operacje** (codzienne): inbox zamówień, statusy, QR recepcji, edycja FAQ. Musi być ekstremalnie prosty (recepcjonista między rozmowami).
- **Guided wizard + procent gotowości** („Hotel gotowy w 70%") — obowiązkowy (HITL #4). Template-first eliminuje syndrom pustego pola.

---

## 5. Interfejs gościa

*Źródło: `context/research/synthesis/roadmap-guest-app.md`*

### 5.1 Architektura informacji

**Pierwsze 10 sekund (happy path):**

```
[Token exchange + auth]   300–500 ms  server-side, niewidoczne
[Splash]                  max 1,5 s   logo hotelu; hard-timeout (nie czeka na dane treści)
[Welcome (część /)]       natychmiast  hero + "Witaj, [Imię]!" + 1 zdanie (max 2)
[Home: grid 5 kategorii]  below welcome
[Sekcja "Polecamy"]       below grid  3 kafelki, wymaga scrolla (HITL #6)
[Floating "Concierge"]    zawsze widoczny
```

**5 kategorii top-level** (max 6 — powyżej cognitive overload): 🍽️ Restauracja & Bar · 🛎️ Usługi pokojowe · 💆 Spa & Wellness · 🚖 Transport · ℹ️ Informacje. Grid 2 kolumny mobile-first; kategoria pusta → ukryta.

**Sekcja „Polecamy" (HITL #6):** poniżej grida (below the fold); max 3 kafelki pinowane przez hotel (nie algorytm); etykieta „Polecane przez [Hotel]" (nie „PROMOCJA"); frequency cap 24h (`localStorage` per `session_id`); **zakaz pop-upów/modali/overlay przy wejściu**.

**Cena:** widoczna na karcie listy (nie po kliknięciu); usługa bezpłatna → „W cenie pobytu / Included" (nie „0 PLN").

**Wielojęzyczność dwuwarstwowa:** UI strings = next-intl JSON (PL+EN, platforma); treści hotelowe = hotel wpisuje PL → auto-translate EN przy zapisie (`name_pl`/`name_en`). Auto-detect `Accept-Language` → fallback EN; przełącznik „PL | EN" (text) w nagłówku; preferencja w `localStorage` (nie cookie — unika konfliktu z `__Host-session`).

**PWA App Shell <150 KB gzipped:** Next.js 15 RSC + code splitting (czat, „Moje zamówienia", błędy lazy); obrazy WebP/AVIF lazy; fonty `system-ui`/`font-display: swap`. Budżet: FCP <3 s, LCP <2,5 s, INP <200 ms, CLS <0,1, initial JS <150 KB. A2HS nie promować aktywnie (<5% instaluje).

### 5.2 Lista ekranów — priorytety

| Ekran / Route | Priorytet | Uwagi |
|---|---|---|
| Splash | MUST | Max 1,5 s, hard-timeout; czysty CSS |
| Welcome (część `/`) | MUST | Imię z JWT; blok na górze home |
| Home `/` | MUST | Grid 5 kategorii + „Polecamy" below fold + floating Concierge |
| Lista usług `/c/[category]` | MUST | Karty, cena na karcie, greyed dla niedostępnych |
| Karta usługi `/c/[category]/[service]` | MUST | Szczegóły + CTA „Zamów" + picker godziny (tylko time-sensitive) |
| Modal potwierdzenia | MUST | Podsumowanie + opcjonalne uwagi + „Dopisz do rachunku pokoju" |
| Ekran sukcesu | MUST | Pełny ekran (nie toast) + link do „Moje zamówienia" |
| Moje zamówienia `/orders` | MUST | Status live (SSE) + fallback polling 10 s |
| Błąd: token wygasły/nieważny | MUST (P0) | Branded + nr recepcji; rozróżnia „wygasł" vs „nieprawidłowy" |
| Błąd: usługa niedostępna | MUST (P0) | Greyed tile + „Tymczasowo niedostępne" (in-line) |
| Przełącznik języka (komponent) | MUST | „PL \| EN" text, `localStorage` |
| AI Concierge `/concierge` | SHOULD | Czat + Quick Reply chips + wzmianka „wirtualny asystent"; SSE streaming |
| Offline / błąd serwera 5xx | SHOULD (P1) | Toast / friendly error + nr recepcji + retry mutacji |

### 5.3 Flow zamówienia (3–4 tapy)

```
QR scan → init_token exchange → anonymous auth → splash → welcome →
kategoria → usługa (cena na karcie) → "Zamów" → modal (opcjonalne uwagi) →
"Dopisz do rachunku pokoju" → POST (Network Only) → pg NOTIFY (panel + email) →
ekran sukcesu → "Moje zamówienia" (SSE status: złożone→przyjęte→w realizacji→zrealizowane)
```

**Zasada „gość nic nie wpisuje" (HITL #1):** imię, nr pokoju, daty z JWT. Jedyny opcjonalny input: pole „Uwagi" (nigdy required). Picker godziny tylko dla time-sensitive (śniadanie, masaż, wake-up, transfer).

### 5.4 Edge cases (P0/P1/P2)

| Priorytet | Stan | Handling |
|---|---|---|
| 🔴 P0 | Token wygasły/nieważny | Branded strona (logo) + nr recepcji; rozróżnienie „wygasł" vs „nieprawidłowy"; NIE redirect na pustą aplikację |
| 🔴 P0 | Usługa niedostępna | Greyed tile + „Tymczasowo niedostępne" (NIE ukrywać); tooltip; AI sugeruje alternatywę |
| 🟡 P1 | Brak internetu | Toast nieblokujący; przeglądanie z cache działa; „Zamów" disabled offline |
| 🟡 P1 | Błąd serwera 5xx | Friendly error + nr recepcji + retry (tylko zamówienia) |
| 🟢 P2 | Zamówienie odrzucone | Status update w „Moje zamówienia" (SSE) + toast jeśli aktywny |

**Service Worker (Workbox):** Cache First (App Shell, obrazy, i18n, offline fallback); Stale While Revalidate (menu, usługi, godziny); Network First (status zamówień read); **Network Only — nigdy cache** (POST zamówienia, auth, dane osobowe).

**SSE + fallback:** `EventSource('/api/orders/stream')` (Route Handler nodejs + LISTEN/NOTIFY); przy zerwaniu → polling 10 s. Supabase Realtime świadomie NIE użyte (limit 500 conn = za drogie przy skali).

**iOS (twarde):** Service Workers TAK; push bez instalacji NIE (→ SSE); Background Sync NIE (zamówienia wymagają sieci); `beforeinstallprompt` nie istnieje (A2HS tylko Android, COULD). Kasowanie danych po 7 dniach bez interakcji = nie problem dla gościa jednorazowego.

### 5.5 Anti-patterns (twardo zakazane)

1. Formularz przed treścią (błąd ALICE). 2. Koszyk/cart (Intelity). 3. Ukrywanie niedostępnych usług (Canary) — greyed, nie usunięcie. 4. Pop-up wyboru języka przed aplikacją. 5. Toast jako jedyny feedback po zamówieniu.

---

## 6. AI Concierge

*Źródło: `context/research/synthesis/roadmap-ai-concierge.md`*

> **Krytyczne rozróżnienie:** architektura MVP = **prompt injection** (cała KB w kontekście GPT-4o-mini). RAG/chunking/embeddings z Sesji 4 = **wyłącznie ścieżka upgradu post-MVP** (§6.5) — developer NIE implementuje RAG na MVP (HITL #12).

### 6.1 Architektura MVP — Prompt Injection

Payload na każde zapytanie gościa:

```
[SYSTEM PROMPT]            ← stały, platformowy (rola, zasady, fallback, disclosure AI)
+ [HOTEL KNOWLEDGE BASE]   ← Markdown: Q&A + menu + polityki + okolica (per property_id)
+ [CONVERSATION]           ← okno ostatnich 6–10 tur + bieżące pytanie
```

KB małego hotelu: 50–100 Q&A + menu + polityki ≈ **5–10K tokenów** — mieści się z zapasem w 128K ctx GPT-4o-mini. Brak retrieval/embeddingu/vector search — model widzi całą KB.

**Format danych hotelu — Markdown + YAML frontmatter** (model dwudokumentowy: Company Knowledge platformy + Property Knowledge hotelu):

```markdown
---
category: restaurant      # restaurant | services | policies | local | faq
valid_from: 2026-04-01
valid_until: 2026-09-30
property_id: hotel-123
language: pl
---
# Menu Restauracji — Sezon Letni 2026
...
```

**Pipeline kompozycji KB:** panel Q&A → kompozytor (filtr `property_id` + `valid_from/until`, kolejność FAQ→usługi→menu→polityki→okolica, hash) → cache (Redis, klucz `property_id`, invalidacja przy zmianie hasha) → wstrzyknięcie w SYSTEM PROMPT. **Edycja w panelu = natychmiastowa propagacja bez re-indeksu** (brak indeksu do przebudowy — zaleta prompt injection).

**Semantic cache (Upstash Redis):** hash pytania → odpowiedź; hit rate 30–70%; próg podobieństwa 0,90–0,95; TTL ~1h + **invalidacja przy zmianie KB** danego `property_id`. Lookup przed wywołaniem modelu (latencja ~10–400 ms vs 1,2–2,5 s).

**Streaming i latencja:** SSE (Route Handler `runtime="nodejs"`, `dynamic="force-dynamic"`); Edge Functions wykluczone (limit CPU 2 s). Cel <1,5 s end-to-end; alert >5 s.

### 6.2 Integracja stosu (T3 / HITL #12)

| Komponent | Wybór | Uwaga |
|---|---|---|
| Model | GPT-4o-mini | $0,15/1M in, $0,60/1M out; ~$2,59/hotel/mies. |
| Prompt caching | OpenAI (próg 1024 tok.) | Statyczny prefix SYSTEM+KB ~50% rabatu na część cachowaną |
| Semantic cache | Upstash Redis | 30–70% hit |
| Transport | SSE (nodejs) | serwer persystentny (Railway → Fly.io) |
| Confidence/fallback | heurystyka — **DO ZWERYFIKOWANIA** | patrz §11 |
| Logowanie | `session_id` (opaque UUID) | brak PII; provider = sub-procesor (DPA) |

**Confidence/fallback (otwarta kwestia, §11):** zweryfikować `logprobs` GPT-4o-mini vs własna heurystyka. **MUST:** mechanizm fallback działa niezależnie od `logprobs` — podstawą jest **fallback flag** w system promptcie (model zwraca `[FALLBACK]` gdy nie znajduje odpowiedzi); heurystyka długości = wzmocnienie.

**Logowanie (RODO):** treść powiązana wyłącznie z `session_id` (opaque); brak PII w promptach do OpenAI (CJEU IX 2025 — udokumentować); manager widzi agregaty, nie treść per gość; DPA z OpenAI przed wdrożeniem.

### 6.3 Zakres i fallback

**Obsługuje (MUST):** oferta/ceny/godziny, FAQ (check-in/out, WiFi, parking, zwierzęta), okolica (70–85% zapytań to FAQ).

**NIE obsługuje — routing do recepcji (MUST):** booking/zmiany rezerwacji; reklamacje/skargi (natychmiastowy routing, nie próbuje odpowiadać); pilne sytuacje; wykonywanie akcji (HITL #7 — AI sugeruje usługę i odsyła do UI, gość zamawia sam).

**Mechanizm fallback (MUST):** poniżej progu / `[FALLBACK]` → komunikat + **konkretny kontakt recepcji** (przycisk + numer); 3 nieudane próby → automatyczna eskalacja z kontekstem; skargi/pilne → natychmiastowy routing. Wzorzec: *„To wykracza poza to, co mogę sprawdzić. Połączę Cię z recepcją — [przycisk] lub zadzwoń: +48 XXX"*.

**Transparentność (MUST, HITL #8):** pierwszy komunikat/nagłówek jawnie informuje o wirtualnym asystencie; imię bota nie zastępuje disclosure.

**Tone:** neutralny, ciepły (MUST); imię bota opcjonalne (SHOULD); AI nie inicjuje sprzedaży (MUST, HITL #6).

### 6.4 Co hotel musi dostarczyć

| Element | Forma | Priorytet |
|---|---|---|
| Lista Q&A (FAQ) | pary Q&A w panelu (seedowane przez platformę) | MUST |
| Menu | pozycje z ceną + metadane sezonowe | MUST |
| Polityki | tekst (check-in/out, anulacje, zwierzęta, RODO) | MUST |
| Info o okolicy | tekst | SHOULD |
| Imię bota | pole konfiguracyjne (nie zastępuje disclosure) | COULD |

Incremental update (MUST): edycja → przeliczenie hasha → natychmiastowa propagacja + invalidacja cache. Dane dynamiczne (dostępność/ceny real-time) NIE w KB → fallback do recepcji. Odpowiedzialność (HITL #9): hotel za poprawność treści, platforma za delivery.

### 6.5 Ścieżka upgradu do RAG (POST-MVP — poza scope)

Trigger: gdy KB hotelu przekracza budżet kontekstu. Architektura: pgvector w Supabase (aktywacja istniejącej `knowledge_chunks`), chunking per typ treści (FAQ 50–150, menu 50–100, pokoje 100–200, polityki 400–512/overlap 10–15%, okolica 300–600/overlap 50–80), `text-embedding-3-small`, hybrid search BM25+dense, Contextual Retrieval. **Migracja addytywna** — Markdown+YAML z MVP jest bezpośrednim wejściem do chunkingu.

---

## 7. Onboarding hotelu i model SaaS

*Źródło: `context/research/synthesis/roadmap-saas-metrics.md`*

### 7.1 Proces onboardingu

**Cel:** 48h od umowy do *first value* (aktywne QR + gość może zamówić). **Model:** auto-setup + 1× kickoff call 30 min. **Zasada:** template-first + guided in-app wizard (5–7 kroków, progress bar).

| # | Krok | Odpowiedzialny | Priorytet |
|---|---|---|---|
| 1 | Signup + konto hotelu (Owner = ADM) | Hotel | MUST |
| 2 | **Podpisanie DPA** (gate przed krokiem 5) | Hotel + Platforma | MUST |
| 3 | Kickoff call 30 min — profil hotelu | CSM + Hotel | MUST |
| 4 | Import gości CSV → rezerwacje + tokeny | Hotel → platforma parsuje | MUST |
| 5 | Generowanie QR (recepcji + pokoi PDF) | Platforma | MUST |
| 6 | Aktywacja ≥3 usług z szablonów | Hotel (wizard) | MUST |
| 7 | Seeding bazy wiedzy AI ze strony www | Platforma seeduje, hotel weryfikuje | MUST |
| 8 | Wysłanie testowego welcome | Hotel (wizard) | MUST |
| 9 | Przeszkolenie ≥1 staff (inbox zamówień) | Platforma | MUST |
| 10 | Health check tydzień 1 | Platforma (PostHog Pulse) | SHOULD |

> **RODO gate:** krok 2 (DPA) blokuje krok 5. Flaga `properties.dpa_signed_at` — generowanie aktywnych QR zablokowane gdy NULL (HITL #11).

**Definition of Done — 4 warstwy (gate aktywacji):** Tech (QR aktywne + CSV) · Communication (welcome wysłany) · Product (≥3 usługi + AI seeded) · Ops (≥1 staff przeszkolony, `staff_training_completion=true`). Każda jako binary flag w bazie.

**Bottlenecki + mitygacja:** brak treści → template-first; rotacja personelu (30–50%/rok) → dezaktywacja zamiast usunięcia + wizard; brak IT → zero PMS na MVP (CSV), QR jako PDF.

**Offboarding:** export CSV na żądanie (od dnia 1, MUST); retencja 30 dni po umowie (backupy do 60 dni); token gościa wygasa automatycznie; zamówienia 5 lat (podatki), logi 30 dni. Export PRZED wyłączeniem konta.

**Customer Success:** 1–2 CSM / 40–60 hoteli; najwyższy churn pierwsze 90 dni + zmiana GM (reakcja 48h); narzędzia MVP = Airtable/Notion + founder dashboard.

### 7.2 Model cenowy i SLA

**Faza Lighthouse (MVP, HITL #10):** 3–5 hoteli gratis 3–6 mies. za case study + referencje. **Billing NIE jest budowany na MVP** — architektura cenowa przygotowana, nieaktywna. WTP nie walidowane w pilocie.

**Po Lighthouse (do przygotowania architektonicznego):** per-room €5–8/mies. (min €150) lub flat €99–179/mies.; setup fee €0; white-glove €199 (opcja); dyskonto roczne 15–20%; **AI included we wszystkich planach** (nie add-on, brak feature-flag „AI on/off").

**SLA:**

| Parametr | MVP | Growth/Pro |
|---|---|---|
| Uptime | 99,5% | 99,9% |
| Resolution critical | 4h | 4h |
| Backup | Daily (recovery <4h) | Daily |
| Support | Email 24h | Email + chat 4h |

Monitoring SLA od dnia 1: Better Stack (uptime, alerty 99,5%) + Sentry (błędy). Automaty retencji (cron) muszą działać przed pierwszym wdrożeniem produkcyjnym.

### 7.3 RODO / DPA

> **Nie stanowi porady prawnej — wymagana weryfikacja przez radcę prawnego RODO przed podpisaniem umów.**

**Model ról (HITL #11):** Hotel = ADM, platforma = procesor; DPA z każdym hotelem przed wdrożeniem (gate go-live); opaque UUID nie zwalnia z DPA (TSUE C-434/16); Owner podpisuje DPA (HITL #3).

**8 obowiązkowych klauzul DPA (Art. 28)** — rekomendacja: Standardowe Klauzule Umowne KE (Decyzja 2021/915): (1) przedmiot/cel; (2) zakaz innych celów (opt-out trenowania modeli); (3) lista sub-procesorów + 15-dniowy notice; (4) środki bezpieczeństwa (TLS 1.2+, AES-256, pseudonimizacja); (5) breach notification 24h platforma→hotel; (6) retencja per kategoria; (7) prawo audytu (ISO 27001/SOC 2); (8) usunięcie po umowie (30 dni export, backupy do 60 dni). **Sankcja za brak DPA: do €10M lub 2% obrotu.**

**Łańcuch sub-procesorów (publikacja pod URL):** Anthropic/OpenAI (LLM, notice 15/30 dni), Hosting (Railway→Fly.io waw), PostHog EU, Supabase, Upstash, Sentry. Własny notice hotelowi: **15 dni** (najkrótszy w łańcuchu); EDPB Opinion 22/2024 — informowanie proaktywne. DPA z każdym sub-procesorem przed wdrożeniem.

**Retencja (automaty cron — MUST przed go-live):** sesja → checkout+2h, usunięcie w 48h; logi serwera (IP anonimizowane na LB) → 30 dni; zamówienia → 5 lat (podatki); AI chat → checkout+7 dni; eventy PostHog (`guest_id`) → 90 dni (purge po 30); dane zagregowane → bezterminowo.

**Breach chain (MUST):** platforma → hotel max 24h; hotel → UODO max 72h; hotel → goście bez zwłoki (wysokie ryzyko). Zbierać kontakt RODO przy onboardingu; rejestr czynności per hotel (Art. 30 ust. 2).

**Prawa gości (Art. 28 ust. 3 lit. e):** mechanizm eksportu/usunięcia danych gościa na żądanie hotelu (MVP: dopuszczalny manualny przez support, przycisk widoczny); usunięcie z PostHog przez `distinct_id`.

### 7.4 Stack analityczny i eventy (od dnia 1)

**PostHog EU Cloud** (free <1M eventów/mies.; sub-procesor → DPA). Konwencja `verb_noun` snake_case; tracking plan wersjonowany w Git. RODO: `guest_id` = opaque server-side UUID (retencja 90 dni, purge 30); brak PII; capture server-side; consent banner („Mierzymy użycie bez danych osobowych"); respekt `doNotTrack`.

**10 core events (wszystkie MUST):** `hotel_login`, `hotel_settings_updated`, `guest_order_received`, `guest_qr_scanned`, `guest_item_details_opened`, `guest_order_submitted`, `guest_session_returned`, `concierge_query_submitted`, `concierge_response_delivered` (confidence, latency), `concierge_response_escalated`. **`hotel_id` jako group property od dnia 1** (umożliwia kohortyzację bez retroaktywnej migracji). Properties separacji: `staff_training_completion`, `hotel_promotion_activity` (SHOULD).

**Group Analytics:** wymaga paid tier → upgrade przy >3 hotelach (koszt fazy pilotowej).

**Dashboard founder:** Pulse (daily, 5 min: gości online, zamówień/24h, QR scans, escalation rate, operators 7d — liczby nie wykresy); Growth (weekly piątek: guest funnel, cohort activation, AI per kategoria, top/bottom hotel).

---

## 8. Plan wdrożenia MVP

Kolejność wynika z zależności między modułami i wzorca SDD dla solo dev (HITL #13). **Zależność nadrzędna:** auth + multi-tenant + schemat bazy są fundamentem wszystkiego.

### 8.1 Fazy

**Faza 0 — Fundament (MUST, blokuje wszystko)**
- Schemat bazy (wszystkie tabele §3.3) + RLS po `property_id` + indeksy + ENUM-y.
- Supabase Auth Anonymous + Custom Access Token Hook (`property_id` w JWT).
- Multi-tenant context setup w middleware (`current_setting('app.property_id')`).
- CI/CD: GitHub Actions (lint + type-check + unit) + Railway preview deployments.
- Monitoring od dnia 1: Sentry + PostHog EU + Better Stack.

**Faza 1 — Auth + QR flow (MUST)** — *zależy od Fazy 0*
- `/api/scan/*`: walidacja init_token → token exchange → `__Host-session` cookie.
- Generowanie QR (recepcji rotujący 5 min + pokoju statyczny); Step-Up Auth 0→1→2.
- Rate limiting (Upstash, D5); anomaly detection po ASN (D4); early check-out (transakcja atomowa).

**Faza 2 — Panel minimum (MUST)** — *zależy od Fazy 0–1*
- Onboarding tenanta + import CSV gości (D6); DPA gate (`dpa_signed_at`).
- Moduły MUST: Profil, Usługi (CRUD + biblioteka szablonów), Baza wiedzy (Q&A), QR, Zamówienia (inbox + email), Użytkownicy (RBAC 4 role + transfer ownership).
- Tryb setup vs operacje + guided wizard.

**Faza 3 — Guest UI (MUST)** — *zależy od Fazy 1–2*
- App Shell <150 KB + auth flow → welcome → home (5 kategorii + „Polecamy").
- Browse + Order (karta → modal → „charge to room" → ekran sukcesu).
- „Moje zamówienia" + SSE (LISTEN/NOTIFY) + fallback polling.
- Edge cases P0 (token wygasły, usługa niedostępna); przełącznik PL/EN.
- Service Worker (Workbox) + offline (SHOULD).

**Faza 4 — AI Concierge (SHOULD)** — *zależy od Fazy 2 (KB) + 3 (UI czatu)*
- Pipeline kompozycji KB (prompt injection) + cache KB.
- Integracja GPT-4o-mini + SSE streaming + semantic cache (Upstash).
- Fallback (flag + kontakt recepcji + 3 próby → eskalacja); transparentność (HITL #8).

**Faza 5 — Analytics + walidacja (MUST dla pilotu)** — *równolegle od Fazy 1*
- 10 core events PostHog (server-side, `hotel_id` group, opaque `guest_id`).
- Automatyczny pomiar AI (containment, confidence, latency).
- Dashboard founder (Pulse + Growth); consent banner; automaty retencji (cron).

### 8.2 Zależności (graf skrócony)

```
Faza 0 (baza+auth+RLS) ──► Faza 1 (QR flow) ──► Faza 3 (Guest UI) ──► Faza 4 (AI)
        │                        │                     ▲
        └──► Faza 2 (Panel) ─────┴─────────────────────┘ (KB z panelu zasila AI)
        └──► Faza 5 (Analytics) ── równolegle, gotowa przed pilotem
```

### 8.3 Kamienie milowe

| Milestone | Definicja gotowości |
|---|---|
| **M1 — Fundament** | Schemat + RLS + auth działają; izolacja tenantów przechodzi testy (IT-3) |
| **M2 — Pętla QR→zamówienie** | Gość skanuje QR → zamawia → hotel widzi w inboxie (E2E-01) |
| **M3 — Panel operacyjny** | Hotel samodzielnie konfiguruje się przez wizard (4 warstwy DoD) |
| **M4 — AI concierge** | Czat odpowiada z KB + fallback do recepcji działa |
| **M5 — Gotowość pilotażowa** | DPA gate + retencja cron + 10 events + dashboard; go-live dla 1. hotelu Lighthouse |

> Szacunki czasowe nie są podawane — research ich nie dostarcza, a model pracy to solo + Claude Code (HITL #13). Kolejność i gotowość są twarde; tempo zależy od wykonawcy.

---

## 9. Strategia testowania

Framework zgodny ze stackiem (T1/T2): **Vitest** (unit), **Supabase test client + Vitest** (integracyjne), **Playwright** (e2e). Zasada nadrzędna: testy integracyjne i e2e muszą działać z **aktywnym RLS** (nie service_role), by realnie weryfikować izolację tenantów.

### 9.1 Testy jednostkowe (unit)

| Moduł | Co testować | Pokrycie min. |
|---|---|---|
| Parser CSV importu | poprawne/błędne wiersze, mapowanie kolumn | wysokie |
| Kompozytor KB (AI) | filtr `property_id` + `valid_from/until`, kolejność, hash | wysokie |
| Logika RBAC | macierz uprawnień per rola/moduł (§4.2) | wysokie |
| Walidacja tokenów | TTL, single-use, expiry | wysokie |
| Fallback heurystyka AI | wykrywanie `[FALLBACK]`, progi | wysokie |
| i18n / auto-translate | fallback PL↔EN | średnie |

### 9.2 Testy integracyjne (krytyczne ścieżki)

| # | Ścieżka | Kluczowe asercje |
|---|---|---|
| **IT-1** | Generowanie QR | recepcji: rotacja 5 min + ręczna unieważnia poprzedni; pokoju: statyczny, dezaktywacja blokuje; tylko role z uprawnieniem |
| **IT-2** | Walidacja tokenu + token exchange | init_token ważny+nieużyty → JWT z `property_id` → `sessions` → `__Host-session`; replay odrzucony; atrybuty cookie; step-up 1→2 tylko w oknie `valid_from/until` |
| **IT-3** | Onboarding tenanta + CSV | utworzenie property+Owner; parsowanie CSV (błędne raportowane); **izolacja tenantów: kontekst A nie zwraca wierszy B** — obowiązkowe dla wszystkich tabel z RLS (krytyczny test bezpieczeństwa) |
| **IT-4** | Early check-out | jedna transakcja: `reservations.checked_out` + `sessions.revoked` + zamknięcie okna `rooms` + dezaktywacja QR + audit; po niej cookie → 401, QR pokoju → odmowa; rollback przy błędzie kroku |
| **IT-5** | Cykl użytkownika panelu | zaproszenie 72h → aktywacja; dezaktywacja Staff (treści zachowane); blokada dezaktywacji ostatniego Ownera bez transferu (HITL #3) |
| **IT-6** | Onboarding gate (DPA) | próba aktywnych QR bez `dpa_signed_at` → zablokowane |
| **IT-7** | Definition of Done | hotel z <3 usługami / bez seedu AI / bez przeszkolonego staff → nieaktywowany |
| **IT-8** | Retencja (cron) | sesja po checkout+2h unieważniona, po +48h usunięta; AI chat po +7d usunięty; logi po 30d usunięte |
| **IT-9** | RAG pipeline (prompt injection) | kompozycja KB → cache → wstrzyknięcie; edycja Q&A → przeliczenie hasha → invalidacja cache → natychmiastowa propagacja |

### 9.3 Testy e2e

**Flow gościa (QR → usługa):**
- **E2E-01 (MUST, gate przed pilotem):** QR scan → auth → splash ≤1,5 s → welcome („Witaj [Imię]" z tokenu) → home (5 kategorii + „Polecamy" below fold) → kategoria → usługa → modal → „Dopisz do rachunku" → ekran sukcesu → „Moje zamówienia" status „złożone". Asercje: gość NIC nie wpisał (HITL #1); zero pola karty (HITL #5).
- **E2E-02..09 (SHOULD/COULD):** zmiana języka; offline browsing z cache; SSE status update + fallback polling; token wygasły P0; usługa niedostępna (greyed, nie ukryta); zamówienie odrzucone; AI czat (sugeruje nie inicjuje + disclosure HITL #8); błąd 5xx + retry.

**Flow hotelu (panel → widoczność w appce):**
- Hotel tworzy/aktywuje usługę w panelu → pojawia się w guest UI w odpowiedniej kategorii.
- Hotel edytuje Q&A → AI concierge odpowiada z nową treścią (po invalidacji cache).
- Hotel zmienia status zamówienia → gość widzi update live (SSE).

### 9.4 Testy AI concierge (automatyczne, bez manualnego review)

| Metryka | Próg | Alert |
|---|---|---|
| Containment rate (% bez eskalacji) | 40–65% | escalation >35% |
| Confidence score histogram | avg ≥0,6/kategoria | avg <0,6 |
| Response latency end-to-end | <1,5 s cel | >5 s |
| Response length outliers | — | >500 znaków (hallucination) / <10 (truncation) |
| Semantic cache hit rate | 30–70% | <30% |

**Monthly spot-audit (MUST):** 10 próbek/hotel (5 eskalowanych + 5 high-confidence) — kalibracja progów bez pełnego audytu. Kombinacja containment + confidence + escalation daje obraz zdrowia bez czytania każdej rozmowy.

### 9.5 Co testujemy przed każdym deploymentem na MVP

1. CI gate (GitHub Actions): lint + type-check + unit — przy każdym PR.
2. Pełen pakiet integracyjny IT-1..IT-9 z aktywnym RLS — przed merge do `main`.
3. E2E-01 (happy path) — gate przed promocją do produkcji.
4. Test izolacji tenantów (IT-3) — **nieprzekraczalny gate bezpieczeństwa**.
5. Manual smoke na preview environment (Railway) przed `manual promote` na produkcję.

---

## 10. Walidacja MVP

*Źródło: `context/research/synthesis/roadmap-saas-metrics.md §5`*

### 10.1 Kryteria sukcesu — HITL #14 (rygorystyczny 3/3)

Wszystkie trzy warunki jednocześnie:

| # | Typ | Warunek | Okno |
|---|---|---|---|
| 1 | Leading | ≥30% gości skanuje QR w ciągu doby 1. pobytu | tydzień 1–7 |
| 2 | Lagging | ≥10% konwersja upsell (≥1 zamówienie / 10 aktywnych gości) | tydzień 4–6 |
| 3 | Retention | Hotel kontynuuje po 3 mies. bez „stop" | miesiąc 3 |

Cele uzupełniające (SHOULD, nie kill): session depth ≥2 sekcje/sesja; retention gościa ≥40%.

### 10.2 Kryteria kill

- <15% adoption QR po 14 dniach (przy aktywnej promocji) → problem produktowy.
- 0 zamówień po 30 dniach → problem value proposition.
- Hotel prosi o wyłączenie przed końcem 6 tygodni → implementation/product fail.

### 10.3 Skala i harmonogram pilotu — HITL #15

3 hotele × 6 tygodni (Lighthouse; 2 boutique + 1 mid-size, różne geografie). Tyg. 1–2 setup; tyg. 3–6 dane (2–3 cykle rotacji). Min. 50–100 aktywnych gości/hotel. Po 6 tyg.: decyzja go/no-go.

> **Rozbieżność rozstrzygnięta:** research rekomenduje 90 dni; HITL #15 ustala 6 tyg. zbierania danych. **Obowiązuje HITL #15** — ale warunek #3 (retencja) mierzy się w horyzoncie 3 mies. (pilot zbiera dane 6 tyg., decyzja o retencji w mies. 3).

### 10.4 Separacja product-fit od implementation-fit

- `staff_training_completion` (gate) — jeśli false → dane hotelu wykluczone z walidacji produktu.
- `hotel_promotion_activity` — count emaili/signage/front-desk.
- Diagnostyka: wysoka świadomość + niska adopcja = problem UX (product-fit); niska świadomość = problem promocji (implementation-fit).
- Stratyfikacja danych: 1 hotel ze słabym WiFi/niezmotywowanym staffem nie zaniża średniej 2 dobrych.

### 10.5 Stack analityczny

Patrz §7.4 — PostHog EU, 10 core events, dashboard Pulse/Growth, automatyczny pomiar AI. Benchmark upsell (kontekst progu #2): 10–25% pre-arrival, early/late checkout #1 kategoria, digital 4× front-desk; realistyczny cel €5–15/pobyt/gość. Próg #2 (≥10%) jest konserwatywny (nasz upsell jest in-stay, nie pre-arrival, ale wzmocniony efektem digital 4×).

---

## 11. Otwarte ryzyka i decyzje odroczone

### 11.1 Decyzje HITL odroczone

**Brak.** Wszystkie 15 decyzji HITL + 5 tech (T1–T5) mają status ✅ zamknięta. Nie ma decyzji ze statusem 🚫 odroczona.

### 11.2 Otwarte kwestie techniczne (do rozstrzygnięcia przy implementacji)

| # | Kwestia | Kontekst | Rekomendacja |
|---|---|---|---|
| R1 | **Confidence score AI** | Czy GPT-4o-mini zwraca użyteczne `logprobs`? | Zacząć od `[FALLBACK]` flag w system promptcie (deterministyczne); dodać heurystykę długości jako wzmocnienie. Mechanizm fallback MUST działać niezależnie od `logprobs` (§6.2) |
| R2 | **Moment upgrade PostHog** | Group Analytics (kohortyzacja hoteli) wymaga paid tier | Upgrade przy >3 hotelach; zaplanować jako koszt fazy pilotowej (§7.4) |
| R3 | **Dane dashboardu GM bez PMS** | RevPAR/ADR/Occupancy wymagają danych z PMS | Na MVP zasilać occupancy/booking pace z importu CSV; reszta odroczona — potwierdzić zakres przy implementacji modułu (§4.3) |
| R4 | **DeepL vs Claude do auto-translate** | Treści hotelowe PL→EN — koszt vs jakość | Decyzja przy implementacji Warstwy 2 i18n (§5.1) |
| R5 | **White-glove €199 — wykonawca** | Team wewnętrzny czy partner zewnętrzny | Decyzja operacyjna, nie blokuje MVP (§7.1) |
| R6 | **Wzorzec DPA** | Rekomendowane SCC KE 2021/915 | Weryfikacja przez radcę prawnego RODO przed pierwszym podpisem (§7.3) |

### 11.3 Ryzyka techniczne

| Ryzyko | Wpływ | Mitygacja |
|---|---|---|
| **SSE long-lived na Railway** | Stabilność połączeń przy skali | Fallback polling 10 s wbudowany; migracja do Fly.io waw przy wzroście (T4) |
| **Limit kontekstu prompt injection** | Duży hotel z bogatą KB przekroczy ~10K tok. | Ścieżka upgradu pgvector gotowa w schemacie (§6.5); monitorować rozmiar KB per hotel |
| **iOS kasuje cookie po 7 dniach** | Utrata sesji | Silent re-auth przez statyczny QR pokoju (§3.2); nie problem dla gościa jednorazowego |
| **Brak PII w promptach do LLM** | Ryzyko RODO przy nieostrożnej implementacji | Twarda zasada: tylko `session_id` + treść KB; imię wstrzykiwane po stronie platformy (§6.2); udokumentować (CJEU IX 2025) |
| **Wydajność RLS bez indeksów** | Degradacja liniowa | Indeks na `property_id` obowiązkowy na każdej tabeli tenantowej (§3.3) |

### 11.4 Ryzyka produktowe

| Ryzyko | Wpływ | Mitygacja |
|---|---|---|
| **Niska adopcja QR** | Główne kryterium kill (<15%) | Separacja product/implementation-fit (§10.4); health check tydzień 1; promocja przez hotel mierzona |
| **Rotacja personelu hotelu** | Champion odchodzi, wiedza znika | Dezaktywacja zamiast usunięcia (audit trail); guided wizard; rekomendacja champion + backup |
| **Hotel dostarcza słabą KB** | Niska jakość AI (odpowiedzialność hotelu, HITL #9) | Template-first + seeding ze strony www; confidence histogram alert <0,6 → sygnał niekompletnej KB |
| **Mała próba pilotu** | 3 hotele = ryzyko statystyczne | Min. 50–100 aktywnych gości/hotel; stratyfikacja; decyzja w horyzoncie leading + lagging |

---

*Dokument finalny fazy syntezy. Fragmenty źródłowe: `context/research/synthesis/roadmap-{identity-panel,guest-app,ai-concierge,saas-metrics}.md`. Decyzje: `context/foundation/decisions_log.md`. Filozofia: `context/foundation/product-philosophy-brief.md`.*
