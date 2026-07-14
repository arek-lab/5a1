# App Shell + Splash + Welcome + Home (S3.1) Implementation Plan

## Overview

Build the guest-facing PWA app shell: the flow a guest sees immediately after a successful QR scan — splash → welcome → home (5-category grid + "Polecamy" pinned services + floating Concierge stub) — with PL/EN switching and a minimal PWA manifest. This is the first real guest UI; today `(guest)/page.tsx` is a placeholder `<h1>Guest Home</h1>`.

## Current State Analysis

- `proxy.ts` already validates `__Host-session`, refreshes the Supabase JWT, and forwards `x-property-id` / `x-session-id` request headers (proxy.ts:93-100). `lib/supabase/tenant.ts:withTenantContext(headers)` turns those headers into an RLS-scoped service-role client.
- `sessions.auth_level` (0/1/2) exists and is set by `lib/scan/reception.ts` (1) and `lib/scan/room.ts` (2), but nothing today gates guest page rendering on it.
- `reservations.guest_first_name` exists but nothing joins `sessions.reservation_id → reservations` yet — this is new.
- `properties.logo_url` / `properties.name` exist (`lib/supabase/database.types.ts:304-319`) for branding.
- Services: `lib/panel/service-categories.ts` defines the fixed 5-category taxonomy (`restaurant`, `room_service`, `spa`, `transport`, `info`). `services.is_pinned` (max 3, enforced in `lib/panel/service-validation.ts:58-60`) backs "Polecamy". No guest-side query exists yet.
- next-intl: `i18n/routing.ts` uses `localePrefix: 'never'`; `i18n/request.ts` resolves locale via `requestLocale` only — no Accept-Language or cookie fallback today. No `NEXT_LOCALE`-style cookie exists.
- No PWA manifest, service worker, or workbox deps exist (`package.json` confirmed clean). Full SW caching is explicitly S3.5 scope — out of bounds here.
- Test framework: Vitest, colocated `__tests__/*.test.ts`, mocking `@/lib/supabase/server` / `@/lib/supabase/service-role` per existing patterns (e.g. `app/[locale]/(hotel)/services/__tests__/actions.test.ts`).
- No E2E/Lighthouse tooling exists in the repo.

## Desired End State

A guest who lands on `/` after a valid QR scan (`auth_level >= 1`) sees: a splash screen for up to 1.5s, then a welcome banner ("Witaj, [Imię]!" or a generic greeting if no name), then a home page with a static 5-tile category grid and a below-the-fold "Polecamy" section (up to 3 pinned services, hidden for 24h per session after first view). A floating Concierge button is always visible and links to a "coming soon" placeholder. A "PL | EN" switcher changes UI language app-wide. The app is installable per Lighthouse's PWA installability checks (manifest + viewport + icons), verified manually. A guest with `auth_level` 0 or an invalid/missing session is redirected to the existing branded error screen.

### Key Discoveries:

- `withTenantContext(headers)` (`lib/supabase/tenant.ts:10-30`) is the correct way for guest server components/route handlers to get an RLS-scoped client — pass through `headers()` from `next/headers`, which will carry `x-property-id`/`x-session-id` set by `proxy.ts`.
- `lib/panel/auth.ts`'s `getHotelUser` pattern (React `cache()` wrapping a single Supabase lookup, returning a typed object or `null`) is the established convention to mirror for a new `getGuestSessionContext()`.
- `sessions` row already carries `reservation_id`; joining to `reservations.guest_first_name` requires a second query (RLS-scoped) or a manual join — no view exists yet.

## What We're NOT Doing

- No Service Worker / Workbox caching strategies (S3.5).
- No `/c/[category]` list page, service detail page, or order flow (S3.2).
- No real AI Concierge chat (S4) — `/concierge` is a static placeholder only.
- No Lighthouse CI / automated performance gate — verified manually this session.
- No per-category service-count query or hiding of empty categories — all 5 tiles always render (downstream empty-state handling is S3.2's job per §5.5).
- No auto-translate pipeline for hotel-authored content (out of scope; this session's content is platform UI strings only).
- No offline fallback page beyond what Lighthouse's installability check requires.

## Implementation Approach

Layer bottom-up: first the guest session/locale data layer (no UI), then the app shell layout (header, guard, manifest), then the splash/welcome UI, then the home page content, then translations/tests/manual verification. Each phase produces a working, testable slice; the guest layout guard from Phase 2 protects everything built in Phases 3–4.

## Phase 1: Guest Session & Locale Foundation

### Overview

New data-access helpers: a per-request guest session context (reservation join, auth_level check) and locale resolution that works without a URL prefix.

### Changes Required:

#### 1. Guest session context helper

**File**: `lib/guest/session.ts`

**Intent**: Provide a single `getGuestSessionContext()` React-`cache()`-wrapped helper that guest pages call to get `{ propertyId, sessionId, authLevel, guestFirstName, propertyName, logoUrl }` or `null` if the session is invalid/insufficient. Mirrors `lib/panel/auth.ts:getHotelUser` in shape and caching.

**Contract**: Reads `x-property-id`/`x-session-id` from `next/headers` `headers()`, calls `withTenantContext(headers)`, queries `sessions` (join or second query to `reservations` via `reservation_id`, and to `properties` via `property_id`) to build the context. Returns `null` (not a throw) when `x-property-id` is absent, the session row is missing, or `auth_level < 1` — callers redirect on `null`.

#### 2. Guest auth guard

**File**: `lib/guest/session.ts` (same file) or `lib/guest/require-session.ts`

**Intent**: A `requireGuestSession()` wrapper used by the guest layout/pages that calls `getGuestSessionContext()` and `redirect('/error?type=insufficient_auth')` (Next.js `redirect()`) when it returns `null`, so individual pages don't repeat the check.

**Contract**: Returns the non-null `GuestSessionContext` on success; never returns on failure (throws Next's redirect signal). Reuses the existing `/error` page (`app/[locale]/(guest)/error/page.tsx`) with a new `type=insufficient_auth` value handled the same way as `session_revoked`.

#### 3. Locale resolution without URL prefix

**File**: `i18n/request.ts`

**Intent**: Resolve SSR locale from a `NEXT_LOCALE` cookie first (written client-side by the new language switcher), falling back to the `Accept-Language` header, falling back to `routing.defaultLocale`.

**Contract**: `getRequestConfig` currently only reads `requestLocale`. Add: read `cookies()` for `NEXT_LOCALE` (from `next/headers`); if absent/invalid, parse the first matching locale out of the `accept-language` header (from `headers()`); validate against `routing.locales` at each step before falling back further.

#### 4. Language switcher component

**File**: `components/guest/language-switcher.tsx`

**Intent**: `'use client'` component rendering "PL | EN" text toggle; on click, writes the new locale to `localStorage` (per roadmap, source of truth for UI state) AND sets the `NEXT_LOCALE` cookie (non-httpOnly, `SameSite=Lax`, `Path=/` — distinct from `__Host-session`, no conflict), then calls `router.refresh()` so the next SSR render picks it up via `i18n/request.ts`.

**Contract**: No props; reads `useLocale()` from `next-intl` for current state, no server round trip needed beyond the refresh.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test -- lib/guest`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- With a valid `auth_level=1` session cookie, `getGuestSessionContext()` returns the expected reservation/property fields (verified via a temporary console log or debug page, removed before phase close)
- Switching the language via a raw fetch/manual cookie edit changes SSR-rendered locale on next load

---

## Phase 2: App Shell Layout + PWA Manifest

### Overview

The guest layout: header (logo/wordmark fallback, language switcher, floating Concierge button), the `auth_level` guard wired in, and PWA manifest/metadata.

### Changes Required:

#### 1. Guest layout with header + guard

**File**: `app/[locale]/(guest)/layout.tsx`

**Intent**: Replace the current pass-through fragment with a layout that calls `requireGuestSession()`, renders a header (hotel logo `<img>` if `logo_url` present, else the hotel name as a styled text wordmark — same reserved space either way to avoid CLS), the `LanguageSwitcher`, and a `FloatingConciergeButton`, then renders `children`.

**Contract**: Server Component; the guard runs before any child renders, so `auth_level < 1` never reaches Phase 3/4 UI.

#### 2. Floating Concierge button + placeholder route

**File**: `components/guest/floating-concierge-button.tsx`, `app/[locale]/concierge/page.tsx`

**Intent**: A fixed-position button (per roadmap, "always visible") linking to `/concierge`, which renders a minimal "available soon" message. This gives S4 a route to build into.

**Contract**: `/concierge` sits outside the `(guest)` group's home content but still needs the same session guard — either move it inside `(guest)` as a sibling route, or call `requireGuestSession()` in its own page. Use the `(guest)` group so the shared layout/header apply.

#### 3. PWA manifest + metadata

**File**: `public/manifest.json`, `app/[locale]/(guest)/layout.tsx` (or root `app/layout.tsx` if `<head>` metadata must live there)

**Intent**: Ship `manifest.json` (`name`, `short_name`, `icons` — reuse/generate a placeholder icon set, `display: "standalone"`, `theme_color`, `background_color`, `start_url`), and add `viewport`/`theme-color` via Next's `metadata`/`generateViewport` export. No service worker registration.

**Contract**: Use Next.js 15's `metadata` export (`manifest: '/manifest.json'`) on the guest layout or a dedicated `app/[locale]/(guest)/manifest` route per Next's metadata file convention — follow whichever the installed Next version's App Router metadata API supports for `manifest.json` (`app/manifest.ts` is the Next 15 convention; prefer that over a static `public/manifest.json` if both work, for type-checked icon fields).

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test -- lib/guest components/guest`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- Visiting `/` with `auth_level=0` (or no session cookie) redirects to `/error?type=insufficient_auth`
- Visiting `/` with a valid `auth_level>=1` session shows header with logo (or wordmark fallback), language switcher, and floating Concierge button
- Tapping the Concierge button navigates to `/concierge` and shows the placeholder message
- Chrome DevTools "Application > Manifest" shows a valid manifest with installability checks passing

---

## Phase 3: Splash + Welcome

### Overview

The time-based splash overlay and the welcome banner with name fallback.

### Changes Required:

#### 1. Splash screen component

**File**: `components/guest/splash-screen.tsx`

**Intent**: `'use client'` component shown on first mount of the home page; displays hotel branding, unmounts itself after 1.5s via `setTimeout`, independent of any data fetching happening underneath. Home page content streams in via Suspense regardless of splash state.

**Contract**: No props beyond optional `durationMs` (default 1500) for testability. Internally: `useState` + `useEffect` timer flipping a `visible` boolean; renders `null` when not visible.

#### 2. Welcome banner with name fallback

**File**: `components/guest/welcome-banner.tsx`

**Intent**: Server Component rendering "Witaj, {guestFirstName}!" when present, else a generic "Witaj!" — never blocks rendering on a missing name.

**Contract**: Takes `guestFirstName: string | null` as a prop from the page (already resolved via `getGuestSessionContext()` in Phase 1); pure presentational, i18n message keys for both the named and generic variants (see Phase 5).

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test -- components/guest/splash-screen components/guest/welcome-banner` (fake timers for splash duration; both name-present and name-null cases for welcome)
- Type checking passes: `npm run typecheck`

#### Manual Verification:

- Splash disappears at ~1.5s regardless of network throttling
- Welcome shows the guest's first name when the test reservation has one, and a generic greeting when it doesn't

---

## Phase 4: Home Page — Category Grid + Polecamy

### Overview

The home page content: static 5-tile category grid and the pinned-services "Polecamy" section with its 24h frequency cap.

### Changes Required:

#### 1. Pinned services query

**File**: `lib/guest/services.ts`

**Intent**: `getPinnedServices(client, propertyId)` fetching up to 3 active, pinned services for the property, ordered consistently (e.g. by `category`, `name`).

**Contract**: `.from('services').select(...).eq('property_id', propertyId).eq('is_pinned', true).eq('is_active', true).limit(3)`, run against the RLS-scoped client from `withTenantContext`.

#### 2. Category grid component

**File**: `components/guest/category-grid.tsx`

**Intent**: Renders all 5 `SERVICE_CATEGORIES` (`lib/panel/service-categories.ts`) as static tiles with an icon + i18n label, each linking to `/c/[category]` (route doesn't exist until S3.2 — link target is correct, destination page arrives later).

**Contract**: No data dependency beyond the static category list; icon lookup is a local `Record<ServiceCategory, IconComponent>` map.

#### 3. Polecamy section with frequency cap

**File**: `components/guest/polecamy-section.tsx`

**Intent**: `'use client'` (needs `localStorage`) wrapper that checks `polecamy_seen_{sessionId}` in `localStorage`; if a timestamp exists and is < 24h old, renders nothing; otherwise renders the up-to-3 pinned service tiles (received as a prop from the server-fetched data) labeled "Polecane przez [Hotel]", and writes the current timestamp to that key on render.

**Contract**: Props: `services: PinnedService[]`, `sessionId: string`, `hotelName: string`. Below-the-fold placement is a page-layout concern (Phase 4 item 4), not this component's.

#### 4. Home page assembly

**File**: `app/[locale]/(guest)/page.tsx`

**Intent**: Replace the placeholder with: splash screen, welcome banner (using context from `requireGuestSession()`/`getGuestSessionContext()`), category grid, then Polecamy section below the fold (fetched via `getPinnedServices`).

**Contract**: Server Component composing the pieces above; passes `guestFirstName`, `services`, `sessionId`, `hotelName` down as needed.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test -- lib/guest/services components/guest/polecamy-section`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- All 5 category tiles render regardless of whether the property has services in that category
- Polecamy section shows up to 3 pinned services on first visit, then disappears on a second visit within 24h (verified by manually inspecting/clearing the `localStorage` key)
- Polecamy section sits visually below the fold (requires scroll) on a typical mobile viewport

---

## Phase 5: Translations, Tests, Performance Verification

### Overview

Fill in PL/EN message keys for everything built in Phases 2–4, backfill remaining unit test coverage, and run the manual Lighthouse pass.

### Changes Required:

#### 1. Message keys

**File**: `messages/en.json`, `messages/pl.json`

**Intent**: Add a `guest` top-level block (or per-component blocks following the existing `services.list`/`services.form` nesting convention) covering: welcome (named + generic), category labels for all 5 categories, Polecamy label ("Polecane przez {hotel}"), Concierge placeholder copy, error page's new `insufficient_auth` message variant.

**Contract**: Follow the existing convention of nested objects per feature area (see `messages/en.json`'s `services`/`onboarding`/`qr` blocks for the pattern).

#### 2. Remaining unit tests

**File**: `lib/guest/__tests__/session.test.ts`, `lib/guest/__tests__/services.test.ts`, `components/guest/__tests__/*.test.ts`

**Intent**: Cover: `getGuestSessionContext` null cases (no header, no session row, `auth_level` 0), locale resolution fallback chain (cookie → accept-language → default), Polecamy frequency-cap boolean logic, welcome-banner name/no-name branches.

**Contract**: Follow existing mocking convention (`vi.mock('@/lib/supabase/server')`, etc., per `app/[locale]/(hotel)/services/__tests__/actions.test.ts`).

### Success Criteria:

#### Automated Verification:

- Full unit test suite passes: `npm run test`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- Toggling "PL | EN" changes every guest-facing string on the page
- Manual Lighthouse run (Chrome DevTools or `npx lighthouse`) against the built app shows PWA installability checks passing (manifest, viewport, icons) and reports FCP <3s, LCP <2.5s, CLS <0.1 on a throttled mobile profile
- INP <200ms verified by manual interaction with the category grid / language switcher during the Lighthouse trace

---

## Testing Strategy

### Unit Tests:

- `getGuestSessionContext` / `requireGuestSession`: valid session, missing header, missing session row, `auth_level=0`, `auth_level>=1`
- Locale resolution: cookie present & valid, cookie invalid, cookie absent + accept-language match, accept-language no match → default
- Frequency cap: no localStorage entry (show), entry <24h old (hide), entry >24h old (show)
- Welcome banner: name present, name null

### Integration Tests:

- Not applicable this session (no E2E tooling); the guest flow end-to-end (QR scan → splash → welcome → home → order) is E2E-01, gated at S3.2.

### Manual Testing Steps:

1. Complete a QR scan flow (reception + room) to obtain a valid `auth_level=2` session cookie, then load `/`.
2. Confirm splash → welcome → home sequence and timing.
3. Confirm Polecamy frequency cap by reloading within and after clearing/backdating the localStorage key.
4. Toggle language and confirm SSR-rendered locale persists across a full page reload.
5. Run Lighthouse against the built app and confirm PWA installability + performance budget checks.
6. Manually set `auth_level=0` (or delete the session cookie) and confirm redirect to the branded error screen.

## Performance Considerations

- Splash timing must never depend on data-fetch latency (Phase 3 design) so the 1.5s hard-timeout budget is guaranteed regardless of DB/network conditions.
- Home page content streams via Suspense/RSC so a slow pinned-services query doesn't block FCP/LCP for the category grid.
- No new client-side JS beyond the language switcher, splash timer, and Polecamy's localStorage check — keeps initial JS within the <150KB budget.

## Migration Notes

Not applicable — no existing data or guest UI to migrate from; this is new construction on top of existing schema/session infrastructure.

## References

- Session plan: `context/foundation/session-plan.md` (S3.1 section)
- Roadmap: `context/foundation/implementation_roadmap.md` (HITL #1, #6; §5.5; App Shell budget; guest flow diagram)
- Existing session/tenant pattern: `lib/supabase/tenant.ts:10-30`, `lib/panel/auth.ts`
- Existing pin-limit rule: `lib/panel/service-validation.ts:58-60`
- Existing category taxonomy: `lib/panel/service-categories.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Guest Session & Locale Foundation

#### Automated

- [x] 1.1 Unit tests pass: `npm run test -- lib/guest` — 0fbe80c
- [x] 1.2 Type checking passes: `npm run typecheck` — 0fbe80c
- [x] 1.3 Linting passes: `npm run lint` — 0fbe80c

#### Manual

- [ ] 1.4 `getGuestSessionContext()` returns expected fields for a valid session (deferred to Phase 2 — no guest page calls it yet until the layout guard lands)
- [x] 1.5 Locale changes via cookie edit reflect on next SSR load — 0fbe80c

### Phase 2: App Shell Layout + PWA Manifest

#### Automated

- [x] 2.1 Unit tests pass: `npm run test -- lib/guest components/guest` — e36cbfc
- [x] 2.2 Type checking passes: `npm run typecheck` — e36cbfc
- [x] 2.3 Linting passes: `npm run lint` — e36cbfc

#### Manual

- [x] 2.4 `auth_level=0`/no session redirects to `/error?type=insufficient_auth` — e36cbfc
- [x] 2.5 Valid session shows header, language switcher, floating Concierge button — e36cbfc
- [x] 2.6 Concierge button navigates to placeholder `/concierge` — e36cbfc
- [x] 2.7 Chrome DevTools shows valid manifest + installability checks passing — e36cbfc

### Phase 3: Splash + Welcome

#### Automated

- [x] 3.1 Unit tests pass: `npm run test -- components/guest/splash-screen components/guest/welcome-banner` — 5cca6ee
- [x] 3.2 Type checking passes: `npm run typecheck` — 5cca6ee

#### Manual

- [x] 3.3 Splash disappears at ~1.5s regardless of throttling — c0677cb
- [x] 3.4 Welcome shows name when present, generic greeting when absent — c0677cb

### Phase 4: Home Page — Category Grid + Polecamy

#### Automated

- [x] 4.1 Unit tests pass: `npm run test -- lib/guest/services components/guest/polecamy-section` — c0677cb
- [x] 4.2 Type checking passes: `npm run typecheck` — c0677cb
- [x] 4.3 Linting passes: `npm run lint` — c0677cb

#### Manual

- [x] 4.4 All 5 category tiles render regardless of service content — c0677cb
- [x] 4.5 Polecamy shows on first visit, hides on revisit within 24h — c0677cb
- [x] 4.6 Polecamy renders below the fold on mobile viewport — c0677cb

### Phase 5: Translations, Tests, Performance Verification

#### Automated

- [ ] 5.1 Full unit test suite passes: `npm run test`
- [ ] 5.2 Type checking passes: `npm run typecheck`
- [ ] 5.3 Linting passes: `npm run lint`
- [ ] 5.4 Production build succeeds: `npm run build`

#### Manual

- [ ] 5.5 Language toggle changes every guest-facing string
- [ ] 5.6 Manual Lighthouse run: PWA installability + FCP/LCP/CLS budgets pass
- [ ] 5.7 INP <200ms verified during manual interaction
