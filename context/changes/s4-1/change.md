---
change_id: s4-1
title: KB composition pipeline + Redis cache
status: implemented
created: 2026-07-08
updated: 2026-07-13
archived_at: null
---

## Notes

Z `context/foundation/session-plan.md` (S4.1 — Pipeline kompozycji KB + cache Redis):

**Scope:** kompozytor KB: filtr `property_id` + `valid_from/until`, kolejność (FAQ→usługi→menu→polityki→okolica), `content_hash`. Upstash Redis: klucz `property_id`, invalidacja przy zmianie hasha. Test IT-9.

**DoD:** IT-9 przechodzi; edycja FAQ → nowy hash → cache invalidowany; kolejność §6.1 roadmapy.

**Blokery:** S2.4.
