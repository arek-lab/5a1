# Service Worker + PWA optymalizacja — Implementation Plan

## Overview

S3.5 domyka warstwę PWA gościa: Service Worker (Workbox przez Serwist) z jawnymi
strategiami cache'owania per typ zasobu, dedykowany fallback offline, pipeline
obrazów (`next/image`, WebP/AVIF), jawne granice code-splittingu dla trzech
tras z roadmapy oraz budżet 150KB egzekwowany w CI. Sesja nie zmienia logiki
biznesowej, RBAC, RLS ani schematu danych — wyłącznie warstwę dostawy zasobów
i wydajności guest PWA.

## Current State Analysis

- Nie istnieje żaden Service Worker (`public/sw.js`), brak zależności
  `workbox-*`/`next-pwa`/`serwist` w `package.json`. `app/manifest.ts` istnieje
  (typed `MetadataRoute.Manifest`), ale ikony to wyłącznie dwa SVG
  (`public/icons/icon.svg`, `icon-maskable.svg`) — brak PNG/`apple-touch-icon`
  (iOS ignoruje ikony z manifestu).
- `next.config.ts` jest pusty poza wrapperami Sentry/next-intl — brak configu
  `images`, brak niestandardowego webpacka.
- Guest strony (`app/[locale]/(guest)/**`) renderują treść server-side w RSC
  (bezpośredni odczyt Supabase w Server Components) — nie ma osobnego
  `fetch()` po menu/usługi, które Workbox mógłby przechwycić. Jedyne
  przeglądarkowe `fetch()` w guest UI: `POST /api/orders` (mutacja),
  `GET /api/orders/guest` (read, session-bound), `POST /api/concierge/stream`
  (mutacja/streaming), `GET /api/health` (ping bez sesji).
- `services.image_url` (`components/guest/service-card.tsx:15`) i
  `properties.logo_url` (`app/[locale]/(guest)/layout.tsx:15`,
  `app/[locale]/error/page.tsx:26`) to pola tekstowe — hotel wkleja dowolny
  zewnętrzny URL (`app/[locale]/(hotel)/services/service-form.tsx:26`), nie
  domenę znaną z góry. Oba renderowane dziś przez zwykły `<img>`.
- `components/guest/concierge-chat.tsx` i `guest-orders-panel.tsx` to lekkie
  `'use client'` komponenty (tylko React hooks + `next-intl`) używane
  wyłącznie w swoich trasach (`/concierge`, `/my-orders`) — Next.js App
  Router już dziś dzieli je na osobne chunki automatycznie (routing-based code
  splitting). `components/guest/floating-concierge-button.tsx` to sam `<Link>`
  do `/concierge`, nie importuje komponentu czatu do layoutu.
- S3.4 (`context/changes/s3-4/plan.md`) dodał już `navigator.onLine` +
  `OfflineToast` (`app/[locale]/(guest)/layout.tsx:24`) — czysto klientowy
  wskaźnik statusu sieci, bez cache'owania. S3.5 działa obok, nie zastępuje.
- Brak jakiegokolwiek joba `build`/testu wydajnościowego w CI
  (`.github/workflows/ci.yml` ma tylko `lint` + `type-check`).
- Stack: Next.js `16.2.6`, React `19.2.4`, `next-intl ^4.13.0`, testy
  `vitest ^3.2.6`, brak e2e/Lighthouse w repo.

## Desired End State

Guest PWA ma aktywny Service Worker od pierwszej wizyty: statyczne zasoby i
strony gościa cache'owane zgodnie z macierzą strategii, mutacje i endpointy
sesyjne nigdy nie trafiają do cache, offline nawigacja do niecache'owanej
trasy pokazuje branded `offline` zamiast białego ekranu/błędu przeglądarki.
Obrazy usług i logo hoteli przechodzą przez `next/image` (WebP/AVIF). Trzy
komponenty z roadmapy (czat, panel zamówień, error) mają jawną granicę
`next/dynamic`. CI blokuje PR, jeśli initial JS guest bundle przekroczy
150KB gzip.

Weryfikacja: `npm run build` przechodzi, Lighthouse PWA audit na `/[locale]`
zielony, manualny test airplane-mode pokazuje cache'owaną stronę odwiedzoną
wcześniej i `offline` fallback dla nieodwiedzonej, `npm run test` (nowe testy
strategii routingu SW) zielony.

### Key Discoveries:

- `services.image_url` / `properties.logo_url` to dowolne zewnętrzne URL-e
  (nie znana z góry domena) → `next/image` wymaga `remotePatterns` z
  wildcardem hosta, nie listy konkretnych domen.
- RSC-owa architektura guest stron oznacza, że "SWR dla menu/usług" z
  roadmapy musi działać na poziomie cache'owania całego dokumentu HTML
  (`NavigationRoute`), nie na poziomie JSON — potwierdzone i rozstrzygnięte z
  użytkownikiem podczas planowania.
- Panel hotelowy (`(hotel)`, `(hotel-auth)`, `app/admin/**`) i wszystkie
  `/api/**` poza jawnie dozwolonymi GET-ami muszą być całkowicie poza zasięgiem
  cache'owania SW — to inny system auth (Supabase session cookie, nie
  `__Host-session`) i nie ma dla niego wymogu offline.

## What We're NOT Doing

- Bez zmian logiki zamówień, RBAC, RLS, SSE, AI — wyłącznie warstwa dostawy
  zasobów i cache'owania.
- Bez Push Notifications (świadomie odroczone do V2 per research —
  `context/research/session_03/pwa-mobile-constraints.md`).
- Bez aktywnego promowania Add to Home Screen (HITL z roadmapy — bez zmian w
  tej sesji).
- Bez refaktoru `OfflineToast`/`navigator.onLine` z S3.4 — zostaje bez zmian,
  działa równolegle do SW.
- Bez cache'owania panelu hotelowego (`(hotel)`/`(hotel-auth)`/`admin`) — poza
  zakresem, brak wymogu offline dla staffu.
- Bez migracji istniejących zależności zdjęć (nie ma dziś uploadu do Supabase
  Storage dla `image_url`/`logo_url` — to pozostaje polem tekstowym; sesja
  dodaje tylko renderowanie przez `next/image`, nie zmienia sposobu zapisu
  URL-i).

## Implementation Approach

Serwist (aktywnie utrzymywany następca `next-pwa`, oficjalnie wspiera Next.js
App Router, opakowuje `workbox-precaching`/`workbox-routing`/`workbox-strategies`)
zamiast ręcznego `workbox-build` — mniej boilerplate'u przy tej samej
bibliotece pod spodem, zgodnie z rekomendacją z `session_06/pwa-techstack-2026.md`
("Workbox... mniej boilerplate"). SW rejestruje się automatycznie przez
`@serwist/next` (injected `<script>` w `<head>`), bez ręcznego
`navigator.serviceWorker.register`.

Wszystkie reguły `runtimeCaching` w jednym pliku źródłowym SW
(`app/sw.ts`), żeby macierz strategii (Cache First / SWR / Network First /
Network Only) była czytelna w jednym miejscu i łatwa do code review.

## Critical Implementation Details

**Scoping cache'owania do gościa, nie całej aplikacji:** Service Worker
rejestruje się na scope `/` (cały origin), więc reguły `runtimeCaching` w
`app/sw.ts` muszą jawnie wykluczać `(hotel)`, `(hotel-auth)`, `/admin`, oraz
wszystkie `/api/**` poza jawnie wymienioną whitelistą GET-ów. Domyślna reguła
dla nierozpoznanych żądań musi być Network Only (`NetworkOnly` jako fallback
strategy), nie "cache wszystko co GET".

**`remotePatterns` dla `next/image`:** `image_url`/`logo_url` to pola
tekstowe z dowolnym zewnętrznym URL-em wklejonym przez hotel — nie ma listy
znanych domen. Użyj `images.remotePatterns: [{ protocol: 'https', hostname: '**' }]`
(Next.js 14.1+ wspiera wildcard hostname). To świadomie szerokie; jedyne
ograniczenie to protokół `https`. Jeśli w przyszłości hotel-provided images
przejdą przez Supabase Storage, `remotePatterns` można zawęzić — poza
zakresem tej sesji.

**Offline fallback musi być precached, nie tylko routowany:** `offline` page
działa jako SW fallback tylko jeśli jej HTML jest w precache manifeście od
instalacji SW (Serwist `fallbacks.entries` / precache injection), inaczej
sama strona fallbacku wymaga sieci przy pierwszym uderzeniu.

## Phase 1: Fundament Service Workera (Serwist)

### Overview

Wpięcie Serwist w build, plik źródłowy SW z lifecycle auto-activate, pusta
(na razie) tablica `runtimeCaching` do wypełnienia w Fazie 2.

### Changes Required:

#### 1. Zależności

**File**: `package.json`

**Intent**: Dodać `serwist` + `@serwist/next` jako zależności budujące i
wstrzykujące Service Workera do Next.js App Routera.

**Contract**: `dependencies`: `serwist`; `devDependencies`: `@serwist/next`
(zgodnie z oficjalnym podziałem paczek Serwist — runtime biblioteka używana w
`app/sw.ts` trafia do `dependencies`, plugin buildowy do `devDependencies`).

#### 2. Next config

**File**: `next.config.ts`

**Intent**: Owinąć istniejący `nextConfig` pluginem `withSerwist`, wskazującym
źródło SW i miejsce wygenerowanego pliku.

**Contract**: `withSerwist({ swSrc: 'app/sw.ts', swDest: 'public/sw.js', disable: process.env.NODE_ENV === 'development' })`
komponowany z istniejącymi `withSentryConfig(withNextIntl(...))` — kolejność
kompozycji: `withSerwist` na zewnątrz (Serwist musi widzieć finalny output
Next.js configu, w tym `images`/`experimental` dodane w Fazie 3).

#### 3. Service Worker source

**File**: `app/sw.ts` (nowy)

**Intent**: Zainicjować instancję Serwist z precachingiem
(`self.__SW_MANIFEST`), auto-activate (`skipWaiting: true, clientsClaim: true`)
i pustą listą `runtimeCaching` — wypełnianą w Fazie 2.

**Contract**: Eksportuje `Serwist` instance i wywołuje `serwist.addEventListeners()`.
Typy z `@serwist/next/typings` (`declare global { interface WorkerGlobalScope { __SW_MANIFEST: ... } }`)
zgodnie ze standardowym setupem Serwist dla App Routera.

#### 4. Ignorowanie wygenerowanego SW

**File**: `.gitignore`

**Intent**: Wygenerowany `public/sw.js` (i sourcemapy) nie powinien trafiać do
repo — buduje się przy każdym `next build`.

**Contract**: Dopisać `public/sw.js`, `public/sw.js.map`, `public/swe-worker-*.js`
(Serwist worker chunks).

### Success Criteria:

#### Automated Verification:

- `npm run build` przechodzi i generuje `public/sw.js`
- `npm run typecheck` przechodzi (typy `app/sw.ts` poprawne)
- `npm run lint` przechodzi

#### Manual Verification:

- W DevTools → Application → Service Workers widoczny zarejestrowany SW ze
  statusem "activated and is running" po pierwszym `npm run start`
- Po edycji `app/sw.ts` i re-buildzie, odświeżenie taba aktywuje nowy SW bez
  ręcznego zamykania wszystkich kart (potwierdza `skipWaiting`/`clientsClaim`)

---

## Phase 2: Strategie cache'owania + offline fallback

### Overview

Wypełnienie `runtimeCaching` w `app/sw.ts` zgodnie z macierzą z roadmapy,
ograniczone do tras gościa, plus dedykowana strona offline jako precached
fallback.

### Changes Required:

#### 1. Strona offline

**File**: `app/[locale]/offline/page.tsx` (nowy)

**Intent**: Statyczny, w pełni server-rendered branded ekran (wzorem
`app/[locale]/error/page.tsx`) pokazywany przez SW, gdy nawigacja offline
trafia na niecache'owaną trasę. Bez dostępu do danych sesji/property (offline
= brak sieci, nie można dociągnąć brandingu) — generyczny komunikat "brak
połączenia, spróbuj ponownie" + link `/`.

**Contract**: Nowy klucz i18n `guest.offline.{heading,body,retry}` w
`messages/pl.json` i `messages/en.json`, wzorem istniejącej struktury
`guest.error.*`.

#### 2. Runtime caching rules

**File**: `app/sw.ts`

**Intent**: Zaimplementować macierz strategii z `implementation_roadmap.md:421`
jako uporządkowaną (od najbardziej specyficznej do ogólnej) listę
`runtimeCaching` entries Serwist/Workbox.

**Contract**:
- Cache First: `_next/static/*`, `/icons/*`, `/fonts/*` (jeśli dodane w Fazie
  3) — `CacheFirst` z `ExpirationPlugin` (np. 30 dni, App Shell się nie
  zmienia między deployami dzięki content-hashed nazwom Next.js).
- Stale While Revalidate (App Shell dokumenty gościa): dopasowanie tylko do
  nawigacji HTML w guest route group — matcher wyklucza `/pl/hotel*`,
  `/en/hotel*`, `/admin*`, `/pl/hotel-auth*`, `/en/hotel-auth*` oraz
  `/[locale]/scan*` (skan pokoju ma efekt uboczny podniesienia sesji — nie
  wolno serwować z cache).
- Network First (`networkTimeoutSeconds: 3`, fallback do cache): dokładnie
  `GET /api/orders/guest`.
- Network Only (jawna, żeby nie polegać na braku reguły): `POST /api/orders`,
  `POST /api/concierge/*`, `GET|POST /api/scan/*`, `GET|POST /api/auth/*`,
  `POST /api/invite/*`, `POST /api/panel/*`, `POST /api/cron/*`,
  `GET /api/orders/stream*` (SSE — Workbox musi w ogóle nie przechwytywać
  strumieni; `NetworkOnly` z wyłączonym `cacheableResponse`).
- Fallback offline: `fallbacks: { entries: [{ url: '/pl/offline', matcher: ({request}) => request.destination === 'document' }] }`
  (Serwist `fallbacks` plugin) — precache obu wariantów locale
  (`/pl/offline`, `/en/offline`) przy instalacji SW.

### Success Criteria:

#### Automated Verification:

- `npm run build` przechodzi
- Nowy test jednostkowy `app/__tests__/sw-routing.test.ts` weryfikujący, że
  matcher dla `(hotel)`/`admin`/`/api/scan`/`/api/orders` (POST) zwraca
  `false` dla reguł cache'ujących (test samej funkcji matchera, nie pełnego
  SW runtime)
- `npm run test` zielony

#### Manual Verification:

- Chrome DevTools → Network → "Offline": odwiedzona wcześniej strona `/`
  ładuje się z cache (SWR); nieodwiedzona trasa gościa pokazuje `/offline`
  zamiast błędu przeglądarki
- `POST /api/orders` offline kończy się błędem sieci (nie fałszywym
  sukcesem z cache) — potwierdza Network Only dla mutacji
  (`context/foundation/implementation_roadmap.md:421` "POST zamówienia...
  nigdy cache")
- Panel hotelowy (`/pl/hotel/...`) offline NIE ładuje się z cache (poza
  zakresem SW) — potwierdza scoping z Critical Implementation Details

**Implementation Note**: Po tej fazie zatrzymaj się na manualne potwierdzenie
testu airplane-mode przed przejściem do Fazy 3.

---

## Phase 3: Pipeline obrazów

### Overview

`next/image` z obsługą dowolnych zewnętrznych hostów, konwersja
`service-card.tsx` na `<Image>`, uzupełnienie manifestu o PNG/`apple-touch-icon`.

### Changes Required:

#### 1. Next config — images

**File**: `next.config.ts`

**Intent**: Włączyć optymalizację obrazów dla dowolnych `https` hostów
(hotel wkleja własny URL) z formatami WebP/AVIF.

**Contract**: `images: { remotePatterns: [{ protocol: 'https', hostname: '**' }], formats: ['image/avif', 'image/webp'] }`.

#### 2. Service card

**File**: `components/guest/service-card.tsx`

**Intent**: Zastąpić `<img src={service.imageUrl}>` przez `next/image`
`<Image>` z lazy loadingiem (domyślny dla `<Image>` poza LCP) i WebP/AVIF.

**Contract**: `<Image src={service.imageUrl} alt="" fill sizes="(max-width: 640px) 100vw, 320px" className="rounded-t-lg object-cover" />`
wewnątrz kontenera z `position: relative` (wymagane przez `fill`) w miejsce
dzisiejszego `h-32 w-full`.

#### 3. Ikony manifestu

**File**: `public/icons/` (nowe pliki: `icon-192.png`, `icon-512.png`,
`icon-maskable-192.png`, `icon-maskable-512.png`, `apple-touch-icon.png`),
`app/manifest.ts`

**Intent**: Uzupełnić manifest o standardowy zestaw PNG (Chrome/Android
wymaga PNG/WebP dla instalowalności — SVG bywa niewspierany) i dodać
`apple-touch-icon`, bez którego iOS ignoruje branding przy "Add to Home
Screen".

**Contract**: `app/manifest.ts` → `icons` zawiera warianty PNG 192/512 (`purpose: 'any'`)
+ maskable 192/512 (`purpose: 'maskable'`), zachowując istniejące SVG jako
dodatkowy wpis (fallback). Root layout metadata (`app/[locale]/layout.tsx`
lub `app/layout.tsx` — którykolwiek dziś eksportuje `metadata`) dostaje
`icons.apple: '/icons/apple-touch-icon.png'`. Generowanie plików PNG z
istniejącego SVG (np. `sharp`/`resvg` w jednorazowym skrypcie build-time lub
ręcznie eksportowane) — implementer wybiera najprostszą ścieżkę zgodną z
istniejącym designem ikony; brak wymogu konkretnego narzędzia.

### Success Criteria:

#### Automated Verification:

- `npm run build` przechodzi (Next.js waliduje `remotePatterns` i manifest
  przy buildzie)
- `npm run typecheck` i `npm run lint` przechodzą

#### Manual Verification:

- Karta usługi ze zdjęciem renderuje obraz przez `/_next/image?url=...`
  (widoczne w Network tab), nie surowy URL hotela
- Lighthouse "Installable" audit nie zgłasza braku ikon
- Na iOS Safari (lub symulacji przez DevTools device toolbar) "Add to Home
  Screen" pokazuje właściwą ikonę, nie domyślny screenshot strony

---

## Phase 4: Code splitting (czat, zamówienia, błędy)

### Overview

Jawna granica `next/dynamic` dla trzech komponentów z roadmapy, mimo że
routing App Routera już dziś izoluje je do osobnych chunków — insurance
przeciw przyszłemu refaktorowi, który mógłby przenieść import do wspólnego
layoutu, i dosłowna realizacja zakresu z `session-plan.md:143`.

### Changes Required:

#### 1. Concierge chat

**File**: `app/[locale]/(guest)/concierge/page.tsx`

**Intent**: Załadować `ConciergeChat` przez `next/dynamic` z `ssr: false` —
komponent jest czysto interaktywny (stream czatu), nie potrzebuje SSR, a
jawna granica gwarantuje osobny chunk niezależnie od przyszłych zmian w
layoutcie.

**Contract**: `const ConciergeChat = dynamic(() => import('@/components/guest/concierge-chat').then(m => m.ConciergeChat), { ssr: false, loading: () => <ChatSkeleton /> })`.

#### 2. Panel zamówień

**File**: `app/[locale]/(guest)/my-orders/page.tsx`

**Intent**: Analogicznie do czatu — `GuestOrdersPanel` przez `next/dynamic`,
`ssr: false` (SSE/polling i tak wymaga hydracji klienckiej).

**Contract**: Ten sam wzorzec co punkt 1.

#### 3. Error/offline screens

**File**: `app/[locale]/error/page.tsx`, `app/[locale]/offline/page.tsx`

**Intent**: Te strony są w pełni server-rendered (bez `'use client'`) i już
są osobnymi trasami — routing-based code splitting Next.js już je izoluje od
głównego bundle'a. Weryfikacja (nie zmiana kodu): potwierdzić bundle
analyzerem z Fazy 5, że nie ciągną wspólnego chunku z resztą aplikacji.

**Contract**: Brak zmian kodu w tym punkcie — tylko weryfikacja w Fazie 5.

### Success Criteria:

#### Automated Verification:

- `npm run build` przechodzi, output buildu pokazuje osobne chunki dla
  `/concierge` i `/my-orders` (widoczne w standardowym `next build` route
  size summary)
- `npm run typecheck` i `npm run lint` przechodzą
- Istniejące testy `components/guest/__tests__/concierge-chat.test.tsx` i
  odpowiednik dla `guest-orders-panel` nadal przechodzą (import przez
  `dynamic` nie psuje testów renderujących komponent bezpośrednio)

#### Manual Verification:

- Network tab: JS chunk dla `ConciergeChat`/`GuestOrdersPanel` ładuje się
  dopiero przy wejściu na `/concierge`/`/my-orders`, nie na `/` (home)

---

## Phase 5: Budżet CI + weryfikacja końcowa

### Overview

Automatyczna blokada regresji budżetu 150KB w CI oraz pełna weryfikacja
Lighthouse/manualna zamykająca DoD sesji.

### Changes Required:

#### 1. Bundle budget

**File**: `package.json`, `.size-limit.json` (nowy)

**Intent**: Dodać `size-limit` jako dev dependency z konfiguracją budżetu dla
guest route entrypointu, plus skrypt npm do uruchomienia w CI.

**Contract**: `.size-limit.json`: `[{ "path": ".next/static/chunks/pages/**/*.js", "limit": "150 KB", "gzip": true }]`
dopasowane do faktycznej struktury outputu App Routera (implementer
weryfikuje dokładny glob po pierwszym buildzie — struktura `.next/static`
różni się między Pages i App Router, `size-limit` ma preset `@size-limit/preset-app`
dedykowany pod Next.js App Router). `package.json` → `"size": "size-limit"`.

#### 2. CI gate

**File**: `.github/workflows/ci.yml`

**Intent**: Nowy job `bundle-budget`, równoległy do `lint`/`type-check`,
failujący PR przy przekroczeniu budżetu.

**Contract**: Nowy job analogiczny do istniejących (`actions/checkout@v4` +
`actions/setup-node@v4` + `npm ci`) kończący się `npm run build && npm run size`.

### Success Criteria:

#### Automated Verification:

- `npm run size` przechodzi lokalnie i raportuje aktualny rozmiar guest
  bundle'a poniżej 150KB gzip
- Nowy CI job `bundle-budget` zielony na PR
- `npm run build`, `npm run lint`, `npm run typecheck`, `npm run test`
  wszystkie przechodzą bez regresji

#### Manual Verification:

- Lighthouse PWA audit (Chrome DevTools) na `/pl` gościa: sekcja "Installable"
  i "PWA Optimized" bez błędów krytycznych
- Manualny test airplane-mode: (a) strona odwiedzona wcześniej ładuje się z
  cache, (b) nieodwiedzona trasa pokazuje `/offline`, (c) próba złożenia
  zamówienia offline kończy się czytelnym błędem sieci (nie fałszywym
  sukcesem)
- Manualne potwierdzenie, że panel hotelowy (`/pl/hotel/...`) nie ma
  żadnego zachowania offline/cache (poza zakresem SW)

**Implementation Note**: Po tej fazie sesja S3.5 jest zamknięta — DoD z
`session-plan.md:164` w całości spełnione.

---

## Testing Strategy

### Unit Tests:

- Matcher functions dla reguł `runtimeCaching` w `app/sw.ts` (który URL
  trafia do której strategii) — bez uruchamiania pełnego SW runtime
- Istniejące testy `service-card.test.tsx` zaktualizowane pod `next/image`
  (mock `next/image` jeśli test dziś asercjonuje na `<img>`)

### Integration Tests:

- Brak nowych — poza zakresem sesji (brak zmian logiki API)

### Manual Testing Steps:

1. `npm run build && npm run start`, otworzyć `/pl` w Chrome, DevTools →
   Application → Service Workers → potwierdzić aktywny SW
2. Odwiedzić `/`, `/c/[category]`, `/my-orders`, `/concierge` online (żeby
   SW je precache'ował przez SWR)
3. DevTools → Network → "Offline", odświeżyć każdą z odwiedzonych tras —
   powinny się załadować z cache
4. DevTools → Network → "Offline", przejść na nieodwiedzoną trasę (np. nowy
   `service.id`) — powinien pokazać się `/offline`
5. Offline, spróbować złożyć zamówienie — oczekiwany czytelny błąd sieci
   (nie fałszywy sukces)
6. Wrócić online, odświeżyć panel hotelowy w osobnej karcie — potwierdzić
   brak jakiegokolwiek zachowania cache/offline (poza zasięgiem SW)
7. Lighthouse audit (mobile, throttled) na `/pl` — sprawdzić PWA + Performance
   sekcje

## Performance Considerations

Budżet 150KB gzip dotyczy initial JS guest route'a — panel hotelowy
(`(hotel)`) nie jest objęty tym budżetem (desktop, inny profil użytkownika).
`next/image` z `remotePatterns: '**'` oznacza, że Next.js Image Optimization
API proxy'uje i cache'uje po stronie serwera dowolny zewnętrzny obraz — przy
większej skali (setki hoteli) warto rozważyć CDN/cache warstwę przed tym API,
ale to poza zakresem MVP tej sesji.

## Migration Notes

Brak migracji danych. Wdrożenie SW na produkcję: pierwsza wizyta po deployu
nie ma jeszcze zainstalowanego SW (brak regresji — po prostu brak
cache'owania do czasu instalacji), więc nie wymaga koordynacji z istniejącymi
sesjami gości.

## References

- Roadmapa: `context/foundation/implementation_roadmap.md:380-425`
- Plan sesji: `context/foundation/session-plan.md:162-165`
- Research: `context/research/session_03/pwa-mobile-constraints.md`,
  `context/research/session_06/pwa-techstack-2026.md`
- Poprzednia sesja (App Shell): `context/changes/s3-1/plan.md`
- Offline UX bez cache (do zachowania bez zmian): `context/changes/s3-4/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Fundament Service Workera (Serwist)

#### Automated

- [x] 1.1 `npm run build` generuje `public/sw.js` — 216a044
- [x] 1.2 `npm run typecheck` przechodzi — 216a044
- [x] 1.3 `npm run lint` przechodzi — 216a044

#### Manual

- [x] 1.4 SW widoczny jako "activated and is running" w DevTools — 216a044
- [x] 1.5 Aktualizacja SW po re-buildzie aktywuje się bez ręcznego zamykania kart — 216a044

### Phase 2: Strategie cache'owania + offline fallback

#### Automated

- [x] 2.1 `npm run build` przechodzi
- [x] 2.2 Nowy test `sw-routing.test.ts` zielony
- [x] 2.3 `npm run test` zielony

#### Manual

- [x] 2.4 Odwiedzona strona ładuje się offline z cache (SWR)
- [x] 2.5 Nieodwiedzona trasa gościa pokazuje `/offline`
- [x] 2.6 `POST /api/orders` offline kończy się błędem sieci, nie cache hitem
- [x] 2.7 Panel hotelowy offline nie ładuje się z cache

### Phase 3: Pipeline obrazów

#### Automated

- [ ] 3.1 `npm run build` przechodzi
- [ ] 3.2 `npm run typecheck` i `npm run lint` przechodzą

#### Manual

- [ ] 3.3 Karta usługi renderuje obraz przez `/_next/image`
- [ ] 3.4 Lighthouse "Installable" audit bez braków ikon
- [ ] 3.5 iOS "Add to Home Screen" pokazuje właściwą ikonę

### Phase 4: Code splitting (czat, zamówienia, błędy)

#### Automated

- [ ] 4.1 `npm run build` pokazuje osobne chunki dla `/concierge` i `/my-orders`
- [ ] 4.2 `npm run typecheck` i `npm run lint` przechodzą
- [ ] 4.3 Istniejące testy komponentów nadal przechodzą

#### Manual

- [ ] 4.4 JS chunk czatu/zamówień ładuje się dopiero przy wejściu na trasę

### Phase 5: Budżet CI + weryfikacja końcowa

#### Automated

- [ ] 5.1 `npm run size` przechodzi poniżej 150KB gzip
- [ ] 5.2 CI job `bundle-budget` zielony
- [ ] 5.3 `npm run build`/`lint`/`typecheck`/`test` bez regresji

#### Manual

- [ ] 5.4 Lighthouse PWA audit bez błędów krytycznych
- [ ] 5.5 Pełny manualny test airplane-mode (cache, offline fallback, błąd mutacji)
- [ ] 5.6 Panel hotelowy potwierdzony jako poza zasięgiem SW
