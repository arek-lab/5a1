# Zarządzanie rezerwacją pokoju: check-in + edycja check-out — Plan Brief

> Full plan: `context/changes/s2-9/plan.md`

## What & Why

Domykamy krytyczną lukę: `validateRoomScan` odrzuca dziś każdy skan QR pokoju, bo żadna sesja w planie nigdy nie ustawia `rooms.valid_from`/`valid_until`. Bez tej sesji krok 1→2 auth (skan QR pokoju) nie może się powieść w produkcji dla żadnego hotelu. Dajemy recepcji minimalny sposób przypisania rezerwacji do pokoju (check-in) i edycji daty check-out.

## Starting Point

Schemat `reservations`/`rooms`/`sessions` istnieje od S0.2, RLS izoluje property, a `process_early_checkout` (S1.3) już poprawnie zamyka rezerwację. Brakuje jedynie ścieżki *otwierającej* rezerwację — nic dziś jej nie tworzy poza testami.

## Desired End State

Recepcja w istniejącym panelu `/qr` melduje gościa do pokoju (jedno pole: data check-out) i może później przedłużyć/skrócić pobyt — zmiana natychmiast przesuwa okno ważności pokoju i wygaśnięcie aktywnej sesji gościa (formuła `check_out + 2h`, HITL #2, nietknięta).

## Key Decisions Made

| Decyzja | Wybór | Uzasadnienie | Źródło |
| --- | --- | --- | --- |
| Umiejscowienie UI | Rozszerzenie listy pokoi w `/qr` | Jedno miejsce "stan pokoju", zero nowego routingu | Plan |
| Model check-in | `check_in = now()`, tylko `check_out` edytowalny | Pasuje do walk-in; brak importu CSV rezerwacji przyszłych | Plan |
| Dane gościa | Formularz nie zbiera imienia — `guest_first_name = NULL` | Minimalizacja PII; nr pokoju jedynym identyfikatorem | Plan (korekta użytkownika) |
| `reservations.status` | `'checked_in'` od razu przy przypisaniu do pokoju | Spójne z `process_early_checkout`, które oczekuje przejścia w `'checked_out'` | Plan |
| Konflikt pokoju | Blokada z błędem `roomOccupied`, brak cichego nadpisania | Zero przypadkowej utraty aktywnej sesji poprzedniego gościa | Plan |
| Bramka DPA | Ta sama co reszta `/qr` (page-level + akcja) | HITL #11 — aktywacja dostępu gościa wymaga podpisanego DPA | Plan |
| Zakres przeliczenia sesji | Wszystkie sesje `reservation_id`, `revoked=false`, `auth_level=2` | Współgoście tego samego pokoju mają osobne sesje — wszystkie muszą być spójne z HITL #2 | Plan |
| Walidacja `check_out` | Musi być `> now()`, inaczej błąd | Natychmiastowe skrócenie do teraz to już istniejący endpoint `process_early_checkout` | Plan |
| Zakres RBAC | Reużycie zasobu `qr_manage` | Ustalony precedens z `app/api/panel/reservations/[id]/checkout/route.ts` | Plan |
| Zakres audytu | Check-in ORAZ edycja check-out | Obie mutacje aktywują/zmieniają dostęp gościa — spójne z innymi wrażliwymi akcjami (`anomaly_revoke`, `early_checkout`) | Plan |
| RLS per-rola | Poza zakresem — RLS zostaje property-level (nie per-rola) | Istniejący wzorzec sprzed tej sesji (jak `qr_codes`), nie nowa luka wprowadzana przez S2.9 | Plan |

## Scope

**In scope:**
- Server-side: `checkInRoom`, `updateReservationCheckOut` w `lib/reservations/` + server actions w `qr/actions.ts`
- Przeliczenie `sessions.expires_at` przy edycji check-out
- Audit log (`reservation_check_in`, `reservation_checkout_edit`)
- UI: rozszerzenie `qr-panel.tsx` o inline check-in/edycję check-out per pokój
- Test integracyjny przeliczenia sesji + klon testu izolacji RLS

**Out of scope:**
- Zbieranie imienia/e-maila gościa, import CSV rezerwacji
- Natychmiastowe wymeldowanie (istnieje już `process_early_checkout`)
- Zawężanie RLS do granulacji per-rola
- Nowy zasób RBAC, nowa zakładka panelu, nawigacja panelu

## Architecture / Approach

Rozszerzenie istniejącego modułu `/qr` (S2.5) — nowa logika domenowa w `lib/reservations/`, wywoływana przez dwie nowe server actions w już istniejącym `qr/actions.ts`, konsumowane przez rozszerzony `qr-panel.tsx`. Zero nowych tabel, zero nowego routingu.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Warstwa serwerowa + testy | `checkInRoom`/`updateReservationCheckOut`, server actions, przeliczenie sesji, testy RLS+integracyjny | Błędne przeliczenie `expires_at` przy wielu współgościach tego samego pokoju |
| 2. UI panelu | Inline check-in/edycja check-out w `/qr`, bez popupów | Rozrost gęstości UI w wierszu pokoju (QR + rezerwacja w jednym miejscu) |

**Prerequisites:** S2.1 (RBAC), S1.1/S0.2 (schemat), S2.5 (moduł `/qr` już istnieje).
**Estimated effort:** ~1 sesja, 2 fazy.

## Open Risks & Assumptions

- Zakładamy, że przyszła sesja (poza zakresem) wypełni `guest_first_name` dla powitania z HITL #1 — dziś to pole zostaje `NULL` po check-in z tej sesji.
- RLS `staff_all_reservations`/`staff_all_rooms` pozostaje property-level (nie per-rola) — jeśli w przyszłości uznane za lukę bezpieczeństwa, wymaga osobnej sesji (jak S2.7 dla `hotel_users`).

## Success Criteria (Summary)

- Recepcja może zameldować gościa do pokoju i edytować check-out bez opuszczania `/qr`.
- Skan QR pokoju (auth_level 1→2) może się powieść po check-in — dziś niemożliwe.
- Zmiana check-out widoczna natychmiast w `rooms.valid_until` i `sessions.expires_at` aktywnej sesji.
