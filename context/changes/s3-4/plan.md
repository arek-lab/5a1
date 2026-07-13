# Guest Edge Cases P0/P1, Error Screens, i18n — Implementation Plan (S3.4)

## Overview

The guest app already redirects to `/error?type=...` from five call sites (reception scan, room scan, `proxy.ts` session guard, `requireGuestSession`) whenever a token/session/auth check fails — but `app/[locale]/error/page.tsx` is a placeholder stub (`Error: {type}` / `Please contact reception.`) with no branding, no message differentiation, and no locale-aware copy. This session builds that page for real, fixes an expiry/revocation conflation bug in `proxy.ts` discovered during research, adds offline detection (toast + disabled "Zamów"), and threads the reception phone number into the existing order-retry error message.

## Current State Analysis

- `app/api/scan/reception/route.ts` redirects to `/error?type=token_not_found|token_expired|token_used|auth_failed`.
- `app/api/scan/room/route.ts` redirects to `/error?type=missing_session_cookie|session_not_found|session_revoked|session_expired|wrong_auth_level|room_qr_not_found|outside_window|no_active_reservation|auth_failed`.
- `proxy.ts:50` redirects to `/error?type=session_revoked` for **both** an actually-revoked session **and** an expired one (`invalid = !session || session.revoked || new Date(session.expires_at) <= new Date()` collapses both into one type) — this is the highest-traffic path to the error page (every guest whose session lapses mid-visit) and currently mislabels the dominant real-world case.
- `lib/guest/require-session.ts:5` redirects to `/error?type=insufficient_auth` when `getGuestSessionContext()` returns null (no session cookie, or session exists but `auth_level < 1`, or property lookup fails).
- None of these five call sites pass `property_id`, so the error page — as it stands — has no way to resolve branding (logo/name/`phone_reception`) even where the caller already has that data in hand.
- `lib/guest/session.ts` (`getGuestSessionContext`) is the only existing code that fetches property branding, and it requires a **valid** session — unusable from the error page by definition.
- `lib/scan/errors.ts` defines `ReceptionScanError` (3 values) and `RoomScanError` (8 values); combined with `auth_failed` (both routes) and `insufficient_auth` (require-session), that's 13 distinct type strings feeding one undifferentiated page today.
- `components/guest/order-confirm-modal.tsx` (built in S3.2) already has working inline retry-on-failure for the order POST — `error` state, `t('errorMessage')`, retry button reuses the same `submit()` handler — but the message is generic with no reception contact, and `GuestOrderContext` (`components/guest/order-cta.tsx:8-13`) doesn't carry `phoneReception`.
- No offline-detection code exists anywhere in the guest app (`navigator.onLine`, `online`/`offline` listeners) — greenfield for this session.
- `components/guest/concierge-chat.tsx:171` already has the exact pattern to reuse for a phone CTA: `<a href={\`tel:${phoneReception}\`}>`.
- Codebase convention confirmed across `order-confirm-modal.tsx`, `order-cta.tsx`, `concierge-chat.tsx`: plain hooks (`useState`/`useEffect`), no Context providers, `next-intl` `useTranslations` for all new client-component copy, flat per-feature namespaces under `guest.*` in `messages/{pl,en}.json`.

## Desired End State

Any guest who hits a token/session/auth failure lands on a real `/[locale]/error` page instead of a 404 or a raw stub: branded with the hotel's logo/name and a `tel:` link to reception when the property is resolvable, or an honest platform-neutral message when it isn't (URL tampering, no session ever existed). The page's copy differs across four groups — expired, invalid, insufficient access, generic room-scan issue — so a guest whose room QR was scanned before check-in doesn't see "your link is invalid." A guest who loses connectivity sees a non-blocking toast and can't tap "Zamów" until back online; an order POST that fails for any reason (offline or 5xx) shows the existing retry affordance now with the reception phone number attached. Both PL and EN carry all new copy. `proxy.ts` correctly distinguishes an expired session from a revoked one.

### Key Discoveries:

- `app/[locale]/error/page.tsx` already exists as a stub (not the empty, unused `app/[locale]/(guest)/error/` directory) — it sits **outside** the `(guest)` route group, so it does not go through `GuestLayout`'s `requireGuestSession()` call. This is load-bearing: if the error page lived inside `(guest)`, reaching it while unauthenticated would redirect right back to itself in a loop. Build here; do not move it into `(guest)`.
- `getGuestSessionContext`'s property fetch (`select('name, logo_url, ai_bot_name, phone_reception')`) is the exact shape needed for the error page's branding — reuse the query, not the whole session-context function (which requires an active session).

## What We're NOT Doing

- No Service Worker / Workbox caching (S3.5) — offline detection here is purely `navigator.onLine` + a toast, no cache-first browsing.
- No retry button on the `/error` page itself — these are auth/token failures where retrying without a new QR scan fails identically; retry stays scoped to order mutations per the roadmap.
- No per-type (13-way) translation — types collapse into 4 message groups.
- No Referer-header or other best-effort property recovery when `property_id` is absent — those cases render the generic fallback.
- No changes to `lib/scan/reception.ts` / `lib/scan/room.ts` validation logic itself — only their route handlers gain a query param on redirect.
- No offline banner/state on the `/error` page or `/concierge` — scope is the ordering flow (`OrderCta`) and a global toast, per the roadmap's P1 row ("Zamów" disabled offline).

## Implementation Approach

Bottom-up: first the shared error-type-to-message-group mapping and the plumbing that gets `property_id` to the error page (Phase 1), then the page itself (Phase 2) — each phase independently testable. Offline detection (Phase 3) and the order-retry phone number (Phase 4) are independent of the error page and of each other. Translations land alongside each phase's UI rather than as one big batch at the end, except a final consistency pass (Phase 5).

## Phase 1: Error taxonomy + property-context plumbing

### Overview

Establish the single source of truth mapping the 13 existing `type` values to 4 message groups, and get `property_id` onto every redirect URL that has one available — including fixing `proxy.ts`'s expired/revoked conflation.

### Changes Required:

#### 1. Error-type mapping

**File**: `lib/guest/error-copy.ts`

**Intent**: Pure function mapping a `type` query string to one of four message groups, used by the error page to pick translation keys.

**Contract**: `export type ErrorGroup = 'expired' | 'invalid' | 'insufficient_access' | 'generic'`. `export function resolveErrorGroup(type: string | undefined): ErrorGroup` — `expired` for `{token_expired, session_expired}`; `invalid` for `{token_not_found, token_used, missing_session_cookie, session_not_found, session_revoked, auth_failed}`; `insufficient_access` for `{insufficient_auth, wrong_auth_level}`; `generic` for `{room_qr_not_found, outside_window, no_active_reservation}` and any unrecognized value (defensive default).

#### 2. `proxy.ts` — split expired vs revoked

**File**: `proxy.ts`

**Intent**: The existing `invalid` check (`proxy.ts:45`) collapses "session row missing," "revoked," and "expired" into one redirect type. Split so an expired session redirects with `type=session_expired` and a genuinely revoked/missing one redirects with `type=session_revoked`, and both carry `property_id` when the session row was found.

**Contract**: Replace the single `invalid` boolean with three explicit branches ordered `!session` → `session.revoked` → `expired`; each builds its own redirect URL. When `session` is non-null, append `&property_id=${session.property_id}` to the redirect URL regardless of which branch fired (the row exists even for the expired/revoked cases — only `!session` has no property to attach).

#### 3. Reception scan route — append `property_id`

**File**: `app/api/scan/reception/route.ts`

**Intent**: The `token_expired` and `token_used` redirects (`route.ts:31`) have `tokenResult.qr.property_id` in scope even on failure (the row was found, just not consumable) — attach it. `token_not_found` (no row at all) and the `auth_failed` cases (post-signin failures, `route.ts:65,76`) already have `qr.property_id` in scope by that point too.

**Contract**: `tokenResult.ok === false` branch appends `&property_id=${tokenResult.qr?.property_id}` when `findAndConsumeToken` returns the row even on failure — requires widening `findAndConsumeToken`'s failure return type to optionally include the found `qr` row for `token_expired`/`token_used` (it currently only returns `{ ok: false, error }`; `token_not_found` genuinely has no row). The two `auth_failed` redirects lower in the handler already have `qr.property_id` in scope — append directly.

#### 4. Room scan route — append `property_id`

**File**: `app/api/scan/room/route.ts`

**Intent**: `validateRoomScan`'s failure branches after the session lookup succeeds (`wrong_auth_level`, `room_qr_not_found`, `outside_window`, `no_active_reservation`) have `session.property_id` in scope. `missing_session_cookie` and `session_not_found` (session lookup itself failed) do not.

**Contract**: Widen `validateRoomScan`'s failure return (`lib/scan/room.ts`) to include the fetched `session` row when available (i.e. for every error past the initial `sessionError || !session` check), mirroring the reception route's pattern. Route handler appends `&property_id=${session.property_id}` where present. The `auth_failed` redirect already has `validation.session.property_id` in scope.

#### 5. `require-session.ts` — no change

**Intent**: `getGuestSessionContext()` returning null means no resolvable session *or* no resolvable property — there is nothing to attach. Confirmed no-op for this phase; documented here so Phase 2 doesn't need to special-case it.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test -- lib/guest/error-copy lib/scan/reception lib/scan/room`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- Triggering an expired reception QR scan redirects to `/error?type=token_expired&property_id=<uuid>`
- Letting a session naturally expire (or forcing `expires_at` in the past) and hitting any guest page redirects to `/error?type=session_expired&property_id=<uuid>`, not `session_revoked`
- Scanning a room QR with `room_id` for a different property's room redirects without a `property_id` mismatch (still resolves to the requesting session's own property)

---

## Phase 2: `/error` page

### Overview

Replace the stub with the real branded/generic informational page.

### Changes Required:

#### 1. Property branding lookup

**File**: `lib/guest/error-copy.ts` (extend from Phase 1)

**Intent**: Server-side helper fetching the same branding fields `getGuestSessionContext` fetches, but keyed by `property_id` directly with no session dependency — usable from a context where no valid session exists.

**Contract**: `export async function getErrorPageBranding(propertyId: string | undefined): Promise<{ name: string; logoUrl: string | null; phoneReception: string | null } | null>` — returns `null` when `propertyId` is undefined or the property row isn't found; otherwise a service-role `select('name, logo_url, phone_reception').eq('id', propertyId).maybeSingle()` (service-role, not tenant-scoped client — there is no authenticated tenant context at this point, mirroring `lib/scan/reception.ts`'s use of `createServiceRoleClient()`).

#### 2. Error page

**File**: `app/[locale]/error/page.tsx`

**Intent**: Replace the placeholder. Reads `type` and `property_id` from `searchParams`, resolves the message group via `resolveErrorGroup`, resolves branding via `getErrorPageBranding`. Renders logo (if present) + hotel name + group-specific heading/body copy + a `tel:` link to `phoneReception` (reusing the `concierge-chat.tsx:171` pattern) when branding resolved, or the generic platform-neutral copy (no logo, no phone, "contact your hotel's reception directly") when it didn't. A single link back to `/`. No retry button.

**Contract**: Server component; `searchParams: Promise<{ type?: string; property_id?: string }>`; `getTranslations('guest.error')` for copy keyed by group (`expired`, `invalid`, `insufficientAccess`, `generic`) plus shared `contactReception`/`backHome` strings.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test -- lib/guest/error-copy`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- Visiting `/pl/error?type=token_expired&property_id=<real-uuid>` shows the hotel's logo, name, "wygasł" copy, and a tappable phone link
- Visiting `/pl/error?type=token_not_found` (no `property_id`) shows generic copy, no logo, no phone link
- Visiting `/pl/error?type=outside_window&property_id=<real-uuid>` shows branded but distinctly different copy from the expired/invalid cases (not "your link is invalid")
- Visiting `/en/error?type=session_revoked` shows English copy
- No redirect loop: reaching `/error` never triggers `requireGuestSession()`

---

## Phase 3: Offline detection

### Overview

Non-blocking global toast on connectivity loss; "Zamów" disabled while offline.

### Changes Required:

#### 1. Online-status hook

**File**: `lib/guest/use-online-status.ts`

**Intent**: Client hook exposing current connectivity, backed by `navigator.onLine` plus `online`/`offline` window event listeners.

**Contract**: `'use client'` directive; `export function useOnlineStatus(): boolean` — initializes from `navigator.onLine` (guarded for SSR: default `true` when `navigator` is undefined), subscribes/unsubscribes `online`/`offline` listeners in a `useEffect`.

#### 2. Offline toast

**File**: `components/guest/offline-toast.tsx`

**Intent**: Renders a non-blocking toast (visual pattern matches `components/guest/order-toast.tsx`, but persists while offline rather than auto-dismissing — it should reflect current state, not a one-shot event) when `useOnlineStatus()` is `false`; renders nothing when online.

**Contract**: `'use client'`; no props; mounted once.

#### 3. Wire into guest layout

**File**: `app/[locale]/(guest)/layout.tsx`

**Intent**: Mount `<OfflineToast />` alongside the existing `<FloatingConciergeButton />`.

**Contract**: One new import, one new element in the returned JSX.

#### 4. Disable "Zamów" while offline

**File**: `components/guest/order-cta.tsx`

**Intent**: The "Zamów" button (`order-cta.tsx:47`) becomes `disabled` when `useOnlineStatus()` is `false`, matching the existing `disabled:opacity-50` styling already present on other guest buttons.

**Contract**: `const isOnline = useOnlineStatus()`; button gains `disabled={!isOnline}` and the existing Tailwind class list already handles the disabled visual state via `disabled:` variants used elsewhere in this file's sibling components — verify/add if absent on this specific button.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test -- lib/guest/use-online-status components/guest/offline-toast components/guest/order-cta`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- Using browser devtools "Offline" throttling on a guest page shows the toast within one event tick and disables "Zamów" on any service detail page
- Restoring connectivity dismisses the toast and re-enables "Zamów"
- Toast does not block interaction with the rest of the page (browsing still works while offline, per cached content — no claim about cache freshness, that's S3.5)

---

## Phase 4: Order-retry phone number

### Overview

Thread `phoneReception` into the order flow so the existing retry message includes reception contact.

### Changes Required:

#### 1. Extend `GuestOrderContext`

**File**: `components/guest/order-cta.tsx`

**Intent**: Add `phoneReception` to the type already threaded from the service detail page down through `OrderCta` into `OrderConfirmModal`.

**Contract**: `GuestOrderContext` (`order-cta.tsx:8-13`) gains `phoneReception: string | null`.

#### 2. Pass `phoneReception` from the service detail page

**File**: `app/[locale]/(guest)/c/[category]/[service]/page.tsx`

**Intent**: `requireGuestSession()` already returns `phoneReception` (`lib/guest/session.ts:16`) — thread it into the `GuestOrderContext` object built for `OrderCta`.

**Contract**: One additional field on the existing object literal.

#### 3. Show phone in the retry error message

**File**: `components/guest/order-confirm-modal.tsx`

**Intent**: The existing `error` state message (`errorMessage`, line 41/47) gains a `tel:` link when `guestContext.phoneReception` is present, reusing the `concierge-chat.tsx:171` `<a href={\`tel:${phoneReception}\`}>` pattern. No distinction between offline-triggered and 5xx-triggered failure — both paths already funnel into the same `catch`/`!response.ok` branches.

**Contract**: `t('errorMessage')` becomes a translation with an interpolated phone placeholder, or the phone link renders as a separate element below the existing message when `phoneReception` is non-null — implementer's choice, either satisfies the same visible outcome.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test -- components/guest/order-confirm-modal`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- Forcing a POST failure (devtools network throttling → offline, or stubbing a 500) on order submission shows the existing retry button plus a tappable reception phone link
- Successful retry after a forced failure still completes the order and navigates to `/order-success`

---

## Phase 5: i18n consistency pass + final verification

### Overview

Confirm all new copy exists in both locales under the agreed namespaces; run the full verification suite.

### Changes Required:

#### 1. Translation keys

**File**: `messages/pl.json`, `messages/en.json`

**Intent**: New `guest.error` namespace (`expired`, `invalid`, `insufficientAccess`, `generic` — each with a heading + body; shared `contactReception`, `backHome`) and `guest.offline` namespace (`toastMessage`), alongside the existing `guest.categories/service/orderModal/orderSuccess/orders` blocks (`messages/pl.json:5`). Extend `guest.orderModal.errorMessage` (or add `guest.orderModal.errorMessageWithPhone`) per the Phase 4 implementer's choice.

**Contract**: Both files' `guest` object gain identical key shapes — PL and EN structurally mirrored, per existing convention.

### Success Criteria:

#### Automated Verification:

- Full test suite passes: `npm run test`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- Full manual pass through Phases 1-4's manual verification steps with the language switcher toggled to confirm both PL and EN render correctly for every error group
- No leftover hard-coded strings in any new/modified component (spot-check against the `useTranslations` convention used elsewhere in `components/guest/`)

---

## Testing Strategy

### Unit Tests:

- `resolveErrorGroup`: all 13 known type values map to the expected group; unrecognized value falls back to `generic`
- `getErrorPageBranding`: returns `null` for undefined `property_id`, returns the expected shape for a known property, returns `null` for an unknown `property_id`
- `useOnlineStatus`: reflects `navigator.onLine` initial value; updates on simulated `online`/`offline` events
- `findAndConsumeToken` / `validateRoomScan`: widened failure return shapes still satisfy existing call sites and tests (extend, don't break, current test coverage in `lib/scan/__tests__/`)
- `order-confirm-modal`: renders phone link when `phoneReception` present, omits it when null

### Integration Tests:

- None new — this session has no E2E tooling in scope (consistent with S3.1/S3.2 precedent, no Playwright in repo).

### Manual Testing Steps:

1. Force each of the 13 `type` values via direct URL navigation to `/pl/error?type=...` (with and without `property_id`) and confirm correct grouping/copy.
2. Let a real session expire naturally (or manipulate `expires_at`) and confirm `proxy.ts` now redirects with `session_expired`, not `session_revoked`.
3. Toggle devtools offline mode mid-session: confirm toast appears, "Zamów" disables, order retry shows phone number after a forced failure.
4. Switch language PL↔EN on the error page and in the order retry flow.

## Performance Considerations

None — this is UI/routing work with no new hot paths; the error-page branding lookup is a single indexed `properties` row fetch, same cost as the existing session-context lookup it mirrors.

## Migration Notes

No schema changes. No data migration.

## References

- Session plan: `context/foundation/session-plan.md` (S3.4, lines 157-160)
- Roadmap edge-case spec: `context/foundation/implementation_roadmap.md:382-424`
- Prior session establishing order flow + retry pattern: `context/changes/s3-2/plan.md`
- Existing `tel:` link pattern: `components/guest/concierge-chat.tsx:169-180`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Error taxonomy + property-context plumbing

#### Automated

- [x] 1.1 Unit tests pass: `npm run test -- lib/guest/error-copy lib/scan/reception lib/scan/room`
- [x] 1.2 Type checking passes: `npm run typecheck`
- [x] 1.3 Linting passes: `npm run lint`

#### Manual

- [ ] 1.4 Expired reception QR scan redirects to `/error?type=token_expired&property_id=<uuid>`
- [ ] 1.5 Naturally expired session redirects with `type=session_expired`, not `session_revoked`
- [ ] 1.6 Room QR scan property_id resolves correctly

### Phase 2: `/error` page

#### Automated

- [ ] 2.1 Unit tests pass: `npm run test -- lib/guest/error-copy`
- [ ] 2.2 Type checking passes: `npm run typecheck`
- [ ] 2.3 Linting passes: `npm run lint`

#### Manual

- [ ] 2.4 `/pl/error?type=token_expired&property_id=<real-uuid>` shows branded expired copy
- [ ] 2.5 `/pl/error?type=token_not_found` shows generic unbranded copy
- [ ] 2.6 `/pl/error?type=outside_window&property_id=<real-uuid>` shows distinct generic-room-issue copy
- [ ] 2.7 `/en/error?type=session_revoked` shows English copy
- [ ] 2.8 No redirect loop reaching `/error`

### Phase 3: Offline detection

#### Automated

- [ ] 3.1 Unit tests pass: `npm run test -- lib/guest/use-online-status components/guest/offline-toast components/guest/order-cta`
- [ ] 3.2 Type checking passes: `npm run typecheck`
- [ ] 3.3 Linting passes: `npm run lint`

#### Manual

- [ ] 3.4 Offline throttling shows toast and disables "Zamów"
- [ ] 3.5 Restoring connectivity dismisses toast and re-enables "Zamów"
- [ ] 3.6 Browsing remains usable while offline toast is shown

### Phase 4: Order-retry phone number

#### Automated

- [ ] 4.1 Unit tests pass: `npm run test -- components/guest/order-confirm-modal`
- [ ] 4.2 Type checking passes: `npm run typecheck`
- [ ] 4.3 Linting passes: `npm run lint`

#### Manual

- [ ] 4.4 Forced POST failure shows retry button plus reception phone link
- [ ] 4.5 Successful retry after forced failure completes the order

### Phase 5: i18n consistency pass + final verification

#### Automated

- [ ] 5.1 Full test suite passes: `npm run test`
- [ ] 5.2 Type checking passes: `npm run typecheck`
- [ ] 5.3 Linting passes: `npm run lint`
- [ ] 5.4 Production build succeeds: `npm run build`

#### Manual

- [ ] 5.5 Full manual pass through Phases 1-4 in both PL and EN
- [ ] 5.6 No leftover hard-coded strings in new/modified components
