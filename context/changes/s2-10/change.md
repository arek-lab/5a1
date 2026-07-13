---
change_id: s2-10
title: Dodawanie pokoi + druk QR (rozszerzenie Modułu 4)
status: implemented
created: 2026-07-13
updated: 2026-07-13
archived_at: null
---

## Notes

Z `context/foundation/session-plan.md` (S2.10 — Dodawanie pokoi + druk QR (rozszerzenie Modułu 4)):

**Kontekst:** zgłoszone przez użytkownika 2026-07-13 — właściciele hoteli muszą mieć możliwość
dodawania pokoi do swojego hotelu i drukowania ich kodów QR, bez wykraczania poza zakres
własnego property. Audyt kodu (`/plan`) potwierdził: w całym repo nie istnieje żadna funkcja
tworzenia pokoju — tabela `rooms` (schemat z S0.2) jest dziś zasilana wyłącznie ręcznie przez
skrypty testowe/service-role (`supabase/tests/s2_5_qr_staff_isolation.sql`,
`scripts/verify-qr.ts`). Strona `/qr` (S2.5) wyświetla listę pokoi i zarządza aktywacją ich QR,
ale bez istniejącego wiersza `rooms` nie ma czego aktywować. Renderowanie obrazu QR w panelu
istniało dotąd wyłącznie dla QR recepcji (`generateQRImage` wołane tylko w sekcji recepcji
`app/[locale]/(hotel)/qr/page.tsx`) — QR pokoju nigdy nie był renderowany/drukowany.

**Napięcie z roadmapą (odnotowane, nie blokujące):** `implementation_roadmap.md:293` oraz
`:530` opisują "Generowanie PDF z QR pokoi do druku" jako funkcję SHOULD wykonywaną przez
**zespół platformy jako płatną opcję**, nie jako self-service ownera. Żadna z 15 zamkniętych
decyzji HITL (`context/foundation/decisions_log.md`, §1.3 roadmapy) nie dotyczy wprost tej
kwestii, więc nie jest to rewizja twardej decyzji — jest to unowocześnienie SHOULD-owej,
nigdy niezaimplementowanej funkcji do self-service. Zarejestrowane tutaj dla przejrzystości
historii decyzji.

**Reguły dostępu (ustalone z użytkownikiem podczas planowania):**
- Dodawanie pokoju: tylko Owner/Admin (nowy zasób RBAC `rooms_manage`).
- Druk QR pokoju: Owner/Admin/Staff — Staff może drukować QR tylko dla już istniejących pokoi,
  nie może ich tworzyć.
- Zasięg property: `hotelUser.propertyId` z `getHotelUser()` (nigdy klient), plus istniejący
  RLS backstop `staff_all_rooms`/`auth_user_property_ids()` — bez nowej migracji RLS.

**Scope:** formularz "Dodaj pokój" w `/qr` (Owner/Admin) + nowa podstrona `/qr/print` z kartami
QR do druku przeglądarkowego (Owner/Admin/Staff/Viewer, odczyt). Bez edycji/usuwania pokoju,
bez generowania prawdziwego pliku PDF (druk przez natywny dialog przeglądarki, zero nowych
zależności).

**DoD:** patrz session-plan.md S2.10 (wyżej).

**Blokery:** brak — S0.2, S2.1, S2.5 już zaimplementowane.

**Status:** zaimplementowane i zweryfikowane. Wszystkie punkty Progress w
`context/changes/s2-10/plan.md` zamknięte: `npm run typecheck`/`lint`/`test`/`build` przechodzą,
`supabase/tests/s2_10_rooms_staff_isolation.sql` uruchomiony w Supabase SQL Editor kończy się
`S2.10 PASSED`, manualna weryfikacja UI (dodawanie pokoju przez Owner, brak dostępu dla
Staff/Viewer, duplikat numeru, druk QR, poprawny `room_id` po zeskanowaniu) potwierdzona przez
użytkownika.

## Implementacja — notatki

Skrypt testu RLS musiał zostać przepisany z jednego bloku `DO $$` zawierającego zagnieżdżony
`BEGIN/EXCEPTION/END` na kilka top-level bloków `DO $$` (każdy z jednym poziomem `BEGIN`/
`EXCEPTION`/`END`) — Supabase Studio SQL Editor błędnie tnie wieloinstrukcyjny skrypt licząc pary
`BEGIN`/`END` naiwnie, co przy zagnieżdżeniu powodowało fałszywy błąd składni ("syntax error at
or near IF") w dalszej części skryptu mimo poprawnej gramatyki PL/pgSQL. Wzorzec z płaskimi,
top-level blokami `DO $$` jest bezpieczniejszy dla tego edytora i został zastosowany w finalnej
wersji `supabase/tests/s2_10_rooms_staff_isolation.sql`.
