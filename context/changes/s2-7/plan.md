# Użytkownicy panelu i offboarding (S2.7) — Implementation Plan

## Overview

S2.7 buduje Moduł 6 (§4.1) panelu hotelowego: zapraszanie nowych użytkowników (Owner/Admin), zarządzanie ich rolami, dezaktywację (nigdy DELETE), transfer ownership wymuszony przed dezaktywacją ostatniego Ownera (HITL #3), oraz IT-5. RBAC (S2.1) już ma gotowe zasoby `users`/`transfer_ownership` w `lib/panel/rbac.ts` — ta sesja konsumuje istniejącą macierz, nie tworzy nowej.

## Current State Analysis

- `hotel_users` (`supabase/migrations/20260626000001_initial_schema.sql:46-59`) ma kolumny `role`, `status` (plain `TEXT`, brak CHECK), `invite_token`, `invite_expires_at`, `last_login_at` — wszystkie oprócz `role`/`status` są schema-only, żaden kod aplikacji ich nie czyta/zapisuje.
- `lib/panel/rbac.ts:12,15,30,33` — `Resource` już zawiera `'users'` (owner/admin: `full`) i `'transfer_ownership'` (tylko owner: `full`). Zero zmian w macierzy potrzebne.
- `lib/panel/auth.ts` `getHotelUser()` filtruje `status = 'active'` przy service-role lookupie — `invited`/`deactivated` użytkownicy już są efektywnie odcięci od panelu, bez dodatkowej pracy.
- `app/api/panel/auth/login-event/route.ts` istnieje i woła `captureEvent('hotel_login', ...)` po udanym `signInWithPassword` (wywoływane z `login-form.tsx:29`) — **nie zapisuje `last_login_at`**. To naturalne miejsce do rozszerzenia, nie nowy endpoint.
- RLS: `staff_all_hotel_users` (`supabase/migrations/20260626000002_rls_policies.sql:112-120`) to `FOR ALL USING (property_id IN (... status='active'))` **bez roli i bez `WITH CHECK`** — dziś każdy aktywny hotel_user (nawet `viewer`) może teoretycznie mutować `hotel_users` na poziomie DB; jedyna dotychczasowa ochrona jest w warstwie aplikacji (`canPerform`).
- Brak jakiejkolwiek infrastruktury e-mail w repo (`RESEND_API_KEY` to tylko placeholder w `.env.example`, nieużywany). Supabase Auth ma wbudowany mailer (`supabase/config.toml:219-251`, `auth.email.template.invite`) — decyzja HITL: użyć go zamiast budować własny e-mail stack.
- Wzorzec CRUD serwerowego: `app/[locale]/(hotel)/services/actions.ts` (`requireXWriteAccess()` → `getHotelUser()` + `canPerform()` → walidacja → mutacja przez `createServerClient()` lub `createServiceRoleClient()` → `revalidatePath`). S2.7 kopiuje ten wzorzec pod `app/[locale]/(hotel)/users/`.
- Brak precedensu testowania RLS jako realnie zalogowana rola (istniejące IT-testy używają service-role do fixtures i asercji app-layer 403). IT-5 wprowadza pierwszy `signInWithPassword`-owy test w projekcie.

## Desired End State

Owner/Admin zaprasza nowego użytkownika e-mailem (Supabase mailer, 72h), zaproszony ustawia hasło i staje się `active`. Owner/Admin zmienia role (poza nadaniem/odebraniem `owner`), dezaktywuje konta (treści zachowane, nie własne konto, nie ostatniego Ownera bez transferu). Transfer ownership to dedykowany, potwierdzany osobno flow. RLS na `hotel_users` dopuszcza mutacje tylko dla `owner`/`admin`. IT-5 przechodzi z aktywnym RLS.

### Key Discoveries:

- `lib/panel/rbac.ts:12,15,30,33` — zasoby `users`/`transfer_ownership` już istnieją w macierzy.
- `app/api/panel/auth/login-event/route.ts` — istniejący hook po loginie, do rozszerzenia o `last_login_at`.
- `supabase/config.toml:219-251` — Supabase Auth mailer + `auth.email.template.invite` dostępne do customizacji treści bez własnego SMTP.
- `supabase/migrations/20260626000002_rls_policies.sql:112-120` — luka RLS do zamknięcia w tej sesji (naturalny moment, bo i tak wprowadzamy realne mutacje).

## What We're NOT Doing

- Reset hasła (self-service "zapomniałem hasła") — SHOULD w roadmapie, TODO na kolejną sesję.
- Budowa własnej infrastruktury e-mail (Resend/SMTP) — Supabase Auth mailer obsługuje wysyłkę; wrapper jest napisany tak, by podmiana była lokalna do jednego modułu.
- Zmiana `status` z `TEXT` na ENUM w tej sesji (poza zakresem DoD; nie blokuje niczego z IT-5).
- Podgląd/rewokacja pojedynczych aktywnych sesji hotel_users (COULD, poza zakresem).

## Implementation Approach

Sześć faz: (1) hardening schematu/RLS + last_login_at, (2) invite flow oparty o `supabase.auth.admin.inviteUserByEmail`, (3) lista użytkowników + zmiana roli, (4) dezaktywacja + guardy, (5) transfer ownership, (6) testy (IT-5 + RLS mutation test). Każda faza kończy się działającym stanem — brak half-finished.

## Critical Implementation Details

### Invite token: Supabase-owned link, nasze kolumny to bookkeeping

Zamiast budować własną walidację `invite_token` (osobny route sprawdzający UUID+expiry), zaproszenie idzie przez `supabase.auth.admin.inviteUserByEmail(email, { redirectTo })` — Supabase generuje **własny** magic-link token, wysyła e-mail przez wbudowany mailer, i po kliknięciu ustanawia sesję auth pod `redirectTo`. Nasze kolumny `hotel_users.invite_token`/`invite_expires_at` są ustawiane wyłącznie do wyświetlania w UI listy ("zaproszenie wygasa za X dni", przycisk resend) — nie są źródłem prawdy dla walidacji linku. `invite_expires_at = now() + 72h` przy tworzeniu zaproszenia.

**Uwaga operacyjna (manualna, poza zakresem kodu):** faktyczny czas życia linku Supabase kontroluje ustawienie projektu (Dashboard → Auth → Email OTP expiry), nie parametr per-wywołanie. Aby zbliżyć się do 72h z DoD, trzeba ręcznie ustawić tę wartość w hostowanym Supabase (manual verification w Fazie 2) — kod nie może tego wymusić per-invite.

### Wrapper na wysyłkę zaproszenia — łatwy switch na Resend później

`lib/invites/send-invite.ts` eksportuje jedną funkcję `sendInviteEmail(email: string, redirectTo: string): Promise<{error?: string}>`, dziś implementowaną jako cienki wrapper nad `createServiceRoleClient().auth.admin.inviteUserByEmail`. Cała reszta kodu (server actions, resend) woła tylko tę funkcję — podmiana na Resend w przyszłości dotyka jednego pliku.

### Accept-invite: pierwsze logowanie ustanawia hasło

`/[locale]/invite/accept` (nowa grupa route, poza `(hotel)` i `(hotel-auth)` — użytkownik ma sesję Supabase ustanowioną przez klik w link, ale jeszcze nie ma rekordu `hotel_users` z `auth_user_id` uzupełnionym). Strona: `supabase.auth.getUser()` → znajdź `hotel_users` po `email` + `status='invited'` → formularz hasła → `supabase.auth.updateUser({password})` → `UPDATE hotel_users SET auth_user_id=user.id, status='active', invite_token=null WHERE id=...` (service-role, bo RLS po zawężeniu w Fazie 1 nie pozwoli świeżo zalogowanemu — jeszcze nie `active` — użytkownikowi update'ować samego siebie). Błąd Supabase w URL (`error=access_denied&error_code=otp_expired`) → branded strona wygasłego zaproszenia z przyciskiem "Poproś o nowe" (woła `resendInvite` action, wymaga zalogowanego Owner/Admin — link do tej akcji z listy użytkowników, nie ze strony accept).

## Phase 1: Schema hardening — RLS + last_login_at

### Overview

Zamyka lukę bezpieczeństwa w RLS przed dodaniem realnych mutacji user-management, i podłącza dotąd martwą kolumnę `last_login_at`.

### Changes Required:

#### 1. Migracja RLS `hotel_users`

**File**: `supabase/migrations/<timestamp>_hotel_users_rbac_rls.sql`

**Intent**: Zawężenie `staff_all_hotel_users` tak, by SELECT pozostał dla każdego aktywnego usera property, ale INSERT/UPDATE/DELETE tylko dla `role IN ('owner','admin')`.

**Contract**: Drop istniejącej polityki `staff_all_hotel_users`; nowa `SELECT`-owa polityka (bez zmian w zachowaniu) + nowa `ALL`-owa polityka na INSERT/UPDATE/DELETE z `USING`/`WITH CHECK` filtrującym po `role IN ('owner','admin')` w podzapytaniu do `hotel_users` (ten sam wzorzec self-referencing subquery co dziś).

#### 2. `last_login_at` write path

**File**: `app/api/panel/auth/login-event/route.ts`

**Intent**: Po `captureEvent`, zapisz `last_login_at = now()` na rekordzie zalogowanego hotel_usera.

**Contract**: `createServiceRoleClient().from('hotel_users').update({ last_login_at: new Date().toISOString() }).eq('id', hotelUser.id)` — dopisane po istniejącym `captureEvent`, przed `return`.

### Success Criteria:

#### Automated Verification:

- [ ] Migracja aplikuje się bez błędów na Supabase (SQL wklejony do SQL Editora)
- [ ] `npm run typecheck` przechodzi
- [ ] Istniejące testy `login-event/__tests__/route.test.ts` nadal przechodzą (rozszerzone o assercję `last_login_at`)

#### Manual Verification:

- Ręczny SQL w Supabase SQL Editor: zalogowany jako `viewer` (przez `SET request.jwt.claims`) próbuje `UPDATE hotel_users` innego rekordu → odrzucone przez RLS
- Zalogowany jako `admin` → `UPDATE` przechodzi

---

## Phase 2: Invite flow

### Overview

Owner/Admin zaprasza nowego użytkownika; zaproszony ustawia hasło i staje się `active`.

### Changes Required:

#### 1. Wrapper wysyłki zaproszenia

**File**: `lib/invites/send-invite.ts`

**Intent**: Pojedynczy punkt wysyłki e-maila zaproszenia, dziś przez Supabase Auth admin API.

**Contract**: `sendInviteEmail(email: string, redirectTo: string): Promise<{ error?: string }>` wołające `createServiceRoleClient().auth.admin.inviteUserByEmail(email, { redirectTo })`.

#### 2. Server action `inviteUser` + `resendInvite`

**File**: `app/[locale]/(hotel)/users/actions.ts`

**Intent**: Owner/Admin wypełnia formularz (email, rola startowa — nie `owner`), akcja tworzy wiersz `hotel_users` (`status='invited'`, `invite_expires_at=now()+72h`) i woła `sendInviteEmail`. `resendInvite(userId)` odświeża `invite_expires_at` i ponownie woła `sendInviteEmail`.

**Contract**: `requireUsersWriteAccess()` (wzorzec z `services/actions.ts`) → `canPerform(role, 'users', 'write')`. Walidacja: rola docelowa ∈ `{admin, staff, viewer}` (nigdy `owner` z tej akcji — patrz Faza 5). Insert przez `createServiceRoleClient()` (RLS po Fazie 1 i tak wymaga `owner`/`admin`, ale insert nowego usera nie ma jeszcze `auth_user_id` do dopasowania w podzapytaniu RLS, więc service-role jest wymagane, analogicznie do `orders/actions.ts`).

#### 3. Strona `/invite/accept`

**File**: `app/[locale]/invite/accept/page.tsx` + `accept-form.tsx` (client)

**Intent**: Nowo zaproszony ustawia hasło i aktywuje konto.

**Contract**: Server component czyta `supabase.auth.getUser()`; jeśli brak sesji lub `error_code=otp_expired` w search params → branded strona błędu z przyciskiem "Poproś o nowe zaproszenie" (link do panelu, nie samoobsługowy — wymaga zalogowanego Owner/Admin). W przeciwnym razie renderuje `AcceptForm` (client) z polem hasła → `supabase.auth.updateUser({password})` → POST do nowego route handlera `app/api/invite/activate/route.ts` który (service-role) ustawia `auth_user_id`, `status='active'`, `invite_token=null` na dopasowanym po `email` rekordzie `status='invited'`.

### Success Criteria:

#### Automated Verification:

- [ ] `npm run typecheck` przechodzi
- [ ] Unit test `lib/invites/__tests__/send-invite.test.ts` (mock service-role client, asercja wywołania `inviteUserByEmail` z poprawnym `redirectTo`)
- [ ] Unit test `app/[locale]/(hotel)/users/__tests__/actions.test.ts` — `inviteUser` odrzuca rolę `owner`; `staff`/`viewer` nie mają dostępu (403)

#### Manual Verification:

- Zaproszenie e-mail faktycznie dociera (hostowany Supabase, sprawdzić skrzynkę testową)
- Kliknięcie linku → formularz hasła → po submicie `status='active'`, login działa
- Ustawić w Supabase Dashboard → Auth → Email OTP expiry na wartość odpowiadającą 72h (manualny krok, poza kodem)
- Kliknięcie wygasłego linku → branded strona błędu, nie generic Supabase error

---

## Phase 3: Lista użytkowników + zmiana roli

### Overview

Owner/Admin widzi wszystkich użytkowników property (status, rola, ostatnie logowanie) i może zmienić rolę (poza nadaniem/odebraniem `owner`).

### Changes Required:

#### 1. Strona listy

**File**: `app/[locale]/(hotel)/users/page.tsx` + `user-list.tsx` (client, wzorzec `service-list.tsx`)

**Intent**: Tabela: email, rola, status, ostatnie logowanie, akcje (zmień rolę / dezaktywuj / zaproś ponownie gdy `invited`).

**Contract**: `RequirePermission role={hotelUser.role} resource="users" level="read"`; query przez `createServerClient()` (SELECT dozwolony wszystkim aktywnym po RLS z Fazy 1) na `hotel_users` filtrowane po `property_id`.

#### 2. Server action `changeRole`

**File**: `app/[locale]/(hotel)/users/actions.ts` (dopisane)

**Intent**: Zmiana roli istniejącego usera na `admin`/`staff`/`viewer`.

**Contract**: `requireUsersWriteAccess()`; odrzuca `newRole === 'owner'` (błąd `'use_transfer_ownership'`) oraz zmianę roli aktualnego `owner` (musi iść przez transfer, Faza 5).

### Success Criteria:

#### Automated Verification:

- [ ] `npm run typecheck` przechodzi
- [ ] Unit test: `changeRole` odrzuca `newRole='owner'`; odrzuca zmianę roli usera który jest aktualnie `owner`

#### Manual Verification:

- Lista pokazuje poprawny `last_login_at` po zalogowaniu (Faza 1)
- Viewer nie widzi akcji zmiany roli (UI) i dostaje 403 przy bezpośrednim wywołaniu akcji

---

## Phase 4: Dezaktywacja + guardy

### Overview

Owner/Admin dezaktywuje konto (nigdy DELETE), z blokadą na ostatniego Ownera i na dezaktywację samego siebie.

### Changes Required:

#### 1. Server action `deactivateUser`

**File**: `app/[locale]/(hotel)/users/actions.ts` (dopisane)

**Intent**: `status='deactivated'`, treści/audit zachowane, brak natychmiastowego force-sign-out (JWT wygasa naturalnie, `getHotelUser()` już odcina dostęp na kolejnym requeście).

**Contract**: `requireUsersWriteAccess()` → guard 1: `targetUserId === hotelUser.id` → błąd `'cannot_deactivate_self'`. Guard 2: jeśli target ma `role='owner'` → `COUNT(*) FROM hotel_users WHERE property_id=... AND role='owner' AND status='active'` > 1, inaczej błąd `'last_owner_requires_transfer'`. Update przez `createServiceRoleClient()`.

### Success Criteria:

#### Automated Verification:

- [ ] Unit test: dezaktywacja własnego konta → `cannot_deactivate_self`
- [ ] Unit test: dezaktywacja jedynego Ownera → `last_owner_requires_transfer`
- [ ] Unit test: dezaktywacja Ownera gdy istnieje drugi aktywny Owner → sukces
- [ ] Unit test: dezaktywacja Staff → sukces, rekord zachowany (nie DELETE)

#### Manual Verification:

- Po dezaktywacji: próba logowania przez zdezaktywowanego usera → `no_access` (istniejący redirect w `layout.tsx`)
- Powiązane dane (np. `audit_logs` z jego akcjami, jeśli istnieją) nienaruszone

---

## Phase 5: Transfer ownership

### Overview

Jedyna droga do nadania roli `owner` — dedykowany, potwierdzany osobno flow (HITL #3).

### Changes Required:

#### 1. Modal potwierdzenia

**File**: `app/[locale]/(hotel)/users/transfer-ownership-modal.tsx` (client)

**Intent**: Owner wybiera docelowego usera (musi być `active`) i wpisuje potwierdzenie tekstowe przed wysłaniem.

**Contract**: Widoczny tylko gdy `canPerform(hotelUser.role, 'transfer_ownership', 'full')` (czyli tylko dla `owner`).

#### 2. Server action `transferOwnership`

**File**: `app/[locale]/(hotel)/users/actions.ts` (dopisane)

**Intent**: Atomowa zamiana ról — aktualny Owner staje się `admin`, target staje się `owner`.

**Contract**: `requireTransferAccess()` → `canPerform(role, 'transfer_ownership', 'full')`. Dwa `UPDATE`y w jednej transakcji (Supabase RPC funkcja SQL `transfer_hotel_ownership(property_id, current_owner_id, new_owner_id)` — wzorzec transakcyjny jak w S1.3 early check-out) żeby uniknąć stanu z dwoma lub zero Ownerami przy błędzie połowicznym.

### Success Criteria:

#### Automated Verification:

- [ ] Unit/integration test: po transferze dokładnie jeden `owner` (stary → `admin`, nowy → `owner`)
- [ ] Test: transfer do usera który nie jest `active` → odrzucony
- [ ] Test: transfer wołany przez `admin` → 403

#### Manual Verification:

- Po transferze stary Owner nadal ma dostęp do panelu (jako Admin), traci `billing`/`transfer_ownership`

---

## Phase 6: Testy — IT-5 + RLS mutation test

### Overview

Pełny cykl użytkownika panelu z aktywnym RLS.

### Changes Required:

#### 1. IT-5 (app-layer, cykl pełny)

**File**: `lib/panel/__tests__/it-5.test.ts`

**Intent**: `inviteUser` → symulacja accept (bezpośredni update service-role, bez realnego kliknięcia e-maila) → `deactivateUser` na Staff (treści zachowane) → próba dezaktywacji jedynego Ownera (odrzucona) → `transferOwnership` → dezaktywacja starego Ownera (teraz Admin, ma drugiego Ownera — powinna się udać).

**Contract**: Wzorzec fixture/teardown z `lib/checkout/__tests__/it-4.test.ts` (service-role seed + cleanup), wywołania server actions bezpośrednio jak istniejące IT-testy.

#### 2. RLS mutation test (nowa infrastruktura)

**File**: `lib/panel/__tests__/hotel-users-rls.test.ts`

**Intent**: Pierwszy w projekcie test logujący się realnie jako konkretna rola (nie tylko service-role), by zweryfikować politykę z Fazy 1 na poziomie DB.

**Contract**: `supabase.auth.signInWithPassword()` z tymczasowym testowym userem o roli `viewer` (utworzonym w `beforeAll` przez `admin.createUser` + wstawienie `hotel_users`), następnie bezpośredni `UPDATE hotel_users` przez klienta z tym sesyjnym JWT (nie service-role) → oczekiwany błąd RLS. Analogiczny test dla `admin` → sukces. `afterAll` usuwa testowego auth usera.

### Success Criteria:

#### Automated Verification:

- [ ] IT-5 przechodzi w całości
- [ ] Test RLS: viewer → mutacja odrzucona; admin → mutacja przechodzi
- [ ] `npm run lint` przechodzi
- [ ] `npm run typecheck` przechodzi

#### Manual Verification:

- Pełny ręczny przebieg: zaproś realny e-mail testowy → klik → ustaw hasło → zaloguj się jako nowy user → sprawdź RBAC UI (np. viewer nie widzi przycisku zmiany roli)

---

## Testing Strategy

### Unit Tests:

- RBAC gating na każdej nowej akcji (`inviteUser`, `changeRole`, `deactivateUser`, `transferOwnership`) dla wszystkich 4 ról
- Guardy: self-deactivate, last-owner, rola `owner` niedostępna przez `changeRole`/`inviteUser`

### Integration Tests:

- IT-5 (pełny cykl)
- RLS mutation test (viewer odrzucony, admin przechodzi)

### Manual Testing Steps:

1. Zaproszenie → e-mail → aktywacja → login
2. Wygasły link → branded error → resend
3. Zmiana roli, dezaktywacja, transfer ownership — każde z UI jako Owner i jako Admin (gdzie dozwolone)
4. Próba dezaktywacji ostatniego Ownera z UI → czytelny komunikat błędu

## Performance Considerations

Brak nowych hotspotów — operacje niskiej częstotliwości (zarządzanie userami to rzadka akcja administracyjna, nie ścieżka gościa).

## Migration Notes

Migracja RLS (Faza 1) jest addytywna (drop+recreate jednej polityki) — bezpieczna do zastosowania na istniejących danych, nie zmienia SELECT-owego zachowania.

## References

- Roadmap: `context/foundation/implementation_roadmap.md:305-335` (Moduł 6, §4.2 macierz RBAC)
- Decyzje HITL: `context/archive/decisions_log.md:217` (HITL #3 — transfer ownership)
- Session plan: `context/foundation/session-plan.md:105-108` (S2.7 scope/DoD)
- Wzorzec server actions: `app/[locale]/(hotel)/services/actions.ts`, `app/[locale]/(hotel)/orders/actions.ts`
- Wzorzec IT-test: `lib/checkout/__tests__/it-4.test.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema hardening — RLS + last_login_at

#### Automated

- [x] 1.1 Migracja aplikuje się bez błędów na Supabase — ca81afc
- [x] 1.2 npm run typecheck przechodzi — ca81afc
- [x] 1.3 Istniejące testy login-event/__tests__/route.test.ts nadal przechodzą — ca81afc

#### Manual

- [x] 1.4 Ręczny SQL: viewer → UPDATE odrzucony przez RLS — ca81afc
- [x] 1.5 Ręczny SQL: admin → UPDATE przechodzi — ca81afc

### Phase 2: Invite flow

#### Automated

- [x] 2.1 npm run typecheck przechodzi
- [x] 2.2 Unit test lib/invites/__tests__/send-invite.test.ts
- [x] 2.3 Unit test app/[locale]/(hotel)/users/__tests__/actions.test.ts (inviteUser)

#### Manual

- [ ] 2.4 E-mail zaproszenia faktycznie dociera
- [ ] 2.5 Klik linku → formularz hasła → status='active', login działa
- [ ] 2.6 Ustawić Email OTP expiry w Supabase Dashboard na ~72h
- [ ] 2.7 Wygasły link → branded strona błędu

### Phase 3: Lista użytkowników + zmiana roli

#### Automated

- [ ] 3.1 npm run typecheck przechodzi
- [ ] 3.2 Unit test: changeRole odrzuca newRole='owner' i zmianę roli aktualnego ownera

#### Manual

- [ ] 3.3 Lista pokazuje poprawny last_login_at
- [ ] 3.4 Viewer nie widzi akcji zmiany roli i dostaje 403 przy bezpośrednim wywołaniu

### Phase 4: Dezaktywacja + guardy

#### Automated

- [ ] 4.1 Unit test: self-deactivate → cannot_deactivate_self
- [ ] 4.2 Unit test: dezaktywacja jedynego Ownera → last_owner_requires_transfer
- [ ] 4.3 Unit test: dezaktywacja Ownera z drugim aktywnym Ownerem → sukces
- [ ] 4.4 Unit test: dezaktywacja Staff → sukces, rekord zachowany

#### Manual

- [ ] 4.5 Zdezaktywowany user → login → no_access
- [ ] 4.6 Powiązane dane nienaruszone

### Phase 5: Transfer ownership

#### Automated

- [ ] 5.1 Test: po transferze dokładnie jeden owner
- [ ] 5.2 Test: transfer do nie-active usera odrzucony
- [ ] 5.3 Test: transfer wołany przez admin → 403

#### Manual

- [ ] 5.4 Stary Owner po transferze ma dostęp jako Admin, traci billing/transfer_ownership

### Phase 6: Testy — IT-5 + RLS mutation test

#### Automated

- [ ] 6.1 IT-5 przechodzi w całości
- [ ] 6.2 Test RLS: viewer odrzucony, admin przechodzi
- [ ] 6.3 npm run lint przechodzi
- [ ] 6.4 npm run typecheck przechodzi

#### Manual

- [ ] 6.5 Pełny ręczny przebieg: zaproszenie → aktywacja → login → RBAC UI weryfikacja
