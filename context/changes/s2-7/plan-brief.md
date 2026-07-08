# Użytkownicy panelu i offboarding — Plan Brief

> Pełny plan: `context/changes/s2-7/plan.md`

## Co i po co

S2.7 buduje Moduł 6 panelu hotelowego: zaproszenia użytkowników (Owner/Admin), zmianę ról, dezaktywację kont (nigdy DELETE — audit trail, RODO), i wymuszony transfer ownership przed dezaktywacją ostatniego Ownera (HITL #3 — Owner = ADM danych, musi zawsze istnieć). Zamyka też przy okazji lukę bezpieczeństwa w RLS odkrytą podczas researchu.

## Punkt startowy

`hotel_users` (rola, status, invite_token, invite_expires_at, last_login_at) istnieje w schemacie od S0.2, ale poza `role`/`status` żadna kolumna nie jest używana przez kod. RBAC (S2.1) ma już gotowe zasoby `users`/`transfer_ownership` w macierzy uprawnień — ta sesja je konsumuje, nie tworzy. Nie istnieje żadna infrastruktura e-mail w projekcie. RLS na `hotel_users` dziś pozwala dowolnemu aktywnemu userowi (nawet `viewer`) mutować wiersze na poziomie DB — chroni tylko warstwa aplikacji.

## Stan docelowy

Owner/Admin zaprasza e-mailem (72h), zaproszony ustawia hasło i staje się aktywny. Role da się zmieniać (poza `owner`), konta dezaktywować (treści zachowane), a rola Ownera przechodzi wyłącznie przez dedykowany, potwierdzany transfer. RLS na `hotel_users` dopuszcza mutacje tylko dla `owner`/`admin`. IT-5 przechodzi z aktywnym RLS.

## Kluczowe decyzje

| Decyzja | Wybór | Dlaczego |
| --- | --- | --- |
| Wysyłka zaproszenia | Supabase Auth `admin.inviteUserByEmail` (wbudowany mailer), opakowane w `lib/invites/send-invite.ts` | Zero tarcia, brak własnej infrastruktury e-mail; wrapper trzyma podmianę na Resend w jednym pliku na przyszłość |
| Token zaproszenia | Supabase generuje własny magic-link; nasze `invite_token`/`invite_expires_at` to tylko bookkeeping/UI | Unika budowy równoległej, własnej walidacji tokenu obok już istniejącego mechanizmu Supabase |
| Last-owner guard | Guard w warstwie aplikacji (server action, COUNT aktywnych ownerów) | Prostszy, testowalny w Vitest, spójny z istniejącym wzorcem app-layer RBAC |
| Luka RLS `staff_all_hotel_users` | Zawężona do `owner`/`admin` dla mutacji (Faza 1) | Sesja i tak wprowadza realne mutacje user-management — naturalny moment na defense-in-depth |
| Transfer ownership UX | Dedykowany modal z potwierdzeniem tekstowym, osobny od zmiany roli | Nieodwracalna, wysokiego ryzyka operacja zasługuje na friction (wzorzec Stripe/Slack/Linear z roadmapy) |
| Zmiana ról | Owner i Admin mogą zmieniać role staff/admin/viewer; nadanie/odebranie `owner` wyłącznie przez transfer ownership | Zgodne z macierzą §4.2 (Admin ma `full` na module Użytkownicy), jeden bezpieczny punkt wejścia do zmiany właściciela |
| Dezaktywacja — efekty uboczne | Tylko `status='deactivated'`, brak natychmiastowego force-sign-out | `getHotelUser()` już blokuje dostęp na kolejnym request; zgodne z DoD "treści zachowane" |
| Self-deactivation | Zablokowane | Zapobiega przypadkowej samo-blokadzie bez ścieżki odzyskania w tej sesji |
| Wygasłe zaproszenie | Branded strona błędu + przycisk "Poproś o nowe" (resend przez Ownera/Admina z listy) | Spójne z wzorcem S3.4, self-service zgodnie z HITL #4 |
| Reset hasła | Poza zakresem, TODO | SHOULD, nie MUST w DoD tej sesji |
| Testowanie IT-5 | App-layer (istniejący wzorzec) + nowy test RLS-as-role (pierwszy `signInWithPassword` w testach) | Pokrywa logikę biznesową i nową politykę DB bez budowania pełnej infrastruktury per-rola |

## Zakres

**W zakresie:**
- Zaproszenie tokenem e-mail (72h), zmiana ról, lista użytkowników z last_login_at
- Dezaktywacja (nigdy DELETE) z guardami: self-deactivate, last-owner
- Transfer ownership (dedykowany flow)
- Zawężenie RLS `hotel_users` do owner/admin dla mutacji
- IT-5 + nowy test RLS mutation

**Poza zakresem:**
- Reset hasła (self-service)
- Własna infrastruktura e-mail (Resend/SMTP)
- Zmiana `status` z TEXT na ENUM
- Podgląd/rewokacja pojedynczych sesji hotel_users

## Architektura / Podejście

`lib/invites/send-invite.ts` opakowuje `supabase.auth.admin.inviteUserByEmail`. `app/[locale]/(hotel)/users/actions.ts` niesie wszystkie server actions (invite, resend, changeRole, deactivateUser, transferOwnership) wzorem `services/actions.ts`. `app/[locale]/invite/accept/` to nowa, niezalogowana grupa route obsługująca pierwszy setup hasła. Transfer ownership idzie przez atomową SQL funkcję (RPC), analogicznie do wzorca transakcyjnego z early check-out (S1.3).

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
| --- | --- | --- |
| 1. Schema hardening | RLS owner/admin-only + last_login_at wpięty w istniejący login-event | Migracja RLS musi wylądować przed Fazą 2, inaczej insert nowego zaproszenia przez service-role maskuje regresję |
| 2. Invite flow | Wrapper wysyłki + accept page + branded expired-link | Realna wysyłka e-mail zależy od konfiguracji hostowanego Supabase (SMTP, OTP expiry) — manualny krok poza kodem |
| 3. Lista + zmiana roli | Strona listy, `changeRole` z blokadą `owner` | — |
| 4. Dezaktywacja + guardy | `deactivateUser`, self-deactivate + last-owner guard | Poprawna kolejność sprawdzeń (self przed last-owner) |
| 5. Transfer ownership | Modal + atomowa zamiana ról | Częściowy fail (dwóch lub zero ownerów) — wymaga transakcji SQL, nie dwóch osobnych UPDATE |
| 6. Testy | IT-5 + pierwszy RLS-as-role test | Nowa infrastruktura testowa (tymczasowy auth user) musi sprzątać po sobie |

**Prerequisites:** S2.1 (RBAC, auth guard) zmergowane.
**Szacowany nakład:** ~1 sesja, 6 faz.

## Otwarte ryzyka i założenia

- Dokładny czas życia linku Supabase (72h) kontroluje ustawienie projektu w Dashboardzie (Email OTP expiry), nie parametr w kodzie — wymaga manualnej konfiguracji na hostowanym Supabase przed pilotażem.
- Transfer ownership przez SQL RPC to pierwszy taki wzorzec transakcyjny poza S1.3 (early check-out) — warto zweryfikować, że Supabase CLI migration flow obsługuje funkcje PL/pgSQL tak samo gładko.
- Nowy test RLS-as-role (Faza 6) tworzy tymczasowego użytkownika w `auth.users` — wymaga starannego teardown, inaczej zaśmieca projekt testowy Supabase.

## Kryteria sukcesu (podsumowanie)

- Zaproszenie → aktywacja → login działa end-to-end, e-mail faktycznie dociera
- Nie da się dezaktywować siebie ani ostatniego Ownera bez transferu
- RLS na `hotel_users` blokuje mutacje spoza owner/admin na poziomie DB (nie tylko aplikacji)
- IT-5 przechodzi z aktywnym RLS
