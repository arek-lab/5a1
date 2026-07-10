---
change_id: s0-3
title: Supabase Auth + Custom Access Token Hook + middleware
status: implemented
created: 2026-06-26
updated: 2026-07-10
archived_at: null
---

## Notes

z @context/foundation/session-plan.md

## Hotfix — 2026-07-10 (discovered during s3-1 manual verification)

`public.custom_access_token_hook` (from `20260626000004_auth_hook.sql`) never actually injected
`app_metadata` (`property_id`, `session_id`, `auth_level`) into real anonymous-sign-in JWTs, despite
the hook being enabled and correctly configured in the Supabase Dashboard. Root cause: real GoTrue
events omit the `app_metadata` key entirely for anonymous sign-in; `jsonb_set` with a multi-element
path (`{app_metadata,property_id}`) silently no-ops when an intermediate path element is missing —
it does not create nested objects, only the last path element. So the hook returned 200 with no
error, but claims were never present in the token. Manual SQL tests calling the function directly
missed this because the test event manually included `app_metadata: {}`.

Fixed via `20260710080000_fix_auth_hook_missing_app_metadata.sql`, which pre-seeds `app_metadata`
as an empty object before any nested `jsonb_set` call. Fix authored and applied while working
`s3-1` (see that change's Handoff notes) because it blocked s3-1 Phase 2 manual verification and
every downstream session depending on guest auth context.
