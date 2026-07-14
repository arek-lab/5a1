# Nawigacja główna (gość + panel) — Plan Brief

> Full plan: `context/changes/s6-0/plan.md`

## What & Why

Budujemy brakującą, trwałą nawigację dla obu aplikacji platformy: dolną nawigację gościa (5
zakładek) i lewą szynę panelu hotelowego (6 pozycji RBAC-filtrowanych). `style.md` §1.3/§2.3
definiuje tę strukturę od dawna, ale żadna sesja jej nigdy nie zbudowała — luka odkryta
2026-07-14 podczas planowania S6.1, który błędnie założył, że nawigacja gościa "jest już
zaimplementowana z Fazy 3 sesji S3.1".

## Starting Point

Gość: `app/[locale]/(guest)/layout.tsx` ma tylko header + `FloatingConciergeButton` (fixed) +
`OfflineToast`. Home page ma statyczny `CategoryGrid` jako treść strony, nie jako trwały nav.
Panel: `app/[locale]/(hotel)/layout.tsx` ma tylko header z wylogowaniem — zero markupu
nawigacyjnego, mimo że `lib/panel/rbac.ts` ma gotową macierz uprawnień od sesji S2.1.

## Desired End State

Gość widzi trwałą dolną nawigację (Dziś/Udogodnienia/Concierge/Mój pobyt/Odkrywaj) na każdej
stronie poza `/scan`, z aktywną zakładką podświetloną. Personel panelu widzi lewą szynę 240px z
6 pozycjami, każda widoczna tylko gdy rola ma odczyt odpowiedniego zasobu RBAC. Dwie nowe strony
gościa (`/my-stay`, `/discover`) i jedna (`/amenities`) uzupełniają docelowe cele nawigacji.

## Key Decisions Made

| Decision                              | Choice                                      | Why (1 sentence)                                                                 | Source |
| -------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------- | ------ |
| FloatingConciergeButton                | Usunięty                                     | Concierge jest teraz zakładką nav — floating button byłby zbędnym duplikatem       | Plan   |
| RBAC dla pozycji "QR" w panelu         | `qr_manage` (read)                           | Strona `/qr` to generator kodów — funkcja zarządcza, nie tylko podgląd sesji       | Plan   |
| Format dat na `/my-stay`               | Bezwzględna data w IBM Plex Mono              | Spójne z numerem pokoju obok, zgodne z regułą style.md §3 "liczby zawsze w mono"    | Plan   |
| Rozszerzenie danych check-in/check-out | Rozszerz `getGuestSessionContext`             | Jeden cache'owany punkt prawdy o sesji, brak dodatkowego zapytania na każdej stronie | Plan   |
| Zakres testów automatycznych           | RBAC filtering + aktywny stan nav (bez smoke testów nowych stron) | Pokrywa jedyną realną logikę biznesową tej sesji                                    | Plan   |
| Zapytanie o treść "okolica"            | Nowa lekka funkcja (nie re-użycie `fetchKbSections`) | Unika zbędnego zapytania do `services` przy każdym wejściu na `/discover`           | Plan   |

## Scope

**In scope:** `components/panel/sidebar-nav.tsx`, `components/guest/bottom-nav.tsx`, strony
`/amenities`, `/my-stay`, `/discover`, rozszerzenie `getGuestSessionContext`, tłumaczenia PL/EN,
usunięcie `FloatingConciergeButton`.

**Out of scope:** design tokeny/shadcn (S6.1), zmiany RBAC/RLS/routingu istniejących stron, nowa
treść redakcyjna dla `/discover`, zmiany `/admin`.

## Architecture / Approach

Oba komponenty nav są kliencie (`usePathname()` do aktywnego stanu), ale dane wejściowe (lista
pozycji RBAC-filtrowana dla panelu) liczone są server-side w layoucie nadrzędnym i przekazywane
jako prop — ten sam podział co istniejący `FloatingConciergeButton`.

## Phases at a Glance

| Phase                              | What it delivers                                    | Key risk                                              |
| ----------------------------------- | ----------------------------------------------------- | -------------------------------------------------------- |
| 1. Panel — szyna nawigacyjna        | `sidebar-nav.tsx`, RBAC filtering, 6 pozycji           | Błędne mapowanie zasobu QR ukrywa pozycję dla viewer      |
| 2. Gość — dolna nav + `/amenities`  | `bottom-nav.tsx`, usunięcie FAB, nowa strona           | Konflikt pozycji z `OfflineToast` (zweryfikowano: brak)   |
| 3. Gość — `/my-stay`                | Rozszerzenie sesji, strona z danymi rezerwacji         | Sesja bez `reservationId` — musi nie wywalać błędu        |
| 4. Gość — `/discover`               | Nowe zapytanie `knowledge_chunks`, strona + pusty stan | Property bez treści `local` — pusty stan musi być zapraszający |
| 5. Testy + weryfikacja końcowa      | Unit testy RBAC + aktywny stan, pełna weryfikacja DoD  | Regresja w istniejących flow gościa/panelu                |

**Prerequisites:** S1.2, S2.1, S2.4, S2.9, S3.1 (wszystkie już zaimplementowane per `session-plan.md`).
**Estimated effort:** ~1 sesja implementacyjna, 5 faz.

## Open Risks & Assumptions

- Zakładamy, że `@testing-library/react` jest już w devDependencies dla testów aktywnego stanu
  (Phase 5.2) — jeśli nie, trzeba dodać przed napisaniem tych testów.
- Format daty `DD.MM.YYYY` w mono jest spójny dla PL/EN — jeśli EN oczekuje innego formatu
  regionalnego, to celowe uproszczenie (jeden format, zero lokalizacji dat, zgodnie z decyzją HITL).

## Success Criteria (Summary)

- Gość widzi funkcjonalną dolną nawigację z poprawnym stanem aktywnym na każdej stronie poza `/scan`.
- Personel panelu widzi szynę 240px z pozycjami filtrowanymi poprawnie wg roli.
- Zero regresji: `npm run build/lint/typecheck/test` przechodzą, żadna istniejąca strona/RBAC/RLS
  się nie zmieniła.
