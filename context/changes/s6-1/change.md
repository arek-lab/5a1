---
change_id: s6-1
title: Design tokens, shadcn/ui, retrofit UI (gość + panel)
status: implementing
created: 2026-07-14
updated: 2026-07-15
archived_at: null
---

## Notes

z 'c:/data/_new_projects/5a1/context/foundation/session-plan.md'

### Faza 5 — blocker: e2e a11y harness wymaga re-planu (2026-07-15)

Próba implementacji `e2e/a11y.spec.ts` (Playwright + `@axe-core/playwright`) dla 5.1
utknęła na uwierzytelnianiu w testach i została wycofana (`e2e/`, `playwright.config.ts`
usunięte; `@playwright/test` + `@axe-core/playwright` zostają w `devDependencies` —
już zainstalowane, do ponownego użycia). 5.3–5.5 (touch targets, focus ring, reduced
motion) nie są blokowane przez ten problem.

**Co już działa (zaimplementowane, niezależne od harnessu testowego):**
- `app/globals.css` — globalny `:focus-visible` (`--guest-accent`/`--panel-accent`
  per `data-theme`) + `@media (prefers-reduced-motion: reduce)`.
- `app/layout.tsx` — realny bug znaleziony przy tej okazji: `<html>` nie miało
  atrybutu `lang` (axe `html-has-lang`, wcag2a). Naprawione: `getLocale()` z
  `next-intl/server` w root layout, `<html lang={locale}>`.

**Rdzeń problemu (do uwzględnienia w re-planie):**
1. Guest flow wymaga prawdziwej, autoryzowanej sesji (`__Host-session` cookie,
   `secure`-only) zestawionej przez realny endpoint `/api/scan/reception?init_token=...`
   (Supabase Auth anonymous sign-in + custom access token hook wstrzykujący
   `property_id`/`session_id` do JWT) — nie da się tego zamockować bez odtworzenia
   prawdziwego flow albo obejścia middleware.
2. `next dev` (Turbopack) w tym środowisku ma niedziałający HMR websocket
   (`wss://.../_next/webpack-hmr` → `ERR_INVALID_HTTP_RESPONSE`), co po cichu
   blokuje hydratację klienckich komponentów — formularz logowania panelu
   (`login-form.tsx`, `'use client'`) renderuje się, ale `onSubmit` nigdy się nie
   odpala, więc żaden test logujący się przez UI nie przejdzie na `next dev`.
   User zdiagnozował i poprawił podejście w `playwright.config.ts` (przed
   wycofaniem): uruchamiać `next build && next start` (produkcyjny build, bez
   HMR) na zwykłym `http://localhost` zamiast `next dev --experimental-https` —
   `localhost` jest traktowany jako secure context przez Chromium, więc
   `__Host-` cookie i tak działa bez samopodpisanego certyfikatu.
3. Do rozstrzygnięcia w re-planie: strategia seedowania danych testowych w
   chmurowym Supabase (brak lokalnego psql — service-role klient + sprzątanie
   w `globalTeardown`, wzorem `it-*.test.ts`), czas budowania produkcyjnego przed
   każdym uruchomieniem `test:a11y` (build+start dodaje realny narzut czasowy do
   pętli iteracji), oraz czy dashboard/orders inbox (panel) i welcome/home
   (gość) faktycznie wymagają pełnego e2e, czy da się część pokrycia WCAG
   zweryfikować taniej (np. axe na statycznie wyrenderowanym HTML bez
   pełnego logowania, tam gdzie to wystarczające).

### Faza 5 — regres: script-tag/hydration/PostHog w konsoli dev (2026-07-16)

Po p4 (`3e45b7f`) w `next dev` nadal pojawiały się w konsoli: "Encountered a script
tag while rendering React component", hydration mismatch na `<aside>` w
`components/panel/sidebar-nav.tsx` (brakujące klasy `flex`/`flex-col`/`overflow-y-auto`
i cały blok `mt-auto` w próbie klienta) oraz podwójna inicjalizacja PostHoga.

Zweryfikowano: `npm run build` (`next build --webpack`) kompiluje się czysto (40 tras),
`npm test` — 391/391 zielone, kod `sidebar-nav.tsx`/`app/layout.tsx` deterministyczny
i poprawny. To ten sam, już opisany wyżej defekt Turbopacka w `next dev` (niedziałający
HMR websocket → cichy desync JS/CSS chunków), nie regres w kodzie aplikacji.
`package.json`'s `build` już unikał Turbopacka (`--webpack`); brakowało tego samego
dla `dev`. Naprawa: `"dev": "next dev --webpack"` w `package.json` — bez zmian w
komponentach. Build + testy zostają zielone.

### Faza 5 — prawdziwa przyczyna znaleziona: `proxy.ts` matcher, nie Turbopack (2026-07-16)

Powyższa diagnoza ("defekt Turbopacka") była błędna co do przyczyny, poprawna co
do objawów. Rzeczywisty winowajca: `proxy.ts`'s `config.matcher` wykluczał tylko
`_next/static`/`_next/image`, nie `_next/webpack-hmr` — więc każdy websocket
handshake HMR był routowany przez lookup sesji Supabase i `next-intl`'s
`handleI18nRouting` zamiast przejść bez zmian. Skonstruowany `NextResponse`
(rewrite/redirect) nie może zrealizować `101 Switching Protocols`, stąd
`ERR_INVALID_HTTP_RESPONSE` na `wss://.../_next/webpack-hmr` i cichy desync
JS/CSS chunków (brakujące klasy/`mt-auto` w `sidebar-nav.tsx`, podwójny init
PostHoga) — nie ograniczenie frameworku, tylko nasz błąd w matcherze.

Naprawa: matcher rozszerzony na cały `_next/*`:
```ts
matcher: ['/((?!_next|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)']
```
Dodatkowo `app/providers.tsx` — guard `posthog.__loaded` przed `posthog.init(...)`,
niezależnie od przyczyny podwójnej inicjalizacji.

Zweryfikowano ręcznie w przeglądarce po fixie: brak hydration mismatch na
`SidebarNav` zarówno przy zimnym starcie (`npm run dev`, natychmiastowy
hard-reload, zero edycji w sesji) jak i po "rozgrzaniu" HMR (kilka edycji w
innych plikach przed hard-reloadem) — potwierdza że to był rzeczywiście ten
sam mechanizm w obu wariantach, nie coś odrębnego ujawniającego się dopiero
po HMR.

Skutek uboczny tej (błędnej) diagnozy: `"dev": "next dev --webpack"` z commita
`4b2add5` (2026-07-16 09:02) zostało wprowadzone jako obejście *zanim* znaleziono
prawdziwą przyczynę. Skoro `proxy.ts` matcher naprawia rzeczywisty bug HMR,
ten wpis w `package.json` nie jest już potrzebny i powinien wrócić do zwykłego
`"next dev"` (Turbopack) — patrz `CLAUDE.md`. Dopóki to nie zostanie
zweryfikowane pod Turbopackiem (a nie pod obecnie aktywnym `--webpack`), sekcja
"Znane ograniczenie środowiska" w `CLAUDE.md` zostaje zaktualizowana, ale
`package.json` wymaga osobnego świadomego kroku.
