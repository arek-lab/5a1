# S0.1 — Project Bootstrap + CI/CD — Plan Brief

> Full plan: `context/changes/s0-1/plan.md`

## What & Why

Bootstrap the Hotel Guest App repo from an empty state into a buildable, deployable skeleton. S0.1 is the prerequisite for every other session in the ~23-session plan — no other work can begin until `npm run build` passes and Railway preview deployments are live.

## Starting Point

The repo contains only `.claude/` and `context/` — no application code, no `package.json`, no CI. This is a true greenfield first commit.

## Desired End State

A Next.js 15 application with TypeScript, Tailwind, and next-intl (PL/EN) scaffolded into two distinct surface areas (guest PWA and hotel panel), with ESLint + Prettier configured, Node 24 pinned, a comprehensive `.env.example` covering all future services, and a CI/CD pipeline where every PR triggers GitHub Actions (lint + type-check) and a Railway preview deployment.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| next-intl locale routing | No URL prefix (`localePrefix: 'never'`) | Preference stored in localStorage to avoid collision with the `__Host-session` cookie (S0.3); clean guest URLs. | Plan |
| Route organization | Route groups `(guest)` and `(hotel)` | Separate layout trees and middleware targeting from day one — avoids a routing refactor when S0.3 adds per-surface auth. | Plan |
| `.env.example` scope | Full project scope (all sessions) | One-time documentation artifact that prevents "what var is missing?" friction in every subsequent session. | Plan |
| Railway deploy config | `railway.toml` + Nixpacks (no Dockerfile) | Nixpacks auto-detects Next.js 15; minimal config surface to maintain for MVP. | Plan |
| Default branch | Rename `master` → `main` | Aligns with project convention (CLAUDE.md) before any CI is wired — zero-cost now, painful later. | Plan |
| CI pipeline scope | Lint + type-check only (no Vitest) | No tests exist yet; CI is green on day 1 without test infrastructure. Vitest added when first tests land. | Plan |
| SDK install boundary | Defer Supabase, Sentry, PostHog, Upstash to S0.2/S0.3 | Keeps `npm run build` clean without dummy env vars for services not yet configured. | Plan |
| Node version | 24 | Matches developer's local environment; aligns with Next.js 15's recommended runtime. | Plan |

## Scope

**In scope:**
- Next.js 15 App Router + TypeScript strict + Tailwind + next-intl (PL/EN skeleton)
- ESLint (Next.js flat config) + Prettier
- Route groups: `app/(guest)/` and `app/(hotel)/`
- Health check route (`/api/health`)
- `.env.example` with all anticipated project vars
- Node 24 pin (`.node-version` + `engines`)
- Branch rename `master` → `main`
- GitHub Actions workflow (lint + type-check on PR)
- `railway.toml` + Railway preview deployments

**Out of scope:**
- Any real UI, data fetching, or business logic
- Supabase, Sentry, PostHog, Upstash, OpenAI SDK installation
- Vitest or any test runner
- Railway production promote (only preview environments)

## Architecture / Approach

Single Next.js 15 app serves both surfaces. Route groups create separate layout trees with no URL segments — `(guest)/page.tsx` maps to `/`, `(hotel)/dashboard/page.tsx` maps to `/dashboard`. next-intl middleware detects locale from `Accept-Language` with no URL prefix; the language switcher (S3.1) will write to localStorage and optionally the `NEXT_LOCALE` cookie for SSR consistency. Railway Nixpacks auto-builds and serves via `npm start` on a persistent Node server — required for the SSE connections added in S1.2, S2.6, S3.3, and S4.2.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Local scaffold | `npm run build` passes; both surfaces reachable in dev; `.env.example` complete | `create-next-app` may conflict with existing `context/` files — verify before running |
| 2. CI/CD pipeline | `main` branch, GH Actions green on PR, Railway preview deploys | Railway dashboard setup is manual; preview URL must be verified before declaring done |

**Prerequisites:** GitHub repo must be accessible from Railway (repo must exist on GitHub, not just locally).  
**Estimated effort:** ~1 session; Phase 1 ~2h, Phase 2 ~1h + Railway dashboard config.

## Open Risks & Assumptions

- `create-next-app` places files in `.` (repo root) — must not overwrite `context/` or `.claude/`. Verify the conflict policy before running.
- next-intl `localePrefix: 'never'` requires that locale detection works correctly server-side via `Accept-Language`. The language switcher (written in S3.1) will need to persist locale choice via `NEXT_LOCALE` cookie so SSR renders in the user's preferred language — this is a known follow-on design constraint, not a blocker for S0.1.
- Railway Nixpacks Node version detection: add `.node-version` **and** `engines` in `package.json` to ensure both Railway and GH Actions resolve Node 24.

## Success Criteria (Summary)

- `npm run build`, `npm run lint`, `npx tsc --noEmit` all exit 0
- GitHub Actions CI passes (green) on a test PR against `main`
- Railway preview deployment responds 200 on `/api/health`
