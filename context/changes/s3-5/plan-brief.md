# Service Worker + PWA optymalizacja — Plan Brief

> Pełny plan: `context/changes/s3-5/plan.md`

## What & Why

Domykamy warstwę PWA guest appki: Service Worker (Workbox przez Serwist) z
jawnymi strategiami cache'owania, offline fallback, pipeline obrazów
(`next/image`), granice code-splittingu i budżet 150KB w CI. To ostatni
brakujący element Fazy 3 (App Shell był S3.1, offline UX bez cache — S3.4).

## Starting Point

Brak jakiegokolwiek Service Workera dziś — tylko `app/manifest.ts` (bez PNG
icon set). Guest strony renderują treść server-side w RSC, nie przez
`fetch()`, co jest niezgodne wprost z literalnym zapisem "SWR dla menu"
z roadmapy — rozwiązane cache'owaniem dokumentu HTML zamiast JSON-a (patrz
Key Decisions). `services.image_url`/`properties.logo_url` to dowolne
zewnętrzne URL-e wklejane przez hotel, renderowane dziś zwykłym `<img>`.

## Desired End State

Gość offline widzi cache'owane strony, które już odwiedził, i branded
`/offline` dla reszty. Zamówienia i inne mutacje nigdy nie fałszują sukcesu z
cache. Obrazy usług/logo przechodzą przez `next/image` (WebP/AVIF). CI
blokuje regresję budżetu 150KB automatycznie.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego (1 zdanie) | Źródło |
| --- | --- | --- | --- |
| SWR dla menu vs architektura RSC | Cache'uj cały dokument HTML (NavigationRoute) | Zero nowego API, zgodne z RSC, realizuje "offline browsing" z DoD | Plan |
| Cykl życia SW | Auto-activate (skipWaiting + clientsClaim) | Gość jednorazowy (1–3 doby) — nie ma sensu prosić o ręczne odświeżenie | Plan |
| Offline fallback | Dedykowana statyczna `offline.html`/route | Działa nawet przy całkowitym braku sieci | Plan |
| Pipeline obrazów | Pełny `next/image` + WebP/AVIF | Uzasadnione odkryciem, że `services.image_url` już istnieje i jest renderowany dziś jako `<img>` | Plan |
| Zakres code splitting | Dokładnie 3 z roadmapy (czat, /orders, błędy) | Zgodne z jawnym zakresem sesji | Plan |
| Budżet 150KB w CI | Tak, jako blokujący gate (`size-limit`) | Ryzyko regresji bundle'a oznaczone jako "Wysokie" w researchu | Plan |
| Relacja do S3.4 offline toast | Bez zmian, SW działa niezależnie obok | Dwie różne warstwy odpowiedzialności (status sieci vs. co jest dostępne offline) | Plan |
| Narzędzie SW | Serwist (nie `next-pwa`, nieaktywnie utrzymywany) | Oficjalne wsparcie App Router, mniej boilerplate'u nad tym samym Workboxem | Research (session_06) |

## Scope

**In scope:**
- Service Worker (Serwist/Workbox) z pełną macierzą strategii z roadmapy
- Offline fallback page
- `next/image` + WebP/AVIF dla `service-card`, PNG icon set + apple-touch-icon
- `next/dynamic` dla czatu, panelu zamówień
- Budżet 150KB jako CI gate

**Out of scope:**
- Push notifications (V2)
- Aktywne promowanie Add to Home Screen
- Zmiany logiki zamówień/RBAC/RLS/SSE/AI
- Cache'owanie panelu hotelowego
- Zmiana sposobu zapisu `image_url`/`logo_url` (pozostaje tekstowe pole)

## Architecture / Approach

`app/sw.ts` → build przez `@serwist/next` → `public/sw.js`. Jedna
uporządkowana lista `runtimeCaching` (Cache First → SWR → Network First →
jawny Network Only) ze ścisłym scopingiem tylko do tras gościa — panel
hotelowy i mutacje są zawsze poza zasięgiem cache.

## Phases at a Glance

| Phase | Co dostarcza | Kluczowe ryzyko |
| --- | --- | --- |
| 1. Fundament SW | Serwist wpięty w build, SW się rejestruje i aktywuje | Konflikt kolejności wrapperów configu (Sentry/next-intl/Serwist) |
| 2. Strategie cache | Pełna macierz cache'owania + offline fallback | Przypadkowe scache'owanie panelu hotelowego lub mutacji |
| 3. Pipeline obrazów | `next/image` dla service-card, PNG icon set | `remotePatterns` wildcard musi zostać ograniczony do `https` |
| 4. Code splitting | `next/dynamic` dla czatu i zamówień | Marginalna korzyść — routing już dziś izoluje te chunki |
| 5. Budżet CI + weryfikacja | `size-limit` gate, Lighthouse, manualny offline test | Dokładny glob `size-limit` zależny od faktycznej struktury `.next/static` po buildzie |

**Prerequisites:** S3.4 ukończone (potwierdzone — ostatni commit `e883946`).
**Estimated effort:** ~5 faz, jedna sesja implementacyjna.

## Open Risks & Assumptions

- Zakładamy, że `remotePatterns: [{ protocol: 'https', hostname: '**' }]`
  jest akceptowalne dla MVP mimo braku ograniczenia domen — do rewizji gdy
  hotele zaczną używać Supabase Storage zamiast dowolnych URL-i.
- Dokładny glob dla `size-limit` (`.next/static/...`) wymaga weryfikacji po
  pierwszym buildzie — struktura outputu App Routera może się różnić od
  założonej w planie.
- Serwist jest młodszym projektem niż Workbox bezpośrednio — jeśli podczas
  implementacji okaże się niekompatybilny z Next.js 16.2.6, fallback to
  ręczna integracja `workbox-build` (opisana w researchu jako alternatywa).

## Success Criteria (Summary)

- Gość offline może przeglądać wcześniej odwiedzone strony i dostaje branded
  `/offline` dla reszty, zamiast białego ekranu
- Żadna mutacja/dane sesyjne nigdy nie są serwowane z cache
- CI automatycznie blokuje regresję budżetu 150KB
