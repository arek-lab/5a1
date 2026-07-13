---
change_id: s2-11
title: Tłumaczenie treści usług (EN) (rozszerzenie Modułu 2)
status: implementing
created: 2026-07-13
updated: 2026-07-13
archived_at: null
---

## Notes

Z `context/foundation/session-plan.md` (S2.11 — Tłumaczenie treści usług (EN) (rozszerzenie
Modułu 2)):

**Kontekst:** zgłoszone przez użytkownika 2026-07-13 — po przełączeniu języka gościa (PL↔EN)
zmienia się tylko część hardcoded strony. Audyt kodu (`/plan`) potwierdził przyczynę: next-intl
poprawnie tłumaczy statyczne UI stringi (`messages/pl.json`/`en.json`, poprawnie użyte w
`app/[locale]/(hotel)/services/*.tsx`, `components/guest/service-card.tsx`), ale tabela
`services` (`supabase/migrations/20260626000001_initial_schema.sql:126-141`) przechowuje
`name`/`description` jako zwykły `TEXT` bez kolumny języka — jedna wartość na wiersz. Guest read
(`lib/guest/services.ts`: `getPinnedServices`, `getServicesByCategory`, `getServiceById`)
renderuje tę wartość wprost, nigdy przez next-intl. Dodatkowo `template-picker.tsx:21-22`
rozwiązuje `t(nameKey)`/`t(descriptionKey)` w momencie dodania usługi z szablonu w bieżącym
języku panelu i zapisuje już przetłumaczony string na stałe — więc nawet szablonowa usługa
zamraża się w jednym języku.

**Napięcie z wcześniejszą decyzją (odnotowane, nie blokujące):** ten sam problem był już
świadomie odroczony podczas S2.3 (`context/changes/s2-3/plan.md:36`: "Auto-tłumaczenie PL→EN
treści usług — odroczone jako R4 w roadmapie (§11.2)... `services` nie ma kolumn
`name_en`/`description_en`"). Roadmapa (`implementation_roadmap.md:378`) opisuje docelową
architekturę dwuwarstwową (Warstwa 1 = next-intl UI, Warstwa 2 = treść hotelowa
`name_pl`/`name_en`). R4 (`implementation_roadmap.md:771`, DeepL vs Claude do auto-translate)
pozostaje otwarte i **nie jest** rozwiązywane w tym wpisie — ta sesja realizuje wyłącznie
manualną warstwę tłumaczenia treści.

**Decyzja o modelu danych (ustalona z użytkownikiem podczas planowania):** rozważono trzy
podejścia:
1. Nullable kolumny `name_en`/`description_en` w `services` (jeden wiersz per usługa, oba
   języki) — **wybrane**. Zgodne z architekturą z roadmapy (§5.1), zero nowej infrastruktury,
   nie rusza R4.
2. Wzorzec `language` per wiersz jak w `knowledge_chunks`
   (`20260626000001_initial_schema.sql:159-171`) — odrzucone: tam KB zasila AI Concierge (może
   degradować się do fallbacku), podczas gdy usługi renderują się bezpośrednio w katalogu gościa;
   duplikowanie wierszy per język pogorszyłoby UX (rozjazd cen/pinów/kategorii między wersjami
   językowymi tej samej usługi).
3. Auto-tłumaczenie PL→EN przez zewnętrzne API (DeepL/Claude) przy zapisie — odrzucone na tym
   etapie: rozwiązuje R4 teraz, ale wprowadza nową zależność/koszt/klucz API bez wyraźnej
   potrzeby na MVP ("brak infrastruktury ponad potrzebę").

**Scope (draft):**
- Migracja SQL: nullable kolumny `name_en`, `description_en` w `services`.
- Formularz `service-form.tsx` — opcjonalne pola "Nazwa (EN)"/"Opis (EN)" obok istniejących PL.
- `template-picker.tsx`/`actions.ts` (`createServiceFromTemplate`) — wypełnienie obu kolumn z
  `getTranslations({locale: 'pl'|'en'})` dla `nameKey`/`descriptionKey` szablonu (klucze
  `services.serviceTemplates.*` już istnieją po PL i EN), zamiast tylko bieżącego locale panelu.
- Guest read (`lib/guest/services.ts`: `getPinnedServices`, `getServicesByCategory`,
  `getServiceById`) — nowy parametr `locale`, zwraca `name_en`/`description_en` gdy `locale ===
  'en'` i pole niepuste, inaczej fallback na `name`/`description` (PL).

**DoD (draft):** usługa dodana z szablonu ma poprawną nazwę/opis w obu językach bez ręcznej
pracy hotelu; usługa custom z wypełnionym EN pokazuje EN po przełączeniu guest UI na `en`;
usługa custom bez EN pokazuje fallback PL (nie pusty string); RLS/izolacja tenantów nietknięta
(brak zmiany polityk, tylko nowe kolumny).

**Blokery:** brak — S2.3 (schemat i CRUD usług) już zaimplementowane.

**Status:** zarejestrowana luka + draft scope, gotowe do szczegółowego planowania przez
`/10x-plan`. Nie implementowane w ramach tego wpisu.
