# S2.1 — Hotel Panel Auth + RBAC Middleware Implementation Plan

## Overview

Wire email+password authentication for `hotel_users` and enforce the §4.2 RBAC permission matrix across the hotel panel. The guest auth path (anonymous sign-in + Custom Access Token Hook) remains untouched; hotel staff use a separate identity resolution path: a `getHotelUser()` helper that reads `hotel_users` via service_role and is wrapped in `React.cache()` for per-request deduplication. All five phases are independent enough to be committed individually.

## Current State Analysis

- `hotel_users` table exists with `role hotel_role ENUM('owner','admin','staff','viewer')`, `property_id`, `auth_user_id`, `status ('invited'|'active'|'deactivated')` — all data for RBAC is in place.
- The Custom Access Token Hook (migration 004) only injects claims from the `sessions` table (guest path). Hotel users get `auth_level: 0` from the hook with no `property_id` in their JWT — the existing `x-property-id` header injection in `proxy.ts` carries nothing for panel requests.
- `app/[locale]/(hotel)/layout.tsx` is a stub pass-through — no auth guard.
- `app/[locale]/(hotel)/dashboard/page.tsx` is a stub — no auth check.
- `app/api/panel/reservations/[id]/checkout/route.ts` has `TODO(S2.1): add RBAC guard` — currently unauthenticated, anyone can trigger early checkout.
- `lib/supabase/client.ts` exports `createBrowserClient()` — available for use in the login form Client Component.
- `lib/supabase/service-role.ts` exports `createServiceRoleClient()` — used to bypass RLS for the hotel_users lookup (hotel_users has RLS enabled, and hotel users have no RLS context set at login time).

## Desired End State

After S2.1:
- Navigating to any `/dashboard` (or future panel route) when unauthenticated redirects to `/login`.
- A hotel staff member signs in with email+password → `supabase.auth.signInWithPassword()` → cookie set by Supabase SSR → redirect to `/dashboard`.
- The `(hotel)` layout calls `getHotelUser()`, resolves the logged-in user's `hotel_users` row, and enforces: unauthenticated → `/login`; deactivated/missing → sign out + `/login?error=no_access`.
- `canPerform(role, resource, level)` is a pure function implementing the §4.2 matrix; all 48 cells are covered by Vitest tests.
- `RequirePermission` is a server component guard usable by any future panel page.
- `POST /api/panel/reservations/[id]/checkout` returns 401 for unauthenticated requests and 403 for viewer role.
- `npm run test -- lib/panel/__tests__/rbac.test.ts` exits 0.

### Key Discoveries

- `hotel_users` has RLS enabled (migration 002). The policy is `property_id = current_setting('app.property_id', true)::uuid`. At login time, no tenant context is set, so the `authenticated` Supabase client cannot read `hotel_users` — the lookup MUST use `createServiceRoleClient()`.
- `React.cache()` is available in both Next.js Server Components and Route Handlers (per-request deduplication). Wrapping `getHotelUser()` means layout + route handler in the same request share one DB lookup.
- `proxy.ts` (the middleware) already handles `__Host-session` revocation for guests. It does not check hotel_users; the panel layout owns hotel-user auth enforcement.
- Cookie mutations (`signOut`) require a request/response context with write access. Server Components cannot write cookies. Use a Route Handler (`/api/auth/sign-out`) for all signOut operations — both the manual button and the automatic deactivated-user path.
- `localePrefix: 'never'` in i18n routing: all `[locale]` segments are transparent in URLs. `app/[locale]/(hotel)/dashboard/page.tsx` maps to `/dashboard`.

## What We're NOT Doing

- Extending the Custom Access Token Hook for hotel users (hook stays guest-only; hotel identity resolves at the application layer).
- Building any panel UI modules (services, QR, orders, users, billing) — those are S2.2–S2.7.
- Adding a billing route or a users-management route — no routes to guard yet; billing and users RBAC is verified through unit tests only.
- CAPTCHA or multi-factor auth on the login form — MVP scope.
- Panel-specific RLS policies — hotel queries in S2.2+ will use service_role + `property_id` filter via `set_tenant_context`.
- Password reset flow — deferred to S2.7 ("Reset hasła; zmiana roli przez Admin/Owner | SHOULD").
- Persisting hotel_user `last_login_at` — tracked in S2.7 (user list feature).

## Implementation Approach

Five phases in sequence. Phase 3 (RBAC) is pure logic and can be developed in any order relative to Phases 1–2. The layout guard (Phase 4) depends on Phases 2 and 3. The checkout route guard (Phase 5) depends on Phases 2 and 3.

```
Phase 1: Login UI (hotel-auth group, no guard)
Phase 2: getHotelUser() resolver + sign-out route handler
Phase 3: RBAC matrix (pure logic) + 48-cell unit tests    ←── parallel with 1–2
Phase 4: (hotel) layout guard + unauthorized page + RequirePermission
Phase 5: Wire checkout route (uses Phase 2 + 3 output)
```

---

## Phase 1: Login Page

### Overview

Create the hotel panel login page in a new `(hotel-auth)` route group — outside the `(hotel)` layout that will carry the auth guard in Phase 4. The page is a Server Component that redirects already-logged-in hotel users to `/dashboard`; it renders a Client Component form that calls Supabase signInWithPassword.

### Changes Required

#### 1. New route group directory

**File**: `app/[locale]/(hotel-auth)/` (directory only)

**Intent**: Establish a Next.js route group for public hotel-auth pages (login only for now). Pages here use the `[locale]/layout.tsx` (i18n provider) but not the `(hotel)/layout.tsx` (auth guard). URL paths are unchanged — `(hotel-auth)` is transparent.

**Contract**: No layout file needed in this group (inherits `[locale]/layout.tsx`). Sibling to `(hotel)` and `(guest)` directories.

---

#### 2. Login page server component

**File**: `app/[locale]/(hotel-auth)/login/page.tsx`

**Intent**: Check if the current user is already an active hotel user and redirect them to `/dashboard`. Render an error message when the `?error=no_access` search param is present (set by the sign-out route after detecting a deactivated account). Pass through to the LoginForm client component.

**Contract**: Async Server Component. Reads `searchParams.error`. Calls `getHotelUser()` (Phase 2); if non-null, calls `redirect('/dashboard')`. Passes `error` string (or null) as a prop to `<LoginForm>`.

---

#### 3. Login form client component

**File**: `app/[locale]/(hotel-auth)/login/login-form.tsx`

**Intent**: Collect hotel user email and password, call Supabase browser-side sign-in, and navigate to `/dashboard` on success. Show inline error for invalid credentials.

**Contract**: `'use client'`. Uses `createBrowserClient()` from `lib/supabase/client.ts`. On submit: `supabase.auth.signInWithPassword({ email, password })`. On error: display the Supabase error message inline (no toast). On success: `router.push('/dashboard')` via `useRouter`. Accepts `initialError?: string | null` prop to display the no-access message from the server.

### Success Criteria

#### Automated Verification

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification

- Visiting `/login` shows the email+password form
- Valid hotel user credentials → redirect to `/dashboard`
- Invalid credentials → inline error message (no redirect)
- Already-logged-in hotel user visiting `/login` → redirected to `/dashboard`
- Visiting `/login?error=no_access` → error message rendered (e.g., "Your account has been deactivated")

**Implementation Note**: After completing this phase and automated checks pass, pause for manual verification before proceeding.

---

## Phase 2: Hotel User Resolver + Sign-Out Route Handler

### Overview

Implement `getHotelUser()` — the shared identity resolver for the hotel panel — and the `/api/auth/sign-out` route handler used by both the sign-out button and the auto-signout path for deactivated users.

### Changes Required

#### 1. Hotel user resolver

**File**: `lib/panel/auth.ts`

**Intent**: Provide a single, deduplicated lookup of the current Supabase user's `hotel_users` row. Wrapping in `React.cache()` ensures the layout and any child server components (or route handlers) that call this function in the same request share one DB round-trip.

**Contract**:

Export:
```ts
export type HotelUser = {
  id: string          // hotel_users.id
  propertyId: string  // hotel_users.property_id
  role: HotelRole     // from lib/panel/rbac.ts
  fullName: string | null
  email: string
}

export const getHotelUser: () => Promise<HotelUser | null>
```

Implementation outline (no snippet needed — follows established pattern):
- `cache()` from `'react'` wraps an async function.
- Inner function: `createServerClient().auth.getUser()` → if no `user`, return null.
- `createServiceRoleClient().from('hotel_users').select('id, property_id, role, full_name, email, status').eq('auth_user_id', user.id).eq('status', 'active').single()` → if no row (error or null), return null.
- Map to `HotelUser` shape and return.

Note: `HotelRole` import comes from `lib/panel/rbac.ts` (Phase 3). To avoid circular imports, define `HotelRole` in `rbac.ts` and import it here.

---

#### 2. Sign-out route handler

**File**: `app/api/auth/sign-out/route.ts`

**Intent**: Handle both the manual sign-out button (POST) and the automatic deactivated-user sign-out path (GET redirect from the `(hotel)` layout). Both paths call `supabase.auth.signOut()` and redirect to `/login`. Only route handlers and server actions can write auth cookies — this is why signOut is delegated here rather than handled in a server component.

**Contract**:

- `GET /api/auth/sign-out`: reads `?error` search param; calls `createServerClient().auth.signOut()`; redirects to `/login` (appending `?error=<value>` if present). Used by the layout for deactivated users: `redirect('/api/auth/sign-out?error=no_access')`.
- `POST /api/auth/sign-out`: calls `createServerClient().auth.signOut()`; redirects to `/login`. Used by the sign-out button form.

### Success Criteria

#### Automated Verification

- Type checking passes: `npm run typecheck`

#### Manual Verification

- Calling `GET /api/auth/sign-out` clears the Supabase auth cookie and redirects to `/login`
- Calling `GET /api/auth/sign-out?error=no_access` redirects to `/login?error=no_access`
- Calling `POST /api/auth/sign-out` (via form submission) clears session and redirects to `/login`

**Implementation Note**: Pause for manual verification after completing this phase.

---

## Phase 3: RBAC Permission Matrix + Unit Tests

### Overview

Implement the permission matrix from §4.2 as a pure TypeScript module with no external dependencies. Write Vitest tests that assert every one of the 48 matrix cells. This phase can be developed independently of Phases 1–2.

### Changes Required

#### 1. RBAC module

**File**: `lib/panel/rbac.ts`

**Intent**: Encode the §4.2 permission matrix as a typed constant and expose a `canPerform` predicate that route handlers and server components use to gate access. Pure function — no DB, no async, no side effects. Makes the RBAC contract explicit and testable in isolation.

**Contract**:

```ts
export type HotelRole = 'owner' | 'admin' | 'staff' | 'viewer'

export type Resource =
  | 'hotel_profile'
  | 'services'
  | 'knowledge'
  | 'qr_manage'
  | 'qr_sessions'
  | 'orders_view'
  | 'orders_status'
  | 'orders_export'
  | 'users'
  | 'dashboard'
  | 'billing'
  | 'transfer_ownership'

export type Permission = 'none' | 'read' | 'write' | 'full'

// Hierarchy: full > write > read > none
// canPerform returns true when the role's actual permission >= required level.
export function canPerform(
  role: HotelRole,
  resource: Resource,
  level: Permission
): boolean
```

The `PERMISSION_MATRIX` (a `Record<Resource, Record<HotelRole, Permission>>` constant) encodes the §4.2 table verbatim:

| Resource | owner | admin | staff | viewer |
|---|---|---|---|---|
| `hotel_profile` | full | full | read | read |
| `services` | full | full | write | read |
| `knowledge` | full | full | write | read |
| `qr_manage` | full | full | full | none |
| `qr_sessions` | full | full | full | read |
| `orders_view` | full | full | full | read |
| `orders_status` | full | full | full | none |
| `orders_export` | full | full | none | full |
| `users` | full | full | none | none |
| `dashboard` | full | full | read | full |
| `billing` | full | none | none | none |
| `transfer_ownership` | full | none | none | none |

`canPerform` compares the numeric index of the actual permission in `['none','read','write','full']` against the required level's index. Returns true if actual index ≥ required index.

---

#### 2. RBAC unit tests

**File**: `lib/panel/__tests__/rbac.test.ts`

**Intent**: Verify all 48 matrix cells — 12 resources × 4 roles — so that any change to the matrix immediately surfaces as a test failure. Each test group covers one resource; each assertion covers one role × one representative permission boundary.

**Contract**: Vitest test file. No mocks, no imports other than `canPerform` and the types. Structure: one `describe` block per resource (12 total), four assertions per block covering all four roles. Each assertion tests the cell's declared permission level at its own level (should return `true`) and one level above (should return `false`) — except `full` cells which only test the positive case. The DoD cells from session-plan.md are explicitly commented:

- `canPerform('viewer', 'orders_status', 'read')` → `false` (viewer cannot POST status change)
- `canPerform('staff', 'billing', 'read')` → `false` (staff cannot see billing)
- `canPerform('owner', 'billing', 'full')` → `true` (owner can see billing)

### Success Criteria

#### Automated Verification

- Unit tests pass: `npm run test -- lib/panel/__tests__/rbac.test.ts`
- Type checking passes: `npm run typecheck`
- All 48 resource × role cells have at least one assertion

#### Manual Verification

None — pure unit tests; no manual verification needed.

**Implementation Note**: This phase is self-contained. Proceed to Phase 4 as soon as tests are green.

---

## Phase 4: (hotel) Layout Auth Guard + Unauthorized Page + RequirePermission Component

### Overview

Replace the stub `(hotel)/layout.tsx` with a real auth guard that uses `getHotelUser()`. Add a sign-out button form. Create the `/unauthorized` page for role-based access violations. Create the `RequirePermission` server component for use by future panel pages.

### Changes Required

#### 1. (hotel) layout with auth guard

**File**: `app/[locale]/(hotel)/layout.tsx`

**Intent**: Enforce authentication for all hotel panel pages. Redirect unauthenticated users to `/login`. Auto-sign-out and redirect deactivated users to `/login?error=no_access`. Render a sign-out button for authenticated users.

**Contract**: Async Server Component. Calls `getHotelUser()` (from `lib/panel/auth.ts`):
- If `createServerClient().auth.getUser()` would return null (no Supabase session) → the `getHotelUser()` function returns null → `redirect('/login')`.
- If Supabase user exists but hotel_users row is missing/deactivated → `getHotelUser()` returns null → `redirect('/api/auth/sign-out?error=no_access')`.

The layout cannot distinguish between "no session" and "deactivated" from the null return alone. To distinguish: check `(await createServerClient().auth.getUser()).data.user` first — if null, redirect to `/login` directly; if non-null but `getHotelUser()` is null, redirect to the sign-out handler.

Alternatively (simpler): always redirect to `/api/auth/sign-out?error=no_access` when `getHotelUser()` is null, and the sign-out handler safely handles the case where no session exists (signOut on an already-signed-out user is a no-op in Supabase).

Choose the simpler path: null from `getHotelUser()` → `redirect('/api/auth/sign-out?error=no_access')`. The sign-out route handles both cases.

Sign-out button: `<form action="/api/auth/sign-out" method="POST"><button type="submit">Sign out</button></form>`. Minimal styling — this is functional scaffolding; full UI comes in S2.2+.

---

#### 2. Unauthorized page

**File**: `app/[locale]/(hotel)/unauthorized/page.tsx`

**Intent**: Inform a hotel user that they lack permission for the page they navigated to. Provide a navigation path back to the dashboard.

**Contract**: Server Component. Static content: heading ("Access denied"), one sentence explaining the role restriction, a link back to `/dashboard`. No auth guard needed — the `(hotel)` layout already enforces authentication; reaching this page means the user IS authenticated but has insufficient role.

---

#### 3. RequirePermission server component

**File**: `components/panel/require-permission.tsx`

**Intent**: Reusable server-side permission gate for future panel pages. Wraps children; redirects to `/unauthorized` if the user's role cannot perform the required action on the given resource. Centralizes the redirect so individual pages don't repeat the redirect logic.

**Contract**:

```ts
interface Props {
  role: HotelRole
  resource: Resource
  level: Permission
  children: React.ReactNode
}
```

Calls `canPerform(role, resource, level)`. If false → `redirect('/unauthorized')`. If true → `<>{children}</>`.

Import `HotelRole`, `Resource`, `Permission`, `canPerform` from `lib/panel/rbac.ts`. This is a Server Component — no `'use client'` directive.

### Success Criteria

#### Automated Verification

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification

- Visiting `/dashboard` when unauthenticated → redirects to `/login`
- Visiting `/dashboard` when logged in as an active hotel user → renders the dashboard (stub content)
- Visiting `/dashboard` with a deactivated user account → redirects to `/login?error=no_access`
- Sign-out button in the layout clears the session and redirects to `/login`
- Visiting `/unauthorized` as an authenticated hotel user shows the access-denied page

**Implementation Note**: Pause for manual verification after completing this phase.

---

## Phase 5: Wire Checkout Route with RBAC Guard

### Overview

Add the RBAC guard to the early-checkout route handler that was marked as `TODO(S2.1)` in S1.3. Viewers must receive 403; unauthenticated callers receive 401; owner/admin/staff proceed normally.

### Changes Required

#### 1. RBAC guard on checkout route handler

**File**: `app/api/panel/reservations/[id]/checkout/route.ts`

**Intent**: Enforce that only active hotel staff (owner, admin, or staff) can trigger early checkout. Viewer role is read-only and must not alter reservation state. Unauthenticated callers get 401.

**Contract**: At the top of the `POST` handler, before calling `processEarlyCheckout`:
1. Call `await getHotelUser()`.
2. If null → `return NextResponse.json({ error: 'unauthorized' }, { status: 401 })`.
3. If `!canPerform(hotelUser.role, 'qr_manage', 'full')` → `return NextResponse.json({ error: 'forbidden' }, { status: 403 })`.

The resource `qr_manage` is used here because early checkout deactivates QR codes — it's the closest resource in the §4.2 matrix that distinguishes owner/admin/staff (full) from viewer (none). Remove the `TODO(S2.1)` comment.

### Success Criteria

#### Automated Verification

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- IT-4 still passes (no regression): `npm run test -- lib/checkout/__tests__/it-4.test.ts`

#### Manual Verification

- `POST /api/panel/reservations/[id]/checkout` without a session cookie → 401
- `POST /api/panel/reservations/[id]/checkout` with a viewer-role session → 403
- `POST /api/panel/reservations/[id]/checkout` with a staff-role session → 200 (successful checkout)

**Implementation Note**: Pause for manual verification after completing this phase.

---

## Testing Strategy

### Unit Tests

- `lib/panel/__tests__/rbac.test.ts` — all 48 matrix cells; pure logic; no mocks.

### Integration Tests

No new integration tests in S2.1. IT-4 (early checkout) is an existing test that must continue to pass after Phase 5.

### Manual Testing Steps

1. Create a test hotel user in Supabase Dashboard (or via SQL) with `status='active'` and each of the four roles.
2. Verify login, layout guard, sign-out, and deactivated-user flows for each role as described in the per-phase manual verification steps.
3. Verify checkout route responses (401/403/200) using curl or the browser developer tools.

## References

- RBAC matrix source: `context/foundation/implementation_roadmap.md §4.2`
- Session plan: `context/foundation/session-plan.md § S2.1`
- Guest session middleware: `proxy.ts`
- Tenant context helper: `lib/supabase/tenant.ts`
- Early checkout library: `lib/checkout/early-checkout.ts` (IT-4: `lib/checkout/__tests__/it-4.test.ts`)
- Database types: `lib/supabase/database.types.ts` (hotel_role enum at line 663)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Login Page

#### Automated

- [x] 1.1 Type checking passes: `npm run typecheck` — f344f3d
- [x] 1.2 Linting passes: `npm run lint` — f344f3d

#### Manual

- [ ] 1.3 `/login` renders email+password form
- [ ] 1.4 Valid credentials → redirect to `/dashboard`
- [ ] 1.5 Invalid credentials → inline error, no redirect
- [ ] 1.6 Already-logged-in hotel user visiting `/login` → redirected to `/dashboard`
- [ ] 1.7 `/login?error=no_access` → error message rendered

### Phase 2: Hotel User Resolver + Sign-Out Route Handler

#### Automated

- [x] 2.1 Type checking passes: `npm run typecheck` — 19e5fa1

#### Manual

- [x] 2.2 `GET /api/auth/sign-out` clears auth cookie and redirects to `/login` — 19e5fa1
- [x] 2.3 `GET /api/auth/sign-out?error=no_access` redirects to `/login?error=no_access` — 19e5fa1
- [x] 2.4 `POST /api/auth/sign-out` clears session and redirects to `/login` — 19e5fa1

### Phase 3: RBAC Permission Matrix + Unit Tests

#### Automated

- [x] 3.1 Unit tests pass: `npm run test -- lib/panel/__tests__/rbac.test.ts` — 5075f91
- [x] 3.2 Type checking passes: `npm run typecheck` — 5075f91
- [x] 3.3 All 48 resource × role cells have at least one assertion — 5075f91

### Phase 4: (hotel) Layout Auth Guard + Unauthorized Page + RequirePermission Component

#### Automated

- [x] 4.1 Type checking passes: `npm run typecheck` — 7f89e07
- [x] 4.2 Linting passes: `npm run lint` — 7f89e07

#### Manual

- [x] 4.3 Visiting `/dashboard` unauthenticated → redirects to `/login` — 7f89e07
- [x] 4.4 Visiting `/dashboard` as active hotel user → renders dashboard stub — 7f89e07
- [x] 4.5 Visiting `/dashboard` as deactivated user → redirects to `/login?error=no_access` — 7f89e07
- [x] 4.6 Sign-out button clears session and redirects to `/login` — 7f89e07
- [x] 4.7 Visiting `/unauthorized` as authenticated user shows access-denied page — 7f89e07

### Phase 5: Wire Checkout Route with RBAC Guard

#### Automated

- [x] 5.1 Type checking passes: `npm run typecheck`
- [x] 5.2 Linting passes: `npm run lint`
- [x] 5.3 IT-4 still passes: `npm run test -- lib/checkout/__tests__/it-4.test.ts`

#### Manual

- [x] 5.4 `POST /api/panel/reservations/[id]/checkout` without session → 401
- [x] 5.5 `POST /api/panel/reservations/[id]/checkout` with viewer role → 403
- [x] 5.6 `POST /api/panel/reservations/[id]/checkout` with staff role → 200 (owner confirmed)
