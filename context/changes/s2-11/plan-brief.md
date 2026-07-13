# Tłumaczenie treści usług (EN) — Plan Brief

> Full plan: `context/changes/s2-11/plan.md`

## What & Why

Guest UI poprawnie przełącza statyczne stringi (next-intl), ale treść usług hotelowych
(`services.name`/`description`) to zwykły `TEXT` bez kolumny języka — jedna wartość na wiersz,
renderowana wprost bez tłumaczenia. Ten plan dodaje manualną warstwę tłumaczenia treści, żeby
przełączenie języka gościa (PL↔EN) działało spójnie także dla nazw/opisów usług, nie tylko UI.

## Starting Point

`services` ma `name TEXT NOT NULL`, `description TEXT`. Guest read (`lib/guest/services.ts`)
selectuje te pola bez świadomości locale. `template-picker.tsx` rozwiązuje nazwę/opis szablonu
w bieżącym locale panelu i zapisuje ją na stałe — usługa z szablonu zamraża się w jednym języku
w momencie dodania.

## Desired End State

Usługa dodana z szablonu ma poprawną nazwę/opis w PL i EN automatycznie. Usługa custom z
wypełnionym polem EN pokazuje EN po przełączeniu guest UI; bez wypełnionego EN — fallback na PL
(nigdy pusty string). Panel ma opcjonalne pola "Nazwa (EN)"/"Opis (EN)" w formularzu usługi.

## Key Decisions Made

| Decision                          | Choice                                              | Why (1 sentence)                                                                 | Source |
| ---------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------- | ------ |
| Data model                         | Nullable `name_en`/`description_en` na `services`   | Zgodne z architekturą dwuwarstwową z roadmapy, zero nowej infry, nie rusza R4      | Frame (change.md) |
| Locale w guest read                | `getLocale()` z `next-intl/server`, nowy parametr    | Zero zmian sygnatur route, spójne z resolveowaniem locale w `i18n/request.ts`      | Plan |
| `database.types.ts`                | Regeneracja przez `supabase gen types` (CLI, cloud)  | Użytkownik ma dostęp do projektu chmurowego — gwarantowana zgodność ze schematem   | Plan |
| Layout pól EN w formularzu         | Zawsze widoczne pod polami PL                        | Prostsze, spójne z resztą formularza (brak wzorca collapsible gdzie indziej)       | Plan |
| Wypełnianie template (PL+EN)       | Resolved server-side w `createServiceFromTemplate`   | Client-side nie może rozwiązać drugiego locale (`NextIntlClientProvider` bindowany na jeden) — jedyne rzetelne źródło to `getTranslations` per locale w akcji | Plan |
| Auto-translate (DeepL/Claude)      | Poza scope (R4 pozostaje otwarte)                    | Nowa zależność/koszt/klucz API bez wyraźnej potrzeby na MVP                        | Frame (change.md) |

## Scope

**In scope:**
- Migracja SQL: `name_en`, `description_en` nullable na `services`.
- `lib/guest/services.ts`: locale-aware odczyt z fallbackiem PL.
- `service-form.tsx` + `actions.ts`: manualne pola EN, zapis/prefill.
- `createServiceFromTemplate`: server-side resolve obu języków z kluczy szablonu.
- `ServiceRecord`, select w `(hotel)/services/page.tsx`, i18n keys PL/EN.

**Out of scope:**
- Auto-tłumaczenie PL→EN (DeepL/Claude, R4).
- Zmiana wzorca danych na `language`-per-row.
- Zmiana RLS policies.
- Tłumaczenie innych tabel treści (`knowledge_chunks` już ma własny wzorzec).
- Języki inne niż PL/EN.

## Architecture / Approach

Cztery warstwy, każda budująca na poprzedniej: schema (Faza 1) → guest read z fallbackiem
(Faza 2) → panel write manualny (Faza 3) → panel write z szablonu, server-resolved (Faza 4).
Kolejność minimalizuje ryzyko: dane przed kodem, odczyt przed zapisem, prostszy zapis (manual)
przed bardziej złożonym (template + dwa locale naraz).

## Phases at a Glance

| Phase                                        | What it delivers                                              | Key risk                                                        |
| --------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1. Migracja SQL + regenerowane typy           | `name_en`/`description_en` w DB i w `database.types.ts`        | Regeneracja typów zależy od dostępu do chmurowego projektu Supabase |
| 2. Guest read — locale-aware z fallbackiem    | Guest UI pokazuje poprawny język z fallbackiem na PL            | Zapomniany fallback dla pustego stringu (nie tylko `null`) EN     |
| 3. Panel — manualne pola EN w formularzu      | Hotel może ręcznie wpisać EN dla dowolnej usługi                 | `ServiceRecord`/select muszą urosnąć, inaczej edycja zeruje EN     |
| 4. Template fill — oba języki naraz           | Usługa z szablonu ma PL+EN automatycznie, niezależnie od panelu | Zła resolucja `getTranslations` per locale w server action        |

**Prerequisites:** dostęp do projektu Supabase w chmurze (dla `db push` + `gen types`) —
potwierdzony przez użytkownika.
**Estimated effort:** ~1 sesja, 4 fazy.

## Open Risks & Assumptions

- Zakładamy, że `getTranslations({locale: 'en'})` w server action działa niezależnie od locale
  aktualnego requestu (next-intl wspiera to jako standardowy pattern) — do zweryfikowania przy
  implementacji Fazy 4.
- Zakładamy brak istniejących danych seed/fixture z usługami wymagającymi backfillu — potwierdzone
  (brak `supabase/seed.sql`).

## Success Criteria (Summary)

- Usługa z szablonu ma poprawne PL i EN bez ręcznej pracy hotelu.
- Usługa custom z EN pokazuje EN po przełączeniu guest UI; bez EN — fallback PL, nigdy pusty.
- Brak zmian w RLS/izolacji tenantów.
