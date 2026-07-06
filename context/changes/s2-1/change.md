---
change_id: s2-1
title: Hotel panel auth and RBAC middleware
status: implementing
created: 2026-07-06
updated: 2026-07-06
archived_at: null
---

## Notes

Sesja S2.1 z session-plan.md.

**Scope:** logowanie hotel_users (email+password). RBAC middleware: rola z `hotel_users` per route segment. Macierz §4.2 roadmapy. Guard komponenty server-side. Unit testy macierzy.

**DoD:** unit testy przechodzą; viewer nie może POST; staff nie widzi billingu.

**Blokery:** S0.3 (Supabase Auth + Custom Access Token Hook + middleware).
