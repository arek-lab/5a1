# S2.2 — Guided Wizard + Hotel Profile (Module 1) Implementation Plan

## Overview

Build the onboarding wizard shell for the hotel panel: a step framework with a progress bar, a fully working Hotel Profile step (name, address, phone, timezone, check-in/out, logo URL), a weighted readiness percentage, and RBAC-gated access. The wizard shell is designed so S2.3 (services) and S2.4 (knowledge base) — both blocked on this session per the dependency graph — can register their own steps later without reworking the framework.

## Current State Analysis

- `properties` table (migration `20260626000001_initial_schema.sql:29-43`) already has every column this session needs: `name`, `address`, `phone_reception`, `timezone` (default `'Europe/Warsaw'`), `check_in_time`, `check_out_time` (Postgres `TIME`), `logo_url`, `setup_completed`. No new migration is needed for the profile fields themselves.
- RLS already permits the update this session needs: `staff_update_own_property` (migration `20260626000002_rls_policies.sql:202-215`) lets any active `hotel_users` row (via `auth.uid()`) update its own `properties` row — the regular `createServerClient()` (authenticated, RLS-scoped) client can perform the save; no `service_role` bypass is needed for the write itself.
- `getHotelUser()` (`lib/panel/auth.ts:14`) is the established identity resolver — returns `{ id, propertyId, role, fullName, email }` or `null`, already `React.cache()`-wrapped.
- `canPerform(role, 'hotel_profile', level)` (`lib/panel/rbac.ts:22`) already encodes the exact matrix this session needs: owner/admin = `full`, staff/viewer = `read`. No new `Resource` or matrix change required.
- `RequirePermission` (`components/panel/require-permission.tsx`) exists but has no consumers yet — this session is its first real usage.
- `services`, `knowledge_chunks`, `qr_codes` tables already exist (from S0.2) and are currently empty — real (not stubbed) COUNT queries against them can back the non-profile readiness criteria; they'll simply return 0 until S2.3/S2.4/S1.1 populate rows.
- No Supabase Storage bucket exists anywhere in the repo, and per HITL decision this session does not need one: hotels already host their logo elsewhere, so the wizard stores a **logo URL string**, not an uploaded file.
- No form library (no react-hook-form/zod) and no UI component library (no shadcn/ui) exist in the repo. The only prior form (`app/[locale]/(hotel-auth)/login/login-form.tsx`) uses plain controlled `<input>` + `useState` + manual checks — this session follows the same pattern.
- No Next.js Server Actions exist anywhere in the repo yet (all prior mutations are Route Handlers). This session introduces the first one, per HITL decision, for the profile save.
- `messages/en.json` / `messages/pl.json` currently contain only `{ "common": { "loading": "..." } }` — this session adds the first substantial i18n namespace (`onboarding`).

## Desired End State

- Visiting `/onboarding` as an owner/admin renders a stepper: Step 1 "Hotel profile" (interactive), Steps 2+ "Services"/"Knowledge base" (visibly disabled/"coming soon", non-interactive).
- Submitting the Step 1 form saves all fields to `properties` via a Server Action, using the authenticated (RLS-scoped) client, and sets `setup_completed = true`.
- Re-entering `/onboarding` after a partial save resumes on Step 1 if required fields are still missing; if Step 1's required fields are all present, it lands on the first placeholder step.
- A readiness percentage (0–100%, in 25% increments across profile/services/knowledge/QR) is visible on the wizard and on the dashboard for owner/admin.
- Staff/viewer visiting `/onboarding` see a read-only rendering of the current profile values (no inputs, no save action) rather than a permission-denied redirect — `hotel_profile` is `read` for those roles, not `none`.
- Dashboard shows a "Complete setup — Hotel is N% ready" banner (owner/admin only) linking to `/onboarding` when `setup_completed = false`; no forced/hard redirect exists anywhere, so staff/viewer dashboard access is unaffected.
- All wizard-visible strings come from `messages/{en,pl}.json` under an `onboarding` namespace — nothing hardcoded.
- `npm run test -- lib/panel/__tests__/onboarding.test.ts` and `lib/panel/__tests__/readiness.test.ts` pass.

### Key Discoveries

- `staff_update_own_property` RLS already scopes UPDATE to the caller's own property via `auth.uid()` → `hotel_users` join (`supabase/migrations/20260626000002_rls_policies.sql:202-215`); the Server Action can use `createServerClient()` directly instead of `service_role`.
- `services`/`knowledge_chunks`/`qr_codes` tables already exist and are queryable now — readiness criteria for those modules are real COUNT queries from day one, not TODO stubs that need rework later.
- `getHotelUser()` returns `propertyId` — every profile/readiness query in this session scopes by that value.

## What We're NOT Doing

- No Supabase Storage bucket, upload endpoint, or file-picker UI — logo is a URL text field per HITL decision (overrides the literal "logo → Supabase Storage" wording in `session-plan.md`/`implementation_roadmap.md`; the platform-hosted-logo assumption made storage unnecessary).
- No `ai_bot_name` or `default_locale`/"languages served" fields — not named in the S2.2 scope line (`session-plan.md:81`); deferred to whichever session actually needs the AI bot disclosure (HITL #8) or language toggle.
- No Steps 2+ (services activation, knowledge base seeding) content — those are S2.3/S2.4. This session only renders their placeholders in the stepper.
- No hard redirect from the `(hotel)` layout into `/onboarding` — a dashboard banner is used instead, to avoid trapping staff/viewer or future dashboard content behind onboarding.
- No new `Resource` or RBAC matrix changes — `hotel_profile` already covers this feature exactly.
- No react-hook-form/zod, no shadcn/ui or other component library — plain Tailwind + controlled inputs, consistent with `login-form.tsx`.
- No changes to `dpa_signed_at` or any DPA-gating logic (HITL #11 territory — separate from this session).

## Implementation Approach

Server Actions (not Route Handlers) drive all mutations in this session, per HITL decision — this is the first precedent for Server Actions in the repo. Readiness and resume logic are pure functions in `lib/panel/`, unit-testable without a DB. The wizard shell is a thin client component that takes a step-config array as data, so S2.3/S2.4 extend it by appending to that array rather than modifying the shell.

```
Phase 1: Types, i18n scaffolding, readiness/resume pure logic (+ unit tests)
Phase 2: Hotel profile form + save Server Action
Phase 3: Wizard shell UI (stepper, progress bar, placeholders) wired to Phase 1+2
Phase 4: RBAC gating + dashboard readiness banner + entry routing
```

---

## Phase 1: Types, i18n, Readiness & Resume Logic

### Overview

Define the shared step-config shape, the readiness-checklist calculation, and the step-resume calculation as pure functions — no UI, no Server Actions yet. This is the foundation Phases 2–4 build on, and the only phase with unit tests (the rest is UI/wiring, verified manually per the S2.1 precedent).

### Changes Required

#### 1. Onboarding step types

**File**: `lib/panel/onboarding-steps.ts`

**Intent**: Define the wizard's step configuration as data, so future sessions (S2.3, S2.4) add a step by appending an entry rather than touching wizard shell code.

**Contract**:
```ts
export type OnboardingStepKey = 'profile' | 'services' | 'knowledge'

export type OnboardingStep = {
  key: OnboardingStepKey
  labelKey: string       // next-intl key under 'onboarding.steps.<key>'
  interactive: boolean   // false = "coming soon" placeholder
}

export const ONBOARDING_STEPS: OnboardingStep[]
// [{ key: 'profile', labelKey: 'steps.profile', interactive: true },
//  { key: 'services', labelKey: 'steps.services', interactive: false },
//  { key: 'knowledge', labelKey: 'steps.knowledge', interactive: false }]
```

---

#### 2. Readiness calculation

**File**: `lib/panel/readiness.ts`

**Intent**: Compute the weighted readiness percentage from real signals across four onboarding categories (profile, services, knowledge, QR), each worth 25%. Only `profile` is measurable purely from the `properties` row; the other three require counts from their respective tables, so this module exposes both a pure calculator and a data-fetching wrapper.

**Contract**:
```ts
export type ReadinessCounts = {
  activeServicesCount: number
  knowledgeChunksCount: number
  activeReceptionQrCount: number
}

export function isProfileComplete(property: {
  name: string
  address: string | null
  phone_reception: string | null
  check_in_time: string | null
  check_out_time: string | null
}): boolean
// true when name, address, phone_reception, check_in_time, check_out_time are all non-null/non-empty.
// timezone and logo_url are NOT required (timezone has a DB default; logo is optional/SHOULD).

export function computeReadiness(
  profileComplete: boolean,
  counts: ReadinessCounts
): { percentage: number; breakdown: Record<'profile' | 'services' | 'knowledge' | 'qr', boolean> }
// Each of the 4 criteria contributes 25 points: profileComplete; activeServicesCount >= 3;
// knowledgeChunksCount > 0; activeReceptionQrCount > 0.

export async function getReadiness(propertyId: string): Promise<ReturnType<typeof computeReadiness>>
// Fetches the property row + 3 counts (services where is_active=true, knowledge_chunks, qr_codes
// where type='reception' and is_active=true) scoped to propertyId via createServerClient(),
// then calls computeReadiness. Used by both the wizard and the dashboard banner.
```

---

#### 3. Resume-step logic

**File**: `lib/panel/onboarding-resume.ts`

**Intent**: Determine which step the wizard should open on when a user (re-)enters `/onboarding`, based on current completion state — not a stored "current step" field.

**Contract**:
```ts
export function resumeStepKey(
  profileComplete: boolean
): OnboardingStepKey
// false -> 'profile'; true -> 'services' (first placeholder step) — since only 'profile' is
// interactive today, this reduces to a 2-way branch; the shape is a switch over ONBOARDING_STEPS
// so adding S2.3's real 'services' completion check later is a one-line change here.
```

---

#### 4. i18n messages

**Files**: `messages/en.json`, `messages/pl.json`

**Intent**: Add the `onboarding` namespace covering wizard chrome, step labels, profile field labels/placeholders, validation messages, and the dashboard banner — so no string in Phases 2–4 is hardcoded.

**Contract**: Add top-level `"onboarding"` key with nested `steps.{profile,services,knowledge}`, `profile.fields.{name,address,phone,timezone,checkIn,checkOut,logoUrl}`, `profile.actions.{save,saving}`, `profile.errors.{nameRequired,invalidUrl}`, `readiness.label` (e.g. "Hotel is {percent}% ready"), `banner.cta`. Both locale files get the same key structure with PL/EN text.

#### 5. Unit tests

**File**: `lib/panel/__tests__/readiness.test.ts`

**Intent**: Cover `isProfileComplete` (all-filled, one-missing per field) and `computeReadiness` (0/25/50/75/100 combinations).

**File**: `lib/panel/__tests__/onboarding-resume.test.ts`

**Intent**: Cover both branches of `resumeStepKey`.

### Success Criteria

#### Automated Verification

- Unit tests pass: `npm run test -- lib/panel/__tests__/readiness.test.ts lib/panel/__tests__/onboarding-resume.test.ts`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification

None — pure logic and static data, no UI yet.

**Implementation Note**: Proceed to Phase 2 once tests are green.

---

## Phase 2: Hotel Profile Form + Save Server Action

### Overview

Build the interactive Step 1 form and the Server Action that persists it. This is the first Server Action in the repo — establish the pattern cleanly since it has no precedent to deviate from.

### Changes Required

#### 1. Save Server Action

**File**: `app/[locale]/(hotel)/onboarding/actions.ts`

**Intent**: Validate and persist the profile form fields to the caller's own `properties` row, then mark `setup_completed = true`. Enforces RBAC server-side (never trust the client-side `RequirePermission` gate alone).

**Contract**:
```ts
'use server'
export async function saveHotelProfile(formData: FormData): Promise<{ error?: string }>
```
Flow: `getHotelUser()` → if `null` or `!canPerform(role, 'hotel_profile', 'write')`, return `{ error: 'forbidden' }` (form displays this; no throw — this is a same-page re-render, not a redirect). Extract and trim `name`, `address`, `phone_reception`, `timezone`, `check_in_time`, `check_out_time`, `logo_url` from `formData`. Validate: `name` non-empty (required in the `properties` schema); `logo_url` — if non-empty, must parse as a valid absolute URL (`new URL(...)` in a try/catch), otherwise return `{ error: 'invalidUrl' }`. Update via `createServerClient().from('properties').update({...}).eq('id', hotelUser.propertyId)`, then set `setup_completed: true` in the same update payload. Call `revalidatePath('/onboarding')` and `revalidatePath('/dashboard')` after a successful write.

---

#### 2. Profile step form (client component)

**File**: `app/[locale]/(hotel)/onboarding/profile-step-form.tsx`

**Intent**: Controlled form for the 7 profile fields, pre-filled from the current `properties` row, calling `saveHotelProfile` on submit.

**Contract**: `'use client'`. Props: `initialValues: Pick<PropertiesRow, 'name'|'address'|'phone_reception'|'timezone'|'check_in_time'|'check_out_time'|'logo_url'>`. `useState` per field (matches `login-form.tsx` pattern) seeded from `initialValues`. On submit: build `FormData`, call `saveHotelProfile`, show inline error from the returned `{ error }` (translated via `onboarding.profile.errors.<key>`), or a success indicator (no toast library — inline text, consistent with the rest of the panel). `timezone` renders as a `<select>` with a short fixed list of common zones (`Europe/Warsaw` first/default) rather than a free-text field, to avoid invalid IANA strings reaching the DB. `check_in_time`/`check_out_time` use `<input type="time">`.

---

#### 3. Read-only profile view (staff/viewer)

**File**: `app/[locale]/(hotel)/onboarding/profile-readonly.tsx`

**Intent**: Render the same 7 fields as plain text (no inputs, no form) for staff/viewer, who have `read` not `write` on `hotel_profile`.

**Contract**: Server Component. Props: the same `initialValues` shape. Renders a definition list; empty fields show an em-dash placeholder rather than blank space.

### Success Criteria

#### Automated Verification

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification

- Owner/admin: submitting the form with all fields filled saves to `properties` and `setup_completed` becomes `true` (verify via Supabase dashboard or `select` query)
- Owner/admin: submitting with an invalid `logo_url` (e.g. `"not a url"`) shows an inline error, no write occurs
- Owner/admin: submitting with empty `name` shows an inline error
- Staff/viewer: profile renders read-only, no submit button present
- Re-visiting the form after a save shows the previously saved values pre-filled

**Implementation Note**: Pause for manual verification after completing this phase.

---

## Phase 3: Wizard Shell UI

### Overview

Assemble the stepper/progress-bar shell around the Phase 2 form, using Phase 1's step config, readiness, and resume logic. Placeholder steps render as visibly disabled.

### Changes Required

#### 1. Onboarding page (Server Component)

**File**: `app/[locale]/(hotel)/onboarding/page.tsx`

**Intent**: Resolve the current hotel user and property, compute readiness + resume step, and render the wizard shell with either the interactive form (Phase 2, owner/admin) or the read-only view (staff/viewer) for the active step.

**Contract**: Async Server Component. `getHotelUser()` → property fetched via `createServerClient().from('properties').select(...).eq('id', hotelUser.propertyId).single()`. Compute `isProfileComplete(property)`, `resumeStepKey(...)`, and `getReadiness(hotelUser.propertyId)`. Reads `searchParams.step` to allow manual navigation to a step (falls back to the resumed step key if absent/invalid). Renders `<OnboardingWizardShell>` (below) passing `ONBOARDING_STEPS`, the active step key, the readiness result, and the step content (profile form or read-only view based on `canPerform(role, 'hotel_profile', 'write')`).

---

#### 2. Wizard shell (client component — stepper + progress bar)

**File**: `components/panel/onboarding-wizard-shell.tsx`

**Intent**: Render the step list as a horizontal stepper with a progress bar (percentage from readiness), highlight the active step, and render non-interactive steps as visibly disabled with a "coming soon" label — no navigation is possible into them yet.

**Contract**: `'use client'`. Props: `{ steps: OnboardingStep[], activeStepKey: OnboardingStepKey, readinessPercentage: number, children: React.ReactNode }`. Clicking an `interactive: true` step's tab updates the `?step=` search param via `useRouter().push`; clicking a placeholder step is a no-op (disabled `<button>`). Progress bar is a plain Tailwind `div` with `width: {percentage}%` — no chart library needed for a single bar.

### Success Criteria

#### Automated Verification

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification

- Visiting `/onboarding` as owner/admin with an empty profile lands on the "Hotel profile" step
- Progress bar reflects 0% before any save, 25% after a complete profile save
- Placeholder steps ("Services", "Knowledge base") are visibly disabled and unclickable
- After completing the profile, re-visiting `/onboarding` lands on the first placeholder step (per `resumeStepKey`)
- All visible text matches `messages/en.json`/`pl.json` (switch locale, confirm both render correctly)

**Implementation Note**: Pause for manual verification after completing this phase.

---

## Phase 4: RBAC Gating, Dashboard Banner & Entry Routing

### Overview

Wire `RequirePermission` into the onboarding page's write path, add the dashboard readiness banner for owner/admin, and confirm there is no hard redirect trapping other roles.

### Changes Required

#### 1. RBAC gate on the onboarding page

**File**: `app/[locale]/(hotel)/onboarding/page.tsx` (extends Phase 3's version)

**Intent**: The page itself already branches on `canPerform(role, 'hotel_profile', 'write')` to choose form vs. read-only view (Phase 2/3) — this step adds the explicit `RequirePermission` wrap for the minimum bar (`read`) so an unexpected role state (e.g., a resource returning `none`) never silently renders nothing. Since `hotel_profile` is `read` for all four roles, this is a defensive floor, not a new access restriction.

**Contract**: Wrap the page body in `<RequirePermission role={hotelUser.role} resource="hotel_profile" level="read">`. No other page in the panel currently uses `RequirePermission` — this is its first real consumer, validating the component end-to-end.

---

#### 2. Dashboard readiness banner

**File**: `app/[locale]/(hotel)/dashboard/page.tsx`

**Intent**: Surface the "Complete setup" call-to-action on the page hotel staff land on after login, without forcing navigation. Only owner/admin see it (they're the only roles that can act on it).

**Contract**: Server Component (already exists as a stub — extend it). `getHotelUser()` → if `canPerform(role, 'hotel_profile', 'write')` and `!property.setup_completed`, render a banner: `onboarding.banner.cta` text + readiness percentage (via `getReadiness`) + a link to `/onboarding`. Staff/viewer or already-`setup_completed` properties see no banner.

### Success Criteria

#### Automated Verification

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification

- Owner/admin on `/dashboard` with `setup_completed=false` sees the readiness banner with a working link to `/onboarding`
- Owner/admin on `/dashboard` with `setup_completed=true` sees no banner
- Staff/viewer on `/dashboard` never sees the banner, regardless of `setup_completed`
- Staff/viewer can still reach `/dashboard` normally (no redirect loop, no blocked access)
- Visiting `/onboarding` directly as staff/viewer shows the read-only profile, not a redirect to `/unauthorized`

**Implementation Note**: Pause for manual verification after completing this phase. This is the final phase — after manual verification, S2.2's DoD (wizard completes step 1 to end; `setup_completed=true`; logo persisted) is met.

---

## Testing Strategy

### Unit Tests

- `lib/panel/__tests__/readiness.test.ts` — `isProfileComplete` (each required field missing individually + all present), `computeReadiness` (all 16 boolean combinations of the 4 criteria → correct percentage).
- `lib/panel/__tests__/onboarding-resume.test.ts` — both branches of `resumeStepKey`.

### Integration Tests

None required — no new RLS policies or tenant-isolation surface introduced (reuses existing `staff_update_own_property`/`staff_read_own_property`).

### Manual Testing Steps

1. Log in as an owner-role hotel user with an empty `properties` row (fresh test property).
2. Visit `/dashboard` — confirm the readiness banner appears at 0%, click through to `/onboarding`.
3. Fill and submit the profile form; confirm inline validation for empty `name` and invalid `logo_url` before submitting valid data.
4. Confirm `setup_completed` flips to `true` and the wizard advances to the "Services" placeholder step.
5. Log in as a staff-role user on the same property; visit `/onboarding`; confirm read-only rendering and no dashboard banner.
6. Switch locale to PL; re-check all wizard/profile/banner text renders from `messages/pl.json`.

## Performance Considerations

None beyond existing patterns — single-row property fetch + 3 small COUNT queries per page load, all indexed on `property_id` per the roadmap's mandatory-index rule (T2).

## Migration Notes

No schema migration required — all columns already exist (see Current State Analysis).

## References

- Session scope: `context/foundation/session-plan.md` § S2.2
- Field/priority table: `context/foundation/implementation_roadmap.md` §4.1 Moduł 1 (lines 260-267)
- Readiness/wizard mandate (HITL #4): `context/archive/decisions_log.md:218`, `implementation_roadmap.md:351`
- `properties` schema: `supabase/migrations/20260626000001_initial_schema.sql:29-43`
- RLS update policy: `supabase/migrations/20260626000002_rls_policies.sql:202-215`
- RBAC matrix: `lib/panel/rbac.ts`
- Hotel user resolver: `lib/panel/auth.ts`
- Prior form pattern: `app/[locale]/(hotel-auth)/login/login-form.tsx`
- Prior session plan (pattern to imitate): `context/changes/s2-1/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Types, i18n, Readiness & Resume Logic

#### Automated

- [x] 1.1 Unit tests pass: `npm run test -- lib/panel/__tests__/readiness.test.ts lib/panel/__tests__/onboarding-resume.test.ts` — 2de6021
- [x] 1.2 Type checking passes: `npm run typecheck` — 2de6021
- [x] 1.3 Linting passes: `npm run lint` — 2de6021

### Phase 2: Hotel Profile Form + Save Server Action

#### Automated

- [x] 2.1 Type checking passes: `npm run typecheck` — b051ca3
- [x] 2.2 Linting passes: `npm run lint` — b051ca3

#### Manual

- [x] 2.3 Owner/admin: full valid submit saves `properties` and sets `setup_completed=true` — b051ca3
- [x] 2.4 Owner/admin: invalid `logo_url` shows inline error, no write — b051ca3
- [x] 2.5 Owner/admin: empty `name` shows inline error — b051ca3
- [x] 2.6 Staff/viewer: profile renders read-only, no submit button — b051ca3
- [x] 2.7 Re-visiting form after save shows pre-filled values — b051ca3

### Phase 3: Wizard Shell UI

#### Automated

- [x] 3.1 Type checking passes: `npm run typecheck` — d9bfd80
- [x] 3.2 Linting passes: `npm run lint` — d9bfd80

#### Manual

- [x] 3.3 Empty profile → wizard lands on "Hotel profile" step — d9bfd80
- [x] 3.4 Progress bar shows 0% before save, 25% after complete profile save — d9bfd80
- [x] 3.5 Placeholder steps are visibly disabled and unclickable — d9bfd80
- [x] 3.6 After profile completion, re-visit lands on first placeholder step — d9bfd80
- [x] 3.7 All text renders from PL/EN message files — d9bfd80

### Phase 4: RBAC Gating, Dashboard Banner & Entry Routing

#### Automated

- [x] 4.1 Type checking passes: `npm run typecheck` — 233921f
- [x] 4.2 Linting passes: `npm run lint` — 233921f

#### Manual

- [x] 4.3 Owner/admin with `setup_completed=false` sees banner linking to `/onboarding` — 233921f
- [x] 4.4 Owner/admin with `setup_completed=true` sees no banner — 233921f
- [x] 4.5 Staff/viewer never sees the banner — 233921f
- [x] 4.6 Staff/viewer retains normal `/dashboard` access — 233921f
- [x] 4.7 Staff/viewer visiting `/onboarding` directly sees read-only view, not `/unauthorized` — 233921f
