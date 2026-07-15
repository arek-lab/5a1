# Design tokens, shadcn/ui, retrofit UI (gość + panel) — Implementation Plan

## Overview

Retrofit istniejącej, działającej aplikacji (Fazy 0–5) na warstwę prezentacji zdefiniowaną w `context/foundation/style.md`: dwa systemy wizualne — "Welcome Tray" (gość, czysty Tailwind + tokeny) i "Operations Deck" (panel, shadcn/ui + tokeny). Zero zmian logiki biznesowej, routingu, RBAC, RLS, SSE, AI — wyłącznie CSS, markup i biblioteka komponentów na istniejących ekranach.

## Current State Analysis

- `app/globals.css` to cały dzisiejszy design system: 6 linii tokenów (`--background`/`--foreground`), Tailwind v4 CSS-first (`@import "tailwindcss"` + `@theme inline`, **brak** `tailwind.config.ts`), jeden `@media (prefers-color-scheme: dark)` blok podmieniający 2 zmienne, `font-family: Arial, Helvetica, sans-serif` na `body` nadpisujący martwe referencje do `--font-geist-sans`/`--font-geist-mono` (boilerplate z `create-next-app`, nigdy nie zdefiniowane).
- `next/font` **nie jest używany nigdzie** w repo — brak jakiegokolwiek web fontu, tylko fallback Arial/Helvetica.
- Struktura layoutów: `app/layout.tsx` (root `<html>`/`<body>`, bez `lang`, bez fontów) → `app/[locale]/layout.tsx` (i18n provider, bez stylingu) → `app/[locale]/(guest)/layout.tsx` i `app/[locale]/(hotel)/layout.tsx` (oba: `bg-white`/`text-gray-900` na twardo). `app/admin/` nie ma dedykowanego layoutu.
- 14 plików w `components/guest/` (896 linii łącznie; sesja S6.1 z session-plan.md wymienia 13 z nich — `offline-toast.tsx` istnieje dodatkowo i wchodzi w retrofit tym samym wzorcem). Wyłącznie utility klasy Tailwind gray/blue (`bg-gray-50/100/200`, `text-gray-400/600/900`) — **zero literałów hex** w komponentach, więc retrofit to w większości podmiana klas utility na tokeny, nie hex-hunting.
- Dokładnie jedno użycie `dark:` w całym repo (`components/guest/guest-orders-panel.tsx:124`) — dark mode jest dziś praktycznie niezaimplementowany; traktujemy jako budowę od zera, nie migrację.
- Panel: brak `components/ui/`, brak `components.json`, brak `@radix-ui/*` w zależnościach — czyste pole pod instalację shadcn/ui. Dwa współdzielone komponenty (`components/panel/onboarding-wizard-shell.tsx`, `require-permission.tsx`), reszta UI panelu (tabele, formularze, modale, dropdowny) jest wbudowana bezpośrednio w pliki tras pod `app/[locale]/(hotel)/**` — każdy bespoke, bez współdzielonego komponentu tabeli/modala/formularza.
- CI (`ci.yml`) ma tylko `lint` i `tsc --noEmit` — brak jobu `build`, brak kontroli rozmiaru bundla. Budżet <150KB gzipped z S3.1/S3.5 nie jest dziś egzekwowany narzędziowo.
- `next.config.ts` jest pusty poza wrapperami `next-intl`/Sentry — brak bundle analyzera.

## Desired End State

Wszystkie istniejące ekrany gościa i panelu renderują się na tokenach CSS ze `style.md` §4 (rozszerzonych o warianty dark — patrz Key Discoveries), zero literału hex/koloru poza blokiem tokenów. Panel korzysta z shadcn/ui dla list/formularzy/modali/dropdownów; gość zostaje na czystym Tailwind + tokenach, bez nowej zależności. Kontrast WCAG AA zweryfikowany automatycznie (axe-core) na kluczowych ekranach (welcome, home, dashboard, inbox zamówień) + manualnie na stanach greyed/disabled. `npm run build`/`lint`/`test`/`typecheck` przechodzą bez regresji. Guest bundle nie przekracza budżetu 150KB gzipped, weryfikowane automatycznie w CI. Dark mode działa pełnoprawnie dla obu systemów wizualnych, domyślnie wg system preference, z ręcznym przełącznikiem (system/jasny/ciemny) po stronie gościa — decyzja zmieniona w trakcie implementacji Fazy 3, patrz "What We're NOT Doing".

Weryfikacja: `npm run build && npm run lint && npm run typecheck && npm test`, wizualny przegląd kluczowych ekranów w light i dark, `npx playwright test a11y` (nowy skrypt z Fazy 5).

### Key Discoveries:

- `app/globals.css:1-26` — jedyne miejsce do rozbudowy o tokeny (Tailwind v4 nie ma osobnego JS config), więc `@theme inline` blok rośnie tu, nie w nowym pliku configu.
- `app/layout.tsx:16` — `<html suppressHydrationWarning>` bez `lang` — dobre miejsce do zawieszenia klas `next/font` variable (`className`) i `data-theme` jeśli potrzebny na poziomie dokumentu.
- Zero hex literałów w komponentach (`grep -rn "#[0-9a-fA-F]{3,6}" components/`) — retrofit to systematyczna podmiana Tailwind gray/blue klas na odpowiedniki oparte o CSS custom properties (np. arbitrary-value klasa wskazująca na konkretną zmienną tokenu guest/panel) lub, tam gdzie sensowniej, nowe Tailwind `@theme` aliasy (`bg-guest-paper` itp.) mapowane na te same CSS custom properties.
- `i18n/routing.ts` — `localePrefix: 'never'`, locale rozwiązywany z cookie/header, nie z URL — fonty/tokeny nie wymagają żadnej wiązki per-locale.

## What We're NOT Doing

- Zmiana logiki biznesowej, routingu, walidacji, RBAC, RLS, SSE, AI, endpointów, schematu danych.
- Tworzenie platformowego logo/znaku (§3 `style.md`) — DoD sesji go nie wymaga; zostaje TODO do osobnej sesji.
- ~~Ręczny toggler dark/light dla użytkownika — tylko `prefers-color-scheme`~~ — **decyzja zmieniona w trakcie implementacji Fazy 3** (HITL, sesja implementacyjna): dodano ręczny przełącznik system/jasny/ciemny po stronie gościa (`components/guest/theme-toggle.tsx`, obok `LanguageSwitcher`), z zapisem preferencji w `localStorage` i blokującym inline-skryptem w `app/layout.tsx` zapobiegającym FOUC. Mechanizm CSS przeszedł z `@media (prefers-color-scheme: dark)` na atrybut `data-color-scheme` na `<html>` (patrz `app/globals.css`), rozwiązywany z system preference tylko gdy user nie ma zapisanej jawnej preferencji. Panel (Faza 4) nie dostaje własnego przełącznika w tym planie — TODO poza zakresem S6.1, jeśli będzie potrzebny.
- Per-hotel branding poza `properties.logo_url` (HITL #3 z session-plan.md) — paleta/typografia/spacing identyczne dla wszystkich hoteli.
- Instalacja shadcn/ui / lucide-react po stronie gościa — guest zostaje na czystym Tailwind (decyzja z session-plan.md, potwierdzona w tym planowaniu).
- Trwały, rozbudowany system bundle-budgetów (np. per-route budgets, historical tracking) — dodajemy jeden prosty CI-gate na całkowity rozmiar guest bundle, nie infrastrukturę do jego wizualizacji.
- Migracja `app/admin/**` na osobny design system — traktowana jako część "panelu"/Operations Deck (brak własnego layoutu dziś, dziedziczy `--panel-*`).

## Implementation Approach

Fundament (tokeny + fonty + bundle guard) przed komponentami, żeby Fazy 3–4 miały gotowe zmienne CSS i budżet już mierzony. shadcn/ui instalowany zaraz po fundamencie (Faza 2), bo Faza 4 (retrofit panelu) go wymaga. Retrofit gościa (Faza 3) przed retrofitem panelu (Faza 4) — mniej plików bespoke, szybsza walidacja podejścia (utility-klasa → token) zanim przejdziemy do bardziej złożonej wymiany bespoke tabel/modali na komponenty shadcn. Weryfikacja dostępności na końcu (Faza 5), bo wymaga gotowych, przełożonych na tokeny ekranów obu systemów.

## Critical Implementation Details

### Font loading — wagi i strategia

`next/font/google` dla wszystkich 4 fontów (self-hosted, zero runtime request do Google, zgodnie z Next 16.2.6). Ładujemy tylko realnie potrzebne wagi, `display: 'swap'`, `subsets: ['latin']` (PL wymaga polskich znaków diakrytycznych — **jeśli Google Fonts nie oferuje `latin-ext` jako opcjonalny subset dla danego fontu, dodać `latin-ext`**, bo `subsets: ['latin']` samo nie pokrywa ogonków/kresek PL; to jest realna pułapka — sprawdzić przy implementacji per font, nie zakładać, że `latin` wystarczy).

- Frank Ruhl Libre (guest display): 500, 600 — używane tylko w nagłówkach/powitaniach, nie w body.
- Public Sans (guest UI/body): 400, 500, 600 — body, przyciski, nawigacja.
- IBM Plex Sans (panel UI): 400, 500, 600 — cały interfejs panelu.
- IBM Plex Mono (wspólny, oba systemy): 400, 500 — liczby, kody, dane.

To 9 wariantów wagowych łącznie zamiast pełnych rodzin (typowo 4-9 wag każda) — świadomy kompromis wag vs budżet, potwierdzony w planowaniu.

### Bundle-size guard w CI

Dodajemy `build` job do `.github/workflows/ci.yml` (dziś ma tylko `lint`+`type-check`) uruchamiający `npm run build`, plus prosty skrypt/krok mierzący gzipped rozmiar guest route chunków (np. `.next/static/chunks` dla `app/[locale]/(guest)/**`) i failujący powyżej 150KB. Nie wprowadzamy pełnego `size-limit`/`bundlesize` configu z historycznym trackingiem — jeden próg, jeden krok CI, zgodnie z zakresem "prosty guard" ustalonym w planowaniu.

### Dark mode — zakres tokenów

`style.md` §4 nie definiuje wartości dark — trzeba je wyprowadzić przy implementacji zachowując te same role (accent/moss/clay dla gościa, success/warning dla panelu) i kontrast WCAG AA, nie kopiować 1:1 wartości light z odwróconą jasnością. Mechanizm (zaktualizowany w trakcie Fazy 3 — patrz "What We're NOT Doing"): `:root[data-color-scheme="dark"]` w `globals.css` niesie pełny zestaw `--guest-*`/`--panel-*` override'ów, aktywowany przez atrybut na `<html>` zamiast bezpośrednio przez `@media (prefers-color-scheme: dark)`. Atrybut jest ustawiany raz, przed pierwszym malowaniem, przez blokujący inline-skrypt w `app/layout.tsx` (`COLOR_SCHEME_INIT_SCRIPT` z `lib/theme/color-scheme.ts`): czyta zapisaną w `localStorage` preferencję (`light`/`dark`), a przy jej braku rozwiązuje z `prefers-color-scheme` — więc domyślne, nietknięte przez usera zachowanie nadal jest w pełni OS-driven, tylko z dodaną możliwością jawnego override'u przez `components/guest/theme-toggle.tsx`.

## Phase 1: Fundament — tokeny, fonty, bundle guard

### Overview

Wprowadza kompletny system tokenów CSS (light + dark) i fonty ze `style.md` do `app/globals.css` i `app/layout.tsx`, oraz dodaje CI-gate na rozmiar guest bundle. Żaden komponent jeszcze nie jest przepisany — to czysto infrastrukturalna faza, którą Fazy 3–4 będą konsumować.

### Changes Required:

#### 1. Design tokens (light + dark)

**File**: `app/globals.css`

**Intent**: Zastąpić dzisiejsze 2 zmienne (`--background`/`--foreground`) i martwe referencje Geist pełnym blokiem tokenów ze `style.md` §4, rozszerzonym o warianty dark dla każdej zmiennej `--guest-*`/`--panel-*` (wyprowadzone zgodnie z Critical Implementation Details, nie zdefiniowane w `style.md`). Usunąć hardcoded `font-family: Arial, Helvetica, sans-serif` z `body` — fonty przejmuje Faza 1.2.

**Contract**: `:root` zawiera zawsze-dostępne `--guest-*`, `--panel-*`, `--radius-card` (16px guest / 8px panel — dwa osobne tokeny, nie jeden dzielony), `--radius-pill`, `--shadow-soft`, `--font-display`, `--font-ui`, `--font-mono` dokładnie wg bloku `style.md` §4 (Tailwind v4 `@theme inline` mapuje je na `--color-*` aliasy do użycia jako `bg-guest-stone` itp. w klasach Tailwind). `@media (prefers-color-scheme: dark)` blok podmienia wszystkie `--guest-*`/`--panel-*` (nie tylko `--background`/`--foreground`) na warianty dark zachowujące kontrast AA i te same role kolorów.

#### 2. Fonty

**File**: `app/layout.tsx`, nowy `app/fonts.ts` (lub równoważny moduł eksportujący instancje `next/font/google`)

**Intent**: Załadować 4 fonty ze `style.md` §1.2/§2.2 przez `next/font/google` z wagami i subsetami ze sekcji Critical Implementation Details, wystawić jako CSS variables (`variable: '--font-display'` itp.) i podłączyć do `<html>`/`<body>` w `app/layout.tsx` (obecnie bez `className` fontów, bez `lang`).

**Contract**: Każdy font ma własną `variable` zgodną z nazwami tokenów z `style.md` §4 (`--font-display`, `--font-ui`, `--font-mono` — Uwaga: guest i panel dzielą nazwy `--font-ui`/`--font-mono` ale mapują na różne fonty; rozwiązać przez `data-theme="guest"`/`data-theme="panel"` scoping tak jak `style.md` §4 już to robi w blokach `:root[data-theme="guest"]`/`:root[data-theme="panel"]` — czyli fonty ładowane globalnie w `layout.tsx`, ale przypisanie do `--font-ui`/`--font-mono` per-theme dzieje się w CSS przez selektor `[data-theme]`, nie przez dwa różne globalne warianty). `app/[locale]/(guest)/layout.tsx` i `app/[locale]/(hotel)/layout.tsx` dostają `data-theme="guest"`/`data-theme="panel"` na najbliższym wspólnym wrapperze.

#### 3. Bundle-size guard w CI

**File**: `.github/workflows/ci.yml`, nowy krok/skrypt (np. `scripts/check-bundle-size.mjs`)

**Intent**: Dodać `build` job uruchamiający `npm run build`, a po nim krok liczący gzipped rozmiar JS chunków dla `app/[locale]/(guest)/**` i failujący CI gdy suma przekracza 150KB.

**Contract**: Nowy job w `ci.yml` równoległy do istniejących `lint`/`type-check`; skrypt czyta `.next/static/chunks` (lub `.next/app-build-manifest.json` do namierzenia chunków guest route group), sumuje gzipped rozmiary, porównuje z stałą `150 * 1024` bajtów, `process.exit(1)` przy przekroczeniu.

### Success Criteria:

#### Automated Verification:

- `npm run build` przechodzi bez błędów
- `npm run typecheck` przechodzi
- `npm run lint` przechodzi
- Nowy `build` job w CI zielony na tym PR, w tym krok bundle-size guard pod progiem 150KB

#### Manual Verification:

- `app/globals.css` nie zawiera żadnego literału hex poza blokiem tokenów §4 (visual grep)
- Fonty widoczne w DevTools Network jako self-hosted (brak requestów do `fonts.googleapis.com`)
- Przełączenie systemowego dark mode zmienia wszystkie `--guest-*`/`--panel-*` zmienne (sprawdzone w DevTools na `:root`)

**Implementation Note**: Po ukończeniu tej fazy i przejściu automatycznej weryfikacji, zatrzymaj się do manualnego potwierdzenia przez człowieka przed przejściem do Fazy 2.

---

## Phase 2: shadcn/ui — instalacja i konfiguracja dla panelu

### Overview

Instaluje i konfiguruje shadcn/ui wyłącznie dla `app/[locale]/(hotel)/**`, `(hotel-auth)/**`, `app/admin/**` (theme podłączony pod `--panel-*` z Fazy 1). Guest nie dostaje tej zależności. Żaden istniejący panel-komponent jeszcze nie jest migrowany na shadcn — to instalacja + konfiguracja + jeden pilotażowy komponent do weryfikacji podłączenia motywu.

### Changes Required:

#### 1. Instalacja shadcn/ui CLI + `components.json`

**File**: nowy `components.json` w root, nowy `components/ui/` (dodawany narzędziem CLI shadcn per komponent)

**Intent**: Zainicjalizować shadcn/ui (`npx shadcn@latest init`) wskazując `app/globals.css` jako plik tokenów i `components/ui` jako katalog docelowy, style "new-york" (gęstszy, pasuje do "Operations Deck" — mniejsza skala typograficzna z `style.md` §2.2).

**Contract**: `components.json` mapuje shadcn CSS-variable slots (`background`, `foreground`, `primary`, itd.) na istniejące `--panel-*` zmienne z Fazy 1 zamiast generować własną, równoległą paletę — shadcn theme i `style.md` §4 muszą być tym samym źródłem prawdy, nie dwoma niezależnymi zestawami tokenów.

#### 2. Pilotażowy komponent — weryfikacja motywu

**File**: `components/panel/onboarding-wizard-shell.tsx`

**Intent**: Zmigrować progress bar + step nav (dziś ręczne `bg-gray-200`/`bg-blue-600` warunkowe klasy) na shadcn `Progress` + `Tabs`/przyciski shadcn `Button` jako pierwszy realny test podłączenia `--panel-accent` przez shadcn theme, zanim Faza 4 rozszerzy retrofit na resztę panelu.

**Contract**: Wizualny wynik identyczny funkcjonalnie (te same 3 stany: active/interactive/disabled), ale renderowany komponentami shadcn zamiast ręcznych warunkowych klas.

### Success Criteria:

#### Automated Verification:

- `npm run build`/`typecheck`/`lint` przechodzą
- `components.json` obecny, wskazuje `components/ui`
- Guest bundle-size guard z Fazy 1 nadal zielony (shadcn nie przecieka do guest bundla — sprawdzić, że żaden `components/guest/*` nie importuje z `components/ui/*`)

#### Manual Verification:

- `onboarding-wizard-shell.tsx` renderuje się wizualnie w `--panel-accent`, nie w domyślnym shadcn niebieskim
- Trzy stany kroku (active/interactive/disabled) nadal rozróżnialne wizualnie

**Implementation Note**: Po ukończeniu tej fazy i przejściu automatycznej weryfikacji, zatrzymaj się do manualnego potwierdzenia przez człowieka przed przejściem do Fazy 3.

---

## Phase 3: Retrofit gościa — 14 komponentów + strony

### Overview

Przepisuje wszystkie komponenty `components/guest/*` (13 wymienionych w session-plan.md + `offline-toast.tsx`) i strony `app/[locale]/(guest)/**` na tokeny `--guest-*` z Fazy 1, wzorce z `style.md` §1.4 (ekran główny jako "taca powitalna", dymki Concierge jak notatka na papierze, karty usług) i custom SVG avatar dla AI concierge. Czysty Tailwind — bez shadcn/lucide.

### Changes Required:

#### 1. Layout gościa — chrome + `data-theme`

**File**: `app/[locale]/(guest)/layout.tsx`

**Intent**: Podmienić `bg-white`/`text-gray-900` na `--guest-*` tokeny, dodać `data-theme="guest"` na wrapperze (konsumowane przez fonty z Fazy 1.2), header w Public Sans.

**Contract**: Zachowuje dzisiejszą strukturę (logo/nazwa hotelu + `LanguageSwitcher` + `FloatingConciergeButton` + `OfflineToast`), zero zmian w `requireGuestSession()` czy logice.

#### 2. Ekran główny — "taca powitalna"

**File**: `components/guest/welcome-banner.tsx`, `components/guest/category-grid.tsx`

**Intent**: Powitanie z imieniem i numerem pokoju w IBM Plex Mono (jak karta-klucz, `style.md` §1.4), grid 5 kategorii nawigacji dolnej (`Dziś / Udogodnienia / Concierge / Mój pobyt / Odkrywaj` z §1.3 — **uwaga**: to jest już zaimplementowana nawigacja z Fazy 3 sesji S3.1, tu tylko retrofit wizualny, nie zmiana struktury nawigacji).

**Contract**: Numer pokoju/dane liczbowe renderowane w `font-mono` (`--font-mono` → IBM Plex Mono w kontekście guest).

#### 3. Karty usług i statusy

**File**: `components/guest/service-card.tsx`, `components/guest/polecamy-section.tsx`, `components/guest/order-cta.tsx`, `components/guest/order-toast.tsx`

**Intent**: Karty: zdjęcie + tytuł w Frank Ruhl Libre + cena w IBM Plex Mono + CTA w `--guest-accent`, radius `--radius-card` (16px), cień `--shadow-soft`. Statusy: `--guest-moss` dla potwierdzone/gotowe, czerwień zarezerwowana wyłącznie dla realnych błędów (nigdy default), zgodnie z `style.md` §1.4.

**Contract**: Zachowuje istniejące greyed/disabled stany z S3.2 (usługi niedostępne — NIE ukrywać), teraz z tokenami zamiast `text-gray-400`/`bg-gray-200`, kontrast AA zweryfikowany w Fazie 5.

#### 4. Concierge AI — element sygnaturowy

**File**: `components/guest/concierge-chat.tsx`, `components/guest/floating-concierge-button.tsx`

**Intent**: Dymki czatu jako "odręczna notatka na papierze" — `--guest-paper`, cienka ramka, `--shadow-soft`. Nowy custom inline SVG avatar (jeden ręcznie zaprojektowany symbol w `--guest-accent`, ciepły, nie robot/gwiazdka — zgodnie z decyzją z planowania) wstawiony bezpośrednio w komponent, zero nowej zależności.

**Contract**: SVG inline (nie plik zewnętrzny wymagający `next/image`), rozmiar/viewBox dopasowany do istniejącego miejsca avatara w markupie czatu.

#### 5. Pozostałe komponenty i strony (retrofit mechaniczny)

**File**: `components/guest/splash-screen.tsx`, `order-confirm-modal.tsx`, `guest-orders-panel.tsx`, `language-switcher.tsx`, `room-qr-scanner.tsx`, oraz wszystkie strony `app/[locale]/(guest)/{page,c/[category]/page,c/[category]/[service]/page,concierge/page,my-orders/page,order-success/page,scan/page}.tsx`

**Intent**: Systematyczna podmiana `bg-gray-*`/`text-gray-*`/`bg-white` na odpowiadające `--guest-*` tokeny, `border` na tokenizowany kolor, zachowując istniejący jedyny `dark:` wariant w `guest-orders-panel.tsx:124` jako punkt startowy (teraz konsumujący pełny dark blok z Fazy 1, nie ręczny pojedynczy override).

**Contract**: Brak zmian w propsach/logice tych komponentów — czysto klasy CSS i struktura wizualna.

### Success Criteria:

#### Automated Verification:

- `npm run build`/`typecheck`/`lint`/`test` przechodzą bez regresji
- Bundle-size guard z Fazy 1 zielony (guest nadal <150KB z nowymi fontami + SVG avatar)
- `grep -rn "#[0-9a-fA-F]\{3,6\}" components/guest/ app/[locale]/(guest)/` nie zwraca wyników poza `app/globals.css`

#### Manual Verification:

- Ekran główny, karta usługi, Concierge chat wizualnie zgodne ze `style.md` §1.4 (taca powitalna, notatka na papierze, karty z ceną w mono)
- Stany greyed/disabled z S3.2 nadal widoczne (nie ukryte) i czytelne kontrastowo
- Dark mode: kluczowe ekrany gościa (welcome, home) czytelne po przełączeniu systemowego dark mode
- Ręczny przełącznik motywu (obok `LanguageSwitcher`) cyklicznie zmienia system → jasny → ciemny → system, bez FOUC po odświeżeniu strony, i przetrwa nawigację między stronami gościa (localStorage)

**Implementation Note**: Po ukończeniu tej fazy i przejściu automatycznej weryfikacji, zatrzymaj się do manualnego potwierdzenia przez człowieka przed przejściem do Fazy 4.

---

## Phase 4: Retrofit panelu — shared + route-embedded na shadcn/ui

### Overview

Migruje resztę panelu (poza pilotażowym `onboarding-wizard-shell.tsx` z Fazy 2) na shadcn/ui: bespoke tabele, formularze, modale, dropdowny wbudowane dziś bezpośrednio w pliki tras pod `app/[locale]/(hotel)/**`. Dodaje insight ticker (element sygnaturowy panelu, `style.md` §2.4) na dashboard.

### Changes Required:

#### 1. Layout panelu + admin — chrome + `data-theme`

**File**: `app/[locale]/(hotel)/layout.tsx`, `app/admin/page.tsx` (brak dedykowanego layoutu — patrz What We're NOT Doing, admin dziedziczy `--panel-*` bez nowego pliku layoutu)

**Intent**: Podmienić `bg-white`/`text-gray-900`/ręczny przycisk sign-out na shadcn `Button` + tokeny `--panel-*`, dodać `data-theme="panel"`.

**Contract**: Zachowuje dzisiejszą strukturę auth-gate (`redirect` na brak `user`/`hotelUser`) bez zmian logiki.

#### 2. Tabele treści/usług

**File**: `app/[locale]/(hotel)/services/service-list.tsx`, `app/[locale]/(hotel)/knowledge/knowledge-list.tsx`, `app/[locale]/(hotel)/users/user-list.tsx`

**Intent**: Migracja na shadcn `Table` z inline-edycją zachowaną, status jako mały badge (shadcn `Badge` w `--panel-success`/`--panel-warning`), nie kolorowe tło całego wiersza — zgodnie z `style.md` §2.4. Gęstość: wiersz `40px`, padding `16px`.

**Contract**: Zachowuje istniejące RBAC guardy (staff edytuje, viewer tylko widzi — z S2.1/S2.3) bez zmian w warunkach uprawnień, tylko zmiana renderowanego komponentu.

#### 3. Formularze

**File**: `app/[locale]/(hotel)/services/service-form.tsx`, `app/[locale]/(hotel)/knowledge/knowledge-form.tsx`, `app/[locale]/(hotel)/onboarding/profile-step-form.tsx`, `app/[locale]/(hotel)/users/invite-form.tsx`, `app/[locale]/(hotel-auth)/login/login-form.tsx`, `app/[locale]/(hotel-auth)/signup/signup-form.tsx`, `app/admin/login/login-form.tsx`

**Intent**: Migracja na shadcn `Form`/`Input`/`Select`/`Label` z zachowaniem istniejącej walidacji (server actions/client-side, bez zmian w logice walidacji samej).

**Contract**: `<form>` submit handlery i server actions nietknięte — zmienia się wyłącznie warstwa renderowanych pól.

#### 4. Modale i dropdowny

**File**: `app/[locale]/(hotel)/users/transfer-ownership-modal.tsx`, `app/[locale]/(hotel)/knowledge/faq-template-picker.tsx`, `app/[locale]/(hotel)/services/template-picker.tsx`

**Intent**: Migracja na shadcn `Dialog` (modale) i `Select`/`DropdownMenu` (pickery), zachowując istniejące potwierdzenia krytycznych akcji (transfer ownership — HITL #3 z session-plan.md, bez zmian w warunkach blokady dezaktywacji ostatniego Ownera).

**Contract**: Trigger/confirm/cancel flow identyczny funkcjonalnie, zmienia się tylko komponent bazowy.

#### 5. Generator kodów dostępu + QR panel

**File**: `app/[locale]/(hotel)/qr/qr-panel.tsx`, `app/[locale]/(hotel)/qr/print/print-room-qr-list.tsx`

**Intent**: Kod w IBM Plex Mono (już częściowo — `font-mono` na linii 183), duży, kopiowalny jednym kliknięciem — dodać przycisk kopiowania (shadcn `Button` + ikona z lucide-react, który przychodzi z shadcn init w Fazie 2) jeśli dziś brak.

**Contract**: `print-room-qr-list.tsx` zachowuje istniejący `window.print()`/`@media print` mechanizm z S2.10 bez zmian — tylko wizualna warstwa kart QR poza trybem druku.

#### 6. Insight ticker (nowy element sygnaturowy)

**File**: nowy `components/panel/insight-ticker.tsx`, osadzony w dashboard głównym panelu (najbliższy odpowiednik: `app/[locale]/(hotel)/page.tsx` jeśli istnieje, inaczej najwyżej w hierarchii tras `(hotel)`)

**Intent**: `style.md` §2.4 definiuje insight ticker jako **element sygnaturowy** panelu — żywy strumień wniosków z rozmów AI concierge. To jedyny nowy komponent (nie tylko retrofit) w tej fazie: wymaga źródła danych. **Weryfikacja przed implementacją**: sprawdzić, czy istnieje już agregacja/log rozmów AI concierge z Fazy 4 (S4.1–S4.3) gotowa do wystawienia jako strumień — jeśli tak, ticker to widok nad istniejącymi danymi (czysto prezentacyjne, w zakresie S6.1); jeśli źródło danych nie istnieje, ograniczyć się do statycznego/pustego-stanu tickera z komponentem gotowym na podłączenie danych, i zarejestrować faktyczne zasilenie danymi jako TODO poza zakresem S6.1 (S6.1 to retrofit prezentacji, nie budowa nowego pipeline'u danych).

**Contract**: Komponent przyjmuje listę insightów jako props (typ `{ text: string; timestamp: string }[]` lub podobny) — nie wykonuje własnego fetchowania w tej fazie jeśli źródło danych wymaga nowej logiki backendowej (poza zakresem).

### Success Criteria:

#### Automated Verification:

- `npm run build`/`typecheck`/`lint`/`test` przechodzą bez regresji
- `grep -rn "#[0-9a-fA-F]\{3,6\}" app/[locale]/(hotel)/ app/[locale]/(hotel-auth)/ app/admin/ components/panel/` nie zwraca wyników poza `app/globals.css`
- RBAC testy jednostkowe z S2.1 nadal zielone (potwierdzenie zero regresji w uprawnieniach po zmianie komponentów)

#### Manual Verification:

- Tabele/formularze/modale wizualnie zgodne ze `style.md` §2 (radius 6-8px, gęstość, mono dla liczb)
- Transfer ownership modal nadal blokuje dezaktywację ostatniego Ownera (regresja HITL #3)
- Insight ticker renderuje się na dashboardzie (dane lub pusty stan, zależnie od ustalenia z Intent)
- Dark mode: dashboard i inbox zamówień czytelne po przełączeniu systemowego dark mode

**Implementation Note**: Po ukończeniu tej fazy i przejściu automatycznej weryfikacji, zatrzymaj się do manualnego potwierdzenia przez człowieka przed przejściem do Fazy 5.

---

## Phase 5: Weryfikacja dostępności (WCAG AA)

### Overview

Automatyczny audyt kontrastu (axe-core) + manualny przegląd na kluczowych ekranach (welcome, home, dashboard, inbox zamówień) dla obu systemów, w light i dark. Weryfikuje focus ring, touch targets ≥44px na guest PWA, `prefers-reduced-motion`.

### Changes Required:

#### 1. Audyt axe-core

**File**: nowy `e2e/a11y.spec.ts` (lub lokalizacja zgodna z istniejącą konfiguracją testów — sprawdzić czy Playwright jest już w repo; jeśli nie, dodać `@axe-core/playwright` + `@playwright/test` jako dev-dependency minimalną do uruchomienia tego audytu)

**Intent**: Test przechodzący po kluczowych ekranach (welcome, home, dashboard, inbox zamówień) w light i dark, asercja braku naruszeń `wcag2aa` z axe-core.

**Contract**: Nowy `npm run test:a11y` script w `package.json`, osobny od istniejącego `vitest`.

#### 2. Focus ring + touch targets + reduced motion

**File**: `app/globals.css`

**Intent**: Globalny `:focus-visible` styl `2px solid var(--*-accent)` z offsetem (wg `style.md` §3), `@media (prefers-reduced-motion: reduce)` blok wyłączający/skracający animacje wprowadzone w Fazach 3-4 (fade/slide gościa, opacity panelu).

**Contract**: Selektor `:focus-visible` per `data-theme` (accent koloru zależny od guest/panel), jeden globalny `prefers-reduced-motion` blok.

### Success Criteria:

#### Automated Verification:

- `npm run test:a11y` przechodzi (zero naruszeń `wcag2aa`) na welcome, home, dashboard, inbox zamówień, w light i dark
- `npm run build`/`typecheck`/`lint`/`test` przechodzą

#### Manual Verification:

- Touch targets ≥44px zweryfikowane na guest PWA (kluczowe CTA: Zamów, karty usług, nawigacja dolna)
- Focus ring widoczny klawiaturą (Tab) na obu systemach
- `prefers-reduced-motion` respektowany — animacje wprowadzone w Fazach 3-4 wyłączają się/skracają

**Implementation Note**: Po ukończeniu tej fazy sesja S6.1 jest kompletna — brak dalszych faz.

---

## Testing Strategy

### Unit Tests:

- Istniejące testy RBAC (S2.1) i logiki (nie UI) muszą pozostać zielone bez modyfikacji — potwierdza brak regresji logiki podczas retrofitu wizualnego.

### Integration Tests:

- Brak nowych testów integracyjnych logiki (poza zakresem — S6.1 to retrofit prezentacji).

### Manual Testing Steps:

1. Przejść pełny guest flow (welcome → home → browse → order → my-orders → concierge) w light i dark, weryfikując zgodność ze `style.md` §1.
2. Przejść kluczowe ekrany panelu (dashboard, services, knowledge, users, qr, orders inbox) w light i dark, weryfikując zgodność ze `style.md` §2.
3. Sprawdzić stany greyed/disabled (S3.2) i statusy zamówień (moss vs czerwień tylko dla realnych błędów).
4. Sprawdzić transfer ownership modal — blokada dezaktywacji ostatniego Ownera nadal działa (regresja HITL #3).
5. Sprawdzić `/qr/print` — druk QR nadal działa bez zmian funkcjonalnych (S2.10).

## Performance Considerations

Guest bundle budżet 150KB gzipped (S3.1/S3.5) pod presją nowych fontów (2 z 4 fontów są guest-side) — zaadresowane przez minimalne warianty wagowe (Critical Implementation Details) i nowy CI-gate (Faza 1.3) łapiący regresję automatycznie. shadcn/ui + Radix dependencies izolowane do panelu — brak wpływu na guest bundle, zweryfikowane przez import-check w Fazie 2 Automated Verification.

## Migration Notes

Brak migracji danych — czysto zmiana warstwy prezentacji na istniejących, działających danych i schemacie.

## References

- Konwencje stylu: `context/foundation/style.md`
- Definicja sesji + HITL decyzje: `context/foundation/session-plan.md` (sekcja S6.1, linie 208-283)
- Zależne sesje (retrofitowane ekrany): S2.1-S2.11, S3.1-S3.6, S4.1-S4.2

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Fundament — tokeny, fonty, bundle guard

#### Automated

- [x] 1.1 `npm run build` przechodzi bez błędów — 712b371
- [x] 1.2 `npm run typecheck` przechodzi — 712b371
- [x] 1.3 `npm run lint` przechodzi — 712b371
- [x] 1.4 Nowy `build` job w CI zielony, bundle-size guard pod 150KB — 712b371

#### Manual

- [x] 1.5 `app/globals.css` bez literałów hex poza blokiem tokenów §4 — 712b371
- [x] 1.6 Fonty self-hosted (brak requestów do fonts.googleapis.com) — 712b371
- [x] 1.7 Przełączenie systemowego dark mode zmienia wszystkie `--guest-*`/`--panel-*` — 712b371

### Phase 2: shadcn/ui — instalacja i konfiguracja dla panelu

#### Automated

- [x] 2.1 `npm run build`/`typecheck`/`lint` przechodzą — 419e172
- [x] 2.2 `components.json` obecny, wskazuje `components/ui` — 419e172
- [x] 2.3 Guest bundle-size guard nadal zielony, brak importów `components/ui` w `components/guest` — 419e172

#### Manual

- [x] 2.4 `onboarding-wizard-shell.tsx` renderuje się w `--panel-accent` — 419e172
- [x] 2.5 Trzy stany kroku nadal rozróżnialne wizualnie — 419e172

### Phase 3: Retrofit gościa — 14 komponentów + strony

#### Automated

- [x] 3.1 `npm run build`/`typecheck`/`lint`/`test` przechodzą bez regresji — 92ef948
- [x] 3.2 Bundle-size guard zielony — 92ef948
- [x] 3.3 Brak literałów hex w `components/guest/` i `app/[locale]/(guest)/` — 92ef948

#### Manual

- [x] 3.4 Ekran główny/karta usługi/Concierge zgodne ze `style.md` §1.4 — 92ef948
- [x] 3.5 Stany greyed/disabled nadal widoczne i czytelne — 92ef948
- [x] 3.6 Dark mode czytelny na welcome/home — 92ef948
- [x] 3.7 Ręczny przełącznik motywu (system/jasny/ciemny) działa bez FOUC i przetrwa nawigację — 92ef948

### Phase 4: Retrofit panelu — shared + route-embedded na shadcn/ui

#### Automated

- [x] 4.1 `npm run build`/`typecheck`/`lint`/`test` przechodzą bez regresji
- [x] 4.2 Brak literałów hex w plikach panelu/admin
- [x] 4.3 Testy RBAC z S2.1 nadal zielone

#### Manual

- [x] 4.4 Tabele/formularze/modale zgodne ze `style.md` §2
- [x] 4.5 Transfer ownership modal nadal blokuje dezaktywację ostatniego Ownera
- [x] 4.6 Insight ticker renderuje się na dashboardzie
- [x] 4.7 Dark mode czytelny na dashboard/inbox zamówień

### Phase 5: Weryfikacja dostępności (WCAG AA)

#### Automated

- [ ] 5.1 `npm run test:a11y` przechodzi (zero naruszeń wcag2aa) w light i dark
- [ ] 5.2 `npm run build`/`typecheck`/`lint`/`test` przechodzą

#### Manual

- [ ] 5.3 Touch targets ≥44px na guest PWA
- [ ] 5.4 Focus ring widoczny klawiaturą na obu systemach
- [ ] 5.5 `prefers-reduced-motion` respektowany
