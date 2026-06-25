# QR Auth Patterns — Hotel Guest App
*Sesja 1 — Badanie przeprowadzone: 2026-06-25*

> **Uwaga metodologiczna:** Narzędzia WebSearch i WebFetch były niedostępne w tym środowisku (brak uprawnień). Dokument opiera się na wiedzy z bazy treningowej obejmującej OWASP Cheat Sheet Series, RFC 6749/7519/8252, artykuły z IETF, Stack Overflow, GitHub Security Advisories oraz literatury bezpieczeństwa do sierpnia 2025. Wszystkie powołane zasady są dobrze ugruntowane i aktualne.

---

## Kluczowe ustalenia

- Token w URL to nieunikniony punkt wejścia przy QR, ale musi być natychmiast wymieniony na cookie — trzymanie go w URL przez całą sesję jest podatnością OWASP A07
- Opaque token (losowy, nieprzezroczysty) przewyższa JWT dla tego use-case: natychmiastowa rewokacja, brak ryzyka algorytmicznych ataków, mniejszy payload w QR
- Dwuetapowa weryfikacja przez dwa QR kody (recepcja + pokój) nie ma jednego nazwanego wzorca, ale jest implementacją "step-up authentication" dobrze opisanej w OAuth2/OIDC
- Czas życia tokenu powinien być związany ze znanych datą checkout, a nie arbitralnym oknem czasowym — fixed expiry, nie sliding window
- QR kod pokoju powinien być statyczny przez pobyt (jak karta hotelowa), QR recepcji może rotować co kilka minut dla wyższego bezpieczeństwa
- Skanowanie QR musi mieć rate limiting i jednorazową wymianę initial-token → session-token, żeby zapobiec replay attack

---

## Token w URL vs Cookie

### Problem z tokenem w URL

Gdy QR kod zawiera URL z tokenem (np. `https://hotel.app/scan?token=abc123`), token automatycznie trafia do:

1. **Logów serwera** — Apache/Nginx/CDN logują pełny URL z query string domyślnie
2. **Historii przeglądarki** — URL z tokenem jest zapisywany lokalnie na urządzeniu
3. **Nagłówka Referer** — jeśli strona ładuje zasoby zewnętrzne (analytics, fonty), token wycieka do tych serwisów
4. **Cache proxy/CDN** — pośrednicy sieciowi mogą cache'ować URL z tokenem
5. **Ramienia serwisowego (shoulder surfing)** — token widoczny w pasku adresu

OWASP Session Management Cheat Sheet (sekcja "URL Rewriting") wprost zabrania przechowywania session ID w URL jako podatność klasy A07:2021 (Identification and Authentication Failures).

### Właściwy wzorzec: Token Exchange

QR kod dostarcza jednorazowy "initial token" (krótki czas życia: 5-15 minut), który po stronie serwera jest wymieniany na właściwy session token przechowywany w cookie:

```
[QR Code URL] → https://hotel.app/scan?init_token=<one_time_token>
       ↓
[Backend validation]
  - Weryfikuje init_token (ważny, nieużyty, prawidłowe IP/UA?)
  - Unieważnia init_token (single-use)
  - Tworzy session_token w bazie
  - Ustawia cookie: Set-Cookie: session=<opaque>; HttpOnly; Secure; SameSite=Strict; Path=/
       ↓
[Redirect to app] → https://hotel.app/ (token już nie jest w URL)
```

### Atrybuty cookie

| Atrybut | Wartość | Uzasadnienie |
|---------|---------|--------------|
| `HttpOnly` | true | Blokuje dostęp JS; chroni przed XSS token theft |
| `Secure` | true | Tylko HTTPS; obowiązkowe |
| `SameSite` | `Strict` | Chroni przed CSRF; PWA nie potrzebuje cross-site cookies |
| `Path` | `/` | Zakres całej aplikacji |
| `Expires` | data checkout | Token wygasa dokładnie o czasie checkout |
| `__Host-` prefix | tak | Dodatkowe zabezpieczenie (przeglądarka wymusza Secure + Path=/) |

Pełna nazwa cookie: `__Host-session=<token>`

### Porównanie: URL token vs Cookie

| Kryterium | Token w URL | Token w Cookie (HttpOnly) |
|-----------|-------------|--------------------------|
| Wyciek przez logi | Tak | Nie |
| Dostęp przez JS (XSS) | Tak (jeśli w localStorage) | Nie (HttpOnly) |
| CSRF | Nie (token w URL jest "niewidoczny" dla innych) | Wymaga SameSite/CSRF token |
| Udostępnienie linku | Tak — krytyczne ryzyko | Nie dotyczy |
| UX przy QR | Naturalne (URL) | Wymaga exchange po otwarciu |
| Rewokacja | Zależy od implementacji | Natychmiastowa (serwer-side) |

**Wniosek:** Token w URL jest akceptowalny WYŁĄCZNIE jako krótkotrwały (≤15 min) one-time initial token dostarczany przez QR, który natychmiast po odwiedzeniu strony jest wymieniany na cookie.

---

## Czas życia tokenu — rekomendacja

### Kontekst hotelowy

Pobyt hotelowy ma dwie naturalne granice: **check-in** i **check-out**. To jest idealna podstawa dla fixed expiry — w przeciwieństwie do ogólnych aplikacji, gdzie czas pobytu jest nieznany.

### Fixed Expiry vs Sliding Window

| Aspekt | Fixed Expiry | Sliding Window |
|--------|-------------|----------------|
| Przewidywalność | Deterministyczny (wygasa o checkout) | Trudniejszy do zarządzania |
| Bezpieczeństwo przy kradzieży | Token wygasa w określonym czasie | Token może żyć bardzo długo jeśli atakujący go używa |
| Implementacja | Prostsze | Wymaga aktualizacji `expires_at` przy każdym żądaniu |
| UX | Gość wie, że token wygasa przy wyjeździe | Nieoczekiwane wygaśnięcie jeśli gość nie używa aplikacji |

### Rekomendacja dla Hotel Guest App

**Główny session token:**
- Czas życia: od momentu zakończenia dwuetapowej weryfikacji do `checkout_datetime + 2h` (bufor na późne wymeldowanie)
- Typ: fixed expiry ustawiony przez serwer na podstawie danych rezerwacji
- Nie używać sliding window — zbyt ryzykowne przy skradzionym urządzeniu

**Initial token (w QR URL):**
- Czas życia: 15 minut od generowania (recepcja) lub 24h (w pokoju, QR statyczny)
- Jednorazowy (single-use) — po pierwszym użyciu natychmiast unieważniany

**Odświeżenie sesji:**
- Jeśli gość wraca po długiej przerwie i cookie wygasło (np. przez wyczyszczenie), powinien móc ponownie zeskanować QR z pokoju (bez konieczności chodzenia na recepcję)
- Recepcja QR służy do "wyższego poziomu uprawnień" (np. klucz do drzwi, checkout przez aplikację)

### Konkretne wartości

```
init_token (URL)      = 15 minut (recepcja), 24h (pokój)
session_token (cookie) = checkout_datetime + 2h
max_session_duration  = 14 dni (max długość pobytu)
idle_timeout          = brak (fixed expiry, nie sliding)
```

---

## Dwuetapowa weryfikacja — mechanika

### Analogia: Step-Up Authentication

Wzorzec jest dobrze znany w OAuth2/OIDC jako **step-up authentication** (RFC 9470 — OAuth 2.0 Step Up Authentication Challenge Protocol). Zamiast podnosić poziom uprawnień hasłem/OTP, tutaj podnoszeniem jest fizyczna obecność potwierdzana przez skanowanie QR.

### Stany autoryzacji gościa

```
[UNAUTHENTICATED]
       ↓  Scan reception QR
[RECEPTION_VERIFIED]  — "jesteś w hotelu"
       ↓  Scan room QR  
[FULLY_AUTHORIZED]    — "jesteś w pokoju X"
```

Każdy stan ma inny zestaw dostępnych funkcji:

| Stan | Dostępne funkcje |
|------|-----------------|
| UNAUTHENTICATED | Landing page, informacje ogólne |
| RECEPTION_VERIFIED | Informacje o hotelu, menu restauracji, concierge chat |
| FULLY_AUTHORIZED | Klucz do pokoju (digital key), TV control, room service, checkout |

### Implementacja mechanizmu

**Baza danych — tabela `sessions`:**
```sql
CREATE TABLE sessions (
  session_id       TEXT PRIMARY KEY,      -- opaque token (UUID v4)
  reservation_id   TEXT NOT NULL,         -- FK do rezerwacji
  room_id          TEXT,                  -- wypełniane po skan. QR pokoju
  auth_level       INTEGER DEFAULT 0,     -- 0=none, 1=reception, 2=full
  reception_scan_at TIMESTAMPTZ,
  room_scan_at      TIMESTAMPTZ,
  device_fingerprint TEXT,               -- UA + timezone hash
  expires_at        TIMESTAMPTZ NOT NULL,
  revoked           BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT now()
);
```

**Endpoint skanowania QR recepcji:**
```
POST /api/scan/reception
Body: { init_token: "abc123" }

1. Walidacja init_token (ważny, nieużyty, nie wygasł)
2. Pobranie reservation_id z init_token
3. Sprawdzenie czy rezerwacja aktywna
4. Unieważnienie init_token
5. Utworzenie session z auth_level=1, expires_at=checkout+2h
6. Zwrot: Set-Cookie: __Host-session=<session_id>
7. Redirect do aplikacji
```

**Endpoint skanowania QR pokoju:**
```
POST /api/scan/room
Headers: Cookie: __Host-session=<session_id>
Body: { room_token: "room_xyz_abc" }

1. Weryfikacja session cookie (aktywna, auth_level=1)
2. Walidacja room_token → pobierz room_id
3. Sprawdzenie czy room_id pasuje do reservation_id z sesji
4. UPDATE sessions SET auth_level=2, room_id=?, room_scan_at=now()
5. Zwrot: 200 OK + zaktualizowana sesja
```

### Precedensy w branży

- **Event ticketing (Ticketmaster, Eventbrite):** Skanowanie QR przy bramce wejściowej (analogia do recepcji) + skanowanie na konkretny sektor (analogia do pokoju)
- **Airport lounges:** Boarding pass QR (linia lotnicza = recepcja) + lounge QR (sala = pokój)
- **Co-working spaces (WeWork, Regus):** App-based entry: budynek QR → biuro QR
- **Parking systems:** Gate-in token → space assignment token
- **Digital wallets (Google Pay, Apple Pay):** Nie QR, ale analogiczny step-up: device unlock + payment confirmation

Nie istnieje jeden "standard" dla hotelowej dwuetapowej weryfikacji QR, ale wzorzec "fizyczna obecność jako faktor" jest dobrze znany w access control.

---

## Edge Cases i ich obsługa

| Przypadek | Problem | Rozwiązanie |
|-----------|---------|-------------|
| **Utrata telefonu** | Token na skradzionym urządzeniu umożliwia dostęp do pokoju | Recepcja może zrewokować wszystkie sesje danej rezerwacji; gość skanuje QR ponownie na nowym urządzeniu |
| **Wygaśnięcie sesji w trakcie pobytu** | Cookie wygasło (np. przez czyszczenie przeglądarki lub błąd) | QR z pokoju jest statyczny przez pobyt — ponowne skanowanie przywraca sesję z auth_level=2 bez wizyty w recepcji |
| **Wielokrotne skanowanie tego samego QR** | Replay attack na initial_token | Initial token jednorazowy (oznaczany jako "used" po pierwszym użyciu). QR sesyjny (pokój) jest wielorazowy, ale każde skanowanie jest rate-limited |
| **Dwóch gości, jeden QR pokoju** | Współdzielenie pokoju przez dwóch gości z oddzielnymi rezerwacjami | Dwa podejścia: (A) Jeden QR pokoju linkuje do room_id — oba konta mogą go aktywować jeśli mają room_id w rezerwacji. (B) Każda rezerwacja generuje własny QR pokoju. Rekomendacja: opcja A, z room_id walidowanym przez serwer |
| **Gość skanuje QR innego pokoju** | Próba eskalacji dostępu | Serwer sprawdza czy room_id z QR odpowiada room_id w rezerwacji. Niezgodność → odmowa + alert |
| **QR kod sfotografowany/udostępniony** | Token trafi do nieuprawnionej osoby | Initial token: 15 min TTL — okno ataku krótkie. Session token: w cookie (nie w URL). Rotacja QR recepcji co 5 minut eliminuje ryzyko całkowicie |
| **Brak internetu przy skanowaniu** | Skanowanie QR offline | PWA musi informować o braku połączenia. Weryfikacja zawsze online (bezpieczeństwo > UX). Buforowanie ostatniego stanu auth dla trybu offline (limited feature set) |
| **Przedłużenie pobytu** | Token wygaśnie o oryginalnym checkout | Recepcja przy przedłużeniu aktualizuje `expires_at` w bazie; gość nie musi nic robić |
| **Urządzenie współdzielone (family tablet)** | Wiele profili na jednym urządzeniu | Cookie jest per-browser-profile. Jeśli goście używają tego samego profilu — token jest jeden. Rozwiązanie: link z room QR powinien umożliwiać "logout + re-auth" |
| **Bot/skrypt skanujący QR URL** | Automated token harvesting | Rate limiting per IP + per init_token. CAPTCHA po 3 nieudanych próbach. Analiza device fingerprint |

---

## JWT vs Opaque Token — decyzja

### Charakterystyka JWT (JSON Web Token)

**Zalety:**
- Samodzielny (self-contained) — zawiera wszystkie claims (user_id, room, level, exp)
- Weryfikacja bez lookup do bazy danych — szybszy
- Przydatny w architekturze mikrousług bez wspólnego store

**Wady dla tego use-case:**
- **Brak rewokacji** — raz wydany JWT jest ważny do wygaśnięcia, nawet po kradzieży urządzenia
- **Algorytmic attacks** — alg:none, RS256→HS256 downgrade; wymaga starannej konfiguracji
- **Rozmiar** — JWT jest większy (kilkaset bajtów), co nie ma znaczenia dla cookie, ale ma dla QR kodu
- **Podatność na timing attacks** przy weryfikacji podpisu
- Jeśli chcemy rewokację — i tak potrzebujemy backendu/bazy (JWT token blacklist), co niweluje zalety

### Charakterystyka Opaque Token

**Zalety:**
- Pełna kontrola po stronie serwera — rewokacja natychmiastowa
- Brak wrażliwych danych w tokenie (nie można zdekodować)
- Proste zarządzanie (CRUD w bazie)
- Mały rozmiar (UUID: 36 znaków)

**Wady:**
- Każde żądanie wymaga lookup do bazy
- Skalowanie wymaga shared session store (Redis)

### Rekomendacja dla Hotel Guest App

**Opaque token jest właściwym wyborem.**

Uzasadnienie:
1. **Rewokacja jest krytyczna** — przy utracie telefonu recepcja musi móc natychmiast unieważnić dostęp
2. **Backend i tak istnieje** — aplikacja hotelowa musi mieć backend (zarządzanie pokojami, rezerwacjami, room service), więc lookup do bazy nie jest dodatkowym kosztem
3. **Prostszy audyt** — serwer wie dokładnie kto i kiedy ma aktywną sesję
4. **Brak ryzyka JWT attacks** — hotel app nie potrzebuje stateless verification
5. **Mniejszy QR kod** — UUID v4 w URL (36 znaków) vs JWT (300+ znaków) → czytelniejszy QR

**Jeśli architektura wymaga JWT** (np. edge functions bez dostępu do DB):
- Używać krótkich TTL (15 minut) + refresh token mechanism
- Utrzymywać token blacklist w Redis
- Implementować JTI (JWT ID) claim i walidować go przy każdym żądaniu
- NIGDY nie używać alg:none; wymagać RS256 lub ES256

### Struktura opaque token

```
Format:    <version>_<random>_<checksum>
Przykład:  v1_9f4a2b8c1d3e7f0a_a3f2
Wersja:    Umożliwia migrację formatu bez breaking changes
Random:    32 bajty kryptograficznie losowych (crypto.getRandomValues())
Checksum:  4 znaki dla szybkiej wstępnej walidacji (nie zamiast DB lookup)
```

---

## Security Checklist

### Token Generation
- [ ] Tokeny generowane przez CSPRNG (`crypto.getRandomValues()` lub `crypto.randomBytes()`)
- [ ] Minimalna długość: 128 bitów entropia (32 hex znaki / UUID v4)
- [ ] Initial token (URL): jednorazowy, TTL ≤ 15 minut dla QR recepcji
- [ ] Session token: przechowywany wyłącznie w HttpOnly Secure SameSite=Strict cookie
- [ ] Prefix `__Host-` dla dodatkowej ochrony cookie binding

### QR Code Security
- [ ] QR recepcji: rotacja co 5 minut (TOTP-like) lub per-scan one-time
- [ ] QR pokoju: statyczny przez pobyt (jak karta hotelowa), ale powiązany z room_id w bazie
- [ ] QR URL zawiera TYLKO initial_token, nigdy session_token
- [ ] QR generowany server-side, nie client-side

### Endpoint Protection
- [ ] Rate limiting na `/api/scan/*`: max 5 żądań/IP/minutę
- [ ] Rate limiting per initial_token: jedno użycie, potem blokada
- [ ] Logowanie każdego skanowania z: IP, User-Agent, timestamp, wynik
- [ ] Alert przy > 10 nieudanych skanowaniach z tego samego IP w 5 minut
- [ ] HTTPS obowiązkowy (HSTS z preloading)
- [ ] CORS: allowlist tylko własna domena

### Session Management
- [ ] Rewokacja wszystkich sesji danej rezerwacji przez recepcję
- [ ] Automatyczne wygaśnięcie o `checkout_datetime + 2h`
- [ ] Powiązanie sesji z device fingerprint (UA + screen resolution + timezone)
- [ ] Ostrzeżenie (nie blokada) przy nowym device fingerprint na istniejącej sesji
- [ ] Tabela sesji indeksowana po `reservation_id` dla szybkiej rewokacji

### Two-Step Verification
- [ ] auth_level trackowany per sesja (0 → 1 → 2)
- [ ] Przejście z level 1 na 2 możliwe tylko jeśli room_id z QR == room_id z rezerwacji
- [ ] Skanowanie QR z innego pokoju: odmowa + alert
- [ ] Room QR nie upgraduje `auth_level` jeśli sesja nie istnieje (wymagana najpierw recepcja)

### Edge Cases
- [ ] Obsługa "ponowne skanowanie" przez tego samego gościa — refresh sesji, nie duplikat
- [ ] Obsługa współdzielenia pokoju: walidacja room_id po stronie serwera, nie per-person QR
- [ ] Endpoint do rewokacji sesji dla recepcji (chroniony przez admin token)
- [ ] Procedura "lost phone": dokumentacja + UI w systemie hotelowym

### Infrastructure
- [ ] Session store: Redis z TTL lub PostgreSQL z indeksem na `expires_at`
- [ ] Regularne czyszczenie wygasłych sesji
- [ ] Audit log przechowywany minimum 90 dni
- [ ] Backup QR codes dla krytycznych QR (recepcja) — możliwość regeneracji

---

## Dodatkowe rekomendacje projektowe

### Statyczny vs rotujący QR

| QR | Rekomendacja | Uzasadnienie |
|----|-------------|--------------|
| Recepcja (lada) | **Rotujący co 5 minut** | Wysoka ekspozycja — wiele osób widzi QR; krótkie okno dla atakującego |
| Pokój (na drzwiach/TV) | **Statyczny przez pobyt** | Niska ekspozycja (tylko gość w pokoju); UX ważny; analogia do karty hotelowej |

Implementacja rotującego QR recepcji: TOTP (RFC 6238) z 5-minutowym oknem, wyświetlany na ekranie recepcji, aktualizowany automatycznie.

### Fingerprinting urządzenia

Nie używać jako podstawy bezpieczeństwa, ale jako sygnał anomalii:

```javascript
// Lekki fingerprint — nie inwazyjny
const fingerprint = {
  userAgent: navigator.userAgent,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  language: navigator.language,
  screenSize: `${screen.width}x${screen.height}`
};
```

Hash tego fingerprintu przechowywany przy sesji. Przy nowym fingerprincie: sesja nadal działa, ale recepcja może zobaczyć ostrzeżenie.

### PWA-specific considerations

- Service Worker może cache'ować strony — upewniać się że auth-check nie jest cache'owany
- Manifest.json: `"display": "standalone"` — usuwa pasek adresu, co utrudnia phishing ale też nie pokazuje tokenu
- Przy "Add to Home Screen": session cookie zachowany (iOS Safari ogranicza do 7 dni bez interakcji — ważne dla długich pobytów!)
- **iOS 7-day cookie limit:** Na iOS 17+ Safari usuwa cookies po 7 dniach bez interakcji. Dla pobytu > 7 dni: implementować silent re-auth przez room QR

---

## Źródła

Poniższe źródła stanowią podstawę dla rekomendacji zawartych w tym dokumencie (baza treningowa, dostęp pośredni):

- OWASP Session Management Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- OWASP Authentication Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- OWASP JSON Web Token Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html
- RFC 6238 — TOTP: Time-Based One-Time Password Algorithm — https://datatracker.ietf.org/doc/html/rfc6238
- RFC 7519 — JSON Web Token (JWT) — https://datatracker.ietf.org/doc/html/rfc7519
- RFC 9470 — OAuth 2.0 Step Up Authentication Challenge Protocol — https://datatracker.ietf.org/doc/html/rfc9470
- Mozilla MDN — HTTP Cookies — https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies
- NIST SP 800-63B — Digital Identity Guidelines (Authentication) — https://pages.nist.gov/800-63-3/sp800-63b.html
- PortSwigger Web Security — JWT Attacks — https://portswigger.net/web-security/jwt
- Scott Helme — Cookie Prefixes — https://scotthelme.co.uk/tough-cookies/
- Apple Developer Documentation — Safari ITP (Intelligent Tracking Prevention) — https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/
- Troy Hunt — Tokens in URLs are bad — https://www.troyhunt.com/

*Dokument wymaga weryfikacji przez live WebSearch przy następnej okazji, gdy narzędzia będą dostępne. Rdzenne zasady bezpieczeństwa są stabilne i nie zmieniają się w krótkim horyzoncie czasowym.*
