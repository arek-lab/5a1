---
change_id: s7-1
title: Eliminacja sekwencyjnych round-tripów Supabase w aplikacji gościa
status: implemented
created: 2026-07-17
updated: 2026-07-17
archived_at: null
---

## Notes

Z `context/foundation/session-plan.md` (S7.1 — Eliminacja sekwencyjnych round-tripów Supabase w
aplikacji gościa):

**Kontekst:** użytkownik zgłosił, że produkcyjna instancja na Railway jest bardzo wolna — każda
strona aplikacji gościa ładuje się ~2s, mimo że aplikacja miała być PWA. Diagnoza (czytanie
`proxy.ts`, `lib/guest/session.ts`, `lib/supabase/tenant.ts`, migracji RLS,
`app/[locale]/(guest)/layout.tsx`, `app/sw.ts`) wykazała, że wspólny `GuestLayout` (renderowany na
każdej trasie gościa) wywołuje `requireGuestSession()`, które uruchamia **do 7 sekwencyjnych**
round-tripów sieciowych do Supabase, jeden po drugim, zanim jakikolwiek HTML trafi do przeglądarki:

1. `proxy.ts` — `SELECT sessions` (service-role, revoked/expired check)
2. `proxy.ts` — `supabase.auth.getClaims()` (osobny round-trip tylko po `property_id`/`session_id`,
   które **już są** w wyniku kroku 1)
3. `lib/guest/session.ts` → `withTenantContext()` → RPC `set_tenant_context` — **martwy
   round-trip**: klient jest `service_role` (`BYPASSRLS`), więc RLS oparte o
   `current_setting('app.property_id')` nigdy się dla niego nie uruchamia; realną izolacją
   tenantową są wyłącznie ręczne `.eq('property_id', …)` w kodzie aplikacji
4. `lib/guest/session.ts` — drugi `SELECT sessions` (te same dane co krok 1, inne kolumny)
5-7. `lib/guest/session.ts` — `properties`/`reservations`/`rooms`, sekwencyjnie mimo że są
   niezależne od siebie (wszystkie potrzebują tylko danych już znanych po kroku 4)

Dodatkowo: zero plików `loading.tsx` w całej aplikacji — nawigacja w pełni blokująca, ekran pusty
aż cały łańcuch się zakończy.

**Twarde ograniczenie (HITL, `context/archive/decisions_log.md:92,577`):** rewokacja sesji gościa
musi być natychmiastowa — żadna zmiana w tej sesji nie cache'uje `revoked`/`expires_at`.

**Zakres:** wyłącznie aplikacja gościa (`proxy.ts`, `lib/guest/session.ts`,
`lib/supabase/tenant.ts`, nowy `loading.tsx`). Panel hotelowy ma analogiczny problem
(`lib/panel/auth.ts`/`(hotel)/layout.tsx`) — zarejestrowany jako TODO w `session-plan.md`, poza
zakresem tej sesji. `getClaims()` w middleware zostaje (odświeżanie cookies Auth) — usunięcie poza
bezpiecznym zakresem tej sesji.

**Status:** plan zatwierdzony przez użytkownika, kod zaimplementowany — patrz `plan.md`.

## Implementacja — notatki

Wszystkie 4 kroki (usunięcie RPC `set_tenant_context`, nagłówki sesji z middleware, `Promise.all`
w `session.ts`, `loading.tsx`) zaimplementowane. Zaktualizowano `__tests__/proxy.test.ts` i
`lib/guest/__tests__/session.test.ts` pod nowy kontrakt + dodano 2 nowe testy weryfikujące
przekazywanie nagłówków sesji z middleware. `npm run typecheck`/`lint`/`test`/`build` zielone
(396/396 testów; 2 istniejące błędy lint w `qr-panel.tsx`/`reception-qr-kiosk.tsx` niezwiązane z
tą sesją, nie dotknięte). Manualna weryfikacja (1.5-1.9 w `plan.md`) **nie została wykonana** —
wymaga żywego środowiska z Supabase + realną sesją gościa (skan QR), niedostępnego w tej sesji
narzędziowej. Do wykonania przez użytkownika przed uznaniem sesji za zamkniętą.
