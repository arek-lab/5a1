# S2.1 — Hotel Panel Auth + RBAC Middleware — Plan Brief

> Full plan: `context/changes/s2-1/plan.md`

## What & Why

Wire email+password login for hotel staff (`hotel_users`) and enforce the §4.2 role-based permission matrix (Owner / Admin / Staff / Viewer) across the hotel panel. Without this session, every hotel panel route is unguarded and the early-checkout endpoint remains callable by anyone — the session-plan DoD requires unit tests covering the full matrix, viewer blocked from mutations, and staff blocked from billing.

## Starting Point

S0.3 delivered the Custom Access Token Hook and `proxy.ts` middleware — but those handle guest sessions only. Hotel users sign in with email+password to a separate Supabase auth identity; their `hotel_users` row (with `property_id` and `role`) is not injected into the JWT. The `(hotel)` layout and dashboard page are stubs with no auth check. The checkout route has a `TODO(S2.1)` comment and is currently unauthenticated.

## Desired End State

A hotel staff member visits `/login`, enters credentials, and lands on `/dashboard`. Every panel page redirects unauthenticated visitors to `/login`; deactivated accounts are automatically signed out and told "access revoked". `canPerform('staff', 'billing', 'read')` returns false; `canPerform('viewer', 'orders_status', 'full')` returns false — and 48 Vitest tests prove it. The checkout route returns 401/403 for callers without the right role.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Hotel user identity resolution | `getHotelUser()` — service_role DB lookup, `React.cache()` wrapped | Hotel users have no custom JWT claims (hook is guest-only); service_role bypasses RLS on `hotel_users`; `React.cache()` deduplicates across layout + child components in one request | Plan |
| Hook extension | No — hook stays guest-only | Mixing two auth models in one JWT increases audit risk and forces re-login on every role change; application-layer lookup is cheaper and more flexible | Plan |
| Login form mechanism | Client Component + `createBrowserClient().auth.signInWithPassword()` | Standard Supabase SSR pattern; cookie set automatically by the Supabase client; no server-action boilerplate needed | Plan |
| Login page route group | `(hotel-auth)` — separate from `(hotel)` | Login page must not be covered by the `(hotel)` layout auth guard; a sibling route group inherits only `[locale]/layout.tsx` | Plan |
| Unauthenticated access | `redirect('/login')` for pages; 401 JSON for API routes | Standard convention; consistent with how the guest-facing error handling works | Plan |
| Unauthorized role | Redirect to `/unauthorized` page (pages); 403 JSON (API routes) | Clear UX — user understands why they were redirected; route handler contract is explicit | Plan |
| Deactivated user auto-signout | `redirect('/api/auth/sign-out?error=no_access')` from layout | Server Components cannot write cookies; a Route Handler can call `supabase.auth.signOut()` and set the redirect | Plan |
| RBAC unit test coverage | All 48 matrix cells (12 resources × 4 roles) | DoD says "unit testy macierzy"; exhaustive coverage prevents silent matrix drift | Plan |
| Checkout route resource | `qr_manage` with `'full'` level | Early checkout deactivates QR codes; this resource cleanly maps to owner/admin/staff=full, viewer=none | Plan |
| Sign-out button | HTML form `POST /api/auth/sign-out` | Works without JavaScript; Route Handler handles cookie mutation; same handler reused for auto-signout | Plan |

## Scope

**In scope:**
- `(hotel-auth)` route group with `/login` page and login form
- `lib/panel/auth.ts` — `HotelUser` type + `getHotelUser()` resolver
- `app/api/auth/sign-out/route.ts` — GET + POST sign-out handler
- `lib/panel/rbac.ts` — `HotelRole`, `Resource`, `Permission`, `PERMISSION_MATRIX`, `canPerform()`
- `lib/panel/__tests__/rbac.test.ts` — 48-cell Vitest suite
- `app/[locale]/(hotel)/layout.tsx` — auth guard + sign-out button
- `app/[locale]/(hotel)/unauthorized/page.tsx` — role-restriction page
- `components/panel/require-permission.tsx` — server component permission gate
- `app/api/panel/reservations/[id]/checkout/route.ts` — RBAC guard added

**Out of scope:**
- Any panel UI module (services, QR, orders, users, billing) — S2.2–S2.7
- Billing route or users-management route (no route exists yet; matrix tested via unit tests only)
- Custom Access Token Hook extension for hotel users
- Password reset, MFA, invite-token acceptance — deferred
- `hotel_users.last_login_at` update — S2.7

## Architecture / Approach

```
Browser (hotel staff)
  │
  ▼  GET /login  →  (hotel-auth)/login/page.tsx [Server Component]
      ├── getHotelUser() → null → render LoginForm
      └── getHotelUser() → non-null → redirect /dashboard

  LoginForm [Client Component]
      supabase.auth.signInWithPassword()
      success → router.push('/dashboard')

  GET /dashboard  →  (hotel)/layout.tsx [Server Component, auth guard]
      getHotelUser() → null → redirect('/api/auth/sign-out?error=no_access')
      getHotelUser() → HotelUser → render children + sign-out form

  POST /api/panel/reservations/[id]/checkout  [Route Handler]
      getHotelUser() → null → 401
      !canPerform(role, 'qr_manage', 'full') → 403
      processEarlyCheckout(id) → 200

  lib/panel/rbac.ts
      PERMISSION_MATRIX[resource][role] → Permission
      canPerform(role, resource, level) → boolean

  components/panel/require-permission.tsx  [Server Component]
      !canPerform(role, resource, level) → redirect('/unauthorized')
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Login page | `/login` with email+password form in `(hotel-auth)` group | Cookie set by Supabase browser client — verify HttpOnly cookies work correctly in dev |
| 2. User resolver + sign-out | `getHotelUser()` + `POST/GET /api/auth/sign-out` | service_role client must be used for hotel_users lookup (RLS blocks authenticated client) |
| 3. RBAC matrix + tests | `canPerform()` + 48-cell Vitest suite | Matrix must exactly match §4.2 — any typo in permissions goes undetected until a later session |
| 4. Layout guard + components | `(hotel)/layout.tsx` auth guard, `/unauthorized` page, `RequirePermission` | Deactivated-user auto-signout flow has two hops (layout → sign-out route → login) — verify it doesn't loop |
| 5. Checkout route guard | 401/403 on `POST /api/panel/reservations/[id]/checkout` | IT-4 must still pass after this change |

**Prerequisites:** S0.3 complete ✅ (Supabase Auth working, `createServerClient` and `createServiceRoleClient` available). Real Supabase project accessible with an active `hotel_users` row for manual testing.

**Estimated effort:** ~1 session across 5 phases. Phases 3 and 1–2 can be developed in parallel; Phase 4 blocks on Phases 2 and 3; Phase 5 blocks on Phases 2 and 3.

## Open Risks & Assumptions

- `React.cache()` deduplication is assumed to work in both Server Components and App Router Route Handlers within the same request — verify with a log during Phase 2 if uncertain.
- The `(hotel)` layout guard always redirects to the sign-out handler even when there's no Supabase session (unauthenticated visitor). `supabase.auth.signOut()` on an already-signed-out client is a no-op in Supabase — assumed safe.
- `hotel_users.auth_user_id` is nullable in the schema (migration 002). Invited-but-not-yet-accepted users have no `auth_user_id` and `status='invited'` — `getHotelUser()` correctly returns null for them (no match on `eq('auth_user_id', user.id)`).

## Success Criteria (Summary)

- `npm run test -- lib/panel/__tests__/rbac.test.ts` exits 0 with all 48 assertions green
- A hotel staff member can log in, see the dashboard, and sign out
- `POST /api/panel/reservations/[id]/checkout` with viewer role returns 403; with staff role returns 200
