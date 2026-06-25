# Security Best Practices: QR-Based Auth w Aplikacji Hotelowej

**Kontekst:** Hotel Guest App MVP — bezlogowany dostęp przez QR token  
**Data:** 2025-06-25  
**Sesja:** 06

---

## 1. JWT vs Opaque Token — dlaczego UUID wygrywa w tym kontekście

### Dlaczego NIE JWT dla sesji hotelowych

JWT jest samoweryfikowalny — serwer nie musi odpytywać bazy, żeby uznać token za ważny. To zaleta w systemach z wieloma mikroserwisami, gdzie każdy serwis weryfikuje niezależnie. Dla MVP hotelowego to wada, nie zaleta.

**Kluczowy problem: rewokacja**

Gość oddaje pokój o 11:00. QR jego pokoju jest wciąż fizycznie naklejony na ścianie. Z JWT (nawet z `exp`) musisz utrzymywać denylist albo czekać do wygaśnięcia tokena. Przy 1-godzinnym JWT: przez godzinę po wymeldowaniu poprzedni gość lub ktokolwiek z jego pokoju może nadal używać aplikacji z pełnym `auth_level=2`.

Opaque UUID + tabela `sessions` z polem `revoked`:

```sql
-- Checkout wczesny: jedna operacja, skutek natychmiastowy
UPDATE sessions SET revoked = true, revoked_at = NOW(), revoked_reason = 'early_checkout'
WHERE reservation_id = $1;
```

Następny request z tym session_id: middleware sprawdza `revoked = true` → 401. Zero okna ataku.

**Rozmiar tokena w cookie nie ma znaczenia**

JWT z typowym payloadem (`sub`, `iat`, `exp`, `auth_level`, `room_id`, `hotel_id`) to ~350-500 bajtów. UUID w base64url to 22 bajty. Przy każdym HTTP request cookie lecą w nagłówku — w kontekście hotelowym (500 requestów/dobę/gość) różnica jest pomijalnie mała, ale zasada jest dobra: im mniej danych przesyłasz, tym mniej możesz ujawnić.

**Brak informacji w tokenie = brak oracle ataku**

JWT można zdekodować bez klucza (tylko weryfikacja podpisu wymaga klucza). Nawet jeśli payload nie zawiera wrażliwych danych dziś, jutro ktoś doda `room_number` do claimów i zapomnisz, że to publiczne. UUID nie mówi nic — jest tylko kluczem do rekordu w bazie.

**Podsumowanie wyboru:**

| Kryterium | JWT | Opaque UUID |
|---|---|---|
| Natychmiastowa rewokacja | Nie (bez denylist) | Tak |
| Rozmiar | ~400B | ~22B |
| Informacja w tokenie | Jawna (base64) | Żadna |
| DB lookup per request | Nie (ale denylist = tak) | Tak (1 indeksowane zapytanie) |
| Rotacja bez logout | Skomplikowana | Prosta (nowy UUID) |

Dla systemu z <10k jednoczesnych sesji: jedno `SELECT` po indeksowanym `session_id UUID` to <1ms. Overhead jest akceptowalny, a bezpieczeństwo rewokacji jest fundamentalne dla hotelowego modelu biznesowego.

---

## 2. Rate Limiting na Endpoint QR Scan

### Kontekst zagrożenia

Endpoint `/api/auth/exchange-token` (wymiana `init_token` na session cookie) jest szczególnie narażony:
- Token ma 15-minutowy TTL — atakujący ma okno na bruteforce
- UUID v4 ma 2^122 możliwości — bruteforce UUID jest bezcelowy
- Realny wektor: atakujący fotografuje QR (zdobywa prawdziwy token) i próbuje go użyć wielokrotnie lub z wielu urządzeń

Mimo to rate limiting jest konieczny, bo chroni przed:
1. Credential stuffing (token replay z wycieków)
2. Enumeracją tokenów (`init_token` z recepcji mógł być przechwycony)
3. DoS na endpoint auth

### Rekomendowane limity

**Endpoint: `POST /api/auth/exchange-token`**

```
Per IP:          5 prób / 15 minut (sliding window)
Per token:       1 próba (token jednorazowy — po pierwszym użyciu: invalid)
Globalne:        500 prób / minutę (ochrona przed rozproszonym atakiem)
```

Uzasadnienie limitu 5/15min: legalny gość wchodzi do pokoju, skanuje QR, jeden request. Jeśli sieć padnie i ponowi — drugi request. Limit 5 daje 4 margines błędu bez irytowania użytkownika.

**Endpoint: `GET /api/qr/room/{room_id}` (generowanie/odświeżanie QR recepcji)**

```
Per authenticated session: 3 żądania / minutę
Per hotel (tenant):        60 żądań / minutę
```

### Implementacja z Redis (middleware pattern)

Architektura: middleware jako osobna warstwa przed handlerem, nie logika w handlerze.

```typescript
// middleware/rateLimiter.ts
import { Redis } from 'ioredis';

interface RateLimitConfig {
  keyPrefix: string;
  maxAttempts: number;
  windowSeconds: number;
  blockDurationSeconds?: number; // osobny klucz blokady
}

async function checkRateLimit(
  redis: Redis,
  identifier: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean; remaining: number; retryAfter?: number }> {
  const key = `rl:${config.keyPrefix}:${identifier}`;
  const blockKey = `rl:block:${config.keyPrefix}:${identifier}`;

  // Sprawdź czy jest aktywna blokada
  const isBlocked = await redis.exists(blockKey);
  if (isBlocked) {
    const ttl = await redis.ttl(blockKey);
    return { allowed: false, remaining: 0, retryAfter: ttl };
  }

  // Sliding window counter (INCR + EXPIRE atomic przez pipeline)
  const pipeline = redis.pipeline();
  pipeline.incr(key);
  pipeline.expire(key, config.windowSeconds);
  const results = await pipeline.exec();
  const count = results[0][1] as number;

  if (count > config.maxAttempts) {
    // Ustaw osobny klucz blokady (dłuższy TTL niż okno)
    const blockDuration = config.blockDurationSeconds ?? config.windowSeconds * 2;
    await redis.set(blockKey, '1', 'EX', blockDuration);
    return { allowed: false, remaining: 0, retryAfter: blockDuration };
  }

  return { allowed: true, remaining: config.maxAttempts - count };
}

// Użycie w route handlerze (Next.js App Router / Express)
export async function exchangeTokenRateLimiter(req: Request, redis: Redis) {
  const ip = req.headers.get('cf-connecting-ip') // Cloudflare
    ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim()
    ?? 'unknown';

  const result = await checkRateLimit(redis, ip, {
    keyPrefix: 'qr-exchange',
    maxAttempts: 5,
    windowSeconds: 900, // 15 minut
    blockDurationSeconds: 1800, // blokada 30 minut po przekroczeniu
  });

  if (!result.allowed) {
    return Response.json(
      { error: 'Too many attempts' },
      {
        status: 429,
        headers: {
          'Retry-After': String(result.retryAfter),
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }

  return null; // kontynuuj do handlera
}
```

**Ważne: Po pomyślnej wymianie tokena zresetuj licznik IP** — legalny użytkownik nie powinien tracić limitu przez poprawne działanie.

```typescript
// Po udanej wymianie:
await redis.del(`rl:qr-exchange:${ip}`);
```

### Obsługa hotelowego NAT — problem współdzielonego IP

Hotel WiFi to klasyczny NAT: 200 gości, jeden zewnętrzny IP. Rozwiązanie: **rate limiting warstwowy**.

```
Warstwa 1 (IP):      100 prób / 15 minut z jednego IP  ← luźna, dla NAT
Warstwa 2 (token):   1 próba per token (absolutna)
Warstwa 3 (device):  10 prób / 15 minut per device fingerprint
```

Logika: IP limit jest wysoki (100) bo NAT, ale token jest jednorazowy więc IP limit chroni tylko przed enumeracją. Device fingerprint (patrz sekcja 3) pozwala na celniejsze blokowanie.

---

## 3. Token Harvesting — Ochrona QR Pokoju

### Scenariusz ataku

Gość A fotografuje QR kod w pokoju 205 przed wymeldowaniem. Następnego dnia, po zameldowaniu gościa B, gość A próbuje użyć zeskanowanego QR z kawiarni po drugiej stronie ulicy.

Lub: pracownik sprzątający fotografuje QR wszystkich pokojów. Następnie próbuje uzyskać dostęp do aplikacji w imieniu każdego gościa.

### Mechanizmy obrony

#### 3.1 Device Fingerprinting — analiza dla use case hotelowego

**Komponenty fingerprintu (bez agresywnego trackingu):**

```typescript
interface DeviceFingerprint {
  // Stabilne przez pobyt
  userAgent: string;          // ~70% unikatowości
  acceptLanguage: string;     // język przeglądarki
  timezone: string;           // Intl.DateTimeFormat().resolvedOptions().timeZone
  screenResolution: string;   // screen.width + 'x' + screen.height
  colorDepth: number;         // screen.colorDepth
  // Zmienne, ale pomocnicze
  platform: string;           // navigator.platform (deprecated ale nadal dostępny)
  touchSupport: boolean;      // navigator.maxTouchPoints > 0
}

// Hash zamiast pełnych danych (prywatność)
async function generateFingerprint(data: DeviceFingerprint): Promise<string> {
  const raw = JSON.stringify(data);
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}
```

**Pros dla hotelowego use case:**
- Gość używa własnego telefonu przez cały pobyt → fingerprint stabilny
- Wyraźna anomalia: QR z pokoju 205 zeskanowany telefonem z Androidem, a teraz próba z macOS Safari → czerwona flaga
- Nie wymaga instalacji aplikacji mobilnej

**Cons dla hotelowego use case:**
- Goście ze starszymi telefonami, VPN, Tor: fingerprint może się zmieniać między sesjami
- Hotel WiFi captive portal: przełączenie na komórkę może zmienić IP bez zmiany urządzenia → fałszywy alarm przy IP bindingu
- Przepisy RODO/GDPR: fingerprinting bez zgody jest problematyczny w UE. **Rozwiązanie: fingerprint jako sygnał anomalii (nie blokada), przechowywany jako hash, nie pełne dane, usuwany po checkout**

**Rekomendacja:** Fingerprint jako dodatkowy sygnał w systemie anomalii, nie jako twarda blokada. Blokuj tylko gdy fingerprint zmienia się RAZEM z innymi sygnałami (nowe IP + inny timezone + inny UA).

#### 3.2 IP Binding — ryzyko hotelowego WiFi

**Problem:** Hotel ma NAT. 200 gości, jeden IP wychodzący. IP binding przy naiwnej implementacji zablokuje 199 gości, gdy pierwszy się zamelduje.

**Bezpieczna implementacja: IP subnet binding, nie exact IP**

```sql
-- W tabeli sessions: przechowuj /24 subnet, nie pełne IP
ALTER TABLE sessions ADD COLUMN registered_subnet INET; -- np. 192.168.1.0/24

-- Przy wymianie tokena:
UPDATE sessions 
SET registered_subnet = host(network(set_masklen($1::inet, 24)))::inet
WHERE session_id = $2;

-- Walidacja per request: sprawdź czy IP jest w zarejestrowanej sieci
SELECT session_id FROM sessions 
WHERE session_id = $1 
  AND ($2::inet << registered_subnet OR registered_subnet IS NULL)
  AND revoked = false 
  AND expires_at > NOW();
```

**Lepsza strategia: change detection zamiast hard binding**

```typescript
interface SessionIPContext {
  firstSeenIP: string;       // IP przy pierwszym użyciu
  lastSeenIP: string;        // IP przy ostatnim użyciu
  uniqueIPCount: number;     // liczba unikalnych IP
  countryChanges: number;    // zmiany kraju (GeoIP)
}
```

Zmiana IP w obrębie jednego kraju: OK (hotel → restauracja hotelowa → basen, różne AP, ta sama sieć)  
Zmiana kraju: alert  
10+ unikalnych IP w ciągu godziny: auto-revoke (patrz sekcja 4)

#### 3.3 Anomaly Detection jako główna linia obrony

Zamiast twardych blokad (które generują fałszywe alarmy): **scoring system**.

```typescript
interface AnomalyScore {
  sessionId: string;
  score: number;      // 0-100, im wyżej tym bardziej podejrzany
  flags: string[];    // co wyzwoliło score
}

// Czynniki podnoszące score:
const ANOMALY_WEIGHTS = {
  newCountry: 40,           // GeoIP: inny kraj niż przy rejestracji
  manyUniqueIPs: 20,        // >5 unikalnych IP w ciągu godziny
  fingerprintChange: 15,    // zmiana UA + timezone jednocześnie
  unusualHour: 10,          // aktywność 2-6 AM lokalnie (dla typu pokój)
  rapidRequests: 15,        // >30 req/min
  afterCheckout: 100,       // natychmiastowy revoke - zawsze blokuj
};
```

Progi działania:
- Score 0-30: loguj, nic nie rób
- Score 31-60: wymagaj ponownego skanu QR (step-up re-auth)
- Score 61-99: alert do recepcji + wymagaj weryfikacji
- Score 100: auto-revoke sesji

---

## 4. Monitoring Anomalii: Token z 10 IP

### Problem

Jeden `session_id` używany z 10 różnych adresów IP w ciągu 30 minut. Scenariusze:
1. Gość korzysta z sieci hotelowej (Wi-Fi AP switching) → wiele IP, ale ta sama sieć
2. Token skradziony, używany przez wielu aktorów jednocześnie
3. Mobilna sieć z rotującymi IP (carrier-grade NAT)

### Implementacja detekcji w czasie rzeczywistym

```sql
-- Tabela do trackowania użycia sesji
CREATE TABLE session_ip_log (
  id          BIGSERIAL PRIMARY KEY,
  session_id  UUID NOT NULL REFERENCES sessions(session_id),
  ip_address  INET NOT NULL,
  user_agent  TEXT,
  request_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  country     CHAR(2),  -- z GeoIP
  asn         INTEGER   -- Autonomous System Number (identyfikuje operatora sieci)
);

CREATE INDEX idx_session_ip_log_session_time 
  ON session_ip_log(session_id, request_at DESC);

-- Zapytanie detekcji: >5 unikalnych IP z różnych ASN w ciągu 30 minut
SELECT 
  session_id,
  COUNT(DISTINCT ip_address) AS unique_ips,
  COUNT(DISTINCT asn) AS unique_networks,  -- kluczowe! nie tylko IP
  COUNT(DISTINCT country) AS unique_countries,
  MAX(request_at) - MIN(request_at) AS time_span
FROM session_ip_log
WHERE request_at > NOW() - INTERVAL '30 minutes'
GROUP BY session_id
HAVING COUNT(DISTINCT asn) > 2  -- >2 różne sieci = anomalia
    OR COUNT(DISTINCT country) > 1;  -- różne kraje = zawsze anomalia
```

**Dlaczego ASN zamiast IP:** NAT hotelowy może mieć wiele IP wychodzących, ale wszystkie należą do tego samego ISP (tego samego ASN). Gość na WiFi hotelu + komórce ma 2 różne ASN — to normalne. 5 różnych ASN w 10 minut — to nie.

### Logika reakcji

```typescript
async function handleAnomalyDetection(
  sessionId: string,
  uniqueNetworks: number,
  uniqueCountries: number,
  timeSpanMinutes: number
): Promise<void> {
  
  // Natychmiastowy auto-revoke: dowód kompromisu
  if (uniqueCountries > 1 && timeSpanMinutes < 60) {
    await db.query(
      `UPDATE sessions SET revoked = true, revoked_reason = 'anomaly_country_jump' WHERE session_id = $1`,
      [sessionId]
    );
    await notifyFrontDesk(sessionId, 'SESSION_REVOKED_COUNTRY_JUMP');
    await sendSecurityAlert({
      severity: 'HIGH',
      type: 'impossible_travel',
      sessionId,
      details: `${uniqueCountries} countries in ${timeSpanMinutes} minutes`,
    });
    return;
  }

  // Alert + step-up: podejrzane, ale możliwe (dużo AP w hotelu)
  if (uniqueNetworks > 4) {
    await flagSessionForReauth(sessionId);
    await notifyFrontDesk(sessionId, 'SESSION_SUSPICIOUS_MULTI_NETWORK');
    // Sesja działa, ale przy następnym request wymaga ponownej weryfikacji
    await db.query(
      `UPDATE sessions SET requires_reauth = true WHERE session_id = $1`,
      [sessionId]
    );
    return;
  }

  // Tylko log: niekonkluzywne
  await logAnomaly(sessionId, { uniqueNetworks, timeSpanMinutes, severity: 'LOW' });
}
```

### Dashboard recepcji — co pokazywać

```
[AKTYWNE SESJE - ALERTY]

Room 205 | Jan Kowalski | ⚠️ 6 sieci w 20 min   [PODEJRZ.] [UNIEWAŻNIJ]
Room 312 | Anna Nowak  | ✅ 1 sieć              [OK]
Room 108 | [BRAK REZERWACJI] | 🔴 UŻYTO PO CHECKOUT  [AUTO-UNIEWAŻNIONE]
```

Frontdesk nie musi rozumieć technikaliów — widzi traffic light system i może kliknąć "UNIEWAŻNIJ" jednym przyciskiem.

### Retencja logów

```sql
-- Automatyczne czyszczenie: logi sesji usuwaj 7 dni po checkout
-- (compliance: ślad audytowy bez długotrwałego przechowywania danych gościa)
CREATE OR REPLACE FUNCTION cleanup_session_logs() RETURNS void AS $$
  DELETE FROM session_ip_log sil
  USING sessions s, reservations r
  WHERE sil.session_id = s.session_id
    AND s.reservation_id = r.reservation_id
    AND r.checkout_date < NOW() - INTERVAL '7 days';
$$ LANGUAGE sql;
```

---

## 5. Bezpieczeństwo `__Host-` Cookie Prefix

### Dlaczego `__Host-`, nie `__Secure-` ani zwykłe `session`?

Cookie prefix `__Host-` to mechanizm przeglądarki (RFC 6265bis), który wymusza trzy reguły jednocześnie:

1. Cookie musi być ustawione z flagą `Secure` (tylko HTTPS)
2. Cookie NIE może mieć atrybutu `Domain` (nie można ustawić dla subdomeny)
3. Cookie musi mieć `Path=/` (obejmuje całą domenę, nie podkatalog)

Jeśli którykolwiek warunek nie jest spełniony — przeglądarka odrzuca cookie bez ostrzeżenia.

### Ataki, które `__Host-` eliminuje

**Atak 1: Cookie injection przez subdomenę**

Scenariusz: `http://malicious.hotelapp.com` (niezabezpieczona subdomena, np. stary panel administracyjny) ustawia cookie `session=evil_value` z `Domain=.hotelapp.com`.

Z `session` cookie (bez prefixu): DZIAŁA — przeglądarka wyśle `session=evil_value` do `https://guest.hotelapp.com`.

Z `__Host-session` cookie: NIE DZIAŁA — przeglądarka odrzuca cookie z atrybutem `Domain`. Atakujący nie może nadpisać cookie przez subdomenę.

**Atak 2: HTTP downgrade + cookie theft**

Scenariusz: MITM na niezabezpieczonej sieci (hotelowe WiFi!) zmienia HTTPS redirect na HTTP i kradnie cookie.

Z `__Secure-session` (flaga Secure, ale może mieć Domain): możliwy atak przez subdomenę.

Z `__Host-session` + `Secure`: cookie nigdy nie jest wysyłane przez HTTP, MITM nie widzi wartości.

**Atak 3: Path injection**

Scenariusz: XSS w `/feedback` mógłby czytać cookie z `Path=/feedback`.

Z `__Host-session` + `Path=/`: cookie jest dostępne dla całej domeny (co chcemy), ale XSS w podkatalogu też je widzi — dlatego kombinujemy z `HttpOnly` (no JS access).

### Kompletna konfigura cookie

```typescript
// Ustawianie session cookie po udanej wymianie init_token
const cookieOptions = {
  name: '__Host-session',
  value: sessionId,            // UUID v4
  httpOnly: true,              // brak dostępu przez document.cookie
  secure: true,                // tylko HTTPS (wymagane przez __Host-)
  sameSite: 'Strict' as const, // brak wysyłki w cross-site requests (CSRF ochrona)
  path: '/',                   // wymagane przez __Host-
  // BRAK: domain (wymagane przez __Host-)
  // BRAK: expires/maxAge → session cookie (usuwane przy zamknięciu przeglądarki)
  // Sesja wygasa po stronie serwera (expires_at w DB), nie przez cookie TTL
};
```

**Dlaczego brak `expires/maxAge` w cookie?** Session cookie (bez TTL) jest automatycznie usuwane gdy przeglądarka się zamknie. Rzeczywisty czas ważności kontroluje `expires_at` w bazie danych. To oznacza:
- Gość, który zamknie kartę, musi ponownie zeskanować QR (bezpieczniejsze)
- Lub: gość wraca, cookie nadal jest (nie zamknął karty) — serwer sprawdza `expires_at` i `revoked`

Opcjonalnie można dodać `maxAge` = długość pobytu + 2h, ale wtedy cookie przeżyje zamknięcie przeglądarki, co może być wygodne (gość nie musi ponownie skanować przy kolejnym otwarciu).

### Testowanie w środowisku lokalnym

`__Host-` wymaga HTTPS — `localhost` jest wyjątkiem w Chrome/Firefox i działa z HTTP, ale Safari nie honoruje tego wyjątku. Używaj `mkcert` dla lokalnego HTTPS lub testuj na staging z prawdziwym certyfikatem.

---

## 6. QR Pokoju Statyczny — Ochrona Przy Zmianie Gościa

### Scenariusze wymagające ochrony

1. **Early check-out:** Gość wymeldowuje się o 10:00 zamiast o 12:00. QR jest nadal na ścianie pokoju.
2. **Room change:** Gość prosi o zmianę z pokoju 205 na 207 w trakcie pobytu.
3. **Expired stay:** Pobyt skończył się, pokój jest w sprzątaniu, nowy gość jeszcze się nie zameldował — QR jest fizycznie dostępny dla personelu sprzątającego.
4. **No-show + room reassignment:** Rezerwacja anulowana, ten sam QR dostaje nowy gość.

### Architektura: separacja tożsamości QR od rezerwacji

Kluczowa decyzja architektoniczna: **QR kod koduje `room_id`, nie `reservation_id`**. Rewokacja działa na poziomie sesji, nie QR kodu fizycznego.

```sql
-- QR kod zawiera tylko room_id + hotel_id
-- Nigdy nie zawiera reservation_id ani guest_id

-- Tabela pośrednicząca: aktywna rezerwacja dla pokoju
CREATE TABLE room_active_reservation (
  room_id         UUID PRIMARY KEY REFERENCES rooms(room_id),
  reservation_id  UUID REFERENCES reservations(reservation_id),
  valid_from      TIMESTAMPTZ NOT NULL,
  valid_until     TIMESTAMPTZ NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Endpoint skanowania QR pokoju sprawdza:
-- 1. Czy room_id z QR ma aktywną rezerwację?
-- 2. Czy sesja ma powiązanie z tą rezerwacją (prawidłowy auth_level=1 z recepcji)?
-- 3. Dopiero wtedy podnoś auth_level do 2
```

### Early Check-out — procedura

```sql
-- Trigger/procedure wywoływana przez recepcję przy early checkout
CREATE OR REPLACE PROCEDURE process_early_checkout(p_reservation_id UUID)
LANGUAGE plpgsql AS $$
BEGIN
  -- 1. Unieważnij wszystkie sesje dla tej rezerwacji
  UPDATE sessions 
  SET revoked = true, 
      revoked_at = NOW(),
      revoked_reason = 'early_checkout'
  WHERE reservation_id = p_reservation_id
    AND revoked = false;

  -- 2. Zaktualizuj aktywną rezerwację dla pokoju
  UPDATE room_active_reservation
  SET valid_until = NOW(),
      updated_at = NOW()
  WHERE reservation_id = p_reservation_id;

  -- 3. Wyczyść init_tokens które jeszcze nie zostały wymienione
  DELETE FROM init_tokens 
  WHERE reservation_id = p_reservation_id
    AND used = false;

  -- 4. Log audit
  INSERT INTO audit_log (event_type, reservation_id, occurred_at)
  VALUES ('early_checkout_processed', p_reservation_id, NOW());
END;
$$;
```

Efekt: w ciągu jednej transakcji, natychmiastowo, QR pokoju przestaje działać dla poprzedniego gościa.

### Room Change — zachowanie ciągłości

```sql
-- Zmiana pokoju: gość 205 → 207
CREATE OR REPLACE PROCEDURE process_room_change(
  p_reservation_id UUID,
  p_new_room_id UUID
)
LANGUAGE plpgsql AS $$
BEGIN
  -- 1. Unieważnij sesje z auth_level=2 (specyficzne dla starego pokoju)
  UPDATE sessions 
  SET revoked = true,
      revoked_reason = 'room_change'
  WHERE reservation_id = p_reservation_id
    AND auth_level = 2;

  -- 2. Sesje z auth_level=1 (recepcja) pozostają ważne — gość nadal w hotelu
  -- Gość musi zeskanować QR nowego pokoju, żeby uzyskać auth_level=2

  -- 3. Zaktualizuj aktywną rezerwację
  UPDATE room_active_reservation
  SET valid_until = NOW()
  WHERE reservation_id = p_reservation_id;

  INSERT INTO room_active_reservation (room_id, reservation_id, valid_from, valid_until)
  VALUES (p_new_room_id, p_reservation_id, NOW(), 
          (SELECT checkout_datetime + INTERVAL '2 hours' FROM reservations WHERE reservation_id = p_reservation_id));

  -- 4. Zaktualizuj room_id w rezerwacji
  UPDATE reservations SET room_id = p_new_room_id WHERE reservation_id = p_reservation_id;
END;
$$;
```

Gość po zmianie pokoju: ma działającą sesję (auth_level=1, dostęp do ogólnych funkcji hotelu), ale musi zeskanować QR nowego pokoju żeby uzyskać dostęp do funkcji pokojowych (auth_level=2).

### Okno bez aktywnej rezerwacji (pokój w sprzątaniu)

```sql
-- Sprawdzenie przy skanowaniu QR pokoju
SELECT 
  r.reservation_id,
  r.checkout_datetime + INTERVAL '2 hours' AS session_expires,
  rar.valid_until
FROM room_active_reservation rar
JOIN reservations r ON rar.reservation_id = r.reservation_id
WHERE rar.room_id = $1  -- room_id z QR kodu
  AND rar.valid_from <= NOW()
  AND rar.valid_until >= NOW()  -- aktywne okno
  AND r.checkin_datetime <= NOW()
  AND (r.checkout_datetime + INTERVAL '2 hours') >= NOW();

-- Jeśli brak wyników: QR pokoju nie może podnieść auth_level
-- Gość widzi komunikat: "Pokój nie jest aktualnie przypisany do rezerwacji"
```

Personel sprzątający skanuje QR pustego pokoju: system nie znajdzie aktywnej rezerwacji → odmowa bez ujawniania szczegółów.

### Fizyczna wymiana QR — kiedy jest potrzebna?

Statyczny QR nigdy nie musi być wymieniany ze względów bezpieczeństwa — kontrola odbywa się przez bazę danych. Wymień fizyczny QR tylko gdy:
- QR jest nieczytelny (zniszczony, zalany)
- Hotel zmienia system (nowy hotel_id)
- Audyt bezpieczeństwa wymaga rotacji (np. po wycieku room_id)

Generowanie nowego QR dla pokoju: zmień `qr_token` w tabeli `rooms`, unieważnij wszystkie aktywne sesje dla tego pokoju.

---

## Podsumowanie: Mapa Zagrożeń i Mechanizmów Obronnych

| Zagrożenie | Mechanizm obronny | Priorytet |
|---|---|---|
| Bruteforce init_token | Rate limit 5/15min per IP + token jednorazowy | WYSOKI |
| Token replay (wielokrotne użycie) | `used = true` po pierwszej wymianie, atomicznie | KRYTYCZNY |
| Token harvesting (foto QR) | Anomaly detection ASN + step-up re-auth | WYSOKI |
| Sesja po early checkout | Natychmiastowy revoke przez `revoked = true` | KRYTYCZNY |
| Cookie theft (MITM hotelowe WiFi) | `__Host-` + `Secure` + `HttpOnly` + HTTPS only | KRYTYCZNY |
| CSRF (cross-site request) | `SameSite=Strict` | WYSOKI |
| Subdomain cookie injection | `__Host-` prefix (brak `Domain` atrybutu) | WYSOKI |
| Impossible travel (skradziony token) | GeoIP country change → auto-revoke | WYSOKI |
| Personel skanuje QR pustego pokoju | Walidacja `room_active_reservation` window | ŚREDNI |
| Multi-tenant (QR jednego hotelu w innym) | `hotel_id` weryfikowany przy każdym kroku Step-Up | KRYTYCZNY |
