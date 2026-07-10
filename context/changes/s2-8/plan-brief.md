# Self-service signup ownera + konta hotelu — Plan Brief

> Pełny plan: `context/changes/s2-8/plan.md`

## What & Why

Dziś jedyny sposób powstania hotelu+ownera to ręczny insert `service_role` (seed/testy) — `implementation_roadmap.md` nazywa "Signup + konto hotelu (Owner = ADM)" jako MUST (krok 1 onboardingu), ale plan sesji nie miał dla tego dedykowanej sesji. Ta sesja domyka lukę: formularz self-service (email, hasło, nazwa hotelu) tworzy hotel + ownera atomowo przez UI.

## Starting Point

`app/[locale]/(hotel)/users/actions.ts` obsługuje zapraszanie *kolejnych* userów przez istniejącego ownera (`inviteUser`, `transferOwnership` przez RPC `transfer_hotel_ownership`), ale zakłada, że owner już istnieje. RLS na `hotel_users`/`properties` blokuje zwykły authenticated insert dla pierwszego ownera (chicken/egg) — insert musi iść przez `service_role` lub `SECURITY DEFINER` RPC.

## Desired End State

Nowy hotel + owner powstają wyłącznie przez UI signup. Po potwierdzeniu emaila i zalogowaniu owner trafia na `/dashboard`, widząc wyłącznie swój property (zweryfikowane pod aktywnym RLS).

## Key Decisions Made

| Decyzja | Wybór | Dlaczego (1 zdanie) |
| --- | --- | --- |
| Zakres DPA gate | Poza scope S2.8 | Zostaje egzekwowany wyłącznie w S2.5 przy generowaniu QR — S2.8 zostaje wąski |
| Model onboardingu | W pełni self-service, brak kickoff w kodzie | Zgodne z HITL #4; kickoff call (jeśli jest) jest czysto operacyjny, poza appką |
| Kontrakt błędów RPC | `RAISE EXCEPTION '<code>: %'` | Spójność z jedynym istniejącym wzorcem (`transfer_hotel_ownership`) |
| Partial failure (signUp OK, RPC fail) | Zaakceptuj possible orphaned `auth.users`, retry przez ponowny submit | Supabase Auth i tak obsługuje retry na niepotwierdzony email; brak dodatkowej logiki kompensacyjnej |
| Walidacja email/hasło | Ręczna walidacja w server action, bez zod | W repo nie ma zod/validatora; nowa zależność wykracza poza zakres jednej sesji |
| Rate limiting | Per-IP, 5 prób/60 min | Ten sam wzorzec co `lib/rate-limit/scan.ts`; signup nie dzieje się z hotelowego NAT |
| Redirect po signupie | `/dashboard` | Ten sam target co po zwykłym loginie; wizard S2.2 wykryje `setup_completed=false` |
| Potwierdzenie emaila | Wymagane (standard Supabase) | Owner staje się ADM danych gości (RODO) — słabsza weryfikacja tożsamości byłaby ryzykowna |

## Scope

**In scope:**
- Formularz signup (email, hasło, nazwa hotelu)
- Atomowa funkcja SQL `create_hotel_and_owner` (properties + hotel_users owner)
- Rate limiter dla signupu
- Test integracyjny z aktywnym RLS

**Out of scope:**
- DPA gate / UI podpisywania DPA
- Integracja kickoff call (Calendly itp.)
- Wybór roli przy signupie
- Nowa zależność walidacji (zod)
- Zmiany w centralnym middleware (repo go nie ma)

## Architecture / Approach

Klient woła `supabase.auth.signUp()` → server action woła `SECURITY DEFINER` RPC `create_hotel_and_owner(auth_user_id, email, hotel_name)`, która w jednej transakcji wstawia `properties` (`setup_completed=false`, `dpa_signed_at=NULL`) i `hotel_users(role='owner', status='active')`. Wzorzec RPC i błędów 1:1 kopiuje istniejącą `transfer_hotel_ownership_fn.sql` z S2.7.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. RPC + rate limiter | Atomowa funkcja SQL + `lib/rate-limit/signup.ts` | Race na unikalność emaila między property'ami |
| 2. UI signup + server action | Strona `/signup`, formularz, server action | Orphaned `auth.users` przy nieudanym RPC (zaakceptowane) |
| 3. Test RLS | `it-signup.test.ts` weryfikujący izolację tenantów | Cleanup `auth.users` po teście (wymaga `admin.deleteUser`) |

**Prerequisites:** S0.2 (schemat+RLS), S0.3 (Supabase Auth) — oba już zaimplementowane.
**Estimated effort:** ~1 sesja, 3 fazy.

## Open Risks & Assumptions

- Zakładamy, że Supabase Auth ma włączone wymaganie potwierdzenia emaila (weryfikacja configu projektu przy implementacji).
- Globalna unikalność emaila ownera (nie tylko per-property) jest sprawdzana explicit w RPC, bo DB constraint (`UNIQUE(property_id, email)`) na to nie wystarcza dla nowego property — do zweryfikowania czy to pożądane zachowanie biznesowe (raczej tak: jeden człowiek nie powinien być ownerem dwóch hoteli przez dwa osobne signupy z tym samym mailem, ale może zakładać drugi hotel — jeśli tak, decyzja do rewizji przy implementacji).

## Success Criteria (Summary)

- Nowy hotel + owner powstają przez UI, nie przez service-role seed
- Pod aktywnym RLS nowy property widoczny wyłącznie nowemu ownerowi
- Test integracyjny analogiczny do IT-5 przechodzi
