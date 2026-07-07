# Baza wiedzy AI — FAQ editor (Moduł 3) Implementation Plan

## Overview

Sesja S2.4 dostarcza panelowi hotelowemu edytor bazy wiedzy AI concierge: CRUD Q&A (pytanie/odpowiedź) zapisywanych do `knowledge_chunks`, bibliotekę 5 gotowych szablonów FAQ (godziny, parking, WiFi, checkout, zwierzęta), sekcję „Okolica" (wolny tekst) oraz `content_hash` przeliczany przy każdej zmianie treści. To ostatni z trzech równoległych modułów operacyjnych panelu (obok S2.3 Usługi, S2.5 QR) blokujących S3.1 (interfejs gościa) i bezpośrednio odblokowujący Fazę 4 (S4.1 kompozytor KB konsumuje te dane).

## Current State Analysis

- Tabela `knowledge_chunks` już istnieje w pełni (`supabase/migrations/20260626000001_initial_schema.sql:159-171`): `category`, `question`, `content`, `language` (default `'pl'`), `valid_from`, `valid_until`, `content_hash`, `embedding` (uśpione MVP). Indeksy `(property_id)` i `(property_id, category)` już istnieją (`:241-242`). **Żadna migracja schematu nie jest potrzebna.**
- RLS już istnieje: `guest_read_knowledge_chunks` (current_setting pattern, `supabase/migrations/20260626000002_rls_policies.sql:73-76`) i `staff_all_knowledge_chunks` (FOR ALL, `auth.uid()` → `hotel_users` join, `:182-190`).
- RBAC: zasób `knowledge` już zdefiniowany w macierzy (`lib/panel/rbac.ts:25`): owner/admin=`full`, staff=`write`, viewer=`read`. Test macierzy już pokrywa to (`lib/panel/__tests__/rbac.test.ts`) — nie wymaga zmian.
- `readiness.ts:33-38` już liczy `knowledgeChunksCount > 0` — S2.4 nie modyfikuje readiness, tylko dostarcza dane, które ten kod już konsumuje.
- Krok wizardu „knowledge" istnieje jako placeholder: `lib/panel/onboarding-steps.ts:11` ma `interactive: false`.
- Wzorzec z S2.3 do powielenia 1:1: `lib/panel/service-categories.ts` + `service-templates.ts` (stałe + biblioteka), `lib/panel/service-validation.ts` (czysta logika walidacji, testowalna bez Supabase), `app/[locale]/(hotel)/services/actions.ts` (`'use server'`, `getHotelUser()` → `canPerform()` gate → walidacja → mutacja `.eq('property_id', ...)` → `revalidatePath`), `app/[locale]/(hotel)/services/{page,service-list,service-form,template-picker}.tsx`, `app/[locale]/(hotel)/onboarding/services-step.tsx` + wiring w `onboarding/page.tsx:47-56,71-72`.
- `supabase/tests/s2_3_services_staff_isolation.sql` to bezpośredni wzorzec dla nowego testu izolacji zapisu `staff_all_knowledge_chunks` — seeduje dwa property, symuluje `auth.uid()` przez `set_config('request.jwt.claims', ...)` + `SET LOCAL ROLE authenticated`, w transakcji z `ROLLBACK`.
- Brak żadnego prior art dla `content_hash` w kodzie (`grep` na `content_hash`/`contentHash` zwraca tylko wygenerowane typy w `database.types.ts`) — to jedyny nowy element bez wzorca do skopiowania.
- Brak istniejącej zależności do hashowania — Node.js wbudowany moduł `crypto` (`createHash('sha256')`) wystarcza, zero nowych pakietów.

### Key Discoveries:

- W przeciwieństwie do `services` (zasób RBAC `write`, nigdy hard DELETE — decyzja offboardingowa z Modułu 6), `knowledge` w S2.4 dopuszcza prawdziwy DELETE — potwierdzone HITL tej sesji: brak kolumny `is_active` w schemacie `knowledge_chunks`, a scope S2.4 explicite wymienia „delete".
- Kolumna `category` to `TEXT` bez ENUM (jak `services.category`) — S2.4 ogranicza się do dwóch wartości: `'faq'` (Q&A editor) i `'local'` (sekcja Okolica, `question = NULL`). Wartości `'restaurant'`/`'services'`/`'policies'` z §6.1 roadmapy należą do przyszłych sesji (menu, polityki) i nie są wystawione w tym UI.
- `language` jest realną kolumną konsumowaną przez S4.1/S4.2 (kompozycja KB per język sesji) — musi być wystawiona w formularzu (select `pl`/`en`, default `pl`), inaczej cała KB zostałaby trwale jednojęzyczna bez jasnego właściciela problemu w przyszłości.

## Desired End State

Staff/Admin/Owner może w panelu (`/[locale]/(hotel)/knowledge`) zobaczyć listę wpisów FAQ swojego hotelu, dodać wpis z biblioteki 5 szablonów lub od zera, edytować pytanie/odpowiedź/kategorię/język/okno ważności, usunąć wpis oraz zarządzać osobną sekcją „Okolica" (jeden lub więcej wolnych tekstów, `category='local'`). Każdy zapis (insert/update) przelicza `content_hash` z pola `content` (SHA-256). Viewer widzi listę w trybie tylko-do-odczytu. Krok „Baza wiedzy" w wizardzie onboardingowym jest interaktywny. Weryfikacja:
- `npm run test` — testy jednostkowe walidacji i hasha przechodzą.
- `psql "$DATABASE_URL" -f supabase/tests/s2_4_knowledge_staff_isolation.sql` — staff property A nie widzi/nie modyfikuje/nie usuwa wpisów property B.
- Manualnie: zalogowany jako staff, dodanie FAQ z szablonu → widoczne na liście z content_hash; edycja treści → hash się zmienia; usunięcie wpisu znika z listy; ustawienie `valid_from/until` zapisuje się poprawnie.

## What We're NOT Doing

- Tabela `knowledge_chunk_templates` w bazie danych — szablony to statyczna stała w kodzie, jak `SERVICE_TEMPLATES`.
- Aktywacja `embedding`/RAG/chunking — jawnie poza scope MVP (HITL #12, §6.5 roadmapy „POST-MVP"), kolumna zostaje `NULL`.
- Kompozytor KB, cache Redis, invalidacja przy zmianie hasha na poziomie całej property — to S4.1 (Faza 4), poza scope tej sesji. S2.4 dostarcza tylko poprawny `content_hash` per wiersz, który S4.1 skonsumuje.
- Seeding inicjalny ze strony www przez team platformy (HITL #4, płatna opcja) — poza scope developerskim tej sesji.
- Auto-tłumaczenie PL→EN treści — odroczone (COULD, §11.2 roadmapy), poza zakresem S2.4; brak logiki tłumaczenia, tylko ręczny wybór `language` per wpis.
- Dedykowana kolumna `properties.local_area_info` — „Okolica" żyje w `knowledge_chunks` jak każdy inny wpis (`category='local'`), zgodnie z modelem kompozytora KB z §6.1.
- Podkategorie w obrębie FAQ (np. `faq_hours`, `faq_parking`) — płaska kategoria `'faq'`, zgodnie z §6.1 (kompozytor grupuje po `FAQ→usługi→menu→polityki→okolica`, nie po podtypach).
- Soft-delete / kolumna `is_active` na `knowledge_chunks` — prawdziwy DELETE, brak potrzeby przywracania wpisów FAQ.

## Implementation Approach

Trzy fazy w kolejności zależności, powielające strukturę S2.3: (1) dane statyczne (kategorie, 5 szablonów FAQ, util hashujący) + i18n jako fundament niewymagający decyzji projektowych, (2) logika serwerowa (server actions CRUD + walidacja + hash + testy RLS) jako warstwa, którą UI będzie konsumować, (3) UI panelu (lista Q&A + sekcja Okolica + template picker) + wpięcie w wizard.

## Phase 1: Biblioteka szablonów FAQ + kategorie + util hashujący + i18n

### Overview

Fundament danych: stała lista dwóch kategorii wystawionych w UI (`faq`, `local`), statyczna lista 5 szablonów FAQ, czysta funkcja `computeContentHash`, oraz klucze tłumaczeń PL/EN dla nowego modułu.

### Changes Required:

#### 1. Stałe kategorii wpisów wiedzy

**File**: `lib/panel/knowledge-categories.ts`

**Intent**: Zdefiniować listę kategorii wystawionych w edytorze panelu — `faq` (Q&A) i `local` (Okolica) — analogicznie do `SERVICE_CATEGORIES`, ale ograniczoną do dwóch wartości zgodnie z decyzją tej sesji (pozostałe kategorie z §6.1 roadmapy należą do przyszłych sesji).

**Contract**: Eksportuje `KNOWLEDGE_CATEGORIES` jako tablicę `['faq', 'local']` plus typ `KnowledgeCategory`. Wartości muszą być stabilne (kolumna `category` typu `TEXT`, brak migracji).

#### 2. Biblioteka szablonów FAQ

**File**: `lib/panel/faq-templates.ts`

**Intent**: Statyczna lista dokładnie 5 szablonów FAQ z §4.1 Modułu 3: godziny (check-in/out), parking, WiFi, checkout, zwierzęta — każdy jako gotowa para pytanie+odpowiedź.

**Contract**: Eksportuje `FAQ_TEMPLATES: FaqTemplate[]` gdzie `FaqTemplate = { key: string, questionKey: string, contentKey: string }`. `questionKey`/`contentKey` wskazują na klucze i18n (wzorzec `nameKey`/`descriptionKey` z `ServiceTemplate`) — treść szablonu dostępna po PL i EN dla UI wyboru, ale po dodaniu trafia jako zwykły `TEXT` (edytowalny, bez i18n po insercie).

#### 3. Util przeliczania content_hash

**File**: `lib/panel/knowledge-hash.ts`

**Intent**: Czysta funkcja licząca SHA-256 z pola `content`, wywoływana przez server actions przy każdym insert/update wpisu wiedzy.

**Contract**: Eksportuje `computeContentHash(content: string): string` — `crypto.createHash('sha256').update(content, 'utf8').digest('hex')` (Node.js wbudowany `crypto`, zero nowych zależności). Deterministyczna, bez efektów ubocznych — testowalna w Vitest bez mocków.

#### 4. Klucze tłumaczeń

**File**: `messages/pl.json`, `messages/en.json`

**Intent**: Dodać namespace `knowledge` (lista, formularz, sekcja okolica, akcje, błędy) oraz `faqTemplates` (pytania/odpowiedzi szablonów z pkt 2) w obu plikach, mirror struktura 1:1 z `services.*`. Odblokować label kroku wizardu — już istnieje (`onboarding.steps.knowledge`), nie wymaga zmian.

**Contract**: Klucze pod `knowledge.list.*`, `knowledge.form.fields.*` (question, content, category, language, validFrom, validUntil), `knowledge.form.actions.*` (w tym `delete` + potwierdzenie), `knowledge.form.errors.*` (w tym `errors.invalidDateRange` dla `valid_from > valid_until`), `knowledge.local.*` (sekcja Okolica — osobny label bez pola „pytanie"), `faqTemplates.<template_key>.question` / `.content`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- `messages/pl.json` i `messages/en.json` mają identyczną strukturę kluczy dla nowych namespace'ów (weryfikacja manualna diff kluczy, brak dedykowanego automatu w projekcie)

#### Manual Verification:

- Import `FAQ_TEMPLATES` i `KNOWLEDGE_CATEGORIES` w REPL/testowym pliku potwierdza dokładnie 5 szablonów i 2 kategorie
- `computeContentHash('test')` zwraca stały, deterministyczny hex string (64 znaki, SHA-256)

---

## Phase 2: Server actions CRUD + hash + testy

### Overview

Logika biznesowa: server actions do tworzenia (z szablonu FAQ lub od zera), edycji, usuwania wpisów Q&A oraz osobnej ścieżki dla sekcji Okolica — wszystkie przeliczające `content_hash` przy zapisie treści. Rozszerzenie pokrycia testowego o izolację zapisu staff (RLS) oraz testy jednostkowe walidacji i hasha.

### Changes Required:

#### 1. Walidacja czystej logiki

**File**: `lib/panel/knowledge-validation.ts`

**Intent**: Wydzielona czysta logika walidacji wejścia formularza (wzorzec `service-validation.ts`) — testowalna bez realnego klienta Supabase.

**Contract**: `validateKnowledgeInput(input: { question: string, content: string, category: string, language: string, validFromRaw: string, validUntilRaw: string }): { ok: true, value: {...} } | { ok: false, error: string }`. Reguły: `content` wymagane zawsze; `question` wymagane gdy `category === 'faq'`, ignorowane (zapisywane jako `null`) gdy `category === 'local'`; `category` musi być jedną z `KNOWLEDGE_CATEGORIES`; `language` musi być `'pl'` lub `'en'`; daty opcjonalne, parsowane jako `TIMESTAMPTZ`-zgodny ISO string, błąd `invalidDateRange` gdy oba podane i `validFrom > validUntil`.

#### 2. Server actions bazy wiedzy

**File**: `app/[locale]/(hotel)/knowledge/actions.ts`

**Intent**: Server actions podążające za wzorcem `services/actions.ts`: `createKnowledgeFromTemplate(formData)`, `createKnowledgeEntry(formData)` (obsługuje zarówno `faq` jak i `local` przez pole `category` z formularza), `updateKnowledgeEntry(formData)`, `deleteKnowledgeEntry(id)`. Każda zaczyna od `getHotelUser()` + `canPerform(role, 'knowledge', 'write')` gate.

**Contract**: `createKnowledgeEntry`/`updateKnowledgeEntry` wywołują `computeContentHash(content)` i zapisują wynik do kolumny `content_hash` przy każdym insert/update. Wszystkie mutacje `.eq('property_id', hotelUser.propertyId)` + `revalidatePath('/knowledge')` + `revalidatePath('/onboarding')` (readiness się zmienia). `deleteKnowledgeEntry(id)` wykonuje prawdziwe `DELETE FROM knowledge_chunks WHERE id = ... AND property_id = ...` (brak `is_active`, zgodnie z decyzją tej sesji).

#### 3. Test izolacji zapisu staff

**File**: `supabase/tests/s2_4_knowledge_staff_isolation.sql`

**Intent**: Nowy test (bezpośredni klon `s2_3_services_staff_isolation.sql`, zmienione nazwy tabel/kolumn) — potwierdza, że hotel_user property A nie widzi, nie może zaktualizować ani usunąć wpisu `knowledge_chunks` należącego do property B.

**Contract**: Ten sam wzorzec seedowania (`session_replication_role = 'replica'`, `set_config('request.jwt.claims', ...)`, `SET LOCAL ROLE authenticated`), w transakcji z `ROLLBACK`. Dodatkowa asercja (nowa względem S2.3, bo `knowledge` dopuszcza DELETE): `DELETE FROM knowledge_chunks WHERE id = <entry_b_id>` z JWT property A musi usunąć 0 wierszy.

#### 4. Testy jednostkowe walidacji i hasha

**File**: `lib/panel/__tests__/knowledge-validation.test.ts`, `lib/panel/__tests__/knowledge-hash.test.ts`

**Intent**: Pokryć czystą logikę walidacji (question required dla faq, opcjonalny dla local, zakres kategorii/języka, walidacja zakresu dat) oraz determinizm `computeContentHash`, analogicznie do `service-validation.test.ts`.

**Contract**: Testy importują `validateKnowledgeInput` i `computeContentHash` bez mocków Supabase. Przypadek kluczowy: te same dwa różne stringi `content` dają różne hashe; ten sam string daje ten sam hash.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test`
- Type checking passes: `npm run typecheck`
- RLS staff isolation test passes: `psql "$DATABASE_URL" -f supabase/tests/s2_4_knowledge_staff_isolation.sql`

#### Manual Verification:

- Utworzenie wpisu FAQ i odczyt `content_hash` z bazy potwierdza niepusty 64-znakowy hex string
- Edycja treści istniejącego wpisu zmienia `content_hash` na nową wartość

---

## Phase 3: UI panelu + wpięcie w wizard onboardingowy

### Overview

Strona `/knowledge` z listą Q&A, formularzem (dodaj z szablonu / dodaj własne / edytuj / usuń) i osobną sekcją „Okolica", plus odblokowanie kroku „Baza wiedzy" w wizardzie onboardingowym korzystające z tej samej logiki server actions.

### Changes Required:

#### 1. Strona bazy wiedzy

**File**: `app/[locale]/(hotel)/knowledge/page.tsx`

**Intent**: Server Component pobierający wpisy property, rozdzielający je na listę `faq` i listę `local` po stronie serwera, renderujący `<RequirePermission resource="knowledge" level="read">` wokół treści, oraz przekazujący `canPerform(role, 'knowledge', 'write')` jako flagę `canEdit`.

**Contract**: Route segment `app/[locale]/(hotel)/knowledge/` wewnątrz istniejącej route group `(hotel)`, dziedziczy auth guard z `app/[locale]/(hotel)/layout.tsx`.

#### 2. Komponenty klienckie: lista Q&A + formularz + template picker + sekcja Okolica

**File**: `app/[locale]/(hotel)/knowledge/knowledge-list.tsx`, `knowledge-form.tsx`, `faq-template-picker.tsx`, `local-area-section.tsx`

**Intent**: `knowledge-list.tsx` renderuje wpisy `category='faq'` z przyciskami edytuj/usuń (`useTransition`, wzorzec `service-list.tsx`), z potwierdzeniem przed `deleteKnowledgeEntry` (`window.confirm` lub prosty inline confirm — brak biblioteki modali w projekcie). `faq-template-picker.tsx` to lista `FAQ_TEMPLATES` z przyciskiem „Dodaj" wywołującym `createKnowledgeFromTemplate`. `knowledge-form.tsx` to formularz add-custom/edit dla `category='faq'`: pola question, content, language (select pl/en), valid_from/valid_until (date input, opcjonalne). `local-area-section.tsx` to uproszczony formularz dla `category='local'` bez pola question.

**Contract**: Surowy HTML + `useState`/`useTransition`, brak nowych zależności. Błędy z server action renderowane przez `t(\`errors.${result.error}\`)` jak w `service-form.tsx`.

#### 3. Odblokowanie kroku wizardu

**File**: `lib/panel/onboarding-steps.ts`, `app/[locale]/(hotel)/onboarding/page.tsx`, `app/[locale]/(hotel)/onboarding/knowledge-step.tsx`

**Intent**: Zmienić `interactive: false` → `true` dla kroku `knowledge` (linia 11). Krok w wizardzie renderuje uproszczoną wersję (`faq-template-picker.tsx` + skrócona lista wpisów FAQ) osadzoną w `OnboardingWizardShell`, wzorem `services-step.tsx`.

**Contract**: `onboarding/page.tsx` przy `?step=knowledge` renderuje nowy komponent kroku zamiast obecnego `t('comingSoon')` fallbacku (linia 74), analogicznie do bloku `activeStepKey === 'services'` (linie 71-72) — dodaje pobranie `knowledge_chunks` (`category='faq'`) i przekazanie do `KnowledgeStep`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Unit tests pass: `npm run test`

#### Manual Verification:

- Staff loguje się do panelu, przechodzi do `/knowledge`, dodaje wpis FAQ z szablonu — widoczny na liście z poprawną kategorią
- Edycja treści wpisu FAQ zmienia `content_hash` w bazie (widoczne przez zapytanie SQL lub REPL)
- Usunięcie wpisu FAQ znika z listy natychmiast (revalidation), potwierdzone brakiem wiersza w bazie
- Dodanie/edycja wpisu „Okolica" działa niezależnie od listy FAQ, bez pola „pytanie"
- Ustawienie `valid_from`/`valid_until` na wpisie zapisuje się i jest widoczne po odświeżeniu
- Viewer wchodzi na `/knowledge` — widzi listę, nie widzi przycisków edycji/dodawania/usuwania
- W wizardzie onboardingowym krok „Baza wiedzy" jest klikalny (nie „Wkrótce"); po dodaniu ≥1 wpisu FAQ pasek gotowości hotelu rośnie o 25 p.p. (zgodnie z `readiness.ts:33-38`)

---

## Testing Strategy

### Unit Tests:

- Walidacja wejścia (`validateKnowledgeInput`): question required dla `faq`, opcjonalny/ignorowany dla `local`; category/language w zamkniętych listach; `validFrom > validUntil` odrzucone
- Determinizm i wrażliwość `computeContentHash`: ten sam content → ten sam hash; różny content → różny hash

### Integration Tests:

- `s2_4_knowledge_staff_isolation.sql`: staff property A nie czyta/nie zapisuje/nie usuwa wpisów property B

### Manual Testing Steps:

1. Zalogować się jako `staff` property A, dodać wpis FAQ z szablonu, zweryfikować że pojawia się tylko dla property A
2. Zmienić treść istniejącego wpisu i potwierdzić zmianę `content_hash` w bazie
3. Usunąć wpis FAQ i potwierdzić jego zniknięcie z listy i z bazy
4. Dodać wpis „Okolica" i potwierdzić że nie wymaga pola „pytanie"
5. Ustawić `valid_from`/`valid_until` na wpisie sezonowym i potwierdzić zapis
6. Zalogować się jako `viewer` — potwierdzić brak przycisków edycji/usuwania na `/knowledge`
7. W wizardzie onboardingowym dodać ≥1 wpis FAQ z szablonu — potwierdzić wzrost `readinessPercentage` o 25 p.p.

## Performance Considerations

Brak nowych wzorców zapytań poza standardowym `SELECT ... WHERE property_id = ...` już zaindeksowanym (`knowledge_chunks (property_id)`, `(property_id, category)`, `20260626000001_initial_schema.sql:241-242`).

## Migration Notes

Brak nowej migracji SQL — schemat `knowledge_chunks` i polityki RLS już istnieją od S0.2. Jedyna zmiana danych to nowy plik testowy SQL (nie migracja).

## References

- Roadmap: `context/foundation/implementation_roadmap.md` §4.1 Moduł 3, §6.1 (architektura KB, kompozytor), §6.4 (co hotel musi dostarczyć)
- Session plan: `context/foundation/session-plan.md` S2.4 (linia 90-93)
- Wzorzec S2.3: `app/[locale]/(hotel)/services/{actions,page,service-list,service-form,template-picker}.tsx`, `lib/panel/service-{categories,templates,validation}.ts`, `supabase/tests/s2_3_services_staff_isolation.sql`
- RLS: `supabase/migrations/20260626000002_rls_policies.sql:73-76` (`guest_read_knowledge_chunks`), `:182-190` (`staff_all_knowledge_chunks`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Biblioteka szablonów FAQ + kategorie + util hashujący + i18n

#### Automated

- [x] 1.1 Type checking passes: `npm run typecheck` — edb93c3
- [x] 1.2 Linting passes: `npm run lint` — edb93c3
- [x] 1.3 `messages/pl.json` i `messages/en.json` mają identyczną strukturę kluczy — edb93c3

#### Manual

- [x] 1.4 Import `FAQ_TEMPLATES`/`KNOWLEDGE_CATEGORIES` potwierdza dokładnie 5 szablonów, 2 kategorie — edb93c3
- [x] 1.5 `computeContentHash` zwraca deterministyczny 64-znakowy hex string — edb93c3

### Phase 2: Server actions CRUD + hash + testy

#### Automated

- [x] 2.1 Unit tests pass: `npm run test` — 0bf65d0
- [x] 2.2 Type checking passes: `npm run typecheck` — 0bf65d0
- [x] 2.3 RLS staff isolation test passes: `psql -f supabase/tests/s2_4_knowledge_staff_isolation.sql` — 0bf65d0

#### Manual

- [x] 2.4 Utworzenie wpisu FAQ potwierdza niepusty `content_hash` w bazie
- [x] 2.5 Edycja treści zmienia `content_hash` na nową wartość

### Phase 3: UI panelu + wpięcie w wizard onboardingowy

#### Automated

- [x] 3.1 Type checking passes: `npm run typecheck`
- [x] 3.2 Linting passes: `npm run lint`
- [x] 3.3 Unit tests pass: `npm run test`

#### Manual

- [x] 3.4 Staff dodaje wpis FAQ z szablonu — widoczny na liście z poprawną kategorią
- [x] 3.5 Edycja treści zmienia `content_hash` w bazie (widoczne przez SQL/REPL)
- [x] 3.6 Usunięcie wpisu FAQ znika z listy i z bazy
- [x] 3.7 Dodanie/edycja wpisu „Okolica" działa bez pola „pytanie"
- [x] 3.8 `valid_from`/`valid_until` zapisuje się i jest widoczne po odświeżeniu
- [x] 3.9 Viewer widzi listę, nie widzi przycisków edycji/dodawania/usuwania
- [x] 3.10 Krok „Baza wiedzy" w wizardzie klikalny; dodanie ≥1 wpisu podnosi gotowość o 25 p.p.
