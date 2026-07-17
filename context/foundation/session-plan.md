# Plan sesji implementacyjnych — Hotel Guest App MVP

~23 sesje. Każda: **Scope** (co budujemy) · **DoD** (definicja ukończenia) · **Blokery** (co musi istnieć wcześniej).
Sesje w ramach fazy sekwencyjne. Faza 5 równolegle od Fazy 1.

Decyzje HITL twarde → §1.3 `implementation_roadmap.md`. Testy z aktywnym RLS (nie service_role).

---

## Graf zależności

```
S0.1 → S0.2 → S0.3
                │
                ├──► S1.1 → S1.2 → S1.3
                │              │
                ├──► S2.8 ──► S2.1 ─────┤
                │     │        │
                │     ├─► S2.2 ─► S2.3 ┐
                │     │          S2.4 ├─ (równolegle)
                │     │          S2.5 │
                │     │          S2.7 │
                │     │          S2.9 ┘
                │     └─► S2.6 (+ S1.2)
                │              │
                │              └──► S3.1 → S3.2 → S3.3 → S3.4 → S3.5
                │                     └──► S3.6
                │              S2.4 ──► S4.1 ──► S4.2 → S4.3
                │
                └──► S5.1 (od S0.3; eventy dołączane do S1.2, S2.6)
                          └──► S5.2

Faza 2 (S2.1–S2.11) + Faza 3 (S3.1–S3.6) + Faza 4 (S4.1–S4.2) ──► S6.0 ──► S6.1
```

---

## FAZA 0 — Fundament (blokuje wszystko)

### S0.1 — Project bootstrap + CI/CD
**Scope:** Next.js 15 App Router + TypeScript + Tailwind + next-intl (PL/EN szkielet). ESLint + Prettier. GitHub Actions: lint + type-check per PR. Railway preview deployments. `.env.example`.
**DoD:** `npm run build` przechodzi, CI zielony, Railway preview deployuje.
**Blokery:** brak.

### S0.2 — Schemat bazy danych + RLS
**Scope:** wszystkie tabele z §3.3 roadmapy (properties, hotel_users, reservations, sessions, rooms, qr_codes, services, orders, knowledge_chunks, audit_logs, platform_config, job_queue). ENUMy: `hotel_role`, `qr_type`, `order_status`. RLS wzorzec `current_setting('app.property_id', true)::uuid` na każdej tabeli tenantowej. Indeksy obowiązkowe. Migracja Supabase CLI.
**DoD:** migracja aplikuje się; ręczny SQL: kontekst A nie zwraca wierszy B.
**Blokery:** S0.1.

### S0.3 — Supabase Auth + Custom Access Token Hook + middleware
**Scope:** Anonymous Sign-In. Custom Access Token Hook: `property_id`, `session_id`, `auth_level` w JWT. Middleware: odczyt `__Host-session` → `current_setting('app.property_id')` per request. Init Sentry, PostHog EU, Better Stack (bez eventów).
**DoD:** signIn zwraca JWT z `property_id`; middleware ustawia RLS; Sentry catch-all działa.
**Blokery:** S0.2.

---

## FAZA 1 — Auth + QR flow

### S1.1 — Generowanie QR (recepcja + pokój)
**Scope:** logika `qr_codes`. Recepcja: rotujący co 5 min, `init_token` UUID single-use TTL 15 min. Pokój: statyczny, `room_id`, `is_active`. Utility obrazu QR. Unit testy.
**DoD:** unit testy przechodzą; QR recepcji rotuje; QR pokoju statyczny.
**Blokery:** S0.3.

### S1.2 — Route handler `/api/scan/*` + token exchange + cookie
**Scope:** walidacja `init_token` → unieważnienie → `signInAnonymously()` → Custom Hook → rekord `sessions` (expires_at = checkout+2h) → `Set-Cookie: __Host-session` (HttpOnly, Secure, SameSite=Strict, Path=/) → 302 do `/`. Token NIE w URL. Step-Up Auth 0→1 (QR recepcji), 1→2 (QR pokoju, okno `valid_from/until`). Test IT-2.
**DoD:** IT-2 przechodzi z aktywnym RLS; replay → 401; cookie prawidłowe.
**Blokery:** S1.1.

### S1.3 — Rate limiting + anomaly detection + early check-out
**Scope:** Upstash Redis: 5 prób/15 min/IP na `/api/scan/*`. Anomaly ASN: `COUNT(DISTINCT asn) > 2`/30 min → alert; country jump → auto-revoke. Early check-out: transakcja atomowa (reservations + sessions + rooms + qr_codes + audit_logs) z rollbackiem. Test IT-4.
**DoD:** IT-4 przechodzi; po early check-out cookie → 401, QR → odmowa; rollback działa.
**Blokery:** S1.2.

---

## FAZA 2 — Panel hotelowy (7 sesji)

### S2.1 — Auth panelu + RBAC middleware
**Scope:** logowanie hotel_users (email+password). RBAC middleware: rola z `hotel_users` per route segment. Macierz §4.2 roadmapy. Guard komponenty server-side. Unit testy macierzy.
**DoD:** unit testy przechodzą; viewer nie może POST; staff nie widzi billingu.
**Blokery:** S0.3, S2.8 (potrzebny przynajmniej jeden owner+property, żeby było się czym logować).

### S2.2 — Guided wizard + profil hotelu (Moduł 1)
**Scope:** wizard onboardingu (5–7 kroków, progress bar, `properties.setup_completed`). Formularz profilu (nazwa, adres, telefon, timezone, check-in/out, logo → Supabase Storage). Procent gotowości.
**DoD:** wizard od kroku 1 do końca; `setup_completed` = true; logo w Storage.
**Blokery:** S2.1.

### S2.3 — Usługi: CRUD + biblioteka szablonów (Moduł 2)
**Scope:** CRUD usług (nazwa, opis, cena/"Included", kategoria, `is_active`). Biblioteka 15–20 szablonów. Pin "Polecamy" (max 3, `is_pinned`, walidacja server-side, HITL #6).
**DoD:** CRUD z RLS (staff edytuje, viewer tylko widzi); pin 4. → błąd walidacji.
**Blokery:** S2.2.

### S2.4 — Baza wiedzy AI: FAQ editor (Moduł 3)
**Scope:** edytor Q&A (add/edit/delete). Szablony FAQ (godziny, parking, WiFi, checkout, zwierzęta). Pole "okolica". Zapis `knowledge_chunks` (Markdown+YAML frontmatter §6.1 roadmapy). `content_hash` przy zmianie.
**DoD:** edycja Q&A z nowym hashem; szablony wstawiają się; `valid_from/until` ustawiane.
**Blokery:** S2.2.

### S2.5 — Zarządzanie QR (Moduł 4)
**Scope:** UI QR recepcji (auto-rotacja 5 min + ręczna). Dezaktywacja QR pokoju per pokój. Licznik aktywnych sesji. Blokada gdy `dpa_signed_at IS NULL` (HITL #11). Test IT-6.
**DoD:** IT-6 przechodzi; dezaktywacja → nowe skany odrzucone; licznik działa.
**Blokery:** S2.1, S1.1.

### S2.6 — Inbox zamówień (Moduł 5)
**Scope:** lista zamówień. Zmiana statusu new→confirmed→fulfilled/rejected (Staff+). SSE live update (LISTEN/NOTIFY). Export CSV.
**DoD:** zmiana statusu z RBAC; SSE aktualizuje; CSV generuje.
**Blokery:** S2.1, S1.2.

### S2.7 — Użytkownicy panelu + offboarding (Moduł 6)
**Scope:** zaproszenie tokenem email (24h — patrz adnotacja DoD, rola Staff). Dezaktywacja (NIE DELETE). Lista + ostatnie logowanie. Transfer ownership przed dezaktywacją Ownera (HITL #3). Test IT-5.
**DoD:** IT-5 przechodzi; blokada dezaktywacji ostatniego Ownera; invite wygasa po 24h.
**Adnotacja (2026-07-08, odkryte podczas manualnej weryfikacji Fazy 2/3):** pierwotny DoD zakładał 72h. Supabase Cloud Dashboard (Auth → Email OTP expiry) ma twardy sufit 24h — link zaproszenia jest w całości walidowany przez Supabase (decyzja: żadnej własnej infrastruktury tokenu/e-mail), więc 72h nie jest osiągalne bez cofnięcia tamtej decyzji. Zaakceptowano 24h jako realny limit; `invite_expires_at`/UI/TTL w kodzie ustawione na 24h.
**Blokery:** S2.1.

### S2.8 — Self-service signup ownera + konta hotelu (Moduł onboarding, krok 1) [DRAFT — do doprecyzowania w /10x-plan]
**Scope:** formularz signup (email, hasło, nazwa hotelu) → `auth.signUp` + insert `properties` (`setup_completed=false`) + insert `hotel_users` (`role='owner'`, `status='active'`) atomowo (RPC/transakcja, żeby uniknąć property bez ownera). Owner = billing = ADM (HITL #3) — brak wyboru roli przy signupie. Do potwierdzenia: czy DPA gate (dziś egzekwowany w S2.5 przed generowaniem QR) wchodzi w zakres tej sesji, czy zostaje jak jest.
**DoD:** do doprecyzowania przy planowaniu; minimalnie: nowy hotel+owner powstają przez UI (nie przez service-role seed), RLS: nowo utworzony property widoczny wyłącznie nowemu ownerowi.
**Blokery:** S0.2, S0.3.
**Uwaga:** ta sesja była nieudokumentowaną luką — `implementation_roadmap.md` nazywa "Signup + konto hotelu (Owner = ADM)" jako MUST (krok 1 onboardingu), ale plan sesji jej nie miał; S2.1/S2.2 zakładają istniejące `properties`/`hotel_users`. Zarejestrowana 2026-07-10 podczas audytu invite flow — patrz `context/changes/s2-8/change.md`.

### S2.9 — Zarządzanie rezerwacją pokoju: check-in + edycja check-out [luka odkryta 2026-07-10]
**Scope:** minimalny CRUD rezerwacji per pokój (Staff+, RBAC wg S2.1): przypisanie aktywnej rezerwacji do pokoju (guest_first_name, check_in, check_out) → ustawia `rooms.room_active_reservation_id`, `valid_from = check_in`, `valid_until = check_out`. Edycja `check_out` istniejącej rezerwacji (przedłużenie/skrócenie pobytu) → aktualizuje `valid_until`; jeśli sesja gościa już istnieje (auth_level 2), przelicza `sessions.expires_at = nowy check_out + 2h` (formuła HITL #2 nietknięta — zmienia się tylko input). UI w `/qr` obok istniejącej listy pokoi (rozszerzenie S2.5) lub nowa zakładka. Audit log wpis przy zmianie check_out.
**DoD:** recepcja może utworzyć/edytować rezerwację pokoju; zmiana check_out widoczna w `rooms.valid_until` i w `sessions.expires_at` aktywnej sesji; RLS: property A nie widzi/nie edytuje rezerwacji property B.
**Blokery:** S2.1 (RBAC), S1.1 (schema rooms/reservations już istnieje z S0.2).
**Uwaga:** ta sesja była nieudokumentowaną luką — `validateRoomScan` (lib/scan/room.ts) zależy od `reservations` + `rooms.valid_from/until`, ale żadna sesja w planie nigdy tych pól nie zapisuje poza testami. Bez tej sesji żaden skan QR pokoju (auth_level 1→2) nie może się powieść w praktyce. Zarejestrowana 2026-07-10 na wniosek użytkownika o TTL pokoju — patrz `context/changes/s2-9/change.md`.

### S2.10 — Dodawanie pokoi + druk QR (rozszerzenie Modułu 4) [luka odkryta 2026-07-13]
**Scope:** formularz "Dodaj pokój" (numer + opcjonalny typ) w `/qr`, dostępny tylko dla Owner/Admin (nowy zasób RBAC `rooms_manage`; Staff/Viewer bez dostępu — reszta modułu QR nietknięta). Nowa podstrona `/qr/print`: karty QR (SVG) dla pokoi z aktywnym QR pokoju + przycisk druku przeglądarki (`window.print()`, CSS `@media print`, jeden kod na kartę/stronę) — dostępna dla Owner/Admin/Staff/Viewer (odczyt, brak mutacji). Bez edycji/usuwania pokoju (poza zakresem).
**DoD:** Owner/Admin tworzy pokój przez UI (nie przez service-role seed); Staff/Viewer nie widzą formularza dodawania; `/qr/print` renderuje skanowalny QR tylko dla pokoi z aktywnym QR pokoju; RLS/app-level: property A nie widzi/nie tworzy pokoi property B; test izolacji z aktywnym RLS.
**Blokery:** brak — S0.2 (schemat `rooms`), S2.1 (RBAC panelu), S2.5 (moduł `/qr`, wzorzec do rozszerzenia) już zaimplementowane.
**Uwaga:** ta sesja była nieudokumentowaną luką — w całym kodzie nie istniała żadna funkcja tworzenia pokoju (tabela `rooms` zasilana wyłącznie ręcznie przez skrypty testowe/service-role) ani renderowanie/druk QR pokoju (tylko QR recepcji miał SVG w panelu). `implementation_roadmap.md:293` zakładał "Generowanie PDF z QR pokoi do druku" jako płatną usługę zespołu platformy (SHOULD) — ta sesja unowocześnia to do self-service ownera, bez naruszania żadnej z 15 zamkniętych decyzji HITL. Zarejestrowana 2026-07-13 na wniosek użytkownika o samodzielne dodawanie pokoi i druk ich QR — patrz `context/changes/s2-10/change.md`.

### S2.11 — Tłumaczenie treści usług (EN) (rozszerzenie Modułu 2) [luka odkryta 2026-07-13]
**Scope:** nullable kolumny `name_en`, `description_en` w `services` (migracja SQL). Formularz `service-form.tsx` — opcjonalne pola "Nazwa (EN)"/"Opis (EN)" obok istniejących PL. `template-picker.tsx`/`actions.ts` (`createServiceFromTemplate`) — wypełnienie obu kolumn z `getTranslations({locale: 'pl'|'en'})` dla `nameKey`/`descriptionKey` szablonu, zamiast tylko bieżącego locale panelu. Guest read (`lib/guest/services.ts`: `getPinnedServices`, `getServicesByCategory`, `getServiceById`) — nowy parametr `locale`, zwraca `name_en`/`description_en` gdy locale='en' i pole niepuste, inaczej fallback na `name`/`description`.
**DoD:** usługa dodana z szablonu ma poprawną nazwę/opis w obu językach bez ręcznej pracy hotelu; usługa custom z wypełnionym EN pokazuje EN po przełączeniu guest UI na `en`; usługa custom bez EN pokazuje fallback PL (nie pusty string); RLS/izolacja tenantów nietknięta (brak zmiany polityk, tylko nowe kolumny).
**Blokery:** brak — S2.3 (schemat i CRUD usług) już zaimplementowane.
**Uwaga:** zarejestrowane jako luka wykryta podczas audytu zgłoszenia użytkownika o niekompletnym przełączaniu języka (2026-07-13). Odroczone świadomie w S2.3 (`context/changes/s2-3/plan.md:36`) jako R4 (§11.2 roadmapy); ten wpis realizuje wyłącznie manualną warstwę tłumaczenia treści (bez auto-translate DeepL/Claude, R4 pozostaje otwarte na przyszłość) — patrz `context/changes/s2-11/change.md`.

---

## FAZA 3 — Interfejs gościa (5 sesji)

### S3.1 — App Shell + splash + welcome + home
**Scope:** PWA <150 KB gzipped (FCP <3 s, LCP <2,5 s, INP <200 ms, CLS <0,1). Splash (max 1,5 s, hard-timeout). Welcome ("Witaj, [Imię]!" z JWT). Home: grid 5 kategorii + "Polecamy" below fold (max 3, frequency cap 24h localStorage, etykieta "Polecane przez [Hotel]"). Floating Concierge. PL|EN (next-intl, localStorage). Fonty: `system-ui`.
**DoD:** Lighthouse PWA; splash ≤1,5 s; "Polecamy" below fold; zero pop-upów (HITL #6).
**Blokery:** S0.3, S2.3.

### S3.2 — Browse + flow zamówienia (3–4 tapy)
**Scope:** `/c/[category]` (karty z ceną, greyed niedostępne — NIE ukrywać, §5.5 roadmapy). Karta usługi (CTA "Zamów" + picker godziny tylko time-sensitive). Modal (uwagi opcjonalne + "Dopisz do rachunku"). POST (Network Only). Ekran sukcesu (pełny, nie toast). Gość nic nie wpisuje (HITL #1).
**DoD:** E2E-01 przechodzi; greyed tile widoczny, nie ukryty.
**Blokery:** S3.1.

### S3.3 — Moje zamówienia + SSE + fallback polling
**Scope:** `/orders` z live statusem. `EventSource('/api/orders/stream')` (runtime=nodejs + LISTEN/NOTIFY). Fallback polling 10 s. Toast przy rejected.
**DoD:** zmiana statusu w panelu → gość widzi bez odświeżania; fallback działa.
**Blokery:** S3.2, S2.6.

### S3.4 — Edge cases P0/P1 + error screens + i18n
**Scope:** token wygasły/nieważny: branded strona + nr recepcji + rozróżnienie "wygasł" vs "nieprawidłowy". Offline: toast, "Zamów" disabled. 5xx: friendly + retry. Auth-level insufficient: graceful redirect. Tłumaczenia PL/EN.
**DoD:** P0 stany = branded ekran z kontaktem; offline → disabled; 5xx → retry.
**Blokery:** S3.2.

### S3.5 — Service Worker + PWA optymalizacja
**Scope:** Workbox: Cache First (App Shell, obrazy, i18n); SWR (menu, usługi); Network First (zamówienia read); Network Only (POST, auth — NIGDY cache). WebP/AVIF lazy. Code splitting: czat, /orders, błędy — lazy.
**DoD:** offline browsing z cache; POST nigdy z cache; <150 KB initial JS.
**Blokery:** S3.4.

### S3.6 — In-app skaner QR pokoju [dodane 2026-07-10, wykonane]
**Scope:** przycisk "Skanuj kod pokoju" (`components/guest/welcome-banner.tsx`) zastępujący fallback `'Witaj!'` dla `auth_level=1` bez pokoju. Nowa strona `/scan` (`app/[locale]/(guest)/scan/page.tsx`) z komponentem klienckim (`components/guest/room-qr-scanner.tsx`) — kamera + dekodowanie QR (`qr-scanner`), walidacja zdekodowanego URL (`lib/guest/room-scan-url.ts`, same-origin + `/api/scan/room` + `room_id`), pełna nawigacja przeglądarki reużywająca istniejący `app/api/scan/room/route.ts` bez zmian. Alternatywa dla natywnego skanu aparatem telefonu, nie zamiennik.
**DoD:** zeskanowanie poprawnego QR pokoju podnosi sesję do `auth_level=2`; obcy QR → inline odrzucenie bez nawigacji; odmowa uprawnień kamery → inline fallback z prośbą o pomoc w recepcji. Zweryfikowane manualnie 2026-07-10.
**Blokery:** S3.1, S1.2 (istniejący `/api/scan/room`).
**Uwaga:** zarejestrowane jako TODO w `context/changes/s3-1/change.md` podczas manualnej weryfikacji Fazy 4 S3.1 (poza zakresem tamtej sesji), zrealizowane jako osobna sesja — patrz `context/changes/s3-6/change.md`.

---

## FAZA 4 — AI Concierge (3 sesje)

### S4.1 — Pipeline kompozycji KB + cache Redis
**Scope:** kompozytor KB: filtr `property_id` + `valid_from/until`, kolejność (FAQ→usługi→menu→polityki→okolica), `content_hash`. Upstash Redis: klucz `property_id`, invalidacja przy zmianie hasha. Test IT-9.
**DoD:** IT-9 przechodzi; edycja FAQ → nowy hash → cache invalidowany; kolejność §6.1 roadmapy.
**Blokery:** S2.4.

### S4.2 — Integracja GPT-4o-mini + SSE streaming + semantic cache
**Scope:** `/api/concierge/stream` (runtime="nodejs", dynamic="force-dynamic"). Payload: SYSTEM PROMPT + HOTEL KB + CONVERSATION 6–10 tur. GPT-4o-mini SSE. Semantic cache Upstash: próg 0,90–0,95, TTL ~1h. Logowanie: tylko `session_id` (brak PII). Cel <1,5 s; alert >5 s.
**DoD:** czat streamuje; semantic cache hit <400 ms; żaden PII do OpenAI.
**Blokery:** S4.1, S3.1.

### S4.3 — Fallback + transparentność + Quick Reply chips
**Scope:** `[FALLBACK]` → komunikat + przycisk recepcji; 3× fallback → eskalacja; skargi → natychmiastowy routing. Disclosure wirtualnego asystenta (HITL #8). Quick Reply chips. AI nie inicjuje sprzedaży (HITL #6).
**DoD:** zapytanie poza KB → fallback z przyciskiem; 3× → eskalacja; disclosure widoczny.
**Blokery:** S4.2.

---

## FAZA 5 — Analytics + walidacja (równolegle od Fazy 1)

### S5.1 — PostHog EU: 10 core events + consent banner
**Scope:** 10 events §7.4 roadmapy (MUST). Server-side. `hotel_id` group property od dnia 1. `guest_id` opaque UUID (retencja 90 dni). Consent banner. Respekt `doNotTrack`. Konwencja `verb_noun`.
**DoD:** każdy event w PostHog Live Events; `hotel_id` na każdym; banner przy pierwszej wizycie.
**Blokery:** S0.3, S1.2, S2.6.

### S5.2 — Automaty retencji (cron) + dashboard founder
**Scope:** cron (job_queue) MUST przed go-live: sesja → delete 48h po checkout+2h; logi → 30 dni; AI chat → checkout+7 dni; PostHog `guest_id` → purge 30 dni; zamówienia → 5 lat. Dashboard: Pulse + Growth (§7.4 roadmapy).
**DoD:** cron uruchamia się; IT-8 przechodzi; Pulse wyświetla liczby.
**Blokery:** S5.1.

---

## FAZA 6 — Design System (Gość + Panel) [luka odkryta 2026-07-13]

### S6.0 — Nawigacja główna: dolna nawigacja gościa + szyna panelu [luka odkryta 2026-07-14]
**Scope:**
Buduje brakującą, trwałą strukturę nawigacyjną w obu aplikacjach — na dzisiejszym stylu (Tailwind
gray/blue), bez tokenów/shadcn (to zadanie S6.1, który wykonuje się po tej sesji). Zero zmian w
logice biznesowej/RBAC/RLS — wyłącznie routing i chrome nawigacyjny.
- **Gość** (`style.md` §1.3, 5 zakładek dolnej nawigacji): nowy trwały komponent nawigacji dolnej
  (`components/guest/bottom-nav.tsx` lub równoważny) osadzony w `app/[locale]/(guest)/layout.tsx`,
  widoczny na wszystkich stronach grupy `(guest)` poza `/scan` (pełnoekranowy skaner) i `/error`
  (ekran błędu bez fałszywych afordancji). Pięć zakładek:
  - Dziś → `/` (bez zmian, istniejąca strona główna)
  - Udogodnienia → nowa strona `/amenities` re-używająca istniejącego `CategoryGrid` (bezpośrednie
    przeglądanie 5 kategorii bez przewijania przez powitanie/Polecamy)
  - Concierge → `/concierge` (bez zmian)
  - Mój pobyt → nowa strona `/my-stay`: dane rezerwacji (imię, numer pokoju w IBM Plex Mono,
    check-in/check-out z S2.9) + link do `/my-orders`
  - Odkrywaj → nowa strona `/discover`: renderuje treść "okolica" z bazy wiedzy (S2.4
    `knowledge_chunks`) dla property, pusty stan gdy brak treści
  Aktywna zakładka podświetlona wg bieżącej trasy. Nawigacja renderuje się identycznie niezależnie
  od `auth_level` — każda strona docelowa zachowuje własny guard (`requireGuestSession()` z S3.1).
- **Panel** (`style.md` §2.3, lewa szyna 240px, stała): nowy komponent
  (`components/panel/sidebar-nav.tsx`) osadzony w `app/[locale]/(hotel)/layout.tsx`. Sześć pozycji
  menu: Dashboard (`/dashboard`), Usługi (`/services`), Baza wiedzy (`/knowledge`), QR (`/qr`),
  Zamówienia (`/orders`), Użytkownicy (`/users`) — dokładnie tyle, ile ma dziś stronę + RBAC
  resource w `lib/panel/rbac.ts`. Każda pozycja filtrowana przez `canPerform(role, resource,
  'read')` z istniejącego `lib/panel/rbac.ts` — ukryta całkowicie (nie wyszarzona) gdy rola nie ma
  dostępu do odczytu, zgodnie z wzorcem "viewer nie widzi billingu" z DoD S2.1. Aktywna sekcja
  podświetlona wg bieżącej trasy. Onboarding i `app/admin/**` **poza menu** (nadal dostępne przez
  bezpośredni URL) — decyzja HITL tej sesji.
- Tłumaczenia PL/EN dla wszystkich nowych etykiet nawigacji i dwóch nowych stron gościa.

**DoD:**
- Gość: dolna nawigacja widoczna i funkcjonalna na każdej stronie `(guest)` poza `/scan`/`/error`;
  5 zakładek z poprawnym stanem aktywnym; `/my-stay` pokazuje dane rezerwacji (numer pokoju w
  mono); `/discover` renderuje treść "okolica" lub pusty stan; touch targets ≥44px (budżet z
  S3.1/S3.5 nienaruszony — brak nowych ciężkich zależności).
- Panel: lewa szyna 240px widoczna na każdej stronie `(hotel)`; 6 pozycji menu filtrowanych przez
  RBAC (viewer/staff nie widzą sekcji bez uprawnień odczytu); aktywna sekcja podświetlona;
  onboarding/`/admin` nieobecne w menu, ale nadal osiągalne przez URL.
- `npm run build`/`lint`/`typecheck`/`test` przechodzą bez regresji. Zero zmian w RBAC/RLS/routingu
  istniejących stron — wyłącznie nowy chrome nawigacyjny i dwie nowe strony gościa.

**Blokery:** S1.2 (sesja gościa/auth_level), S2.1 (RBAC panelu), S2.4 (baza wiedzy — treść
"okolica" dla `/discover`), S2.9 (dane rezerwacji/pokoju dla `/my-stay`), S3.1 (app shell gościa,
`CategoryGrid` do re-użycia w `/amenities`).

**Uwaga:** ta sesja była nieudokumentowaną luką — `style.md` §1.3/§2.3 definiuje strukturę
nawigacji dla obu aplikacji, ale żadna sesja w planie nigdy jej nie zbudowała: S3.1 dostarczył
tylko statyczny grid kategorii na stronie głównej, a każda sesja Fazy 2 (S2.1–S2.11) dodawała
kolejną stronę panelu bez wspólnego menu. `context/changes/s6-1/plan.md:178` błędnie założył, że
nawigacja gościa "jest już zaimplementowana z Fazy 3 sesji S3.1" — zweryfikowane jako nieprawdziwe
(przeszukanie repo pod kątem `nav`/`sidebar`/`tabbar`/`menu` nie znalazło żadnego komponentu
nawigacyjnego w żadnej z aplikacji). Zarejestrowana 2026-07-14 na wniosek użytkownika o
uzupełnienie navbarów przy planowaniu Fazy 6. Numer sesji **S6.0** (nie S6.2) celowo, żeby
numeracja odzwierciedlała kolejność wykonania: ta sesja musi poprzedzać S6.1, który retrofituje
zbudowaną tu strukturę na tokeny/shadcn — patrz zaktualizowany bloker S6.1 poniżej.

### S6.1 — Design tokens, shadcn/ui, retrofit UI (gość + panel)
**Scope:**
To jest retrofit, nie nowa funkcjonalność: cała logika produktu (Fazy 0–5) już istnieje i działa
na domyślnym stylu bez tokenów/biblioteki komponentów. S6.1 zmienia wyłącznie warstwę prezentacji
(CSS, markup, biblioteka komponentów) na istniejących, działających ekranach — zero zmian logiki
biznesowej, zachowania, endpointów czy schematu danych.
- Dokument konwencji **już istnieje**: `context/foundation/style.md` — dwa systemy wizualne
  ("Welcome Tray" dla gościa, "Operations Deck" dla panelu) + wspólna tkanka platformy (§3) i
  gotowy blok tokenów CSS (§4). Sesja **wdraża** ten dokument, nie tworzy nowego od zera.
- Fonty ze `style.md` §1.2/§2.2 (Frank Ruhl Libre, Public Sans, IBM Plex Sans, IBM Plex Mono) —
  dodanie przez `next/font`, zgodnie z budżetem wydajności z S3.1.
- Design tokens: CSS custom properties w `app/globals.css`, dokładnie wg bloku `style.md` §4
  (`--guest-*`, `--panel-*`, `--radius-*`, `--shadow-soft`, `--font-*`), zastępujące dzisiejsze
  domyślne zmienne Geist/`--background`/`--foreground`.
- shadcn/ui: instalacja + konfiguracja wyłącznie dla panelu hotelowego
  (`app/[locale]/(hotel)/**`, `(hotel-auth)/**`, `app/admin/**`), theme podłączony pod
  `--panel-*` z `style.md` §4. Guest PWA (`app/[locale]/(guest)/**`) zostaje na czystym
  Tailwind + tokenach `--guest-*` — brak nowej zależności po tej stronie (budżet <150 KB gzipped
  z S3.1/S3.5 nienaruszony).
- Retrofit gościa wg `style.md` §1 (komponenty sygnaturowe: ekran główny "taca powitalna",
  dymki Concierge AI jak notatka na papierze, karty usług, statusy): `components/guest/*` (13
  komponentów: splash-screen, welcome-banner, category-grid, service-card, polecamy-section,
  order-confirm-modal, order-cta, concierge-chat, guest-orders-panel, order-toast,
  language-switcher, floating-concierge-button, room-qr-scanner) + strony
  `app/[locale]/(guest)/**`.
- Retrofit panelu wg `style.md` §2 (insight ticker na dashboardzie, tabele z inline-edycją,
  generator kodów dostępu w mono, formularze zasilania AI): `components/panel/*`
  (onboarding-wizard-shell, require-permission) + strony `app/[locale]/(hotel)/**`,
  `(hotel-auth)/**`, `app/admin/**` — migracja tabel, formularzy, dropdownów, modali na
  komponenty shadcn/ui podłączone pod tokeny.
- Dostępność: kontrast WCAG AA tekst/tło (w tym stany greyed/disabled z S3.2), widoczny focus
  ring (`2px solid var(--*-accent)` z offsetem, wg `style.md` §3), touch targets ≥44px na guest
  PWA, `prefers-reduced-motion` respektowany (wg `style.md` §3 "Ruch").
- Dark mode: świadoma decyzja zamiast dzisiejszego przypadkowego `prefers-color-scheme` w
  `globals.css` — ustalić przy planowaniu (`/10x-plan`), czy zostaje (tokeny z wariantami
  light/dark) czy jest świadomie wyłączony na MVP. `style.md` dziś nie definiuje wariantów dark —
  do doprecyzowania w planie implementacji.

**DoD:** wszystkie istniejące ekrany gościa i panelu renderują się na tokenach ze `style.md` §4
(zero literału hex/koloru poza tym blokiem); panel korzysta z shadcn/ui dla
list/formularzy/modali, gość zostaje na czystym Tailwind; kontrast WCAG AA zweryfikowany na
kluczowych ekranach (welcome, home, dashboard, inbox zamówień); `npm run build`/`lint`/`test`
przechodzą bez regresji; guest bundle nie przekracza budżetu 150 KB z S3.1. Zero zmian w
logice/zachowaniu aplikacji (routing, walidacja, RBAC, RLS, SSE, AI) — wyłącznie warstwa
prezentacji.

**Blokery:** S6.0 (nawigacja musi istnieć zanim zostanie zretrofitowana), oraz wszystkie sesje z UI
zaimplementowane do tej pory — Faza 2 (S2.1–S2.11), Faza 3 (S3.1–S3.6), Faza 4 (S4.1–S4.2).
Retrofit wymaga istniejących komponentów do zmiany.

**Uwaga:** nieudokumentowana luka — `implementation_roadmap.md` i `session-plan.md` nigdy nie
definiowały design systemu ani konwencji stylu; `product-philosophy-brief.md:103-109` explicite
wyklucza "szczegółowy flow UX i projekt interfejsu" ze swojego zakresu, zapowiadając go jako
przedmiot "kolejnych sesji roboczych" — nigdy niezrealizowany. W efekcie Fazy 0–4 zbudowano na
domyślnym Tailwind v4 (Geist font, tylko `--background`/`--foreground` w `globals.css`), bez
wspólnych tokenów i bez biblioteki komponentów. Zarejestrowana 2026-07-13 na wniosek użytkownika.
Decyzje HITL podjęte przy planowaniu (do zalogowania w `decisions_log.md`, referencjonowanym w
`CLAUDE.md`, ale dziś nieobecnym w repo — rozbieżność odnotowana, nie naprawiana w tej sesji):
1. Zakres: nowa sesja z pełnym retrofitem istniejącego UI, nie tylko konwencje na przyszłość.
2. Warstwa komponentów: hybryda — czysty Tailwind + tokeny po stronie gościa, shadcn/ui po
   stronie panelu, obie podłączone pod te same CSS custom properties.
3. Branding: jednolity brand platformy dla wszystkich hoteli, bez per-hotel koloru motywu.
4. Dostępność (WCAG/kontrast) i świadoma decyzja o dark mode wchodzą do formalnego DoD.

**Uwaga (`style.md`):** `context/foundation/style.md` powstał 2026-07-13 jako realizacja tego
dokumentu konwencji (systemy "Welcome Tray"/"Operations Deck"). Tego samego dnia skorygowany:
sekcja 1.5 pierwotnie definiowała `--guest-accent` jako nadpisywany per-hotel z panelu, co
kolidowało z decyzją HITL #3 powyżej (jednolity brand platformy). Poprawiono na stały,
platformowy `--guest-accent` — jedyną zmienną per property pozostaje `properties.logo_url`.
Wątek zamknięty, nie wymaga dalszej decyzji.

**Uwaga (kolejność wykonania):** mimo numeracji na końcu pliku, S6.1 powinien zostać
zaplanowany/wykonany **przed** ukończeniem S4.3, S5.1, S5.2, żeby te sesje budowały UI od razu
zgodnie z konwencją ze `style.md` i nie wymagały drugiego retrofitu. Po zamknięciu S6.1 warto
ręcznie dopisać "+ S6.1 (konwencje)" do blokerów S4.3/S5.1/S5.2.

**Uwaga (korekta założenia, 2026-07-14):** plan S6.1 (`context/changes/s6-1/plan.md`, Faza 3
punkt 2 i Faza 4 punkt 1) zakładał gotową nawigację gościa/panelu do retrofitu. To założenie było
błędne — nawigacja nie istniała. Nową sesję S6.0 zarejestrowano, żeby ją zbudować przed
retrofitem; S6.1 przy faktycznym planowaniu/wykonaniu Fazy 3–4 musi objąć również nowe komponenty
`bottom-nav.tsx`/`sidebar-nav.tsx` i strony `/amenities`, `/my-stay`, `/discover` z S6.0.

---

## Prace dodatkowe (poza formalnym zakresem sesji)

### 2026-07-15 — Kafle kategorii gościa: tła zdjęciowe zamiast ikon
Na wniosek użytkownika, w trakcie trwania S6.1: `components/guest/category-grid.tsx` — zamiana
emoji-ikon (`CATEGORY_ICON`) na zdjęciowe tła kafli (`CATEGORY_IMAGE`, `next/image` hotlink do
Unsplash) dla wszystkich 5 kategorii (`restaurant`, `room_service`, `spa`, `transport`, `info`).
Czysto wizualna zmiana — zero zmian logiki/routingu/RBAC. Poza formalnym DoD S6.1 (który tego nie
przewidywał), udokumentowane tu zamiast w `context/changes/s6-1/plan.md`, żeby nie zaburzać
progresu formalnych faz tej sesji.

### 2026-07-15 — Zakładka "Dziś": hero image + opis hotelu, usunięcie kafli kategorii
Na wniosek użytkownika, w trakcie trwania S6.1: `app/[locale]/(guest)/page.tsx` — pod górną belką
dodano zdjęcie na pełną szerokość (~30% wysokości ekranu, nowy `components/guest/hero-image.tsx`,
`next/image` hotlink do Unsplash) i opis hotelu pod powitaniem (nowy
`components/guest/hotel-description.tsx`), nowe klucze i18n `guest.welcome.description` w
`messages/pl.json`/`en.json`. Dodatkowo usunięto z tej strony `CategoryGrid` (kafle kategorii
usług) jako zbędne obok nowego hero+opisu — komponent i `getVisibleCategories` zostają, nadal
używane na `/amenities`. Czysto wizualna zmiana — zero zmian logiki/routingu/RBAC/schematu. Poza
formalnym DoD S6.1, udokumentowane tu z tego samego powodu co wpis powyżej.

**TODO (poza zakresem tego wpisu):** opis hotelu jest dziś statycznym placeholderem — w tabeli
`properties` nie ma pola na opis (HITL, 2026-07-15: zdecydowano nie rozszerzać schematu w tej
sesji). Osobna sesja powinna dodać kolumnę `properties.description`/`description_en` + edycję w
panelu (np. `app/[locale]/(hotel)/onboarding` lub sekcja profilu hotelu) i podmienić placeholder w
`hotel-description.tsx` na dane z bazy.

**TODO (poza zakresem, zarejestrowane 2026-07-17 podczas S7.1):** panel hotelowy ma analogiczny
problem wydajnościowy jak ten naprawiony w S7.1 dla apki gościa — `lib/panel/auth.ts`
(`getHotelUser`) i `app/[locale]/(hotel)/layout.tsx` wywołują `supabase.auth.getUser()`
niezależnie od siebie (dwa round-tripy do serwera Auth zamiast jednego), a middleware (`proxy.ts`)
osobno pobiera claims JWT bez przekazania ich dalej. Osobna sesja powinna zastosować ten sam wzorzec
(dedup przez nagłówki z middleware + `Promise.all`) do warstwy auth panelu.

### 2026-07-15 — Kafle amenities poziome + CTA do udogodnień na "Dziś"
Na wniosek użytkownika, w trakcie trwania S6.1: `components/guest/category-grid.tsx` —
`/amenities` przebudowane z siatki 2×2 na pionową listę poziomych kafli pełnej szerokości
(miniatura 84×84 po lewej na tle `guest-paper`, tytuł + strzałka po prawej), po porównaniu dwóch
wariantów makiety z użytkownikiem. Dodano nowy komponent `components/guest/amenities-cta.tsx`
(przycisk-pill, styl `scanCta`) wstawiony na stronie "Dziś" (`app/[locale]/(guest)/page.tsx`)
między powitaniem a opisem hotelu; tekst z klucza `guest.welcome.amenitiesCta`
(`messages/pl.json`/`en.json`) — finalna treść PL: "Zobacz co dla Ciebie przygotowaliśmy".
Poprawiono też dwa linki, które błędnie prowadziły na `/` zamiast `/amenities`:
`app/[locale]/(guest)/order-success/page.tsx` ("Wróć do listy usług") i
`components/guest/guest-orders-panel.tsx` (pusty stan zamówień, "Przeglądaj usługi"). Czysto
wizualna zmiana + korekta routingu — zero zmian schematu/RBAC. Poza formalnym DoD S6.1,
udokumentowane tu z tego samego powodu co wpisy powyżej.

### 2026-07-15 — Paleta ciemnego motywu gościa: "Ciepła Czerń" → "Żar"
Na wniosek użytkownika, w trakcie trwania S6.1: obecna paleta `:root[data-color-scheme="dark"]`
w `app/globals.css` (tokeny `--guest-stone`/`--guest-paper`, oliwkowo-szare, ~3% różnicy jasności
tło↔karta) sprawiała wrażenie płaskiej i nieapetycznej — karty kategorii tonęły w tle, akcent
`--guest-accent` był zbyt mało nasycony, cień liczony na czerni był niewidoczny. Porównano na
żywo w przeglądarce (nie makieta) trzy warianty palety: "Ciepła Czerń" (neutralny prawie-czarny +
złoto), "Nocna Rezydencja" (chłodny grafit + złoty kontrast), "Żar" (espresso + terakotowy akcent).
"Ciepła Czerń" odrzucona przez użytkownika jako zbyt monochromatyczna ("kawa z błotem" — tło i
karta zbyt blisko tego samego brązu). Wdrożono "Żar": `--guest-stone: #1b120e`,
`--guest-paper: #2a1c15`, `--guest-ink: #f6ece2`, `--guest-ink-muted: #bba28f`,
`--guest-accent: #e08a4f`, `--guest-moss: #8a9c6e`, `--guest-clay: #e79571`,
`--guest-shadow-soft` z dodaną ciepłą poświatą (`0 0 26px rgba(224, 138, 79, 0.07)`) obok cienia.
Zmiana wyłącznie w tokenach `--guest-*`; blok `--panel-*` (panel hotelu) nietknięty — zweryfikowano
`git diff` bit w bit przed komitem. Czysto wizualna zmiana — zero zmian logiki/routingu/RBAC. Poza
formalnym DoD S6.1, udokumentowane tu z tego samego powodu co wpisy powyżej.

### 2026-07-15 — Fix: `<script>` w `RootLayout` psuł render (guest + panel)
W trakcie testowania powyższych zmian na żywo ujawnił się blokujący błąd deweloperski "Encountered
a script tag while rendering React component" w `app/layout.tsx:27`, psujący render zarówno apki
gościa, jak i panelu dla staffu (współdzielony `RootLayout`). Zweryfikowano `git diff` — plik nie
był dotknięty żadną z powyższych zmian; przyczyna to znany konflikt Next.js 16.2 + React 19 z
wzorcem `<script dangerouslySetInnerHTML>` w `<head>` Server Component (potwierdzone w publicznych
issues Next.js/next-themes/shadcn-ui). Naprawiono przez zamianę na `next/script` ze strategią
`beforeInteractive` (`import Script from 'next/script'`), co jest oficjalnie rekomendowanym wzorcem
dla blokujących skryptów anty-FOUC w head. Bez zmian w `lib/theme/color-scheme.ts` — sam skrypt
inicjalizujący `data-color-scheme` pozostał identyczny. Nie było to spowodowane pracami nad
paletą/S6.1, ale naprawione w ramach tej samej sesji, bo blokowało dalszą weryfikację na żywo.

### 2026-07-15 — Zielony odcień + gradient tła + zmiękczony akcent (dark mode gościa)
Kontynuacja wpisu o palecie "Żar": na wniosek użytkownika dodano (1) delikatne przesunięcie
`--guest-stone`/`--guest-paper` w stronę zieleni leśnej zamiast czystego espresso-brązu
(`#1a1d13`/`#242a1b` w dark, `--guest-moss` podbity do `#7fa06e`), (2) gradient tła — nowy token
`--guest-stone-deep` (głębszy stop) + klasa `.bg-guest-gradient` (liniowy gradient góra→dół),
podpięta tylko do głównego wrappera `app/[locale]/(guest)/layout.tsx`; w light mode oba stopy są
identyczne więc gradient tam jest niewidoczny, (3) zmiękczony akcent CTA — `--guest-accent` z
ostrego pomarańczu `#e08a4f` na przygaszone złoto `#c99860` (użytkownik: "ten pomarańczowy jest za
ostry"), (4) w jasnym motywie `--guest-ink` przesunięty lekko w zieleń (`#2a2b24` → `#232b1f`) z
wyjątkiem górnej belki — nowy token `--guest-ink-header` (wartość identyczna jak stary `--guest-ink`
w obu motywach) podpięty tylko do tytułu hotelu w `(guest)/layout.tsx`, żeby belka zostawała bez
zmian. Czysto wizualne, zero zmian logiki/routingu/RBAC.

### 2026-07-15 — Glassmorfizm na kaflach usług + redesign listy usług w kategorii
Na wniosek użytkownika: (1) `components/guest/category-grid.tsx` (kafle "Udogodnienia") — usunięte
płaskie `bg-guest-paper` z kontenera, panel z nazwą po prawej dostał `bg-guest-paper/65
backdrop-blur-lg` (dostrojone iteracyjnie z /45 i /60 na żywo) + cienki separator; zdjęcie po lewej
zostaje bez zmian (ostre, `object-cover`). (2) `components/guest/service-card.tsx` — przebudowany z
pionowej karty (zdjęcie u góry + tekst pod spodem, siatka 2×3) na poziomy pasek pełnej szerokości
bez zdjęcia (nazwa po lewej, cena/status po prawej, to samo szkło co w (1)); kontener listy w
`app/[locale]/(guest)/c/[category]/page.tsx` zmieniony z `grid grid-cols-2 sm:grid-cols-3` na
`flex flex-col gap-2.5`, spójnie z listą "Udogodnienia". `ServiceListItem.imageUrl` przestał być
renderowany na tej liście (zostaje używany na stronie szczegółu usługi, nietkniętej). (3) Dodany
link powrotu nad listą usług, wyrównany do prawej (`self-end`), stały cel `/amenities` (nie
`router.back()` — ustalone z użytkownikiem jako bardziej przewidywalne dla wejść przez QR/deep-link);
ikona SVG chevron (nie znak Unicode `‹` — renderował się krzywo, niespójny baseline między
fontami), tekst skrócony do samego "Wróć"/"Back" (klucz `guest.categories.back` w
`messages/pl.json`/`en.json`). Testy `service-card.test.tsx` (3/3) przechodzą bez zmian — nie
sprawdzały renderowania zdjęcia. Czysto wizualne + jeden nowy link — zero zmian schematu/RBAC. Poza
formalnym DoD S6.1, udokumentowane tu z tego samego powodu co wpisy powyżej.

### 2026-07-16 — Fix: dopełnienie retrofitu — ekrany błędów/potwierdzeń/przekierowań pominięte w Fazie 3
Faza 3 planu S6.1 (`context/changes/s6-1/plan.md`, punkt 5) wyprowadziła listę stron gościa do
retrofitu z `components/guest/*` + głównych tras `(guest)/**`, pomijając strony, które celowo żyją
poza route groupami `(guest)`/`(hotel-auth)` (muszą renderować się nawet gdy sesja gościa/panelu
zawiedzie, więc nie dziedziczą `data-theme` z layoutu grupy). W efekcie cztery realne, osiągalne
ekrany zostały na surowym Tailwind gray albo całkowicie bez stylowania: `app/[locale]/error/page.tsx`
(błąd skanu/QR gościa), `app/[locale]/offline/page.tsx` (offline gościa),
`app/[locale]/(hotel-auth)/unauthorized/page.tsx` (access denied panelu) i
`app/[locale]/invite/accept/{accept-form,accept-gate,expired-invite}.tsx` (aktywacja konta
zaproszonego pracownika). Naprawiono zgodnie z wzorcem już ustalonym w Fazie 4 dla stron poza
layoutem grupy (`(hotel-auth)/login/login-form.tsx`, `admin/login/login-form.tsx`): lokalny
`data-theme="guest"`/`data-theme="panel"` na najbliższym wrapperze; guest-side czysty Tailwind +
tokeny `--guest-*` (wzorzec 1:1 z `(guest)/room-required/page.tsx`); panel-side shadcn
`Button`/`Input`/`Label` już zainstalowane w `components/ui/`, ten sam pattern
`border-destructive/30 bg-destructive/10 text-destructive` na komunikaty błędu co w
`login-form.tsx`. `app/global-error.tsx` (Next.js root error boundary, celowo bez Tailwind — może
renderować się, gdy sam root layout padnie) i `components/analytics/consent-banner.tsx` (celowo
neutralny, renderowany nad obiema stronami platformy przed ustaleniem `data-theme`) świadomie
zostawione poza zakresem tego fixu. Czysto wizualne — zero zmian w `requireGuestSession()`,
`resolveErrorGroup`/`getErrorPageBranding`, `createBrowserClient().auth.*`, `router.push`,
walidacji formularza. `npm run build`/`typecheck`/`lint` zielone bez regresji. Poza formalnym DoD
S6.1, udokumentowane tu z tego samego powodu co wpisy powyżej.

### 2026-07-17 — Kafel "Wyloguj pobyt" na `/my-stay`
Na wniosek użytkownika: aplikacja gościa nie miała żadnego sposobu na ręczne zakończenie sesji —
`__Host-session` żyła aż do wygaśnięcia albo revoke z panelu, co utrudniało testowanie różnych
scenariuszy (inny pokój/poziom auth) na tym samym urządzeniu bez czyszczenia cookies w devtoolsach.
Dodano: (1) `app/api/guest/sign-out/route.ts` — POST-only route handler (brak GET, żeby zwykły
link/prefetch nie mógł wywołać akcji destrukcyjnej): oznacza wiersz `sessions.revoked = true`
(`createServiceRoleClient`, spójnie z `lib/anomaly/detect.ts`), usuwa cookie `__Host-session` z
`Secure`+`Path=/` (ten sam gotcha co w `proxy.ts` — bez tego browser cicho odrzuca Set-Cookie),
przekierowuje na `/error?type=signed_out`. (2) `lib/guest/error-copy.ts` +
`app/[locale]/error/page.tsx` — nowa grupa błędu `signed_out` (nie recykluje `insufficient_access`,
żeby świadome wylogowanie nie brzmiało jak błąd dostępu), z własnym komunikatem "Wylogowano" w
`messages/pl.json`/`en.json`. (3) `components/guest/sign-out-tile.tsx` — nowy client component,
styl skopiowany z `service-card.tsx` (`rounded-card`/`border-guest-ink-muted/15`/`bg-guest-paper/65`/
`shadow-soft`/`backdrop-blur-lg`, bez nowej zależności wizualnej typu lucide/shadcn `Card`), zwykły
`<form method="post">` do route handlera + `window.confirm` przed submitem jako jedyny powód
`'use client'`. Wpięty w `app/[locale]/(guest)/my-stay/page.tsx` pod istniejącym linkiem
`ordersLink`; strona zostaje Server Component. `npm test` (400/400) i `tsc --noEmit` zielone bez
regresji. Poza formalnym zakresem jakiejkolwiek sesji z `session-plan.md` — nowa, wcześniej
nieplanowana funkcja, udokumentowana tu z tego samego powodu co wpisy powyżej.

### 2026-07-17 — Fix: wyloguj pobyt zostawiał stare auth_level w cache SW
Zgłoszone przez użytkownika: po wylogowaniu i ponownym skanie kodu recepcji (świeża sesja,
`auth_level = 1`) aplikacja od razu pokazywała treść z poprzedniej sesji (`auth_level = 2`).
Przyczyna: `app/sw.ts`'s `runtimeCaching` trzyma strony gościa (`/`, `/my-stay`, `/amenities`, ...,
patrz `GUEST_NAV_PATTERNS` w `lib/sw/matchers.ts`) w cache `pages` przez `StaleWhileRevalidate`
kluczowanym wyłącznie po URL — cache nie wie, że sesja/tożsamość gościa się zmieniła. Fix z S7-1
(`app/api/guest/sign-out/route.ts`) czyścił tylko `__Host-session` cookie + `sessions.revoked` po
stronie serwera; sam browser cache `pages` (i analogicznie `guest-orders-status`, też per-sesja)
zostawał nietknięty, więc pierwsza nawigacja po ponownym skanie (redirect na `/` z
`app/api/scan/reception/route.ts`) trafiała w stary, zbuforowany HTML z poprzedniej, wyższej
sesji — zanim SW zdążył zrewalidować w tle. To nie tylko UX bug: to realny wyciek prywatnych
danych poprzedniego gościa (numer pokoju, rezerwacja) na to samo urządzenie. Naprawiono w
`components/guest/sign-out-tile.tsx`: przed właściwym submitem formularza czyści
`caches.delete('pages')` + `caches.delete('guest-orders-status')` (Cache Storage API dostępne też
z kontekstu okna, nie tylko z SW) — nazwy cache wyniesione do nowej stałej
`GUEST_SESSION_CACHE_NAMES` w `lib/sw/matchers.ts`, żeby nie dryfowały względem `app/sw.ts`.
Submit robiony programowo (`form.submit()`, które celowo nie odpala zdarzenia `submit` — brak
ryzyka pętli/podwójnego wysłania) dopiero po `clearGuestCaches()`. Dodatkowo `/api/guest/*` dopisane
do `isNetworkOnlyApi` w `lib/sw/matchers.ts` dla jawności (funkcjonalnie nieinterceptowane już
wcześniej — SW nie przechwytuje requestów bez dopasowanej trasy). `npm test` (400/400) i
`tsc --noEmit` zielone. Ręczna weryfikacja w przeglądarce (DevTools → Application → Cache Storage)
nie została wykonana w tej sesji — zalecana przed uznaniem za w pełni zweryfikowane.

---

## FAZA 7 — Wydajność

### S7.1 — Eliminacja sekwencyjnych round-tripów Supabase w aplikacji gościa [luka odkryta 2026-07-17]
**Scope:** Naprawa łańcucha renderowania każdej strony gościa (`GuestLayout` → `requireGuestSession()`
→ `getGuestSessionContext()`), który dziś wykonuje do 7 sekwencyjnych round-tripów sieciowych do
Supabase przed pierwszym renderem: (1) `lib/supabase/tenant.ts` — usunięcie wywołania RPC
`set_tenant_context` z `withTenantContext()` (klient `service_role` ma `BYPASSRLS`, RPC nie chroni
niczego, tylko kosztuje round-trip — realną izolacją tenantową pozostają `.eq('property_id', …)` w
kodzie); (2) `proxy.ts` — middleware rozszerza istniejące zapytanie `sessions` o
`auth_level`/`reservation_id`/`room_id` i przekazuje je przez nagłówki (`x-session-auth-level`,
`x-session-reservation-id`, `x-session-room-id`), `x-property-id` ustawiane bezpośrednio z wyniku
tego zapytania zamiast czekać na `getClaims()`; (3) `lib/guest/session.ts` — usunięcie
zduplikowanego drugiego `SELECT` na `sessions` (dane już w nagłówkach z (2)), oraz zamiana
sekwencyjnych `await` na `properties`/`reservations`/`rooms` na jeden `Promise.all`; (4)
`app/[locale]/(guest)/loading.tsx` — streaming fallback (Suspense) dla całej grupy tras gościa, tak
żeby powłoka renderowała się natychmiast zamiast czekać na pełny łańcuch danych. `getClaims()` w
middleware **zostaje** (odświeżanie cookies Supabase Auth — poza bezpiecznym zakresem tej sesji).
**DoD:** DevTools Network na `/` (guest) pokazuje spadek z ~7 do ~2-3 sekwencyjnych round-tripów do
Supabase; rewokacja sesji nadal natychmiastowa (revoke w bazie → kolejne żądanie → redirect
`session_revoked` bez opóźnienia); RLS/izolacja tenantowa nietknięta (gość property A nie widzi
danych property B); pierwsza nawigacja pokazuje `loading.tsx` zamiast pustego ekranu;
`npm run typecheck`/`lint`/`test` zielone bez regresji.
**Blokery:** brak — dotyka wyłącznie istniejącego kodu warstwy sesji gościa (S1.2, S3.1).
**Uwaga:** zarejestrowana na wniosek użytkownika po zgłoszeniu "każda strona ładuje się ~2s mimo
PWA" na produkcji Railway (2026-07-17). Diagnoza: `proxy.ts` + `lib/guest/session.ts` +
`lib/supabase/tenant.ts` wykonują nadmiarową, sekwencyjną pracę sieciową na każdym żądaniu; brak
`loading.tsx` w całej aplikacji potęguje odczuwalny efekt. Panel hotelowy ma analogiczny problem
(`lib/panel/auth.ts`/`(hotel)/layout.tsx`, podwójne `auth.getUser()`) — odnotowany jako TODO w
sekcji "Prace dodatkowe" powyżej, poza zakresem S7.1. Region Railway vs Supabase (kolokacja) nie
zweryfikowany w tej sesji — do ręcznego sprawdzenia przez użytkownika w dashboardach. Twarde
ograniczenie HITL (`context/archive/decisions_log.md:92,577`, natychmiastowa rewokacja sesji)
respektowane — żadna zmiana nie cache'uje stanu `revoked`/`expires_at`. Patrz
`context/changes/s7-1/change.md`.
