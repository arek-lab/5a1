# Zarządzanie QR (Moduł 4) — Plan Brief

> Full plan: `context/changes/s2-5/plan.md`

## What & Why

Budujemy panel zarządzania QR: auto-rotacja QR recepcji co 5 min + rotacja ręczna, dezaktywacja QR pokoju per pokój, licznik aktywnych sesji, blokada modułu gdy hotel nie podpisał DPA (HITL #11). Backend tej logiki (`lib/qr/generate.ts`) jest już gotowy z S1.1 — ta sesja dodaje warstwę RBAC, UI panelu i test IT-6.

## Starting Point

`lib/qr/generate.ts` ma kompletne funkcje `generateReceptionQR`/`generateRoomQR`/`deactivateRoomQR` z bramką DPA (`DpaNotSignedError`), pokryte unit testami (mock). RBAC (`qr_manage`, `qr_sessions`) już zdefiniowane w macierzy z S2.1. Brak jest: warstwy server actions z RBAC dla panelu, UI strony `/qr`, licznika sesji i testu IT-6.

## Desired End State

Recepcja widzi w panelu stronę `/qr`: aktualny QR recepcji z odliczaniem do auto-rotacji i przyciskiem ręcznej rotacji, licznik gości aktualnie zalogowanych przez ten QR, oraz listę pokoi z przełącznikiem aktywuj/dezaktywuj QR pokoju. Gdy hotel nie ma podpisanego DPA, strona pokazuje blokadę zamiast funkcji.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Licznik aktywnych sesji | Liczone po `reception_scan_at >= created_at` bieżącego aktywnego QR | Brak FK sessions→qr_codes; unika migracji schematu poza scope sesji | Plan |
| Auto-rotacja QR recepcji | Client-side `setInterval` (5 min) wołający server action | Zero nowej infrastruktury cron/job_queue (ta jest dopiero w S5.2) | Plan |
| Dezaktywacja QR pokoju | Blokuje tylko nowe skany, nie revokuje istniejących sesji | Zgodne z DoD ("nowe skany odrzucone") i zerowa zmiana w kodzie S1.1 | Plan |
| Blokada DPA w UI | Cała strona `/qr` zablokowana komunikatem | Spójne z istniejącym wzorcem server-side guard (`RequirePermission`) | Plan |
| Odświeżanie licznika sesji | Tylko przy przeładowaniu strony (server-side), bez SSE/polling | Funkcja SHOULD, nieproporcjonalny nakład na real-time infra | Plan |
| Zakres testu IT-6 | Nowy `it-6.test.ts` (real DB, bramka DPA) + klon SQL izolacji RLS dla `qr_codes` | Domyka DoD "IT-6 przechodzi" ponad istniejące unit testy (mock) | Plan |
| Lista pokoi | Płaska lista, bez paginacji/wyszukiwarki | Hotele MVP (boutique/mid-size) mają dziesiątki, nie tysiące pokoi | Plan |
| PDF do druku / rewokacja pojedynczych sesji | Poza scope — TODO | SHOULD/COULD bez zdefiniowanego UX w roadmapie | Plan |

## Scope

**In scope:**
- Server actions RBAC-owane: rotacja QR recepcji, aktywacja/dezaktywacja QR pokoju
- Zapytanie licznika aktywnych sesji
- Strona `/qr` + komponent kliencki (karta QR recepcji, lista pokoi, blokada DPA)
- Test IT-6 (real DB) + test izolacji RLS `qr_codes`
- Tłumaczenia PL/EN

**Out of scope:**
- PDF QR pokoi do druku
- Podgląd/rewokacja pojedynczych aktywnych sesji
- Real-time odświeżanie licznika (SSE/polling)
- Revokowanie sesji przy ręcznej dezaktywacji QR pokoju
- Wspólny komponent nawigacji panelu
- Zmiany w `lib/qr/generate.ts`, RBAC matrix, RLS policies (już gotowe)

## Architecture / Approach

Faza 1: warstwa serwerowa — server actions w `app/[locale]/(hotel)/qr/actions.ts` opakowują istniejące funkcje z `lib/qr/generate.ts` w RBAC + friendly error na `DpaNotSignedError`; nowe zapytanie `lib/qr/session-count.ts`; test IT-6 + klon SQL izolacji. Faza 2: UI — `app/[locale]/(hotel)/qr/page.tsx` (server) + `qr-panel.tsx` (client), wzorowane 1:1 na module `services/`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Server actions, licznik, IT-6 | RBAC-owane akcje QR, zapytanie licznika sesji, test IT-6 + izolacja RLS | Definicja licznika sesji (brak FK) może nie odpowiadać dokładnie oczekiwaniom recepcji |
| 2. UI panelu QR | Strona `/qr` z kartą recepcji (auto-rotacja+countdown), listą pokoi, blokadą DPA | Auto-rotacja działa tylko gdy karta przeglądarki jest otwarta (brak cron) |

**Prerequisites:** S2.1 (RBAC, już gotowe), S1.1 (logika QR, już gotowa) — oba spełnione.
**Estimated effort:** ~1 sesja, 2 fazy.

## Open Risks & Assumptions

- Auto-rotacja client-side oznacza, że QR nie rotuje, jeśli karta przeglądarki recepcji zostanie zamknięta — akceptowane świadomie (brak infrastruktury cron przed S5.2).
- Licznik sesji po `reception_scan_at >= created_at` bieżącego QR jest przybliżeniem — precyzyjne dopasowanie sesja→QR wymagałoby migracji (`qr_code_id` na `sessions`), świadomie odłożonej.

## Success Criteria (Summary)

- Recepcja widzi aktualny QR, który rotuje automatycznie co 5 min i ręcznie na żądanie.
- Dezaktywacja QR pokoju natychmiast blokuje nowe skany tego pokoju.
- Licznik aktywnych sesji odzwierciedla liczbę gości zalogowanych przez bieżący QR recepcji.
- Hotel bez podpisanego DPA nie może wygenerować/aktywować żadnego QR.
