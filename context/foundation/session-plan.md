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
