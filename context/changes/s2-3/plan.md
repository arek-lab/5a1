# Usługi: CRUD + biblioteka szablonów (Moduł 2) — Implementation Plan

## Overview

Sesja S2.3 dostarcza panelowi hotelowemu zarządzanie katalogiem usług: CRUD (nazwa, opis, cena/„Included", kategoria, aktywność), bibliotekę 15–20 gotowych szablonów do szybkiego startu oraz pinowanie do sekcji „Polecamy" (max 3, HITL #6). To pierwszy w pełni operacyjny moduł panelu po S2.2 (profil hotelu) — odblokowuje krok „usługi" w wizardzie onboardingowym i zasila DoD gotowości hotelu (`readiness.services` wymaga ≥3 aktywnych usług, już zaimplementowane w `lib/panel/readiness.ts:33`).

## Current State Analysis

- Tabela `services` już istnieje w pełni (`supabase/migrations/20260626000001_initial_schema.sql:126-141`): `template_key`, `name`, `description`, `category`, `price_cents`, `currency`, `image_url`, `is_active`, `is_pinned`, `available_from/to`. RLS włączone, polityka `staff_all_services` (FOR ALL, `auth.uid()` → `hotel_users` join, `supabase/migrations/20260626000002_rls_policies.sql:163-170`) i `guest_read_services` już istnieją — **żadna migracja schematu nie jest potrzebna**.
- RBAC: zasób `services` już zdefiniowany w macierzy (`lib/panel/rbac.ts:23`): owner/admin=`full`, staff=`write`, viewer=`read`. Test macierzy już istnieje (`lib/panel/__tests__/rbac.test.ts:21-36`) — nie wymaga zmian.
- Wzorzec server action + formularz z S2.2 (`app/[locale]/(hotel)/onboarding/actions.ts`, `profile-step-form.tsx`): `getHotelUser()` → `canPerform()` gate → ręczna walidacja stringów (bez zod) → `createServerClient().from(...).update()` → `revalidatePath`. Klient: `'use client'`, `useState` + `useTransition`, brak bibliotek formularzy.
- Brak Supabase Storage w projekcie — `logo_url` w S2.2 to zwykły URL walidowany `new URL()`. Brak `components/ui` — wszystkie formularze to surowy HTML.
- Krok wizardu „usługi" istnieje jako placeholder: `lib/panel/onboarding-steps.ts:11` ma `interactive: false`.
- Test izolacji tenantów IT-3 (`supabase/tests/it3_tenant_isolation.sql`) pokrywa **odczyt gościa** (`anon` rola, wzorzec `current_setting`) dla 9 tabel w tym `services` — ale **nie** testuje izolacji zapisu przez staff (`staff_all_services`, oparta o `auth.uid()`), bo ta ścieżka nie istniała przed S2.3.

### Key Discoveries:

- `services` resource w RBAC ma dla staff poziom `write`, nie `full` (`lib/panel/rbac.ts:23`) — spójne z decyzją „tylko dezaktywacja, brak hard delete": wszystkie operacje CRUD w S2.3 to INSERT/UPDATE, nigdy DELETE, więc `write` wystarcza.
- `readiness.ts:33` już liczy `activeServicesCount >= 3` — S2.3 nie modyfikuje readiness, tylko dostarcza dane, które ten kod już konsumuje.
- Wzorzec ustawiania `auth.uid()` w testach SQL: Supabase czyta `auth.uid()` z GUC `request.jwt.claims->>'sub'`. Test S0.3 (`supabase/tests/dod_s0_3_jwt_claims.sql`) pokazuje wzorzec seedowania fixture'ów w transakcji z `session_replication_role = 'replica'` do ominięcia FK na `auth.users`.

## Desired End State

Staff/Admin/Owner może w panelu (`/[locale]/(hotel)/services`) zobaczyć listę usług swojego hotelu, dodać usługę z biblioteki szablonów lub od zera, edytować pola, przełączyć aktywność, przypiąć do „Polecamy" (max 3). Viewer widzi listę w trybie tylko-do-odczytu. Krok „usługi" w wizardzie onboardingowym jest interaktywny i pozwala aktywować usługi bez opuszczania wizardu. Weryfikacja:
- `npm run test` — testy jednostkowe walidacji przechodzą.
- `psql -f supabase/tests/s2_3_services_staff_isolation.sql` — staff property A nie widzi/nie modyfikuje usług property B.
- Manualnie: zalogowany jako staff, dodanie usługi z szablonu → widoczna na liście → toggle pin 4. usługi → błąd walidacji.

## What We're NOT Doing

- Upload plików do Supabase Storage dla zdjęcia usługi — `image_url` to pole tekstowe URL, spójne z `logo_url` z S2.2.
- Tabela `service_templates` w bazie danych — szablony to statyczna stała w kodzie.
- Hard DELETE usług — tylko `is_active` toggle (offboarding = dezaktywacja, nie usunięcie, zgodnie z filozofią §4.1 Moduł 6).
- DB-owy trigger/constraint wymuszający max 3 piny — walidacja w server action.
- Dowolne (free-text) kategorie usług — zamknięta lista 5 kategorii z §5.1 roadmapy, bo guest UI (S3.1) renderuje siatkę dokładnie tych kategorii.
- Auto-tłumaczenie PL→EN treści usług — odroczone jako R4 w roadmapie (§11.2), poza zakresem S2.3; `services` nie ma kolumn `name_en`/`description_en`.
- Dostępność godzinowa UI (`available_from/to`) — kolumny istnieją w schemacie, ale UI dla nich jest priorytetem COULD w roadmapie (§4.1 Moduł 2) i nie jest wymagane przez DoD S2.3.
- Zdjęcie usługi jako COULD — pole `image_url` wystawione jako opcjonalny input URL, ale bez dedykowanego UI podglądu/croppingu.

## Implementation Approach

Trzy fazy w kolejności zależności: (1) dane statyczne + i18n jako fundament niewymagający decyzji projektowych, (2) logika serwerowa (server actions + walidacja + testy RLS) jako warstwa, którą UI będzie konsumować, (3) UI panelu + wpięcie w wizard. Taka kolejność pozwala testować logikę biznesową (pin max-3, walidację pól) niezależnie od UI, zanim UI powstanie.

## Phase 1: Biblioteka szablonów + kategorie + i18n

### Overview

Fundament danych: statyczna lista 15–20 szablonów usług, stała lista 5 kategorii (zamknięta, zgodna z gridem guest UI), oraz klucze tłumaczeń PL/EN dla nowego modułu.

### Changes Required:

#### 1. Stałe kategorii usług

**File**: `lib/panel/service-categories.ts`

**Intent**: Zdefiniować zamkniętą listę 5 kategorii usług odpowiadających gridowi guest-UI (§5.1 roadmapy: Restauracja & Bar, Usługi pokojowe, Spa & Wellness, Transport, Informacje), używaną zarówno przez select w formularzu, jak i przez walidację server-side.

**Contract**: Eksportuje `SERVICE_CATEGORIES` jako tablicę stałych kluczy (np. `'restaurant' | 'room_service' | 'spa' | 'transport' | 'info'`) plus typ `ServiceCategory`. Klucze muszą być stabilne (używane jako wartość w kolumnie `category` typu `TEXT`, nie ENUM — brak migracji).

#### 2. Biblioteka szablonów usług

**File**: `lib/panel/service-templates.ts`

**Intent**: Statyczna lista 15–20 szablonów pogrupowanych po kategorii z §4.1 Modułu 2 (np. dla restauracji: śniadanie do pokoju, kolacja à la carte; dla spa: masaż, sauna; dla transportu: transfer lotniskowy, wynajem roweru; dla informacji: wczesne zameldowanie, późne wymeldowanie, itd. — dobrane tak, by pokryć wszystkie 5 kategorii z co najmniej 3 pozycjami każda).

**Contract**: Eksportuje `SERVICE_TEMPLATES: ServiceTemplate[]` gdzie `ServiceTemplate = { key: string, category: ServiceCategory, nameKey: string, descriptionKey: string, suggestedPriceCents: number | null }`. `nameKey`/`descriptionKey` wskazują na klucze i18n (nie surowy tekst) — treść szablonu musi być dostępna po PL i EN dla UI wyboru szablonu, ale po dodaniu do `services` trafia jako zwykły `TEXT` (bez i18n) zgodnie z „What We're NOT Doing".

#### 3. Klucze tłumaczeń

**File**: `messages/pl.json`, `messages/en.json`

**Intent**: Dodać namespace `services` (lista, formularz, akcje, błędy) oraz `serviceTemplates` (nazwy/opisy szablonów z pkt 2) w obu plikach, mirror strukturę 1:1 (zgodnie z konwencją z `onboarding.*`). Odblokować label kroku wizardu — już istnieje (`onboarding.steps.services`), nie wymaga zmian.

**Contract**: Klucze pod `services.list.*`, `services.form.fields.*`, `services.form.actions.*`, `services.form.errors.*` (w tym `errors.pinLimitExceeded` dla walidacji max-3), `services.categories.*` (etykiety 5 kategorii), `serviceTemplates.<template_key>.name` / `.description`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- `messages/pl.json` i `messages/en.json` mają identyczną strukturę kluczy dla nowych namespace'ów (weryfikacja manualna diff kluczy, brak dedykowanego automatu w projekcie)

#### Manual Verification:

- Import `SERVICE_TEMPLATES` i `SERVICE_CATEGORIES` w REPL/testowym pliku potwierdza min. 15 szablonów pokrywających wszystkie 5 kategorii

---

## Phase 2: Server actions CRUD + walidacja pin + testy

### Overview

Logika biznesowa: server actions do tworzenia (z szablonu lub od zera), edycji, przełączania aktywności i pinowania usług, z walidacją max-3 pin po stronie serwera. Rozszerzenie pokrycia testowego o izolację zapisu staff oraz testy jednostkowe walidacji.

### Changes Required:

#### 1. Server actions usług

**File**: `app/[locale]/(hotel)/services/actions.ts`

**Intent**: Cztery server actions podążające za wzorcem `saveHotelProfile` z S2.2: `createServiceFromTemplate(formData)`, `createCustomService(formData)`, `updateService(formData)`, `toggleServiceActive(id, isActive)`, `toggleServicePin(id, isPinned)`. Każda zaczyna od `getHotelUser()` + `canPerform(role, 'services', 'write')` gate.

**Contract**: `toggleServicePin` gdy `isPinned === true` musi policzyć `COUNT(*) FROM services WHERE property_id = ... AND is_pinned = true AND id != <bieżąca usługa>` przed zapisem; jeśli wynik ≥ 3, zwraca `{ error: 'pinLimitExceeded' }` bez wykonania UPDATE. Walidacja pól tworzenia/edycji: `name` wymagane, `category` musi być jedną z `SERVICE_CATEGORIES`, `price_cents` opcjonalne (puste = „Included"/NULL), musi być nieujemną liczbą całkowitą jeśli podane, `image_url` opcjonalne walidowane `new URL()` jak `logo_url` w S2.2. Wszystkie mutacje `.eq('property_id', hotelUser.propertyId)` + `revalidatePath('/services')` + `revalidatePath('/onboarding')` (readiness się zmienia).

#### 2. Rozszerzenie testu izolacji tenantów o zapis staff

**File**: `supabase/tests/s2_3_services_staff_isolation.sql`

**Intent**: Nowy test (analogiczny do `it3_tenant_isolation.sql`, ale weryfikujący ścieżkę `staff_all_services`, opartą o `auth.uid()`, a nie `current_setting`) — potwierdza, że hotel_user property A (rola `authenticated`) nie widzi ani nie może zaktualizować usługi należącej do property B.

**Contract**: Wzorzec z `dod_s0_3_jwt_claims.sql:16-18` (transakcja + `session_replication_role = 'replica'` do seedowania `hotel_users.auth_user_id` bez realnego `auth.users`). Symulacja `auth.uid()`:
```sql
PERFORM set_config('request.jwt.claims',
  json_build_object('sub', v_auth_user_id_a)::text, true);
SET LOCAL ROLE authenticated;
```
Asercje: `SELECT COUNT(*) FROM services WHERE id = <service_b_id>` = 0 (SELECT leak); `UPDATE services SET name = 'hacked' WHERE id = <service_b_id>` aktualizuje 0 wierszy (write leak). Test w transakcji z `ROLLBACK` na końcu, jak istniejące testy.

#### 3. Testy jednostkowe walidacji

**File**: `app/[locale]/(hotel)/services/__tests__/validation.test.ts` (lub `lib/panel/__tests__/service-validation.test.ts` jeśli walidacja zostanie wydzielona do `lib/panel/`)

**Intent**: Pokryć czystą logikę walidacji wyekstrahowaną z server action (pin limit, wymagane pola, zakres kategorii, walidacja ceny) — bez wywoływania realnego Supabase klienta, analogicznie do `lib/panel/__tests__/readiness.test.ts`.

**Contract**: Funkcje walidacyjne (np. `validateServiceInput`, `wouldExceedPinLimit`) muszą być eksportowalne z modułu niezależnego od `'use server'` (server actions same nie są łatwo testowalne w Vitest) — wydzielić czystą logikę do `lib/panel/service-validation.ts`, a `actions.ts` ją importuje.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test`
- Type checking passes: `npm run typecheck`
- RLS staff isolation test passes: `psql "$DATABASE_URL" -f supabase/tests/s2_3_services_staff_isolation.sql` (oczekiwany `RAISE NOTICE` sukcesu, brak `EXCEPTION`)

#### Manual Verification:

- Próba przypięcia 4. usługi w środowisku deweloperskim zwraca błąd walidacji, nie modyfikuje bazy

---

## Phase 3: UI panelu + wpięcie w wizard onboardingowy

### Overview

Strona `/services` z listą usług i formularzami (dodaj z szablonu / dodaj własną / edytuj), plus odblokowanie kroku „usługi" w wizardzie onboardingowym korzystające z tej samej logiki server actions.

### Changes Required:

#### 1. Strona listy usług

**File**: `app/[locale]/(hotel)/services/page.tsx`

**Intent**: Server Component pobierający usługi property (`createServerClient().from('services').select().eq('property_id', ...)`), renderujący `<RequirePermission resource="services" level="read">` (wzorzec z `components/panel/require-permission.tsx`) wokół listy, oraz przekazujący `canPerform(role, 'services', 'write')` do komponentu klienckiego jako flagę `canEdit` sterującą widocznością przycisków edycji (viewer widzi listę, nie widzi CRUD).

**Contract**: Route segment `app/[locale]/(hotel)/services/` wewnątrz istniejącej route group `(hotel)`, dziedziczy auth guard z `app/[locale]/(hotel)/layout.tsx`.

#### 2. Komponenty klienckie: lista + formularz + wybór szablonu

**File**: `app/[locale]/(hotel)/services/service-list.tsx`, `service-form.tsx`, `template-picker.tsx`

**Intent**: `service-list.tsx` renderuje usługi pogrupowane po kategorii z toggle'ami is_active/is_pinned (wywołującymi odpowiednie server actions przez `useTransition`, wzorzec z `profile-step-form.tsx:36-58`). `template-picker.tsx` to lista `SERVICE_TEMPLATES` z przyciskiem „Dodaj" wywołującym `createServiceFromTemplate`. `service-form.tsx` to formularz add-custom/edit, pola: name, description, category (select z `SERVICE_CATEGORIES`), price_cents (input number + checkbox/opcja „Included" mapowana na NULL), image_url.

**Contract**: Surowy HTML + `useState`/`useTransition`, brak nowych zależności (zgodnie z decyzją „dedykowany UI, bez `components/ui`"). Błędy z server action renderowane przez `t(\`errors.${result.error}\`)` jak w `profile-step-form.tsx:62`.

#### 3. Odblokowanie kroku wizardu

**File**: `lib/panel/onboarding-steps.ts`, `app/[locale]/(hotel)/onboarding/page.tsx`

**Intent**: Zmienić `interactive: false` → `true` dla kroku `services` (linia 11). Krok w wizardzie renderuje uproszczoną wersję (`template-picker.tsx` + skrócona lista aktywnych usług) osadzoną w `OnboardingWizardShell`, reużywając te same server actions co pełna strona `/services`.

**Contract**: `onboarding/page.tsx` przy `?step=services` renderuje nowy komponent kroku (np. `services-step.tsx`) zamiast obecnego domyślnego/pustego renderowania dla kroków `interactive: false`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Unit tests pass: `npm run test`

#### Manual Verification:

- Staff loguje się do panelu, przechodzi do `/services`, dodaje usługę z szablonu — widoczna na liście z poprawną kategorią
- Przypięcie 3 usług do „Polecamy" się udaje, 4. zwraca błąd widoczny w UI
- Toggle `is_active` na usłudze aktualizuje listę bez przeładowania strony (revalidation)
- Viewer wchodzi na `/services` — widzi listę, nie widzi przycisków edycji/dodawania
- W wizardzie onboardingowym krok „Usługi" jest klikalny (nie „Wkrótce"); po aktywowaniu ≥3 usług pasek gotowości hotelu rośnie o 25 p.p. (zgodnie z `readiness.ts:33-38`)

---

## Testing Strategy

### Unit Tests:

- Walidacja pól usługi (name required, category w zamkniętej liście, price_cents nieujemny/NULL)
- Logika limitu pin (`wouldExceedPinLimit`): 0→3 piny OK, 4. odrzucony, edycja istniejącego pinned service (bez zmiany liczby) dozwolona

### Integration Tests:

- `s2_3_services_staff_isolation.sql`: staff property A nie czyta/nie zapisuje usług property B

### Manual Testing Steps:

1. Zalogować się jako `staff` property A, dodać usługę z szablonu, zweryfikować że pojawia się tylko dla property A
2. Przypiąć 3 usługi, spróbować przypiąć 4. — oczekiwany błąd walidacji w UI
3. Zalogować się jako `viewer` — potwierdzić brak przycisków edycji na `/services`
4. W wizardzie onboardingowym aktywować ≥3 usługi z szablonów — potwierdzić wzrost `readinessPercentage` o 25 p.p.

## Performance Considerations

Brak nowych wzorców zapytań poza standardowym `SELECT ... WHERE property_id = ...` już zaindeksowanym (`services (property_id, category, is_active)`, `20260626000001_initial_schema.sql:233`) — lista usług i liczenie pinów mieszczą się w istniejących indeksach.

## Migration Notes

Brak nowej migracji SQL — schemat `services` i polityki RLS już istnieją od S0.2. Jedyna zmiana danych to nowy plik testowy SQL (nie migracja).

## References

- Roadmap: `context/foundation/implementation_roadmap.md` §4.1 Moduł 2, §5.1 (kategorie guest UI), HITL #6 (`context/archive/decisions_log.md:265-271`)
- Session plan: `context/foundation/session-plan.md` S2.3 (linia 85-88)
- Wzorzec S2.2: `app/[locale]/(hotel)/onboarding/actions.ts`, `profile-step-form.tsx`, `components/panel/onboarding-wizard-shell.tsx`
- RLS: `supabase/migrations/20260626000002_rls_policies.sql:163-170` (`staff_all_services`), `:69-71` (`guest_read_services`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Biblioteka szablonów + kategorie + i18n

#### Automated

- [x] 1.1 Type checking passes: `npm run typecheck` — d7ebdba
- [x] 1.2 Linting passes: `npm run lint` — d7ebdba
- [x] 1.3 `messages/pl.json` i `messages/en.json` mają identyczną strukturę kluczy — d7ebdba

#### Manual

- [x] 1.4 Import `SERVICE_TEMPLATES`/`SERVICE_CATEGORIES` potwierdza min. 15 szablonów, 5 kategorii pokrytych — d7ebdba

### Phase 2: Server actions CRUD + walidacja pin + testy

#### Automated

- [x] 2.1 Unit tests pass: `npm run test` — 82e6d26
- [x] 2.2 Type checking passes: `npm run typecheck` — 82e6d26
- [x] 2.3 RLS staff isolation test passes: `psql -f supabase/tests/s2_3_services_staff_isolation.sql` — 82e6d26

#### Manual

- [x] 2.4 Próba przypięcia 4. usługi zwraca błąd walidacji, nie modyfikuje bazy

### Phase 3: UI panelu + wpięcie w wizard onboardingowy

#### Automated

- [x] 3.1 Type checking passes: `npm run typecheck`
- [x] 3.2 Linting passes: `npm run lint`
- [x] 3.3 Unit tests pass: `npm run test`

#### Manual

- [x] 3.4 Staff dodaje usługę z szablonu — widoczna na liście z poprawną kategorią
- [x] 3.5 Przypięcie 3 usług OK, 4. zwraca błąd w UI
- [x] 3.6 Toggle `is_active` aktualizuje listę bez przeładowania strony
- [x] 3.7 Viewer widzi listę, nie widzi przycisków edycji
- [x] 3.8 Krok „Usługi" w wizardzie klikalny; aktywacja ≥3 usług podnosi gotowość o 25 p.p.
