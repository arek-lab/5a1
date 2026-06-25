# Roadmap implementacji — Interfejs Gościa (Guest App MVP)

*Fragment roadmapy implementacyjnej. Synteza Sesji 3 (Interfejs Gościa) z ratyfikacją tech stack (T1–T5, Sesja 6).*
*Status źródeł: decisions_log.md (HITL #1–#15, T1–T5), guest-app-ux-benchmarks.md, pwa-mobile-constraints.md, upsell-ux-patterns.md*
*Data: 2026-06-25*

---

## 0. Założenia wiążące (HITL + tech stack)

Ten fragment roadmapy realizuje następujące decyzje. Każda jest twardym ograniczeniem implementacji — nie podlega reinterpretacji przez developera.

| Założenie | Źródło | Konsekwencja implementacyjna |
|---|---|---|
| **Dane gościa z tokenu — gość nic nie wpisuje** | HITL #1 | Imię, nr pokoju, daty pobytu pochodzą z JWT (Custom Access Token Hook). Zero formularzy identyfikacyjnych w guest flow. |
| **Sesja = `checkout_datetime + 2h` (fixed expiry)** | HITL #2 | Po wygaśnięciu: branded strona P0 "token wygasły". Brak self-service odnowienia. |
| **⭐ HITL #5 — "Charge to room" jako JEDYNA metoda płatności** | HITL #5 | Zero bramki płatniczej, zero PCI DSS scope, zero pola karty. W modalu potwierdzenia: przycisk "Dopisz do rachunku pokoju". |
| **⭐ HITL #6 — Sekcja "Polecamy" (3 kafelki, poniżej nawigacji, wymaga scrolla); ZERO pop-upów/modali; AI nie inicjuje sprzedaży** | HITL #6 | Sekcja "Polecamy" renderowana poniżej grida kategorii (below the fold). Brak jakiegokolwiek overlay/interstitial przy wejściu. Hotel pinuje usługi w panelu (nie algorytm). |
| **AI concierge tylko informuje/sugeruje — gość sam składa zamówienie w UI** | HITL #7 | Czat nie ma akcji transakcyjnych. Z czatu prowadzi deep-link do karty usługi, ale zamówienie zawsze przez standardowy modal. |
| **AI zawsze transparentny ("wirtualny asystent")** | HITL #8 | Nagłówek ekranu czatu + pierwsza wiadomość bota zawiera wzmiankę "wirtualny asystent". |
| **Wielojęzyczność dwuwarstwowa: UI = i18n JSON PL/EN (platforma); treści hotelowe = PL + auto-translate EN** | Sesja 3 | next-intl dla UI strings. Treści hotelowe: kolumna bazowa PL + kolumna `*_en` generowana przy zapisie w panelu. |
| **PWA App Shell < 150 KB gzipped; SSE (nie push); fallback polling 10 s** | Sesja 3 + T4 | Next.js 15 RSC + code splitting. Custom SSE przez Route Handler (`runtime="nodejs"`) + `LISTEN/NOTIFY`. |
| **Stack: Next.js 15 App Router + TS + Tailwind + next-intl; Supabase Auth (Anonymous Sign-In + Custom Hook → `property_id` w JWT)** | T1, T2 | Wszystkie zapytania tenantowe pod RLS `property_id = current_setting('app.property_id', true)::uuid`. |

**Anti-patterns — twardo zakazane (z benchmarków):**
1. Formularz przed treścią (błąd ALICE) — gość nigdy nie widzi formularza przed ofertą.
2. Koszyk/cart (błąd Intelity dla MVP) — jedno zamówienie = jeden flow.
3. Ukrywanie niedostępnych usług (błąd Canary) — niedostępne = greyed tile, nie usunięcie.
4. Pop-up wyboru języka przed wyświetleniem aplikacji — auto-detect + przełącznik w nagłówku.
5. Toast jako jedyny feedback po zamówieniu — wymagany pełny ekran sukcesu + sekcja "Moje zamówienia".

---

## 1. Architektura informacji interfejsu gościa

### 1.1 Pierwsze 10 sekund (happy path "Welcome → Browse → Order")

```
[Token exchange + auth]        300–500 ms   server-side, niewidoczne dla gościa
        ↓
[Splash screen]                max 1,5 s    logo hotelu na kolorze brandingowym;
                                            hard-timeout 1,5 s → przejście dalej nawet
                                            jeśli dane treści jeszcze się dociągają
        ↓
[Welcome screen]               natychmiast  hero image hotelu + "Witaj, [Imię]!"
                                            + 1 zdanie: "Jesteś w [Hotel Name].
                                            Jak możemy Ci dziś pomóc?" (max 2 zdania)
        ↓
[Home: grid 5 kategorii]       below welcome  5 kafelków top-level (patrz 1.2)
        ↓
[Sekcja "Polecamy"]            below grid   3 kafelki, wymaga scrolla (HITL #6)
[Floating button "Concierge"]  zawsze widoczny  wejście do AI czatu
```

**Reguły:**
- Splash to wyłącznie ekran przejściowy z hard-timeoutem 1,5 s — nie czeka na pełne dane treści (te dociągane Stale While Revalidate).
- Imię gościa (`guest_first_name` z rezerwacji, HITL #1) widoczne w nagłówku przez **cały pobyt**, nie tylko na welcome.
- Zero formularza, zero kroku weryfikacji, zero promptu języka przed welcome screen.
- Welcome + grid to jeden route (`/`); welcome to blok na górze home, nie osobny ekran.

### 1.2 Pięć kategorii top-level (max 6 — powyżej: cognitive overload)

```
🍽️  Restauracja & Bar     → menu + zamówienie do pokoju
🛎️  Usługi pokojowe       → housekeeping, amenities, maintenance
💆  Spa & Wellness        → zabiegi, basen, siłownia
🚖  Transport             → transfer, wynajem, taxi
ℹ️  Informacje            → FAQ, WiFi, check-out, godziny, okolica
```

- Grid 2 kolumny (mobile-first), kafelek = ikona + etykieta + opcjonalnie krótki podpis.
- Kolejność stała (konfigurowalna w panelu post-MVP). Dining zawsze osobno i wysoko (najwyżej konwertujący segment).
- Kategoria pusta (hotel nie ma usług spa) → kafelek ukryty lub disabled wg konfiguracji hotelu; domyślnie ukryty gdy 0 usług.

### 1.3 Sekcja "Polecamy" (HITL #6)

- **Pozycja:** poniżej grida kategorii, below the fold (gość musi przescrollować).
- **Maks. 3 kafelki**, pinowane przez hotel w panelu (NIE algorytm, NIE platforma).
- **Etykieta:** "Polecane przez [Hotel Name]" — nie "PROMOCJA", nie "OFERTA SPECJALNA", nie liczniki FOMO.
- **Frequency cap:** jeśli gość nie kliknął kafelka przez 24 h → ukryj tę pozycję (stan w `localStorage`, per `session_id`).
- **Zakaz:** pop-up, modal, interstitial, overlay przy wejściu. AI nie inicjuje sprzedaży (tylko sugeruje przy odpowiedzi na pytanie).

### 1.4 Karta usługi — prezentacja ceny

- Cena widoczna **na karcie listy** (nie po kliknięciu) — zero hidden costs.
- Usługa bezpłatna → etykieta **"W cenie pobytu" / "Included"** (NIE "0 PLN") — wyższe postrzeganie wartości.
- Karta: zdjęcie (opcjonalne, WebP/AVIF lazy) + tytuł + opis 1–2 zdania + cena/etykieta + CTA "Zamów".

### 1.5 Wielojęzyczność — architektura dwuwarstwowa

| Warstwa | Zawartość | Mechanizm | MVP |
|---|---|---|---|
| **Warstwa 1 — UI strings** | etykiety, CTA, komunikaty systemowe, błędy | next-intl, pliki i18n JSON tłumaczone przez platformę | PL + EN |
| **Warstwa 2 — treści hotelowe** | opisy usług, FAQ, nazwy kategorii custom | hotel wpisuje w PL → auto-translate EN przy zapisie w panelu (Claude/DeepL API) → kolumny `name_pl`/`name_en` w DB | PL + EN |

- **Auto-detect:** `Accept-Language` header → PL jeśli `pl`, w przeciwnym razie fallback EN.
- **Przełącznik:** w nagłówku, text label **"PL | EN"** (nie sama flaga — nieczytelna na mobile).
- **Persystencja preferencji:** `localStorage` (NIE cookie — unika konfliktu z `__Host-session`).
- Brak wersji EN treści hotelowej → fallback do PL (lub on-the-fly translate dla rzadkich języków post-MVP).

### 1.6 PWA App Shell < 150 KB gzipped

- Next.js 15 App Router + RSC → bundle poniżej budżetu bez heroicznego wysiłku (potwierdzenie Sesji 6).
- Code splitting: czat AI, "Moje zamówienia", strony błędów — lazy (`dynamic import`).
- Obrazy: WebP/AVIF, `loading="lazy"`, `srcset` dla DPI.
- Fonty: preferuj `system-ui`; custom font → `font-display: swap`.
- Performance budget (cel na slow 3G + 4-letni telefon): FCP < 3 s, LCP < 2,5 s (hard < 4 s), INP < 200 ms, CLS < 0,1, initial JS < 150 KB gzip.
- Manifest cross-platform: `<link rel="manifest">` + `apple-touch-icon` (iOS ignoruje manifest icons) + `theme-color`.
- **Add to Home Screen: NIE promować aktywnie** (gość jednorazowy, < 5% instaluje).

---

## 2. Lista ekranów i komponentów — priorytety MUST / SHOULD / COULD

### 2.1 Ekrany (routes)

| Ekran / Route | Priorytet | Opis | Uwagi implementacyjne |
|---|---|---|---|
| **Splash** | MUST | Logo hotelu, max 1,5 s, hard-timeout | Nie czeka na dane treści; czysty CSS, zero JS-blocking |
| **Welcome (część `/`)** | MUST | "Witaj, [Imię]!" + hero + 1 zdanie | Imię z JWT; blok na górze home, nie osobny route |
| **Home `/`** | MUST | Grid 5 kategorii + sekcja "Polecamy" + floating "Concierge" | "Polecamy" below the fold (HITL #6) |
| **Lista usług kategorii `/c/[category]`** | MUST | Karty usług, cena na karcie, greyed dla niedostępnych | 2 kolumny; pinowane usługi pierwsze |
| **Karta usługi `/c/[category]/[service]`** | MUST | Szczegóły + cena + CTA "Zamów" + (opcj.) picker godziny | Picker tylko dla time-sensitive (patrz 3.4) |
| **Modal potwierdzenia zamówienia** | MUST | Podsumowanie + opcjonalne pole uwag + "Dopisz do rachunku pokoju" | Modal, nie osobny route; pole uwag nigdy wymagane (HITL #5) |
| **Ekran sukcesu** | MUST | Pełny ekran (nie toast) + "co dalej" + link do "Moje zamówienia" | Anti-pattern: toast jako jedyny feedback — zakazany |
| **Moje zamówienia `/orders`** | MUST | Lista zamówień + status live (SSE) | SSE subskrypcja na statusy; fallback polling 10 s |
| **Strona błędu: token wygasły/nieważny** | MUST (P0) | Branded (logo hotelu) + nr recepcji + instrukcja | Rozróżnia "wygasł" vs "nieprawidłowy" — różny tekst, ta sama strona |
| **AI Concierge (czat) `/concierge`** | SHOULD | Interfejs czatu + Quick Reply chips + wzmianka "wirtualny asystent" | HITL #7/#8; SSE streaming odpowiedzi; deep-link do kart usług |
| **Przełącznik języka (komponent nagłówka)** | MUST | "PL \| EN" text, zawsze widoczny | `localStorage`; auto-detect przy 1. wejściu |
| **Strona błędu: usługa niedostępna** | MUST (P0) | Greyed tile + "Tymczasowo niedostępne" (in-line, nie osobny route) | Tooltip przy próbie kliknięcia |
| **Strona offline / toast offline** | SHOULD (P1) | Toast "Jesteś offline" + custom offline fallback page | Przeglądanie cache działa; zamówienia disabled |
| **Strona błędu serwera (5xx)** | SHOULD (P1) | Friendly error + nr recepcji + retry (dla zamówień) | Retry tylko dla mutacji, nie nawigacji |
| **Powiadom mnie gdy dostępna** | COULD | Opcjonalny CTA na greyed tile | Rzadko używane przez hotele — odłożone |
| **Add to Home Screen prompt (Android)** | COULD | Dyskretny banner po 2+ wizytach | Nie na iOS (brak `beforeinstallprompt`); niski priorytet |

### 2.2 Komponenty współdzielone

| Komponent | Priorytet | Uwagi |
|---|---|---|
| `<Header>` (imię gościa + przełącznik PL\|EN) | MUST | Widoczny przez cały pobyt |
| `<CategoryTile>` | MUST | Ikona + etykieta; stan disabled gdy 0 usług |
| `<ServiceCard>` | MUST | Cena/"Included" na karcie; stan greyed dla niedostępnych |
| `<OrderModal>` | MUST | Uwagi opcjonalne; "Dopisz do rachunku pokoju" |
| `<OrderStatusBadge>` | MUST | Statusy: złożone / przyjęte / w realizacji / zrealizowane / odrzucone |
| `<RecommendedSection>` | MUST | Max 3 kafelki, frequency cap 24 h (HITL #6) |
| `<FloatingConciergeButton>` | SHOULD | Wejście do czatu; zawsze widoczny |
| `<ChatBubble>` + `<QuickReplyChips>` | SHOULD | Chips kontekstowe; streaming SSE |
| `<OfflineToast>` | SHOULD | Nieblokujący, dół ekranu |
| `<TimePicker>` | SHOULD | Tylko dla usług time-sensitive |
| `<ErrorPageBranded>` | MUST | Współdzielony layout dla token/5xx z logo + nr recepcji |

---

## 3. Flow użytkownika: od QR scan do zamówionej usługi

### 3.1 Pełna ścieżka (happy path)

```
1. QR scan
   └─ QR pokoju koduje room_id (statyczny przez pobyt) — nie reservation_id
   └─ URL zawiera jednorazowy init_token (TTL 15 min)

2. init_token exchange (server-side)
   └─ Walidacja init_token → kontrola room_active_reservation(valid_from, valid_until)
   └─ Wymiana na sesję

3. Anonymous auth (Supabase)
   └─ signInAnonymously() → Custom Access Token Hook wstrzykuje property_id do JWT
   └─ Opaque UUID session_id zapisany w tabeli sessions (rewokacja, audit)
   └─ __Host-session cookie: HttpOnly; Secure; SameSite=Strict
   └─ RLS: property_id = current_setting('app.property_id', true)::uuid

4. Splash (max 1,5 s) → Welcome ("Witaj, [Imię]!")
   └─ Dane gościa (imię, pokój, daty) z JWT — gość NIC nie wpisuje (HITL #1)

5. Home → wybór kategorii (np. Restauracja & Bar)

6. Lista usług → karta usługi (cena widoczna na karcie)

7. Karta usługi → "Zamów"
   └─ Jeśli usługa time-sensitive (śniadanie, masaż, wake-up): picker godziny
   └─ Jeśli nie (ręczniki, poduszka): bez pickera (friction bez wartości)

8. Modal potwierdzenia
   └─ Podsumowanie zamówienia (z danych tokenu: pokój, imię)
   └─ Pole "Uwagi" — OPCJONALNE, placeholder "np. bez laktozy"; nigdy wymagane
   └─ Przycisk: "Dopisz do rachunku pokoju" (HITL #5 — jedyna metoda)

9. POST zamówienia (Network Only — nigdy nie cachować mutacji)
   └─ Insert do orders (property_id, session_id, status='złożone')
   └─ pg NOTIFY → panel hotelowy + powiadomienie email do hotelu

10. Ekran sukcesu (pełny, nie toast)
    └─ "Zamówienie złożone. Hotel wkrótce się z Tobą skontaktuje."
    └─ Link do "Moje zamówienia"

11. "Moje zamówienia" — status live przez SSE
    └─ EventSource(/api/orders/stream) ← LISTEN/NOTIFY na zmianach statusu
    └─ Fallback: polling co 10 s jeśli SSE niewspierane/zerwane
    └─ Statusy: złożone → przyjęte → w realizacji → zrealizowane (lub odrzucone)
```

### 3.2 Liczba tapów (cel: 3–4 od kategorii do sukcesu)

`kategoria → usługa → "Zamów" (modal) → "Dopisz do rachunku" → sukces`

### 3.3 Zasada "gość nic nie wpisuje" (HITL #1)

- Imię, numer pokoju, daty pobytu — zawsze z JWT/tokenu, nigdy z inputu gościa.
- Jedyny opcjonalny input w całym flow zamówienia: pole "Uwagi" (placeholder, nigdy required).

### 3.4 Picker godziny — tylko time-sensitive

- **Pokazuj picker:** śniadanie do pokoju, masaż/spa, wake-up call, transfer (usługi z atrybutem `time_sensitive=true` w panelu).
- **Nie pokazuj:** dodatkowe ręczniki, poduszka, amenities, maintenance — picker to friction bez wartości.

---

## 4. Edge cases i stany brzegowe

### 4.1 Tabela priorytetów P0/P1/P2

| Priorytet | Stan | Handling | Komponent |
|---|---|---|---|
| 🔴 **P0** | Token wygasły / nieważny | Branded strona (logo hotelu) + nr recepcji + "Zeskanuj ponownie QR lub skontaktuj się z recepcją". Rozróżnienie "wygasł" (checkout minął) vs "nieprawidłowy" (link uszkodzony). NIE redirect na pustą aplikację. | `<ErrorPageBranded>` |
| 🔴 **P0** | Usługa niedostępna | Greyed tile + "Tymczasowo niedostępne" (NIE ukrywać — anti-pattern Canary). Disabled, ale brak błędu po kliknięciu (tooltip). AI sugeruje alternatywę gdy gość pyta. | `<ServiceCard>` greyed |
| 🟡 **P1** | Brak internetu | Toast "Jesteś offline. Niektóre funkcje niedostępne" (nieblokujący, dół). Przeglądanie z cache działa (menu, FAQ, godziny, WiFi password). Przycisk "Zamów" disabled offline (lepsze niż klik → błąd). | `<OfflineToast>` |
| 🟡 **P1** | Błąd serwera (5xx) | Friendly error ("Coś poszło nie tak. Spróbuj za chwilę lub zadzwoń na recepcję") + nr recepcji + retry (tylko dla zamówień). | `<ErrorPageBranded>` |
| 🟢 **P2** | Zamówienie odrzucone | Status update w "Moje zamówienia" (SSE) + toast jeśli gość aktywny. Nie push (brak push na MVP). | `<OrderStatusBadge>` |
| 🟢 **P2** | Sesja wygasa wkrótce | Silent re-auth przez QR pokoju (bez komunikatu, jeśli możliwe). | server-side |

### 4.2 Service Worker — strategie cache

| Zasób | Strategia | Uzasadnienie |
|---|---|---|
| App Shell (HTML/CSS/JS bundle, fonty, ikony) | **Cache First** | Niezmienne przez sesję |
| Zdjęcia usług/pokoi | **Cache First** | Duże, niezmienne; WebP/AVIF |
| Tłumaczenia i18n (UI strings) | **Cache First** | Niezmienne |
| Offline fallback page | **Cache First** | Zawsze dostępna |
| Menu restauracji, lista usług, godziny | **Stale While Revalidate** | Zmienia się rzadko; stare dane OK + odświeżenie w tle |
| Status zamówień (read) | **Network First + cache fallback** | Musi być świeże; ostatni stan przy braku sieci |
| **Składanie zamówień (POST), auth, dane osobowe** | **Network Only — NIGDY cache** | Mutacje nie mogą być cachowane |

- Rekomendacja narzędzia: Workbox (gotowe strategie, mniej boilerplate).
- iOS: dane kasowane po 7 dniach bez interakcji (ITP) — **nie problem** dla gościa jednorazowego (1–3 doby), każda wizyta de facto pierwsza.

### 4.3 SSE + fallback polling

```javascript
// Status zamówień — SSE z fallback do pollingu
const es = new EventSource(`/api/orders/stream`);  // Route Handler runtime=nodejs
es.onmessage = (e) => updateOrderStatus(JSON.parse(e.data));
es.onerror = () => { es.close(); startPolling(10000); };  // fallback co 10 s
```

- Backend: Next.js Route Handler (`runtime="nodejs"`, persystentny serwer — Railway, NIE Vercel/Edge) + PostgreSQL `LISTEN/NOTIFY`.
- Supabase Realtime świadomie NIE użyte dla zamówień (limit 500 concurrent na Pro — za drogie przy skali 200 hoteli).

### 4.4 iOS constraints (twarde)

- Service Workers: TAK (od iOS 11.3) — cache i offline działają.
- **Push bez instalacji: NIE** — dlatego SSE zamiast push na MVP.
- Background Sync: NIE — zamówienia wymagają aktywnej sieci (brak kolejkowania offline na MVP).
- `beforeinstallprompt`: nie istnieje na iOS — A2HS prompt tylko Android, niski priorytet (COULD).
- Chrome/Firefox na iOS = WebKit pod spodem → te same ograniczenia co Safari.

---

## 5. Scenariusze E2E do testów

### 5.1 Minimum (MUST — gate przed pilotażem)

**E2E-01 — Happy path: QR scan → auth → przeglądanie → zamówienie**
```
GIVEN ważny QR pokoju z init_token (TTL 15 min) i aktywną rezerwacją
WHEN gość skanuje QR
THEN init_token wymieniony, signInAnonymously() zwraca JWT z property_id
AND splash ≤ 1,5 s → welcome pokazuje "Witaj, [Imię]!" (imię z tokenu)
AND home renderuje 5 kategorii + sekcję "Polecamy" poniżej (below fold)
WHEN gość: kategoria → usługa → "Zamów" → modal → "Dopisz do rachunku pokoju"
THEN ekran sukcesu (pełny, nie toast)
AND zamówienie widoczne w "Moje zamówienia" ze statusem "złożone"
AND gość NIE wpisał żadnych danych identyfikacyjnych (HITL #1)
AND zero pola karty / bramki płatniczej (HITL #5)
```

### 5.2 Rozszerzone (SHOULD)

**E2E-02 — Zmiana języka**
```
GIVEN gość na home w PL
WHEN klika przełącznik "PL | EN"
THEN UI strings (i18n) i treści hotelowe przełączają się na EN
AND preferencja zapisana w localStorage (przetrwa reload)
AND brak pop-upu wyboru języka (auto-detect przy 1. wejściu)
```

**E2E-03 — Offline browsing z cache**
```
GIVEN gość odwiedził menu i FAQ (cache zapełniony)
WHEN traci połączenie
THEN toast "Jesteś offline" (nieblokujący)
AND przeglądanie menu/FAQ/godzin/WiFi działa z cache
AND przycisk "Zamów" disabled (nie pozwala na klik kończący się błędem)
```

**E2E-04 — Aktualizacja statusu przez SSE**
```
GIVEN gość ma zamówienie "złożone" otwarte w "Moje zamówienia"
WHEN hotel zmienia status w panelu (przyjęte → w realizacji)
THEN status w UI aktualizuje się live przez SSE (bez reloadu)
AND przy zerwaniu SSE → fallback polling co 10 s przejmuje
```

**E2E-05 — Token wygasły (P0)**
```
GIVEN sesja po checkout_datetime + 2h (HITL #2)
WHEN gość otwiera link
THEN branded strona błędu (logo hotelu) z nr recepcji
AND komunikat rozróżnia "wygasł" vs "nieprawidłowy"
AND brak redirectu na pustą aplikację
```

### 5.3 Dodatkowe scenariusze brzegowe (SHOULD/COULD)

- **E2E-06** (SHOULD): Usługa niedostępna → greyed tile + tooltip, brak błędu przy kliknięciu (anti-pattern: ukrywanie).
- **E2E-07** (SHOULD): Zamówienie odrzucone → status update w "Moje zamówienia" + toast jeśli gość aktywny.
- **E2E-08** (COULD): AI concierge — gość pyta o restaurację → bot odpowiada + sugeruje (nie inicjuje sprzedaży, HITL #6/#7) + zawiera wzmiankę "wirtualny asystent" (HITL #8).
- **E2E-09** (COULD): Błąd serwera 5xx przy POST zamówienia → friendly error + retry + nr recepcji.

---

## 6. Kolejność implementacji (sugerowana dla solo + Claude Code, T5)

1. **MUST — App Shell + auth flow:** Splash → init_token exchange → Anonymous Sign-In + Custom Hook → Welcome (E2E-01 część auth). Performance budget < 150 KB od początku.
2. **MUST — Home + IA:** grid 5 kategorii + sekcja "Polecamy" (HITL #6) + przełącznik PL/EN.
3. **MUST — Browse + Order:** lista kategorii → karta usługi → modal → "charge to room" → ekran sukcesu (E2E-01 pełny).
4. **MUST — Moje zamówienia + SSE:** status live + fallback polling (E2E-04).
5. **MUST — Edge cases P0:** token wygasły, usługa niedostępna (E2E-05, E2E-06).
6. **SHOULD — Service Worker strategie + offline:** Cache First / SWR / Network Only (E2E-03).
7. **SHOULD — AI Concierge czat:** SSE streaming + chips + transparentność (E2E-08).
8. **SHOULD/COULD — pozostałe edge'e:** 5xx, odrzucone, A2HS Android.

---

*Fragment roadmapy implementacyjnej — Interfejs Gościa. Zgodny z HITL #1, #2, #5, #6, #7, #8 oraz tech stack T1–T5.*
*Źródła: decisions_log.md, guest-app-ux-benchmarks.md, pwa-mobile-constraints.md, upsell-ux-patterns.md (Sesja 3).*
