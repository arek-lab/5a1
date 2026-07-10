---
change_id: s2-9
title: Zarządzanie rezerwacją pokoju — check-in + edycja check-out
status: implementing
created: 2026-07-10
updated: 2026-07-10
archived_at: null
---

## Notes

Z `context/foundation/session-plan.md` (S2.9 — Zarządzanie rezerwacją pokoju: check-in + edycja check-out):

**Kontekst:** wykryte podczas audytu na wniosek użytkownika o TTL pokoju (2026-07-10).
Recepcja nie ma dziś żadnej możliwości ustawienia ważności pokoju. Przyczyna: `validateRoomScan`
(`lib/scan/room.ts:45-53`) odrzuca skan QR pokoju (`outside_window`), jeśli `rooms.valid_from`/
`valid_until` są `NULL` lub poza oknem — a nic w kodzie produkcyjnym nigdy tych pól nie ustawia
(jedyne miejsca, które je dotykają, to testy i early-checkout). `qr-panel.tsx` pozwala tylko
aktywować/dezaktywować QR pokoju (`is_active`), bez pola daty. Przegląd całego
`session-plan.md` (~23 sesje, S0–S5) potwierdza: żadna sesja nigdy nie tworzyła rezerwacji ani
nie zarządzała check-in/check-out — luka tego samego rodzaju co już raz odkryta S2.8.

**Ważne ograniczenie (HITL #2):** czas życia sesji gościa (`checkout_datetime + 2h`, fixed
expiry) jest twardą decyzją HITL (`context/archive/decisions_log.md:54,114`) i **nie** podlega
zmianie ani konfiguracji. Rozwiązaniem uzgodnionym z użytkownikiem jest umożliwienie recepcji
edycji **daty check-out rezerwacji** — formuła zostaje nietknięta, zmienia się tylko jej input,
co naturalnie przesuwa zarówno okno ważności pokoju (`valid_until`), jak i wygaśnięcie sesji.

**Scope (draft):**
- Minimalny CRUD rezerwacji per pokój (Staff+, RBAC wg S2.1): przypisanie aktywnej rezerwacji
  do pokoju (guest_first_name, check_in, check_out) → ustawia `rooms.room_active_reservation_id`,
  `valid_from = check_in`, `valid_until = check_out`.
- Edycja `check_out` istniejącej rezerwacji (przedłużenie/skrócenie pobytu) → aktualizuje
  `valid_until`; jeśli sesja gościa już istnieje (auth_level 2), przelicza
  `sessions.expires_at = nowy check_out + 2h` (formuła HITL #2 nietknięta).
- UI w `/qr` obok istniejącej listy pokoi (rozszerzenie S2.5) lub nowa zakładka.
- Audit log wpis przy zmianie check_out.

**DoD (draft):** recepcja może utworzyć/edytować rezerwację pokoju; zmiana check_out widoczna
w `rooms.valid_until` i w `sessions.expires_at` aktywnej sesji; RLS: property A nie widzi/nie
edytuje rezerwacji property B; test integracyjny z aktywnym RLS.

**Blokery:** S2.1 (RBAC), S1.1 (schema rooms/reservations już istnieje z S0.2).

**Status:** zarejestrowana luka + draft scope, gotowe do szczegółowego planowania przez
`/10x-plan`. Nie implementowane w ramach tego wpisu.

## Implementacja — notatki

**Phase 1 (warstwa serwerowa) zakomitowana z niepotwierdzoną manualną weryfikacją.** Automated
checks (typecheck/lint/test/SQL RLS) przeszły. Punkty manualne `plan.md` Progress 1.5–1.8
(`checkInRoomAction`/`updateCheckOutAction` — forbidden/dpaNotSigned/roomOccupied/invalidCheckOut)
zostają celowo `- [ ]` — server actions wymagają cookies sesji Next.js (`getHotelUser()`), więc
nie da się ich manualnie zweryfikować bez UI z Phase 2. **TODO:** potwierdzić 1.5–1.8 w przeglądarce
razem z manualną weryfikacją Phase 2 (2.4–2.8), zalogowana jako różne role.
