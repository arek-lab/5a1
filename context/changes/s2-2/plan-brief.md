# Guided Wizard + Hotel Profile (Module 1) — Plan Brief

> Full plan: `context/changes/s2-2/plan.md`

## What & Why

Build the hotel-panel onboarding wizard shell and its first real step — the hotel profile form (name, address, phone, timezone, check-in/out, logo URL) — plus a readiness percentage and RBAC gating. This is HITL #4's mandatory "guided wizard + procent gotowości" mechanism: hotels must be able to self-configure the panel without platform hand-holding.

## Starting Point

S2.1 shipped hotel-panel login, the RBAC matrix (`canPerform`), and an auth-guarded but otherwise empty `(hotel)` layout/dashboard. The `properties` table already has every column this session needs (from S0.2); no schema migration required. No form library, no UI kit, no Server Actions, and no Supabase Storage bucket exist yet anywhere in the repo.

## Desired End State

An owner or admin visiting `/onboarding` sees a stepper with a progress bar: Step 1 "Hotel profile" is a working form; Steps 2+ ("Services", "Knowledge base") are visible but disabled, reserved for S2.3/S2.4. Saving Step 1 persists to `properties` and flips `setup_completed = true`. The dashboard shows a "Hotel is N% ready" banner (owner/admin only) linking into the wizard until setup is done. Staff/viewer can view the profile read-only but never see the banner or an interactive form.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Wizard scope this session | Shell + working profile step only; steps 2+ are placeholders | Matches the real dependency graph — S2.3/S2.4 slot into the shell later without rework | Plan |
| Readiness % basis | Weighted 4-criteria checklist (profile/services/knowledge/QR, 25% each), real queries against existing (currently empty) tables | Avoids future rework — later sessions just populate data that the checks already read | Plan |
| Logo field | Plain URL text input, no Supabase Storage bucket/upload | Hotels already host their logo elsewhere; storage/upload infra is unnecessary overhead | Plan |
| Mutation mechanism | Next.js Server Action (`'use server'`) | Simpler than a Route Handler for a plain form save; first precedent in the repo, deliberately chosen | Plan |
| Progress persistence | Written directly to the `properties` row per step, no draft/localStorage state | `properties` IS the source of truth; resume logic just re-reads it | Plan |
| Wizard RBAC | Owner/admin = interactive (existing `hotel_profile: full`), staff/viewer = read-only view | Reuses the S2.1 matrix exactly, no new resource needed | Plan |
| Entry routing | Dashboard banner (owner/admin only), no hard redirect | Avoids trapping staff/viewer or future dashboard content behind onboarding | Plan |
| Form/UI approach | Plain Tailwind + controlled inputs, no new dependency; all text via next-intl (no hardcoding) | Matches the only existing form (`login-form.tsx`); repo has no UI kit yet | Plan |

## Scope

**In scope:** onboarding wizard shell (stepper, progress bar), hotel profile form (7 fields incl. logo URL), save via Server Action, weighted readiness %, dashboard banner, RBAC gating via existing `hotel_profile` resource, PL/EN i18n strings.

**Out of scope:** Supabase Storage/file upload, `ai_bot_name`/language-toggle fields, Steps 2+ content (services, knowledge base — S2.3/S2.4), any RBAC matrix change, DPA-gating logic (HITL #11), hard redirect into onboarding.

## Architecture / Approach

Server Component page (`/onboarding`) resolves the hotel user + property, computes readiness/resume state via pure functions in `lib/panel/`, and renders a client-side stepper shell driven by a data-only step-config array — so future sessions extend it by appending a step, not modifying the shell. The profile form and its Server Action are the first of their kind in the repo (plain controlled inputs; `'use server'` action), deliberately set as the pattern for panel forms going forward.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Types, i18n, readiness/resume logic | Pure functions + step config + message keys, unit-tested | Readiness weighting (25%/criterion) is a judgment call — easy to adjust later since it's isolated in one function |
| 2. Profile form + save Server Action | Working Step 1, first Server Action in the repo | First-of-kind pattern — no existing code to diverge from, low risk but sets precedent |
| 3. Wizard shell UI | Stepper, progress bar, placeholder steps | Visual/UX polish is hand-rolled Tailwind (no component library) |
| 4. RBAC gating + dashboard banner | `RequirePermission`'s first real usage, banner, confirmed no redirect trap | Must verify staff/viewer never get stuck or see write-only UI |

**Prerequisites:** S2.1 merged (auth guard, RBAC, `getHotelUser()` all in place — confirmed done).
**Estimated effort:** ~1 session across 4 phases, consistent with S2.1's size.

## Open Risks & Assumptions

- Logo-as-URL is a deliberate deviation from the literal roadmap wording ("logo → Supabase Storage") — confirmed via HITL-style decision in this planning session; flagged here for visibility if reviewed against `session-plan.md` later.
- Readiness percentage will show a low ceiling in practice until S2.3/S2.4/S1.1 land (services/knowledge/QR all start at 0 rows) — this is expected, not a bug.
- `timezone` is constrained to a fixed `<select>` list rather than free text to avoid invalid IANA zone strings; the exact list of zones offered isn't specified upstream and defaults to `Europe/Warsaw` plus a small common set — implementer's judgment call within Phase 2.

## Success Criteria (Summary)

- Wizard runs end-to-end from Step 1 to the first placeholder step for an owner/admin.
- `properties.setup_completed` becomes `true` after a valid profile save; logo URL persists.
- Staff/viewer get a correct read-only experience with no dashboard banner and no permission-denied dead end.
