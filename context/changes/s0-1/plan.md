# S0.1 — Project Bootstrap + CI/CD — Implementation Plan

## Overview

Bootstrap the Hotel Guest App repo from an empty state into a buildable, deployable skeleton: Next.js 15 App Router with TypeScript strict, Tailwind CSS, next-intl (PL/EN, no URL prefix), ESLint, Prettier, dual-surface route groups, a comprehensive `.env.example`, and a wired CI/CD pipeline (GitHub Actions lint+type-check + Railway Nixpacks preview deployments).

## Current State Analysis

The repo contains only `.claude/` and `context/` — no application code. This is a greenfield bootstrap with no dependencies to migrate.

## Desired End State

A Next.js 15 application where:
- `npm run build` exits 0 locally
- `npm run lint` and `tsc --noEmit` exit 0
- `npm run dev` serves a placeholder home page at `localhost:3000`
- A PR opened against `main` triggers GitHub Actions (lint + type-check) and a Railway preview environment
- The Railway preview URL responds 200 on `/api/health`

### Key Discoveries

- Stack is locked by HITL-T1–T4: Next.js 15 App Router + TypeScript + Tailwind + next-intl; Railway (persistent server — Vercel excluded due to SSE timeouts).
- next-intl locale preference lives in `localStorage` (not URL, not cookie) to avoid collision with the `__Host-session` cookie added in S0.3. Configure with `localePrefix: 'never'`.
- Two distinct UI surfaces (guest PWA + hotel panel) share one Next.js instance → route groups `(guest)` and `(hotel)` from day one so each gets its own layout and S0.3 middleware can target them independently.
- Monitoring SDKs (Sentry, PostHog, Better Stack) are **not installed** in S0.1 — they're initialized in S0.3. Their env vars appear in `.env.example` only.
- Node 24 matches the developer's local environment. Pin it via `.node-version` and `package.json` `engines`.

## What We're NOT Doing

- Installing Supabase, Sentry, PostHog, Upstash, or OpenAI SDKs (those land in S0.2 and S0.3).
- Implementing any real UI or API logic — all pages are placeholder stubs.
- Wiring up next-intl's `NextIntlClientProvider` beyond the minimum for `npm run build` to pass.
- Configuring Railway's production (promote) environment — only preview deployments on PRs.
- Adding Vitest or any test runner (no tests exist yet; CI covers lint + type-check only).

## Implementation Approach

Phase 1 creates the full local scaffold. Phase 2 wires the remote CI/CD. The split is deliberate: Phase 1 must pass `npm run build` independently before we add deployment infrastructure.

---

## Phase 1: Local Scaffold

### Overview

Create the Next.js 15 application with all required tooling and the skeleton directory structure. Everything in this phase runs locally.

### Changes Required

#### 1. Initialize Next.js 15 project

**File**: repo root (via `npx create-next-app@latest`)

**Intent**: Bootstrap the project using `create-next-app` so the generated config files (tsconfig, next.config.ts, tailwind, eslint.config.mjs) start from the official Next.js 15 defaults rather than being hand-crafted.

**Contract**: Run with these flags so the wizard is non-interactive:

```
npx create-next-app@latest . \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir=no \
  --import-alias="@/*" \
  --turbopack=no
```

The `.` target places files in the repo root. Existing `context/` and `.claude/` directories must not be overwritten — confirm `create-next-app` skips non-conflicting paths or use `--yes` flag after verifying.

---

#### 2. Pin Node 24

**Files**: `.node-version`, `package.json`

**Intent**: Ensure Railway Nixpacks, GitHub Actions, and the local dev environment all use the same Node version — avoiding "works on my machine" build failures.

**Contract**: `.node-version` contains `24`. In `package.json`, add `"engines": { "node": ">=24.0.0" }`.

---

#### 3. Configure next-intl (no URL prefix)

**Files**: `next.config.ts`, `middleware.ts`, `i18n/routing.ts`, `i18n/request.ts`, `messages/pl.json`, `messages/en.json`

**Intent**: Wire next-intl's middleware-only locale detection (no `/pl/` or `/en/` URL segments) with PL as the default locale. Message files are skeleton stubs — content is added in later sessions.

**Contract**:

`i18n/routing.ts` exports a `routing` object via `defineRouting`:
```ts
export const routing = defineRouting({
  locales: ['pl', 'en'] as const,
  defaultLocale: 'pl',
  localePrefix: 'never',
});
```

`i18n/request.ts` uses `getRequestConfig` to load messages from `messages/{locale}.json`.

`middleware.ts` wraps `createMiddleware(routing)` and exports a `config.matcher` that excludes `api`, `_next`, and static asset paths.

`next.config.ts` wraps the config with `createNextIntlPlugin('./i18n/request.ts')`.

`messages/pl.json` and `messages/en.json` each contain a minimal `common` namespace (e.g., `{ "common": { "loading": "Ładowanie..." } }` / `{ "common": { "loading": "Loading..." } }`) so the import resolves without error at build time.

---

#### 4. Route groups: (guest) and (hotel)

**Files**:
- `app/layout.tsx` — root layout
- `app/(guest)/layout.tsx`
- `app/(guest)/page.tsx`
- `app/(hotel)/layout.tsx`
- `app/(hotel)/dashboard/page.tsx`

**Intent**: Establish the two-surface separation now so each surface has its own layout tree. Route groups add no URL segment; `(guest)/page.tsx` still maps to `/`.

**Contract**:

Root `app/layout.tsx` wraps `<html lang={locale}>` with `NextIntlClientProvider` using `getLocale()` + `getMessages()` from next-intl/server.

`(guest)/layout.tsx` — minimal layout stub, no styling yet (added in S3.1).

`(guest)/page.tsx` — a single `<h1>Guest Home</h1>` placeholder; must be a Server Component (no `'use client'`).

`(hotel)/layout.tsx` — minimal layout stub.

`(hotel)/dashboard/page.tsx` — a single `<h1>Hotel Dashboard</h1>` placeholder.

---

#### 5. Health check route

**File**: `app/api/health/route.ts`

**Intent**: Provide a dead-simple endpoint that Railway's healthcheck pings to confirm the server is up. Without this, Railway marks the deployment as failed even when Next.js is running.

**Contract**: `GET` handler returns `new Response('ok', { status: 200 })`. No auth, no logic.

---

#### 6. Prettier configuration

**Files**: `.prettierrc`, `.prettierignore`

**Intent**: Enforce consistent formatting alongside ESLint. next-intl's ESLint plugin (and Next.js's built-in rules) handle linting; Prettier handles formatting.

**Contract**:

`.prettierrc`:
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

`.prettierignore`: `.next/`, `node_modules/`, `context/`.

Add `"format": "prettier --write ."` and `"format:check": "prettier --check ."` scripts to `package.json`. CI does not run format:check in S0.1 (added later if desired).

---

#### 7. Comprehensive `.env.example`

**File**: `.env.example`

**Intent**: Document every environment variable the project will need across all sessions, grouped by service with comment headers. Prevents "what's missing?" friction at every subsequent session's onboarding step.

**Contract**: Groups and vars:

```
# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Supabase (S0.2+)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DB_URL=

# Upstash Redis (S1.3, S4.1+)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# OpenAI (S4.2)
OPENAI_API_KEY=

# Sentry (S0.3)
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=
SENTRY_ORG=
SENTRY_PROJECT=

# PostHog EU (S0.3, S5.1)
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://eu.posthog.com

# Better Stack (S0.3)
LOGTAIL_SOURCE_TOKEN=

# Email / Resend (S2.6)
RESEND_API_KEY=

# Internal
CRON_SECRET=
```

All values empty. Session annotation in comments (e.g., `# Supabase (S0.2+)`) so future sessions know when each var becomes live.

---

### Success Criteria

#### Automated Verification

- `npm run build` exits 0 with no TypeScript errors
- `npm run lint` exits 0 (ESLint + Next.js rules)
- `npx tsc --noEmit` exits 0
- Files exist: `app/(guest)/page.tsx`, `app/(hotel)/dashboard/page.tsx`, `app/api/health/route.ts`, `middleware.ts`, `i18n/routing.ts`, `.env.example`

#### Manual Verification

- `npm run dev` starts without errors; `localhost:3000` renders "Guest Home" placeholder
- `localhost:3000/dashboard` renders "Hotel Dashboard" placeholder
- `localhost:3000/api/health` returns 200 `ok`
- Browser console shows zero errors on all three routes

**Implementation Note**: After Phase 1 automated verification passes, confirm manually that all three routes load cleanly before moving to Phase 2.

---

## Phase 2: CI/CD Pipeline

### Overview

Rename the default branch to `main`, push to GitHub, wire GitHub Actions (lint + type-check on every PR), configure `railway.toml`, and connect the Railway project to the GitHub repo for preview deployments.

### Changes Required

#### 1. Rename default branch to main

**Intent**: Align the repo with the project convention (`main` is the base branch per CLAUDE.md) before wiring any automation that references it.

**Contract**: `git branch -m master main`. Then push the renamed branch and update the upstream tracking: `git push -u origin main`. If GitHub shows `master` as default, change it in repo Settings → Branches → Default branch.

---

#### 2. GitHub Actions CI workflow

**File**: `.github/workflows/ci.yml`

**Intent**: Enforce lint + type-check on every PR targeting `main`. The two jobs run in parallel (no dependency between them) so total wall-clock time is the slower of the two, not their sum.

**Contract**:

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run lint

  type-check:
    name: Type check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npx tsc --noEmit
```

---

#### 3. Railway deployment config

**File**: `railway.toml`

**Intent**: Tell Railway how to start the app and where to probe health, so Nixpacks builds succeed and preview environments come up cleanly.

**Contract**:

```toml
[build]
builder = "NIXPACKS"

[deploy]
startCommand = "npm start"
healthcheckPath = "/api/health"
healthcheckTimeout = 30
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

Nixpacks will detect Next.js and run `npm run build` before `npm start`. No `Dockerfile` needed.

---

#### 4. Railway project setup (manual steps)

**Intent**: Connect the Railway project to the GitHub repo and enable preview environments (Railway creates a separate environment per open PR).

**Contract** (done in the Railway dashboard — not in code):
1. Create a Railway project (or use existing).
2. Add a service → connect to GitHub repo → select `main` as the production branch.
3. In project Settings → Environments → enable "Preview Environments."
4. Set environment variables from `.env.example` for the production environment (only `NEXT_PUBLIC_APP_URL` needed for S0.1; others left empty or omitted until their sessions).

---

### Success Criteria

#### Automated Verification

- `git branch --show-current` outputs `main`
- `.github/workflows/ci.yml` exists and is valid YAML
- `railway.toml` exists with `healthcheckPath = "/api/health"`
- Open a test PR against `main` → GitHub Actions shows both `Lint` and `Type check` jobs pass (green checkmarks)

#### Manual Verification

- Railway preview environment deploys on the test PR (visible in Railway dashboard)
- Preview URL `/api/health` returns 200 `ok` in browser
- Merge the test PR → Railway production build succeeds on `main`

**Implementation Note**: The Railway dashboard steps (item 4 above) require browser access. Complete them after pushing `railway.toml`. Confirm preview environment URL is accessible before closing S0.1.

---

## Testing Strategy

### Automated

- `npm run lint` — ESLint with Next.js + TypeScript rules
- `npx tsc --noEmit` — strict TypeScript type checking
- `npm run build` — full Next.js production build

### Manual Testing Steps

1. `npm run dev` → open `localhost:3000` — placeholder home loads, no console errors
2. Navigate to `localhost:3000/dashboard` — hotel dashboard placeholder loads
3. `curl localhost:3000/api/health` → `ok` with HTTP 200
4. Open a PR against `main` → both GitHub Actions jobs pass
5. Railway preview URL accessible, `/api/health` returns 200

## Migration Notes

No existing data or code to migrate. This is a greenfield initialization.

## References

- Session plan: `context/foundation/session-plan.md` → S0.1
- Stack decisions: `context/foundation/implementation_roadmap.md` §2.1 (T1–T4)
- next-intl no-prefix docs: https://next-intl.dev/docs/routing#locale-prefix-never
- Railway Nixpacks Next.js: https://docs.railway.com/guides/nextjs

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Local Scaffold

#### Automated

- [x] 1.1 `npm run build` exits 0 — 07d8452
- [x] 1.2 `npm run lint` exits 0 — 07d8452
- [x] 1.3 `npx tsc --noEmit` exits 0 — 07d8452
- [x] 1.4 Route group files exist: `app/(guest)/page.tsx`, `app/(hotel)/dashboard/page.tsx`, `app/api/health/route.ts`, `proxy.ts` (Next.js 16: renamed from `middleware.ts`), `i18n/routing.ts`, `.env.example` — 07d8452

#### Manual

- [x] 1.5 `npm run dev` → `localhost:3000` renders Guest Home placeholder, zero console errors — 07d8452
- [x] 1.6 `localhost:3000/dashboard` renders Hotel Dashboard placeholder — 07d8452
- [x] 1.7 `localhost:3000/api/health` returns 200 `ok` — 07d8452

### Phase 2: CI/CD Pipeline

#### Automated

- [x] 2.1 `git branch --show-current` outputs `main` — 819dc0e
- [x] 2.2 `.github/workflows/ci.yml` exists and is valid YAML — 819dc0e
- [x] 2.3 `railway.toml` exists with `healthcheckPath = "/api/health"` — 819dc0e
- [x] 2.4 Test PR opened against `main` → GitHub Actions `Lint` and `Type check` both pass — 819dc0e

#### Manual

- [x] 2.5 Railway preview environment deploys on test PR (visible in Railway dashboard)
- [x] 2.6 Preview URL `/api/health` returns 200 in browser
- [x] 2.7 Test PR merged → Railway production build on `main` succeeds
