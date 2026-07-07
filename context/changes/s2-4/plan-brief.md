# Baza wiedzy AI — FAQ editor (Moduł 3) — Plan Brief

> Full plan: `context/changes/s2-4/plan.md`

## What & Why

Panel hotelowy dostaje edytor Q&A (add/edit/delete) zapisujący wpisy do `knowledge_chunks` — dane, które w Fazie 4 (S4.1) zasilą prompt injection AI concierge. Bez tej sesji hotel nie ma sposobu na dostarczenie treści FAQ/okolicy, więc concierge nie miałby czego wstrzykiwać w SYSTEM PROMPT.

## Starting Point

Schemat `knowledge_chunks`, RLS (`guest_read_knowledge_chunks`, `staff_all_knowledge_chunks`) i RBAC (`knowledge`: owner/admin=full, staff=write, viewer=read) już istnieją od S0.2/S2.1 — zero migracji potrzebnych. Krok wizardu „Baza wiedzy" jest placeholderem (`interactive: false`). Wzorzec do powielenia: S2.3 (Usługi) — identyczny kształt CRUD + biblioteka szablonów + wpięcie w wizard.

## Desired End State

Staff/Admin/Owner zarządza na `/knowledge` listą pytań-odpowiedzi (dodaje z 5 szablonów FAQ lub od zera, edytuje, usuwa) oraz osobną sekcją „Okolica" (wolny tekst). Każdy zapis przelicza `content_hash` (SHA-256 z treści). Krok wizardu jest interaktywny i podnosi pasek gotowości hotelu.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Delete semantics | Prawdziwy DELETE | Brak kolumny `is_active` w schemacie; scope S2.4 wprost wymienia „delete", w odróżnieniu od Usług (nigdy hard DELETE) | Plan |
| content_hash | SHA-256 z pola `content`, per wiersz | Prosty, deterministyczny, wystarczający dla DoD; agregatowy hash KB to zadanie S4.1 | Plan |
| „Okolica" | Zwykły wiersz `knowledge_chunks` z `category='local'`, `question=NULL` | Zero zmian schematu; zgodne z kompozytorem KB z §6.1, który zakłada że okolica pochodzi z tej samej tabeli | Plan |
| Szablony FAQ | Dokładnie 5 (godziny, parking, WiFi, checkout, zwierzęta) | Pokrywa dokładnie MUST ze scope S2.4, bez scope creep | Plan |
| valid_from/until | Opcjonalne pola w formularzu, default NULL | DoD S2.4 wprost wymaga „ustawiane" — potrzebny realny UI, nie tylko kolumna | Plan |
| Pole language | Select pl/en w formularzu, default 'pl' | Kolumna już konsumowana przez S4.1/S4.2 per język sesji; pominięcie zablokowałoby wielojęzyczność KB | Plan |
| Kategorie w UI | Zamknięta lista `faq`/`local`, reszta poza scope | Zgodne z DoD S2.4; `category` to TEXT bez ENUM, przyszłe sesje (menu, polityki) dodadzą wartości bez migracji | Plan |

## Scope

**In scope:** edytor Q&A (add/edit/delete), 5 szablonów FAQ, sekcja „Okolica", `content_hash` per wpis, `valid_from/until` w UI, wybór `language`, krok wizardu interaktywny.

**Out of scope:** kompozytor KB/cache Redis (S4.1), aktywacja embedding/RAG (post-MVP, HITL #12), seeding przez team platformy (HITL #4), auto-tłumaczenie PL→EN, podkategorie FAQ, soft-delete.

## Architecture / Approach

Trzy fazy powielające strukturę S2.3: (1) stałe dane (kategorie, szablony, util hashujący) + i18n, (2) server actions CRUD + hash + test izolacji RLS + testy jednostkowe, (3) UI (`/knowledge`) + wpięcie w wizard onboardingowy. Zero nowych zależności — hash liczony wbudowanym `crypto` Node.js.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Szablony + kategorie + hash util + i18n | Statyczne dane i util bez zależności od Supabase | Niespójność kluczy i18n między pl/en |
| 2. Server actions + testy | CRUD + `content_hash` + izolacja RLS (w tym DELETE) | Test RLS musi pokryć też DELETE, nie tylko SELECT/UPDATE jak w S2.3 |
| 3. UI + wizard | Pełny edytor + krok wizardu interaktywny | Formularz musi rozróżnić `faq` (question required) vs `local` (question=NULL) bez dwóch osobnych tabel |

**Prerequisites:** S2.2 (wizard istnieje), S0.2 (schemat), S2.1 (RBAC) — wszystkie już ukończone.
**Estimated effort:** ~3 sesje implementacyjne (1 per faza), analogicznie do S2.3.

## Open Risks & Assumptions

- Brak biblioteki modali w projekcie — potwierdzenie usunięcia wpisu (DELETE) użyje prostego `window.confirm` lub inline confirm, nie dedykowanego komponentu.
- `language` w UI jako select pl/en zakłada, że S4.1/S4.2 faktycznie odczytają tę kolumnę przy kompozycji KB per język sesji — nie zweryfikowane w tej sesji (poza scope), tylko udostępnione jako poprawne dane.

## Success Criteria (Summary)

- Staff dodaje/edytuje/usuwa wpisy FAQ i „Okolica" z poprawnym `content_hash` po każdej zmianie treści.
- RLS blokuje odczyt, zapis i usunięcie wpisów innej property przez staff.
- Krok „Baza wiedzy" w wizardzie jest w pełni funkcjonalny i podnosi gotowość hotelu.
