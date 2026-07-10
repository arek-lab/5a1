# In-app skaner QR pokoju — Implementation Plan

## Overview

Zamiana `'Witaj!'` (fallback w `WelcomeBanner` dla `auth_level=1` bez pokoju) na CTA
"Skanuj kod pokoju" prowadzące do nowej strony `/scan` z pełnym in-app skanerem QR
(kamera + dekodowanie przez `qr-scanner`). Po poprawnym zdekodowaniu URL wskazującego na
`/api/scan/room`, strona robi pełną nawigację przeglądarki na ten URL — cała logika
walidacji/upgrade sesji zostaje w istniejącym `app/api/scan/room/route.ts`, zero
duplikacji.

## Current State Analysis

- `components/guest/welcome-banner.tsx:8-12` — trzy gałęzie: `guestFirstName` →
  `Witaj, X!`; inaczej `roomNumber` → `Witamy w pokoju X`; inaczej `'Witaj!'` (dokładnie ta
  ostatnia gałąź zmienia się w tej sesji).
- `app/[locale]/(guest)/page.tsx` woła `requireGuestSession()` — gość bez ważnej sesji
  (`auth_level<1`) nigdy nie dociera do `WelcomeBanner`; ten flow pozostaje bez zmian.
- `app/api/scan/room/route.ts` — istniejący route handler: rate limit (`checkScanRateLimit`),
  `validateRoomScan`, `upgradeSession`, anomaly tracking, refresh sesji Supabase, redirect na
  `/`. Oczekuje `__Host-session` cookie (już ustawione, bo `auth_level=1`) + `?room_id=`.
- `lib/qr/generate.ts` → `generateRoomQR` + `lib/qr/image.ts` → `generateQRImage` generują
  QR kodujący pełny URL do `/api/scan/room?room_id=<uuid>` (potwierdzone przez wzorzec
  reception-QR w tym samym module — recepcja/pokój oba kodują pełne URL-e do wydruku).
- Brak w repo: jakiejkolwiek biblioteki dekodującej QR po stronie klienta (`package.json` ma
  tylko `qrcode` — generator, nie scanner) i brak wzorca modala/overlay w `components/guest/`
  — `FloatingConciergeButton` to zwykły `<Link>` do osobnej strony `/concierge`, ten sam
  wzorzec powielamy dla `/scan`.
- `components/guest/__tests__/welcome-banner.test.tsx` — dziś asertuje literalny tekst
  `'Witaj!'` dla fallbacku; wymaga aktualizacji.

## Desired End State

Gość z sesją `auth_level=1` bez pokoju widzi na home page przycisk "Skanuj kod pokoju"
zamiast gołego tekstu. Kliknięcie prowadzi na `/[locale]/scan` (pod istniejącym guest
layoutem/guardem), gdzie po zgodzie na kamerę aplikacja ciągle dekoduje obraz; poprawny
kod pokoju (URL `same-origin`, path `/api/scan/room`, obecny `room_id`) wywołuje pełną
nawigację na ten URL, co odtwarza dokładnie taki sam upgrade sesji jak dziś przy skanie
natywnym aparatem. Obcy/niepoprawny kod QR pokazuje inline komunikat i skanowanie trwa
dalej — użytkownik nie opuszcza `/scan`. Brak kamery/odmowa uprawnień → inline fallback
z prośbą o pomoc w recepcji.

### Key Discoveries:

- Nawigacja pełną stroną (`window.location.href = decodedUrl`) zamiast `fetch`/`router.push`
  jest konieczna, bo `/api/scan/room` to zwykły `GET` route handler ustawiający cookies i
  robiący server-side redirect — reużycie go bez duplikowania logiki wymaga natywnej
  nawigacji przeglądarki, nie SPA-routingu Next.js.
- `qr-scanner` (npm) opakowuje `getUserMedia` + worker-based dekodowanie na `<video>`, ma
  własne typy TS i wbudowaną obsługę uprawnień/braku kamery przez rzucane wyjątki — brak
  potrzeby ręcznej ekstrakcji klatek z `<canvas>`.

## What We're NOT Doing

- Zmiana `requireGuestSession()`/guardów — stan całkowicie niezalogowany (brak sesji) nadal
  przekierowuje na `/error?type=insufficient_auth`, bez zmian.
- Nowe typy `/error?type=...` — odrzucenie obcego QR i brak kamery obsłużone inline na
  `/scan`, bez opuszczania strony.
- next-intl dla nowych stringów — zostają hardkodowane PL, spójnie z istniejącym (choć
  niespójnym z resztą apki) wzorcem w `welcome-banner.tsx`/`category-grid.tsx`.
- Zamiana/wyłączenie natywnego flow skanowania aparatem telefonu — `/scan` to dodatkowa
  ścieżka, nie zamiennik.
- Testy E2E z realną kamerą (niemożliwe w CI) — testowana jest wyłącznie czysta funkcja
  walidująca zdekodowany URL.

## Implementation Approach

Trzy kroki w kolejności zależności: (1) walidator URL + zależność `qr-scanner`, bo
komponent skanera ich potrzebuje; (2) komponent skanera + strona `/scan`; (3) CTA w
`WelcomeBanner` linkujące do gotowej strony.

## Phase 1: Walidator URL + zależność qr-scanner

### Changes Required:

#### 1. Zależność

**Komenda**: `npm install qr-scanner`

**Intencja**: Biblioteka dekodująca QR z `<video>`/kamery, worker-based, TS-typed.

#### 2. Walidator zdekodowanego URL

**Plik**: `lib/guest/room-scan-url.ts`

**Intencja**: Czysta, testowalna funkcja odrzucająca wszystko poza spodziewanym kształtem
URL-a zakodowanego w QR pokoju — kamera to wejście kontrolowane przez atakującego, więc
nigdy nie nawigujemy na surowy zdekodowany string bez walidacji.

**Kontrakt**: `isRoomScanUrl(decoded: string, currentOrigin: string): boolean` — `true`
tylko gdy `decoded` parsuje się jako absolutny URL, `new URL(decoded).origin === currentOrigin`,
`pathname === '/api/scan/room'`, i `searchParams.has('room_id')` z niepustą wartością.
Wszystko inne (zły origin, inny path, brak/pusty `room_id`, niepoprawny URL) → `false`.

### Success Criteria:

#### Automated Verification:
- `npm run typecheck`
- `npm run lint`
- Unit test `lib/guest/__tests__/room-scan-url.test.ts`: same-origin+poprawny path+room_id
  → `true`; obcy origin → `false`; inny path → `false`; brak `room_id` → `false`; niepoprawny
  URL (np. zwykły tekst) → `false`.

---

## Phase 2: Komponent skanera + strona `/scan`

### Changes Required:

#### 1. Komponent skanera (client)

**Plik**: `components/guest/room-qr-scanner.tsx`

**Intencja**: `'use client'`, montuje `<video>` pełnoekranowo, uruchamia `QrScanner` z
`qr-scanner` na tym elemencie z callbackiem `onDecode`. W callbacku: `isRoomScanUrl(result.data,
window.location.origin)` → jeśli `true`, `window.location.href = result.data`; jeśli `false`,
ustawia lokalny state z komunikatem "To nie jest kod pokoju z tego hotelu, spróbuj ponownie"
i kontynuuje skanowanie (nie zatrzymuje `QrScanner`). Start skanera w `try/catch` — błąd
(`NotAllowedError`/brak kamery) ustawia state `cameraError` renderujący inline fallback
"Nie można uzyskać dostępu do aparatu — poproś o pomoc w recepcji" (bez nowego `/error`
route). `useEffect` cleanup: `scanner.stop()` + `scanner.destroy()` przy odmontowaniu.
Import `qr-scanner` statycznie w komponencie — `next/dynamic({ ssr: false })` jest
zablokowany w Server Components w Next 16 App Router (build error), a nie jest potrzebny:
`qr-scanner` dotyka `navigator`/`window` wyłącznie wewnątrz metod wołanych z `useEffect`
(potwierdzone w źródle paczki), nie w top-level module scope, więc SSR renderu komponentu
klienckiego nie crashuje. Biblioteka i tak trafia tylko do bundla trasy `/scan`, nie do
initial bundle home page, bo import żyje w osobnym module ładowanym tylko na tej trasie.

#### 2. Strona `/scan`

**Plik**: `app/[locale]/(guest)/scan/page.tsx`

**Intencja**: Server Component pod istniejącym guest layoutem (guard `requireGuestSession()`
z `layout.tsx` nadal egzekwowany — gość musi mieć ważną sesję `auth_level>=1`, co i tak jest
prawdą dla każdego kto dotarł tu z home page). Renderuje wyłącznie `<RoomQrScanner />`
(import statyczny — patrz Key Discoveries wyżej dot. `ssr: false`).

### Success Criteria:

#### Automated Verification:
- `npm run typecheck`
- `npm run lint`
- `npm run build` (potwierdza że dynamic import się rozwiązuje, brak błędów SSR z
  `navigator`/`mediaDevices`)

#### Manual Verification:
- Otwarcie `/scan` z ważną sesją `auth_level=1` prosi o dostęp do kamery i pokazuje podgląd
- Zeskanowanie realnego QR pokoju (lub URL wygenerowanego przez `generateRoomQR`+
  `generateQRImage`) nawiguje przez `/api/scan/room` i podnosi sesję do `auth_level=2`
- Zeskanowanie obcego QR (losowy URL/tekst) pokazuje inline komunikat odrzucenia, strona się
  nie zmienia, skanowanie trwa dalej
- Odmowa uprawnień kamery pokazuje fallback z prośbą o pomoc w recepcji

---

## Phase 3: CTA w WelcomeBanner

### Changes Required:

#### 1. `components/guest/welcome-banner.tsx`

**Intencja**: Gałąź fallback (brak `guestFirstName` i `roomNumber`) zamiast tekstu `'Witaj!'`
renderuje `<Link href="/scan">Skanuj kod pokoju</Link>` stylizowany jako przycisk (spójnie z
klasami `FloatingConciergeButton`, dopasowane do layoutu banera zamiast fixed/floating).
Pozostałe dwie gałęzie (imię, numer pokoju) nietknięte.

#### 2. `components/guest/__tests__/welcome-banner.test.tsx`

**Intencja**: Zamienić asercję na literalny `'Witaj!'` na asercję że renderuje się link
`href="/scan"` z tekstem "Skanuj kod pokoju", gdy `guestFirstName=null` i `roomNumber=null`.

### Success Criteria:

#### Automated Verification:
- `npm run typecheck`
- `npm run lint`
- `npm run test -- components/guest` (włącznie z zaktualizowanym `welcome-banner.test.tsx`)

#### Manual Verification:
- Home page dla sesji `auth_level=1` bez pokoju pokazuje przycisk "Skanuj kod pokoju"
  zamiast `'Witaj!'`; pozostałe dwa stany banera (imię/numer pokoju) niezmienione

---

## Testing Strategy

### Unit Tests:
- `lib/guest/__tests__/room-scan-url.test.ts` — `isRoomScanUrl` (Faza 1)
- `components/guest/__tests__/welcome-banner.test.tsx` — zaktualizowany fallback (Faza 3)

### Manual Testing Steps:
1. Zeskanować świeży QR recepcji → sesja `auth_level=1` → home page pokazuje "Skanuj kod
   pokoju"
2. Kliknąć, zezwolić na kamerę, zeskanować prawdziwy QR pokoju → nawigacja przez
   `/api/scan/room` → powrót na `/` z numerem pokoju widocznym w bannerze
3. Zeskanować obcy QR → inline odrzucenie, brak nawigacji
4. Odmówić dostępu do kamery → inline fallback z prośbą o pomoc w recepcji

## Performance Considerations

`qr-scanner` ładowany wyłącznie dynamicznie na `/scan`, poza initial bundle home page —
zgodne z budżetem PWA z S3.1 (<150 KB gzipped dla app shell).

## References

- Geneza: TODO w `context/changes/s3-1/change.md` ("out of scope for S3.1")
- Route reużywany bez zmian: `app/api/scan/room/route.ts`
- Wzorzec generowania QR: `lib/qr/generate.ts`, `lib/qr/image.ts`
- Wzorzec Link-jako-przycisk: `components/guest/floating-concierge-button.tsx`
- Guard sesji: `lib/guest/require-session.ts`, `app/[locale]/(guest)/layout.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Walidator URL + zależność qr-scanner

#### Automated
- [x] 1.1 `npm run typecheck`
- [x] 1.2 `npm run lint`
- [x] 1.3 Unit test `room-scan-url.test.ts` przechodzi

### Phase 2: Komponent skanera + strona `/scan`

#### Automated
- [x] 2.1 `npm run typecheck`
- [x] 2.2 `npm run lint`
- [x] 2.3 `npm run build`

#### Manual
- [x] 2.4 `/scan` prosi o kamerę i pokazuje podgląd
- [x] 2.5 Skan poprawnego QR pokoju podnosi sesję do `auth_level=2`
- [x] 2.6 Skan obcego QR pokazuje inline odrzucenie
- [x] 2.7 Odmowa uprawnień pokazuje inline fallback

### Phase 3: CTA w WelcomeBanner

#### Automated
- [x] 3.1 `npm run typecheck`
- [x] 3.2 `npm run lint`
- [x] 3.3 `npm run test -- components/guest`

#### Manual
- [x] 3.4 Home page pokazuje "Skanuj kod pokoju" zamiast `'Witaj!'` dla `auth_level=1` bez pokoju
