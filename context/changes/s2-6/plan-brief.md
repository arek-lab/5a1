# Inbox zamówień (Moduł 5) — Plan Brief

> Full plan: `context/changes/s2-6/plan.md`

## What & Why

Budujemy panelowy inbox zamówień gości: listę zamówień z możliwością zmiany statusu (RBAC Staff+), live update przez SSE (pierwsza implementacja Postgres `LISTEN`/`NOTIFY` w repo) i eksport CSV do rozliczeń. To domyka pętlę QR→zamówienie→hotel widzi w inboxie (E2E-01) po stronie panelu i odblokowuje S3.3 (widok "Moje zamówienia" gościa), który zależy od tej sesji.

## Starting Point

Tabela `orders`, ENUM `order_status` i RLS (`staff_all_orders`) już istnieją z S0.2. RBAC (`orders_view`, `orders_status`, `orders_export`) już zdefiniowane w macierzy z S2.1. Brak jest: wszelkiej infrastruktury SSE/LISTEN-NOTIFY (zero precedensu w repo), warstwy server actions/route handlerów modułu, UI strony `/orders`, i eksportu CSV.

## Desired End State

Recepcja widzi w panelu stronę `/orders` z zakładkami "Aktywne" (new/confirmed) i "Historia" (fulfilled/rejected). Nowe zamówienie gościa i każda zmiana statusu pojawia się na liście operatora natychmiast, bez odświeżania. Viewer ma dostęp tylko-do-odczytu + eksport CSV; Staff ma przyciski zmiany statusu, ale nie eksport.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Architektura SSE | Jedno współdzielone połączenie `pg` (direct, nie pooler) na proces + in-memory fan-out filtrowany po `property_id` | Supabase pgbouncer nie wspiera LISTEN; jedno połączenie niezależnie od liczby operatorów chroni limit połączeń przy skalowaniu | Plan |
| Payload NOTIFY | Pełny wiersz zamówienia (JSON) | Zero dodatkowego round-tripu do bazy przy każdej aktualizacji, najniższa latencja dla UI | Plan |
| Reconnect po stronie panelu | Natywny `EventSource` retry + banner "połączenie przerwane" | Recepcja pracuje na stałym łączu; pełny polling fallback (jak w S3.3 dla gościa) tu nadmiarowy | Plan |
| Przejścia statusu | `new→{confirmed,rejected}`, `confirmed→{fulfilled,rejected}` | Odpowiada realnej pracy recepcji — czasem wiadomo od razu, że się nie da (bez wymuszania "confirmed" przed odrzuceniem) | Plan |
| Współbieżna zmiana statusu | Last-write-wins, bez optimistic concurrency | Niska liczba operatorów na hotel, niski impact przy inboxie zamówień | Plan |
| Zakres eksportu CSV | Respektuje aktualnie zastosowany filtr zakładki/dat | Zgodne z celem "rozliczenia" z roadmapy (hotel eksportuje konkretny okres/status) | Plan |
| Kolumny CSV | Rozliczeniowe: data, pokój, usługa, cena, status, uwagi | Bezpośrednio użyteczne dla księgowości hotelu, bez pól technicznych | Plan |
| Test SSE | Pełny roundtrip HTTP (trigger→NOTIFY→listener→fan-out→SSE) w IT-7 | Jedyny sposób realnej weryfikacji całego łańcucha, zgodnie z konwencją IT-testów innych sesji | Plan |
| Domyślny widok listy | Zakładka "Aktywne" (new/confirmed) domyślna, "Historia" osobno | Recepcja ma widzieć tylko to, co wymaga akcji — spójne z §4.4 roadmapy ("ekstremalnie prosty") | Plan |
| Powiadomienie email | **Poza zakresem** — TODO do przyszłej sesji | `job_queue` nie istnieje; `change.md` DoD go nie wymienia; `RESEND_API_KEY` w `.env.example` to rezerwacja nazwy, nie zobowiązanie | Plan |
| Heartbeat SSE | Co ~20s | Standardowa praktyka zapobiegająca cichym rozłączeniom przez proxy przy niskim ruchu zamówień | Plan |

## Scope

**In scope:**
- Trigger Postgres `NOTIFY` na `orders` + migracja SQL
- Współdzielony listener `pg` z fan-outem w procesie (`lib/orders/listener.ts`)
- Walidacja przejść statusu + RBAC-owana server action zmiany statusu
- Route handler `/api/orders/stream` (SSE, RBAC-owany, heartbeat, cleanup)
- Strona `/orders` + panel kliencki (zakładki, przyciski statusu, banner reconnect)
- Route handler `/api/orders/export` (CSV, RBAC-owany, filtrowany)
- Testy: unit (walidacja/listener), IT-7 (pełny roundtrip SSE + izolacja fan-out), 2× test SQL izolacji tenantowej
- Tłumaczenia PL/EN

**Out of scope:**
- Powiadomienie email o nowym zamówieniu (TODO — przyszła sesja, `job_queue`)
- Widok "Moje zamówienia" gościa i jego `EventSource` (S3.3) — infra tu zaprojektowana pod reużycie
- Polling fallback dla panelu (tylko dla gościa w S3.3)
- Paginacja listy zamówień
- Optimistic concurrency przy zmianie statusu
- Multi-instance fan-out (Redis pub/sub) — MVP single-instance

## Architecture / Approach

Faza 1: warstwa danych — trigger SQL wysyła `pg_notify` z pełnym wierszem zamówienia; jeden singleton połączenia `pg` (na `globalThis`, żeby przetrwać hot-reload w dev) nasłuchuje i rozgłasza przez `EventEmitter` w procesie; server action zmiany statusu z walidacją przejść. Faza 2: `/api/orders/stream` konsumuje fan-out filtrowany po `property_id` operatora, plus dedykowany test bezpieczeństwa (LISTEN/NOTIFY omija RLS, więc standardowy test RLS nie wystarcza). Faza 3: UI panelu 1:1 wzorowane na `qr/` + eksport CSV jako osobny route handler.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Warstwa danych | Trigger NOTIFY, listener + fan-out, walidacja statusu, server action | Reconnect logiki listenera przy zerwaniu połączenia do bazy — pojedynczy punkt awarii dla całego SSE |
| 2. Endpoint SSE + testy | `/api/orders/stream`, IT-7, test izolacji tenantowej fan-out | LISTEN/NOTIFY omija RLS — łatwo przeoczyć wyciek property przy niedopatrzeniu w filtrze fan-out |
| 3. UI panelu + CSV | Strona `/orders`, przyciski statusu, klient SSE, eksport CSV | Rozjazd między stanem SSE a `revalidatePath` przy jednoczesnej akcji operatora i evencie z innego źródła |

**Prerequisites:** S2.1 (RBAC, gotowe), S1.2 (sesje/tokeny, gotowe) — oba spełnione. Nowa zależność npm: `pg`.
**Estimated effort:** ~1 sesja, 3 fazy (wyższa złożoność niż typowa sesja modułu panelu ze względu na pierwszą implementację SSE).

## Open Risks & Assumptions

- Test IT-7 (pełny roundtrip HTTP) może wymagać doprecyzowania przy implementacji, jak uruchomić route handler w środowisku testowym Vitest (pełny serwer HTTP vs bezpośrednie wywołanie `GET()` z mockowanym `NextRequest`) — plan zostawia to jako decyzję implementacyjną w ramach istniejących narzędzi repo.
- In-process fan-out (`EventEmitter`) nie przetrwa restartu procesu ani nie działa na wielu instancjach — świadomie zaakceptowane dla MVP single-instance (Railway, T4); przy skalowaniu do wielu instancji wymagałoby migracji na Redis pub/sub lub podobne.
- `RESEND_API_KEY` w `.env.example` sugerował, że email miał wejść w S2.6 — świadomie odłożone po HITL; jeśli okaże się to blokerem biznesowym (hotel nie widzi powiadomień poza panelem), trzeba będzie zaplanować dedykowaną sesję szybciej niż S5.2.

## Success Criteria (Summary)

- Zmiana statusu zamówienia jest egzekwowana przez RBAC i dozwolone przejścia.
- Operator panelu widzi nowe zamówienia i zmiany statusu bez odświeżania strony (SSE), z jasnym sygnałem gdy połączenie jest przerwane.
- Eksport CSV zwraca poprawnie sformatowany plik zgodny z aktywnym filtrem, dostępny tylko dla ról z uprawnieniem `orders_export`.
- Izolacja tenantowa jest zweryfikowana zarówno dla standardowej ścieżki SQL (RLS), jak i dla ścieżki SSE, która RLS omija.
