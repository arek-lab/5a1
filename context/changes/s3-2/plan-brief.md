# Browse + flow zamówienia (3–4 tapy) — Plan Brief

> Pełny plan: `context/changes/s3-2/plan.md`

## Co i dlaczego

Budujemy centralny flow gościa: przeglądanie usług hotelowych per kategoria i złożenie zamówienia bez wpisywania czegokolwiek poza opcjonalną uwagą (HITL #1). To domyka E2E-01 — gate przed pilotem — razem z S3.1 (już zbudowany app shell/home) i S3.3 (SSE statusu zamówień, poza zakresem tej sesji).

## Punkt wyjścia

S3.1 dostarczył guest layout z guardem sesji, home page z siatką 5 kategorii (statyczną, bez filtrowania pustych) i sekcją „Polecamy". Schemat bazy (`services`, `orders`) oraz RLS (`guest_read_services`, `guest_insert_orders`, `guest_read_own_orders`) i trigger `pg_notify` przy nowym zamówieniu już istnieją z wcześniejszych sesji — ta sesja to głównie warstwa aplikacyjna, plus jedna nowa kolumna schematu.

## Pożądany stan końcowy

Gość przechodzi: kategoria → lista usług (cena widoczna, niedostępne wyszarzone, nie ukryte) → karta usługi → „Zamów” (+ picker godziny dla usług oznaczonych jako wymagające godziny) → modal z opcjonalnymi Uwagami → „Dopisz do rachunku pokoju” → pełnoekranowy ekran sukcesu. Puste kategorie znikają z gridu na home. Hotel może w panelu oznaczyć usługę jako wymagającą wyboru godziny.

## Kluczowe decyzje

| Decyzja | Wybór | Dlaczego | Źródło |
|---|---|---|---|
| Wykrywanie usług „time-sensitive" | Nowa kolumna `is_time_sensitive` | Jawna flaga zamiast zgadywania po kategorii/nazwie — koszt: migracja + rozszerzenie panelu S2.3 | Plan (HITL) |
| Definicja „niedostępności" usługi | Wyłącznie `is_active=false` | Jedno źródło prawdy, bez logiki stref czasowych po stronie gościa | Plan (HITL) |
| Walidacja pola „Uwagi" | Limit 500 znaków, bez innych reguł | Zgodne z „gość nic nie wpisuje" — pole zawsze opcjonalne | Plan (HITL) |
| Błąd przy składaniu zamówienia | Inline błąd w modalu + „Spróbuj ponownie” | Zgodne z roadmapą (friendly retry dla zamówień), nie gubi wpisanych Uwag | Plan (HITL) |
| Ukrywanie pustych kategorii | Server-side query liczący aktywne usługi przed renderem home | Poprawne od pierwszego renderu, zgodne z §5.1 roadmapy | Plan (HITL) |
| Picker godziny | Sloty co 30 min w oknie `available_from`–`available_to` | Spójność z godzinami hotelu zamiast dowolnego inputu | Plan (HITL) |
| Ekran sukcesu | Podsumowanie + link do `/orders` + powrót do home | Zgodne z E2E-01 z roadmapy (link do „Moje zamówienia”) | Plan (HITL) |
| Zakres testów | Unit + manual E2E-01, bez Playwright | Spójne z wzorcem S3.1, brak E2E tooling w repo | Plan (HITL) |
| Mechanizm zapisu zamówienia | Route handler `POST /api/orders` (nie server action) | Wzorzec z S1.2 (`/api/scan/*`), zgodny z regułą „Network Only" dla przyszłego Service Workera (S3.5) | Plan |

## Zakres

**W zakresie:**
- Migracja `is_time_sensitive` + obsługa w panelu (`/services`)
- `/c/[category]`, `/c/[category]/[service]` z kartami usług (cena/greyed)
- Modal potwierdzenia + picker godziny dla time-sensitive
- `POST /api/orders` + ekran sukcesu
- Ukrywanie pustych kategorii na home (dopięcie luki z S3.1)
- Tłumaczenia PL/EN + testy jednostkowe

**Poza zakresem:**
- Service Worker / Workbox (S3.5)
- `/orders` z SSE (S3.3)
- Ekrany błędów P0/P1 poza błędem POST-a zamówienia (S3.4)
- Automatyzacja E2E (Playwright)
- Koszyk / wiele usług w jednym zamówieniu (zakazany anti-pattern §5.5)

## Architektura / Podejście

Warstwowo: schemat+panel (Faza 1) → warstwa danych gościa, czyste funkcje i zapytania (Faza 2) → trasy przeglądania (Faza 3) → zapis zamówienia + sukces (Faza 4) → tłumaczenia/testy/weryfikacja (Faza 5). RLS i trigger NOTIFY już istnieją — żadnych nowych polityk bezpieczeństwa.

## Fazy w skrócie

| Faza | Co dostarcza | Główne ryzyko |
|---|---|---|
| 1. Schemat + panel | Kolumna `is_time_sensitive` + checkbox w panelu | Rozszerza zamknięty scope S2.3 — ryzyko konfliktu z ewentualnymi równoległymi zmianami w panelu |
| 2. Warstwa danych gościa | Zapytania kategorii/usług, generator slotów, rozszerzony kontekst sesji | Brak — czyste funkcje, łatwe do testowania |
| 3. Trasy przeglądania | `/c/[category]`, `/c/[category]/[service]`, filtr pustych kategorii | Zależność od stanu tłumaczeń z S3.1 (Faza 5 tam niezamknięta) |
| 4. Flow zamówienia | Modal, `POST /api/orders`, ekran sukcesu | Retry po błędzie sieci musi zachować stan formularza — łatwo o regresję UX |
| 5. Tłumaczenia + testy | Pełne pokrycie PL/EN, testy jednostkowe, manualny E2E-01 | Manualna weryfikacja E2E-01 zależy od dostępności testowego property z danymi |

**Wymagania wstępne:** działający guest layout z S3.1 (guard sesji, `getGuestSessionContext`), przynajmniej jedna testowa usługa per kategoria w panelu.
**Szacowany nakład:** ~5 faz, praca solo + Claude Code (bez szacunków czasowych, zgodnie z HITL #13).

## Otwarte ryzyka i założenia

- S3.1 Faza 5 (tłumaczenia `guest.*`) nie jest zamknięta w momencie pisania tego planu — Faza 3 tej sesji zakłada dopisanie/utworzenie kluczy niezależnie od stanu S3.1.
- Migracja `is_time_sensitive` rozszerza zakres zamkniętej sesji S2.3 (panel usług) — świadoma decyzja HITL, nie luka w planowaniu.
- Link do `/orders” z ekranu sukcesu prowadzi do trasy, która powstanie dopiero w S3.3 — celowe, zgodne z sekwencją sesji w roadmapie.

## Kryteria sukcesu (podsumowanie)

- Gość przechodzi pełny flow (kategoria → usługa → zamówienie → sukces) bez wpisywania czegokolwiek poza opcjonalnymi Uwagami (E2E-01)
- Niedostępne usługi są widoczne, wyszarzone, nieklikalne — nigdy ukryte
- Puste kategorie znikają z gridu home; zamówienie trafia do bazy z poprawnym `session_id`/`room_id`/`reservation_id` i przechodzi przez istniejące RLS bez zmian w politykach
