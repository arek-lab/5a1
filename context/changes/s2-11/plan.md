# Tłumaczenie treści usług (EN) — Implementation Plan

## Overview

Usługi hotelowe (`services`) przechowują `name`/`description` jako pojedynczy `TEXT` bez
kolumny języka. Guest UI poprawnie przełącza statyczne stringi (next-intl), ale treść usług
zawsze renderuje się w języku, w którym została wpisana/wygenerowana z szablonu. Ten plan
dodaje nullable kolumny `name_en`/`description_en`, przełącza guest read na wybór wersji
językowej z fallbackiem na PL, dodaje opcjonalne pola EN w formularzu panelu, i naprawia
`createServiceFromTemplate` tak, by wypełniał oba języki naraz z kluczy szablonu.

## Current State Analysis

- `services` (`supabase/migrations/20260626000001_initial_schema.sql:126-141`): `name TEXT NOT
  NULL`, `description TEXT` — jedna wartość, brak kolumny języka.
- `lib/guest/services.ts` (`getPinnedServices`, `getServicesByCategory`, `getServiceById`):
  selectuje `name`/`description` wprost, brak parametru locale, brak next-intl.
- Guest pages wołające te funkcje (`app/[locale]/(guest)/page.tsx`,
  `app/[locale]/(guest)/c/[category]/page.tsx`,
  `app/[locale]/(guest)/c/[category]/[service]/page.tsx`) **nie destrukturyzują** `locale` z
  `params` — tylko segment `[locale]/layout.tsx` to robi. `i18n/request.ts` rozwiązuje locale
  z `requestLocale` → cookie `NEXT_LOCALE` → `Accept-Language`; `getLocale()` z
  `next-intl/server` czyta z tej samej resolved wartości bez potrzeby przekazywania parametru
  przez route.
- `app/[locale]/(hotel)/services/service-form.tsx`: kontrolowany formularz z polami PL
  `name`/`description`, submit przez `FormData` do `createCustomService`/`updateService`
  (`actions.ts`). `ServiceRecord` (`service-list.tsx:9-19`) — typ używany do prefill przy
  edycji — nie ma `name_en`/`description_en`; `page.tsx` (`(hotel)/services/page.tsx:17-19`)
  selectuje kolumny wprost do tego typu.
- `template-picker.tsx`: client component, `useTranslations()` (bindowany do **jednego**
  aktywnego locale panelu przez `NextIntlClientProvider`), rozwiązuje `t(nameKey)` raz i
  wysyła jako jedyne pole `name` do `createServiceFromTemplate`. Nie ma technicznej możliwości
  rozwiązania drugiego locale po stronie klienta bez ładowania drugiego bundle'a wiadomości.
- `createServiceFromTemplate` (`actions.ts:24-46`) obecnie ufa `name`/`description` z
  `FormData` (czyli temu jednemu, zresolvowanemu po stronie klienta stringowi).
- `lib/supabase/database.types.ts`: ręcznie/CLI-generowany plik, blok `services` (Row/Insert/
  Update, `database.types.ts:517+`) — nie ma `name_en`/`description_en`. Użytkownik ma dostęp
  do projektu Supabase w chmurze — types będą regenerowane przez CLI po migracji, nie ręcznie.
- Testy: `lib/guest/__tests__/services.test.ts` (sygnatury 2-argumentowe, bez locale),
  `app/[locale]/(hotel)/services/__tests__/actions.test.ts` (nie testuje
  `createServiceFromTemplate` obecnie — trzeba dodać pokrycie dla nowego zachowania).

## Desired End State

- Usługa dodana z szablonu ma poprawną nazwę/opis w PL i EN bez ręcznej pracy hotelu.
- Usługa custom z wypełnionym EN pokazuje EN po przełączeniu guest UI na `en` (welcome home
  "Polecamy", kategoria, detail).
- Usługa custom bez EN pokazuje fallback PL — nigdy pusty string.
- RLS/izolacja tenantów nietknięta — brak zmian polityk, tylko nowe kolumny.
- Panel: formularz usługi ma opcjonalne pola "Nazwa (EN)"/"Opis (EN)" pod polami PL; edycja
  istniejącej usługi prefilluje istniejące wartości EN (jeśli są).

### Key Discoveries:

- `getLocale()` z `next-intl/server` jest bezpiecznym źródłem locale w guest Server Components
  bez zmiany sygnatur `params` — potwierdzone przez `i18n/request.ts:22` (`getRequestConfig`)
  i istniejące użycie `getTranslations()` w `[service]/page.tsx:8,28`.
- `createServiceFromTemplate` musi przestać ufać `name`/`description` z klienta dla ścieżki
  szablonowej — jedyny wiarygodny sposób wypełnienia obu języków to server-side
  `getTranslations({locale: 'pl'})` / `getTranslations({locale: 'en'})` wewnątrz akcji, kluczowane
  przez `template.nameKey`/`template.descriptionKey` (`lib/panel/service-templates.ts`).
- `ServiceRecord` (`service-list.tsx:9-19`) musi urosnąć o `name_en`/`description_en`, inaczej
  edycja istniejącej usługi z wypełnionym EN zgubi te wartości przy zapisie (formularz je
  nadpisze `null`, bo nie ma ich w stanie initial).

## What We're NOT Doing

- Auto-tłumaczenie PL→EN przez zewnętrzne API (DeepL/Claude) — R4, pozostaje otwarte
  (`implementation_roadmap.md:771`).
- Zmiana architektury na wzorzec `language`-per-row (odrzucone w `change.md`, patrz uzasadnienie
  tam).
- Zmiana RLS policies dla `services`.
- Tłumaczenie innych tabel treści (np. `knowledge_chunks` już ma `language`, poza scope).
- Wsparcie dla języków innych niż PL/EN.

## Implementation Approach

Warstwa danych → warstwa odczytu gościa → warstwa zapisu panelu (manual) → warstwa zapisu
panelu (template, server-resolved). Każda warstwa jest niezależnie weryfikowalna i nie blokuje
poprzedniej — kolejność minimalizuje ryzyko (schema przed kodem, read przed write, manual przed
template bo template zależy od tego samego wzorca co manual + dodatkowej logiki server-side).

## Phase 1: Migracja SQL + regenerowane typy

### Overview

Dodaje nullable kolumny `name_en`, `description_en` do `services`. Regeneruje
`database.types.ts` z chmurowego projektu Supabase (CLI), zamiast ręcznej edycji — użytkownik
potwierdził dostęp do projektu.

### Changes Required:

#### 1. Nowa migracja

**File**: `supabase/migrations/20260713000001_services_en_translations.sql`

**Intent**: Dodać opcjonalne kolumny na angielską wersję nazwy/opisu usługi, bez zmiany
istniejących wierszy (NULL domyślnie = brak tłumaczenia, fallback na PL w warstwie odczytu).

**Contract**: `ALTER TABLE services ADD COLUMN name_en TEXT, ADD COLUMN description_en TEXT;`
Brak zmian w RLS, indeksach, ani constraintach — kolumny są nullable i nie uczestniczą w żadnym
istniejącym `UNIQUE`/`CHECK`.

#### 2. Regeneracja typów

**File**: `lib/supabase/database.types.ts`

**Intent**: Odzwierciedlić nowe kolumny w typach `services.Row`/`Insert`/`Update` tak, by TS
strict mode złapał brakujące/błędne użycia w kolejnych fazach.

**Contract**: Uruchomić `supabase gen types typescript --linked` (lub odpowiednik dla
podłączonego projektu chmurowego) po zaaplikowaniu migracji; nadpisać plik wynikiem. Oczekiwany
diff: `name_en: string | null` i `description_en: string | null` w trzech blokach (Row z
wymaganym polem, Insert/Update jako `?:`), analogicznie do istniejącego `description`.

### Success Criteria:

#### Automated Verification:

- Migracja aplikuje się bez błędu na podłączonym projekcie: `supabase db push` (lub
  odpowiednik używany w tym repo)
- Typy się kompilują: `npm run typecheck`

#### Manual Verification:

- `select name_en, description_en from services limit 1;` zwraca kolumny (NULL dla istniejących
  wierszy)

---

## Phase 2: Guest read — locale-aware z fallbackiem

### Overview

`lib/guest/services.ts` zwraca `name_en`/`description_en` gdy locale to `en` i pole jest
niepuste, inaczej fallback na PL. Guest pages przekazują `getLocale()`.

### Changes Required:

#### 1. Funkcje odczytu

**File**: `lib/guest/services.ts`

**Intent**: Każda z `getPinnedServices`, `getServicesByCategory`, `getServiceById` przyjmuje
nowy parametr `locale: string`, selectuje dodatkowo `name_en`/`description_en`, i w mapowaniu
wyniku zwraca EN wariant gdy `locale === 'en' && value` jest niepustym stringiem, inaczej PL.

**Contract**: Sygnatury zyskują parametr, np.
`getPinnedServices(client, propertyId, locale: string)`. Dodać prywatny helper
`pickTranslated(pl: string, en: string | null, locale: string): string` (i wariant dla
nullable `description`) używany we wszystkich trzech funkcjach — unika duplikacji logiki
fallbacku. Typy `PinnedService`/`ServiceListItem`/`ServiceDetail` (eksportowane z tego pliku)
nie zmieniają kształtu — nadal jedno pole `name`/`description`, teraz już wybrane po stronie
serwera.

#### 2. Wywołania z guest pages

**Files**: `app/[locale]/(guest)/page.tsx`, `app/[locale]/(guest)/c/[category]/page.tsx`,
`app/[locale]/(guest)/c/[category]/[service]/page.tsx`

**Intent**: Pobrać bieżące locale przez `getLocale()` z `next-intl/server` i przekazać do
odpowiedniej funkcji odczytu.

**Contract**: Import `getLocale` z `next-intl/server`; `const locale = await getLocale()` przed
wywołaniem funkcji odczytu; przekazać jako ostatni argument.

### Success Criteria:

#### Automated Verification:

- Unit testy `lib/guest/__tests__/services.test.ts` zaktualizowane i przechodzą:
  `npm run test lib/guest/__tests__/services.test.ts`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- Usługa z wypełnionym `name_en` pokazuje EN nazwę na `/[locale=en]` (home "Polecamy",
  kategoria, detail)
- Usługa bez `name_en` pokazuje PL nazwę na `en` (nie pusty string, nie `null`)
- Przełączenie guest UI na `pl` zawsze pokazuje `name`/`description` niezależnie od EN

**Implementation Note**: Po zakończeniu tej fazy i przejściu automatycznej weryfikacji,
zatrzymaj się i poczekaj na potwierdzenie ręcznego testu od użytkownika przed przejściem do
Fazy 3.

---

## Phase 3: Panel — manualne pola EN w formularzu usługi

### Overview

`service-form.tsx` zyskuje opcjonalne pola "Nazwa (EN)"/"Opis (EN)" pod istniejącymi polami PL.
`createCustomService`/`updateService` zapisują te wartości. `ServiceRecord` i select w
`page.tsx` rozszerzone o nowe kolumny tak, by edycja prefillowała istniejące EN.

### Changes Required:

#### 1. Typ i select listy usług

**File**: `app/[locale]/(hotel)/services/service-list.tsx`

**Intent**: `ServiceRecord` musi nosić `name_en`/`description_en`, inaczej formularz edycji nie
ma skąd prefillować wartości i zapis nadpisze je `null`.

**Contract**: Dodać `name_en: string | null` i `description_en: string | null` do typu
`ServiceRecord`.

#### 2. Select w page.tsx

**File**: `app/[locale]/(hotel)/services/page.tsx`

**Intent**: Rozszerzyć listę selectowanych kolumn o nowe pola, zgodnie z rozszerzonym
`ServiceRecord`.

**Contract**: Dodać `name_en, description_en` do stringa `.select(...)`.

#### 3. Formularz

**File**: `app/[locale]/(hotel)/services/service-form.tsx`

**Intent**: Dodać kontrolowane pola EN analogicznie do PL (`nameEn`/`descriptionEn` w stanie,
inicjalizowane z `service?.name_en`/`service?.description_en`), wysyłane w `FormData` jako
`name_en`/`description_en`.

**Contract**: Nowe `<label>` bloki pod istniejącymi PL polami, ten sam `inputClass`/`labelClass`
wzorzec. Nowe klucze i18n: `services.form.fields.nameEn`, `services.form.fields.descriptionEn`.

#### 4. Server actions

**File**: `app/[locale]/(hotel)/services/actions.ts`

**Intent**: `createCustomService` i `updateService` odczytują `name_en`/`description_en` z
`FormData` (trim → `null` gdy puste, ten sam wzorzec co istniejące `description`) i zapisują je
do insert/update payloadu.

**Contract**: `name_en: String(formData.get('name_en') ?? '').trim() || null` i analogicznie
`description_en`, dodane do obiektów przekazywanych do `.insert()`/`.update()` w obu funkcjach.
`createServiceFromTemplate` NIE dostaje tej zmiany w tej fazie (patrz Faza 4).

#### 5. Tłumaczenia UI panelu

**Files**: `messages/pl.json`, `messages/en.json`

**Intent**: Dodać etykiety dla nowych pól formularza, spójne z istniejącym kluczem `form.fields`
w sekcji `services`.

**Contract**: W `messages/pl.json` → `services.form.fields`: `"nameEn": "Nazwa (EN)"`,
`"descriptionEn": "Opis (EN)"`. W `messages/en.json` → analogiczne klucze z angielskimi
etykietami (np. `"nameEn": "Name (EN)"`, `"descriptionEn": "Description (EN)"`).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Existing action tests still pass: `npm run test app/\[locale\]/\(hotel\)/services/__tests__/actions.test.ts`

#### Manual Verification:

- Dodanie custom usługi z wypełnionymi polami EN zapisuje `name_en`/`description_en` w DB
- Edycja istniejącej usługi z EN prefilluje pola EN poprawnie
- Zostawienie pól EN pustymi zapisuje `null` (nie pusty string) — guest read fallbackuje na PL

**Implementation Note**: Po zakończeniu tej fazy i przejściu automatycznej weryfikacji,
zatrzymaj się i poczekaj na potwierdzenie ręcznego testu od użytkownika przed przejściem do
Fazy 4.

---

## Phase 4: Template fill — oba języki naraz, resolved server-side

### Overview

`createServiceFromTemplate` przestaje ufać `name`/`description` z klienta i sam rozwiązuje oba
języki z kluczy szablonu przez `getTranslations`. `template-picker.tsx` upraszcza się do
wysyłania tylko `template_key` (+ opcjonalnie `price_cents`/`image_url`/`is_time_sensitive` jeśli
kiedyś dodane — obecnie nie są wysyłane przez ten komponent).

### Changes Required:

#### 1. Server action

**File**: `app/[locale]/(hotel)/services/actions.ts`

**Intent**: Po znalezieniu `template` po `template_key`, rozwiązać `name`/`name_en` i
`description`/`description_en` z `template.nameKey`/`template.descriptionKey` przy użyciu
`getTranslations({locale: 'pl'})` i `getTranslations({locale: 'en'})` (dwie osobne instancje
translatora), zamiast czytać `name`/`description` z `FormData`. Walidacja (`validateServiceInput`)
nadal działa na rozwiązanej PL nazwie (żeby `nameRequired` miało sens — szablon zawsze ma nazwę,
więc to w praktyce nie zawiedzie, ale zachowuje istniejący kontrakt walidacji).

**Contract**: Import `getTranslations` z `next-intl/server` (server-only, zgodne z istniejącym
użyciem w `[service]/page.tsx:8`). Insert payload zyskuje `name_en`/`description_en` obok
istniejących pól, wypełnione zresolvowanymi stringami (opis może być pusty string z template →
zapisać jako `null` przy pustym trim, ten sam wzorzec co Faza 3).

#### 2. Template picker

**File**: `app/[locale]/(hotel)/services/template-picker.tsx`

**Intent**: Przestać rozwiązywać `t(nameKey)`/`t(descriptionKey)` do `FormData` — akcja robi to
teraz sama server-side z `template_key`. Wizualne wyświetlanie nazwy szablonu w liście (`t(template.nameKey)`
w JSX) zostaje bez zmian — to tylko UI podglądu w bieżącym locale panelu, nie dane zapisywane.

**Contract**: `handleAdd` przestaje wołać `formData.set('name', ...)` i
`formData.set('description', ...)` — `FormData` niesie już tylko `template_key`.

### Success Criteria:

#### Automated Verification:

- Nowy/rozszerzony test w `app/[locale]/(hotel)/services/__tests__/actions.test.ts` dla
  `createServiceFromTemplate`: mockuje `next-intl/server` `getTranslations`, asertuje że insert
  payload ma poprawne `name`/`name_en`/`description`/`description_en` z dwóch różnych locale
  dla tego samego `template_key`
  `npm run test app/\[locale\]/\(hotel\)/services/__tests__/actions.test.ts`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- Dodanie usługi z szablonu w panelu ustawionym na PL zapisuje poprawną nazwę/opis w OBU
  kolumnach (`name` PL, `name_en` EN) bez przełączania panelu na EN
- Guest UI na `en` pokazuje EN wersję usługi dodanej z szablonu; na `pl` pokazuje PL wersję
- Dodanie tej samej usługi z panelu ustawionego na EN daje identyczny wynik (idempotentne
  względem locale panelu — bo resolvowanie jest teraz server-side, nie zależy od klienta)

**Implementation Note**: Po zakończeniu tej fazy i przejściu automatycznej weryfikacji,
zatrzymaj się i poczekaj na potwierdzenie ręcznego testu od użytkownika. To ostatnia faza.

---

## Testing Strategy

### Unit Tests:

- `lib/guest/services.ts`: fallback logic dla obu pól (EN obecne/niepuste → EN; EN `null` → PL;
  EN pusty string → PL — jeśli taki edge case może wystąpić z DB), dla wszystkich trzech funkcji
  i obu wartości locale.
- `actions.ts`: `createCustomService`/`updateService` z i bez pól EN w `FormData`;
  `createServiceFromTemplate` z mockowanym `getTranslations` zwracającym różne stringi per
  locale.

### Integration Tests:

- Brak nowych integration testów w scope — istniejące testy z aktywnym RLS dla `services`
  (jeśli istnieją) nie wymagają zmian, bo RLS nietknięte.

### Manual Testing Steps:

1. W panelu (PL) dodać usługę z szablonu (np. "Masaż") → sprawdzić w DB, że `name`/`name_en`
   oba wypełnione poprawnie.
2. Przełączyć guest UI na `en`, otworzyć tę usługę (home "Polecamy" jeśli pinned, kategoria,
   detail) → nazwa/opis po angielsku.
3. Przełączyć guest UI na `pl` → nazwa/opis po polsku, niezmienione.
4. W panelu dodać usługę custom bez wypełniania pól EN → guest UI na `en` pokazuje PL fallback,
   nie pusty string.
5. Edytować istniejącą usługę z wypełnionym EN → pola EN w formularzu prefillowane poprawnie,
   zapis nie zeruje ich przypadkowo.

## Performance Considerations

Brak — dodanie dwóch nullable kolumn i jednego dodatkowego parametru do istniejących zapytań nie
wpływa na charakterystykę wydajności (te same indeksy, ten sam wzorzec `select`).

## Migration Notes

Migracja jest czysto addytywna (`ADD COLUMN ... NULL`) — brak backfillu, brak downtime, brak
zmiany istniejących wierszy. Rollback = `ALTER TABLE services DROP COLUMN name_en, DROP COLUMN
description_en;` jeśli kiedykolwiek potrzebny (nie przewidziano w scope, ale bezpieczny do
wykonania w dowolnym momencie bez utraty innych danych).

## References

- Change definition: `context/changes/s2-11/change.md`
- Session plan entry: `context/foundation/session-plan.md:130-134`
- Odroczona decyzja z S2.3: `context/changes/s2-3/plan.md:36`
- Architektura dwuwarstwowa: `implementation_roadmap.md:378`
- R4 (auto-translate, otwarte): `implementation_roadmap.md:771`
- Similar server-side getTranslations usage: `app/[locale]/(guest)/c/[category]/[service]/page.tsx:8,28`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Migracja SQL + regenerowane typy

#### Automated

- [x] 1.1 Migracja aplikuje się bez błędu: `supabase db push`
- [x] 1.2 Typy się kompilują: `npm run typecheck`

#### Manual

- [x] 1.3 `select name_en, description_en from services limit 1;` zwraca kolumny

### Phase 2: Guest read — locale-aware z fallbackiem

#### Automated

- [x] 2.1 Unit testy `lib/guest/__tests__/services.test.ts` przechodzą — fed3ba8
- [x] 2.2 Type checking passes — fed3ba8
- [x] 2.3 Linting passes — fed3ba8

#### Manual

- [x] 2.4 Usługa z `name_en` pokazuje EN na guest UI `en` — 206a3bc
- [x] 2.5 Usługa bez `name_en` pokazuje PL fallback na `en` — 206a3bc
- [x] 2.6 Guest UI na `pl` zawsze pokazuje PL — 206a3bc

### Phase 3: Panel — manualne pola EN w formularzu usługi

#### Automated

- [x] 3.1 Type checking passes — 8d5c337
- [x] 3.2 Linting passes — 8d5c337
- [x] 3.3 Existing action tests still pass — 8d5c337

#### Manual

- [x] 3.4 Dodanie custom usługi z EN zapisuje kolumny poprawnie — 8d5c337
- [x] 3.5 Edycja usługi z EN prefilluje pola poprawnie — 8d5c337
- [x] 3.6 Puste pola EN zapisują `null`, nie pusty string — 8d5c337

### Phase 4: Template fill — oba języki naraz, resolved server-side

#### Automated

- [x] 4.1 Nowy test `createServiceFromTemplate` z mockowanym `getTranslations` przechodzi — 206a3bc
- [x] 4.2 Type checking passes — 206a3bc
- [x] 4.3 Linting passes — 206a3bc

#### Manual

- [x] 4.4 Dodanie z szablonu w PL zapisuje poprawne PL i EN — 206a3bc
- [x] 4.5 Guest UI pokazuje poprawny język dla usługi z szablonu — 206a3bc
- [x] 4.6 Wynik idempotentny względem locale panelu (PL vs EN panel daje ten sam zapis) — 206a3bc
