# Retention Automation (Cron) + Founder Dashboard — Plan Brief

> Full plan: `context/changes/s5-2/plan.md`

## What & Why

S5.2 builds the two go-live-blocking pieces of the RODO/analytics roadmap (§7.3/§7.4): automated deletion of stale data (sessions, audit logs) before the Lighthouse pilot goes live, and a founder-only "Pulse" dashboard showing daily platform numbers. Both are MUST-before-go-live per the roadmap ("Automaty retencji (cron) muszą działać przed pierwszym wdrożeniem produkcyjnym").

## Starting Point

`job_queue` and `audit_logs` tables already exist in the schema but have zero consumer code — they're inert. No cron/scheduling mechanism exists anywhere (Railway runs a single web process, no GitHub Actions schedule, no `/api/cron/*` route). No founder/admin auth concept exists — RBAC is entirely hotel-scoped. `orders.session_id` currently has no `ON DELETE` behavior, which would block session deletion outright.

## Desired End State

A daily GitHub Actions job hits a secret-protected route that revokes expired sessions, hard-deletes sessions past their 48h grace window, and purges 30-day-old audit logs — each rule isolated so one failure doesn't block the others. A founder logs into `/admin` with a shared token and sees real numbers: guests online, orders/24h, QR scans/24h, operators active 7d, with escalation rate explicitly marked not-yet-available (blocked on the unbuilt AI Concierge).

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Cron trigger | GitHub Actions `schedule:` → secret-protected route | Zero new infra, follows existing `.github/workflows/` convention, fits solo-dev minimal-ops principle (HITL #13) |
| Founder auth | Static shared token (`ADMIN_ACCESS_TOKEN`) via middleware cookie check | Single pilot founder/operator — a full admin-user table is disproportionate build for the actual need |
| Cron route security | Shared-secret header (`CRON_SECRET`, already in `.env.example`) | Standard convention for scheduled HTTP endpoints; the env var name was already reserved |
| Job model | Direct SQL sweep, no `job_queue` involvement | Retention is a periodic sweep, not a per-row async job; `job_queue`'s real purpose (CSV import, email) stays for those future sessions |
| AI chat retention | Skipped entirely, TODO for the Phase 4 session | No `concierge_messages`-equivalent table exists yet; matches the precedent S5.1 already set for unbuilt event hooks |
| Orders 5yr retention | No active job — documented as keep-only policy | No order is anywhere near 5 years old yet; nothing to delete, nothing to test |
| Session deletion | Hard DELETE (not soft-delete) | RODO erasure means actual deletion; sessions hold `device_fingerprint`/`last_asn`, exactly what must go — requires fixing `orders.session_id`'s FK to `ON DELETE SET NULL` first |
| PostHog `guest_id` purge | Deferred, documented as an open gap before go-live | Needs a new Personal API Key not yet provisioned; not covered by this session's own test (IT-8) |
| Dashboard data source | Direct Postgres aggregation via existing service-role client | No PostHog query client exists in this repo; exact numbers, no new external dependency |
| Dashboard scope | Pulse only; Growth deferred | This session's own DoD says only "Pulse wyświetla liczby" — Growth (weekly funnel/cohort) is materially harder and is a follow-up session |
| IT-8 test strategy | Backdated timestamp fixtures against real Supabase | Matches the existing `lib/checkout/__tests__/it-4.test.ts` pattern already used for this kind of time-based assertion |
| Cron granularity | Single endpoint, all 3 rules, continue-on-error per rule | Simplest to reason about/monitor at pilot scale (3-5 hotels); each rule's own try/catch keeps one failure from hiding the other two's success |

## Scope

**In scope:**
- `orders.session_id` FK fix (`ON DELETE SET NULL`)
- Three retention sweep functions (revoke expired sessions, delete past-48h sessions, purge 30-day audit logs)
- `/api/cron/retention` route + daily GitHub Actions schedule
- Static-token founder auth for a new `/admin` area (outside `[locale]` routing)
- Pulse dashboard (guests online, orders/24h, QR scans/24h, operators 7d, escalation rate marked N/A)
- IT-8 (full retention integration test)

**Out of scope:**
- AI chat retention (no storage table yet — Phase 4)
- PostHog `guest_id` purge (needs new Personal API Key — documented gap)
- Orders 5-year purge job (nothing to delete yet)
- Growth (weekly) dashboard view
- `job_queue`-based worker/queue processing
- Multi-founder accounts / per-user admin auth

## Architecture / Approach

Three small, independently try/caught sweep functions live in `lib/retention/sweep.ts`, called from a single `CRON_SECRET`-guarded `/api/cron/retention` route, triggered daily by a new GitHub Actions workflow. The admin area is a separate, non-localized route tree (`/admin/*`) gated in `proxy.ts` by a cookie compared against `ADMIN_ACCESS_TOKEN`. The Pulse page is a server component running direct Postgres aggregations via the existing `createServiceRoleClient()` — no PostHog dependency.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Retention sweep core | FK fix + 3 sweep functions, tested against real Supabase | FK fix must land before session-delete is ever exercised, or deletes silently fail |
| 2. Cron endpoint + trigger | Secret-protected route + daily GH Actions schedule | Secret/URL provisioning in GH Actions repo settings is a manual step outside this repo |
| 3. Founder auth | Token-gated `/admin` login | None major — self-contained, single-token auth |
| 4. Pulse dashboard + hardening | Daily numbers page + IT-8 | Escalation rate has no real data source yet — must read clearly as "not available," not 0 |

**Prerequisites:** S5.1 merged (analytics core, service-role patterns already in place).
**Estimated effort:** ~1 session across 4 phases.

## Open Risks & Assumptions

- PostHog `guest_id` 30-day purge is a roadmap MUST not covered by this plan or by IT-8 — needs a `POSTHOG_PERSONAL_API_KEY` and a follow-up before the Lighthouse pilot actually goes live.
- AI chat retention has no host table yet — will need its own retention rule once Phase 4 lands.
- GitHub Actions cron scheduling has up to ~15 minutes of jitter — acceptable for daily housekeeping, not treated as precise.
- `CRON_SECRET` and a new `APP_URL`/`ADMIN_ACCESS_TOKEN` must be provisioned as GitHub Actions repository secrets and Railway env vars respectively — a manual, outside-this-repo step called out in Phase 2/3 manual verification.

## Success Criteria (Summary)

- Retention cron runs daily, hard-deletes only what's past its window, and IT-8 passes end to end
- Founder can log into `/admin` and see accurate Pulse numbers pulled straight from Postgres
- Every roadmap MUST retention rule is either implemented or explicitly documented as an open gap — nothing silently dropped
