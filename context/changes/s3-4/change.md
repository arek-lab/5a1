---
change_id: s3-4
title: Guest edge cases P0/P1, error screens, and i18n
status: implementing
created: 2026-07-13
updated: 2026-07-14
archived_at: null
---

## Notes

Zakres wg `context/foundation/session-plan.md` (S3.4):

**Scope:** token wygasły/nieważny: branded strona + nr recepcji + rozróżnienie "wygasł" vs "nieprawidłowy". Offline: toast, "Zamów" disabled. 5xx: friendly + retry. Auth-level insufficient: graceful redirect. Tłumaczenia PL/EN.

**DoD:** P0 stany = branded ekran z kontaktem; offline → disabled; 5xx → retry.

**Blokery:** S3.2 (zaimplementowane).
