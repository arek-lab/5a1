# Self-service signup ownera + konta hotelu — Implementation Plan

## Overview

Nowy formularz self-service signup pod `/[locale]/(hotel-auth)/signup`, który tworzy pierwszego ownera hotelu bez ingerencji service-role seed/testów. Klient wywołuje `supabase.auth.signUp(...)`, a server action woła nową `SECURITY DEFINER` funkcję Postgres `create_hotel_and_owner(...)`, która atomowo wstawia wiersz `properties` (`setup_completed=false`, `dpa_signed_at=NULL`) i wiersz `hotel_users` (`role='owner'`, `status='active'`). Wzorzec RPC i konwencja błędów kopiują istniejącą `transfer_hotel_ownership_fn.sql` (S2.7).

## Current State Analysis

- Jedyny dziś sposób powstania `properties`+`hotel_users` (owner) to ręczny insert przez `service_role` (seed/testy) — brak ścieżki UI.
- `app/[locale]/(hotel)/users/actions.ts` obsługuje wyłącznie zapraszanie *kolejnych* userów przez istniejącego ownera (`inviteUser`, `transferOwnership`) — zakłada, że przynajmniej jeden owner już istnieje.
- RLS na `hotel_users` (INSERT, `20260708000002_hotel_users_rbac_rls.sql`) wymaga, by wstawiający `auth.uid()` był już owner/admin danego `property_id` — nie da się więc wstawić pierwszego ownera przez zwykły authenticated insert. To samo dotyczy `properties` (brak polityki INSERT dla `authenticated`/`anon`).
- Brak `middleware.ts` w repo — auth gating jest per-page przez `getHotelUser()` (`lib/panel/auth.ts`). Nowa strona signup podąża za tym samym wzorcem, nie zakłada centralnego middleware.
- Brak zod/validatora w repo — walidacja dziś to HTML5 `minLength` + unikalne constrainty DB. Styl ręcznej walidacji istnieje w `lib/panel/service-validation.ts` (funkcja zwracająca `{ok:true,value}|{ok:false,error}`).
- Rate limiting na Upstash już istnieje dla `/api/scan/*` (`lib/rate-limit/scan.ts`, `lib/rate-limit/client.ts`) — brak odpowiednika dla signupu.
- Wzorzec testu integracyjnego z aktywnym RLS: `lib/panel/__tests__/it-5.test.ts` — seed przez service-role w `beforeAll`, wywołanie akcji, asercja na DB, cleanup w `afterAll`.

## Desired End State

Nowy hotel + owner powstają wyłącznie przez UI signup (email, hasło, nazwa hotelu). Po sukcesie: `auth.users` (Supabase Auth, wymaga potwierdzenia emaila jak dziś), `properties` (`setup_completed=false`, `dpa_signed_at=NULL`) i `hotel_users` (`role='owner'`, `status='active'`, `auth_user_id` ustawiony) istnieją atomowo. Pod aktywnym RLS nowy property jest widoczny wyłącznie nowemu ownerowi. Po zalogowaniu (po potwierdzeniu emaila) owner trafia na `/dashboard`, tak jak po zwykłym loginie.

### Key Discoveries:

- `transfer_hotel_ownership_fn.sql:1-34` — jedyny istniejący precedens atomowej funkcji wielotabelkowej: `SECURITY DEFINER`, `RAISE EXCEPTION '<code>: %'`, wołana przez `serviceRole.rpc(...)`, błąd parsowany po stronie JS przez `error.message.includes(...)` (`app/[locale]/(hotel)/users/actions.ts:162-170`).
- `properties.setup_completed` i `properties.dpa_signed_at` już istnieją w schemacie (`20260626000001_initial_schema.sql:29-43`) — zero migracji na te kolumny.
- `login/page.tsx:9-11` + `login-form.tsx` — wzorzec do skopiowania dla strony signup: server `page.tsx` guard + client form wołający Supabase Auth bezpośrednio, potem POST do API route/server action dla efektów ubocznych.
- `lib/rate-limit/scan.ts:6-28` — wzorzec fabryki limitera (`Ratelimit.slidingWindow`, prefiks, env-configurable max/window) do powielenia dla signupu.

## What We're NOT Doing

- DPA gate: signup NIE dodaje żadnego UI/logiki wokół `dpa_signed_at` — zostaje jak dziś, egzekwowane wyłącznie w S2.5 przy generowaniu QR.
- Kickoff call z CSM: brak integracji kalendarza/Calendly w kodzie — signup jest w pełni self-service, kickoff call (jeśli się odbywa) jest czysto operacyjny, poza aplikacją.
- Wybór roli przy signupie — zawsze `role='owner'` (HITL #3), brak UI do wyboru roli.
- Zod lub inna biblioteka walidacji — nowa zależność wykracza poza zakres tej sesji.
- Zmiana istniejącego `middleware`/centralnego auth gate — repo go nie ma i S2.8 go nie wprowadza.
- Ekran/flow rezerwacji kickoff call, ekran "welcome" dedykowany dla signupu — redirect idzie wprost do `/dashboard`.
- Multi-property / dodawanie kolejnego property do istniejącego ownera — jeden signup = jeden nowy property + jeden nowy owner.

## Implementation Approach

Trzy fazy w kolejności zależności: (1) baza — funkcja RPC + rate limiter, bo UI i test jej potrzebują; (2) UI signup wołające RPC; (3) test integracyjny z aktywnym RLS weryfikujący izolację nowego property. Kontrakt błędów RPC kopiuje 1:1 konwencję `transfer_hotel_ownership` dla spójności stylu w repo.

## Critical Implementation Details

**Timing potwierdzenia emaila:** `auth.signUp()` zwraca `user.id` natychmiast, niezależnie od tego, czy Supabase wymaga potwierdzenia emaila przed pierwszym logowaniem. Server action woła RPC `create_hotel_and_owner` od razu po udanym `signUp`, używając zwróconego `user.id` — nie czeka na potwierdzenie. Dzięki temu nie ma realnego "partial failure" wynikającego z niepotwierdzonego emaila: `hotel_users.auth_user_id` jest ustawiony od razu, a Supabase samo blokuje `signInWithPassword` dopóki email nie zostanie potwierdzony (istniejące zachowanie, bez zmian).

**Retry po nieudanym RPC:** jeśli RPC zawiedzie po udanym `signUp` (np. race na unikalność), użytkownik widzi błąd i może ponowić submit tego samego formularza z tym samym emailem/hasłem — `auth.signUp` na istniejący, niepotwierdzony email zwraca ten sam `user.id` zamiast błędu, więc retry naturalnie próbuje RPC ponownie dla tego samego `auth_user_id`. Nie implementujemy jawnego rollbacku (`admin.deleteUser`) — akceptowane ryzyko osieroconego `auth.users` bez `hotel_users`, udokumentowane tutaj, nie w kodzie.

## Phase 1: RPC `create_hotel_and_owner` + rate limiter

### Overview

Migracja SQL z atomową funkcją tworzącą `properties`+`hotel_users`, oraz nowy Upstash rate limiter dla endpointu signup.

### Changes Required:

#### 1. Migracja: funkcja `create_hotel_and_owner`

**Plik**: `supabase/migrations/<timestamp>_create_hotel_and_owner_fn.sql`

**Intencja**: Atomowa funkcja `SECURITY DEFINER`, która w jednej transakcji wstawia wiersz `properties` i wiersz `hotel_users(role='owner', status='active')` powiązany z podanym `auth_user_id`, omijając RLS (analogicznie do `transfer_hotel_ownership`, które też jest `SECURITY DEFINER` i modyfikuje `hotel_users` poza normalnym flow authenticated-insert).

**Kontrakt**: Sygnatura `create_hotel_and_owner(p_auth_user_id UUID, p_email TEXT, p_hotel_name TEXT) RETURNS UUID` (zwraca nowy `property_id`). Walidacje i błędy w konwencji `RAISE EXCEPTION '<code>: %'`:
- `p_hotel_name` puste/whitespace → `invalid_hotel_name: %`
- `p_email` już istnieje w `hotel_users` dla jakiegokolwiek property (globalna unikalność ownera na tym etapie, mimo że DB constraint jest per-property) → `email_taken: %` — sprawdzić explicit `SELECT EXISTS` przed insertem, bo `UNIQUE(property_id, email)` sam tego nie wymusi dla nowego `property_id`.
- Sukces: `INSERT INTO properties (name, setup_completed, dpa_signed_at) VALUES (p_hotel_name, false, NULL) RETURNING id` → `INSERT INTO hotel_users (property_id, auth_user_id, email, role, status) VALUES (new_property_id, p_auth_user_id, p_email, 'owner', 'active')` → `RETURN new_property_id`.
- `SET search_path = public` jak w `transfer_hotel_ownership_fn.sql`.

#### 2. Rate limiter signup

**Plik**: `lib/rate-limit/signup.ts`

**Intencja**: Ograniczyć próby signupu per-IP, żeby chronić przed masowym tworzeniem kont.

**Kontrakt**: Kopia wzorca z `lib/rate-limit/scan.ts` — `getSignupRatelimit()` singleton, `Ratelimit.slidingWindow`, prefiks `rl:signup`, limit domyślny 5 prób / 60 min, konfigurowalny przez `SIGNUP_RATE_LIMIT_MAX`/`SIGNUP_RATE_LIMIT_WINDOW` env vars. Eksportowana funkcja `checkSignupRateLimit(ip: string)` zwracająca ten sam kształt wyniku co `checkScanRateLimit`.

### Success Criteria:

#### Automated Verification:

- Migracja aplikuje się: `supabase db reset` (lub odpowiedni skrypt CI dla migracji) bez błędów
- Typecheck przechodzi: `npm run typecheck`
- Lint przechodzi: `npm run lint`

#### Manual Verification:

- Ręczne wywołanie `create_hotel_and_owner` przez SQL editor (Supabase Studio) z nowym `auth_user_id` tworzy oba wiersze atomowo
- Wywołanie z powtórzonym `p_email` zwraca błąd `email_taken`

---

## Phase 2: UI signup + server action

### Overview

Nowa strona `/[locale]/(hotel-auth)/signup` z formularzem (email, hasło, nazwa hotelu), która woła `auth.signUp` po stronie klienta, następnie server action wołający RPC z Fazy 1, z rate limitingiem i ręczną walidacją wejścia.

### Changes Required:

#### 1. Strona signup

**Plik**: `app/[locale]/(hotel-auth)/signup/page.tsx`

**Intencja**: Server Component guard — jeśli użytkownik jest już zalogowany jako `hotel_user`, redirect do `/dashboard` (ten sam wzorzec co `login/page.tsx:9-11`).

**Kontrakt**: Renderuje `<SignupForm />`.

#### 2. Formularz signup (client)

**Plik**: `app/[locale]/(hotel-auth)/signup/signup-form.tsx`

**Intencja**: `'use client'` formularz z polami email/hasło/nazwa hotelu; po submit woła `supabase.auth.signUp({email, password})` przez `createBrowserClient()`, następnie POST do nowej server action z `{authUserId, email, hotelName}`; po sukcesie `router.push('/dashboard')` (ten sam wzorzec co `login-form.tsx`).

**Kontrakt**: Walidacja client-side: email format (HTML5 `type="email"`), hasło `minLength={8}` (spójne z `accept-form.tsx:57`). Błędy z server action wyświetlane inline, w tym `email_taken` i `invalid_hotel_name` z tłumaczeniem PL/EN.

#### 3. Server action tworzenia hotelu

**Plik**: `app/[locale]/(hotel-auth)/signup/actions.ts`

**Intencja**: Otrzymuje `authUserId`, `email`, `hotelName` z formularza; sprawdza rate limit (IP z nagłówków requestu), waliduje `hotelName` ręcznie (niepuste, trim, max długość — styl `validateServiceInput` z `lib/panel/service-validation.ts`), woła `createServiceRoleClient().rpc('create_hotel_and_owner', {...})`, mapuje błędy RPC na kody błędów zwracane do klienta (`error.message.includes('email_taken')` → `{error: 'email_taken'}`, analogicznie do `transferOwnership` w `users/actions.ts:162-170`).

**Kontrakt**: Zwraca `{ok: true} | {ok: false, error: string}`. Nie ustawia `dpa_signed_at` (zostaje `NULL` z RPC).

### Success Criteria:

#### Automated Verification:

- Typecheck przechodzi: `npm run typecheck`
- Lint przechodzi: `npm run lint`
- Unit test walidacji `hotelName` przechodzi: `npm run test`

#### Manual Verification:

- Wypełnienie formularza signup tworzy konto, po potwierdzeniu emaila logowanie działa i przekierowuje do `/dashboard`
- Powtórna próba signupu z tym samym emailem pokazuje czytelny błąd
- Przekroczenie rate limitu (6. próba w oknie) pokazuje komunikat o zbyt wielu próbach

---

## Phase 3: Integracyjny test RLS

### Overview

Test analogiczny do `it-5.test.ts`, weryfikujący że nowo utworzony property jest widoczny wyłącznie nowemu ownerowi pod aktywnym RLS (nie service_role).

### Changes Required:

#### 1. Test integracyjny

**Plik**: `lib/panel/__tests__/it-signup.test.ts`

**Intencja**: Wywołać server action/RPC z Fazy 1-2 tworząc nowy property+owner, następnie zweryfikować przez klienta z aktywnym RLS (kontekst `auth.uid()` ustawiony na nowego ownera), że `SELECT * FROM properties` zwraca tylko ten property, a inny/istniejący property (seed w `beforeAll`, inny owner) nie jest widoczny.

**Kontrakt**: Struktura jak `it-5.test.ts`: `beforeAll` seeduje drugi, niepowiązany property+owner przez `createServiceRoleClient()`; test właściwy woła RPC `create_hotel_and_owner` bezpośrednio (nie przez HTTP, tak jak inne testy IT wołają akcje/RPC bezpośrednio); asercja na `hotel_users.role==='owner'`, `properties.setup_completed===false`, `properties.dpa_signed_at===null`; asercja izolacji przez query z RLS aktywnym (nie przez `service_role`); `afterAll` czyści oba property (`hotel_users` potem `properties`) i utworzonego `auth.users` (przez `service-role admin.deleteUser`, żeby nie zaśmiecać `auth.users` między przebiegami testów).

### Success Criteria:

#### Automated Verification:

- Test przechodzi: `npm run test -- it-signup`
- Cały test suite przechodzi: `npm run test`

#### Manual Verification:

- Ręczne potwierdzenie w Supabase Studio, że po uruchomieniu testu nie zostają osierocone wiersze w `auth.users`/`properties`/`hotel_users`

---

## Testing Strategy

### Unit Tests:

- Walidacja `hotelName` w server action (puste, whitespace, zbyt długie)
- Mapowanie kodów błędów RPC → komunikaty klienta

### Integration Tests:

- IT-signup (Faza 3): atomowość tworzenia property+owner + izolacja RLS

### Manual Testing Steps:

1. Otworzyć `/pl/signup`, wypełnić formularz nowym emailem/hasłem/nazwą hotelu, submit
2. Potwierdzić email (link z Supabase), zalogować się na `/pl/login`
3. Zweryfikować redirect do `/dashboard` i że widoczny jest tylko nowo utworzony hotel
4. Spróbować signup z tym samym emailem ponownie → oczekiwany czytelny błąd
5. Wykonać 6 prób signupu w krótkim czasie → 6. zablokowana przez rate limiter

## Performance Considerations

Brak nowych hotspotów — pojedynczy RPC call + jeden insert do Redis (rate limit check), zgodne z istniejącym wzorcem `/api/scan/*`.

## Migration Notes

Nie dotyczy — nowa funkcjonalność, brak istniejących danych do migrowania. `properties`/`hotel_users` powstałe wcześniej przez service-role seed (testy/manualne) pozostają nietknięte.

## References

- Powiązany zapis luki: `context/changes/s2-8/change.md`
- Wzorzec RPC: `supabase/migrations/20260708000003_transfer_hotel_ownership_fn.sql`
- Wzorzec błędów w akcji: `app/[locale]/(hotel)/users/actions.ts:162-170`
- Wzorzec UI logowania: `app/[locale]/(hotel-auth)/login/page.tsx`, `login/login-form.tsx`
- Wzorzec rate limitera: `lib/rate-limit/scan.ts`
- Wzorzec testu RLS: `lib/panel/__tests__/it-5.test.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: RPC `create_hotel_and_owner` + rate limiter

#### Automated

- [x] 1.1 Migracja aplikuje się: `supabase db reset` (wklejona i zaaplikowana w Supabase SQL Editor) — 2fd0a70
- [x] 1.2 Typecheck przechodzi: `npm run typecheck` — 2fd0a70
- [x] 1.3 Lint przechodzi: `npm run lint` (pre-istniejący błąd w qr-panel.tsx poza zakresem, patrz decyzja HITL) — 2fd0a70

#### Manual

- [x] 1.4 Ręczne wywołanie RPC tworzy oba wiersze atomowo — 2fd0a70
- [x] 1.5 Powtórzony email zwraca błąd `email_taken` — 2fd0a70

### Phase 2: UI signup + server action

#### Automated

- [x] 2.1 Typecheck przechodzi: `npm run typecheck` — f145ffb
- [x] 2.2 Lint przechodzi: `npm run lint` — f145ffb
- [x] 2.3 Unit test walidacji `hotelName` przechodzi: `npm run test` — f145ffb

#### Manual

- [x] 2.4 Formularz signup tworzy konto, po potwierdzeniu emaila logowanie przekierowuje do `/dashboard` — f145ffb
- [x] 2.5 Powtórna próba signupu z tym samym emailem pokazuje czytelny błąd — f145ffb
- [x] 2.6 Przekroczenie rate limitu pokazuje komunikat o zbyt wielu próbach — f145ffb

### Phase 3: Integracyjny test RLS

#### Automated

- [x] 3.1 Test przechodzi: `npm run test -- it-signup`
- [x] 3.2 Cały test suite przechodzi: `npm run test` (3 niepowiązane pre-istniejące błędy w `__tests__/proxy.test.ts` — `getClaims is not a function`, poza zakresem s2-8)

#### Manual

- [x] 3.3 Brak osieroconych wierszy w `auth.users`/`properties`/`hotel_users` po teście
