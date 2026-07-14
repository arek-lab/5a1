---
change_id: s2-5
title: Zarządzanie QR — auto-rotacja, dezaktywacja, licznik sesji (Moduł 4)
status: implemented
created: 2026-07-07
updated: 2026-07-07
archived_at: null
---

## Notes

z pliku 'c:/data/_new_projects/5a1/context/foundation/session-plan.md'

### S2.5 — Zarządzanie QR (Moduł 4)
**Scope:** UI QR recepcji (auto-rotacja 5 min + ręczna). Dezaktywacja QR pokoju per pokój. Licznik aktywnych sesji. Blokada gdy `dpa_signed_at IS NULL` (HITL #11). Test IT-6.
**DoD:** IT-6 przechodzi; dezaktywacja → nowe skany odrzucone; licznik działa.

## Hotfix — 2026-07-10

**Symptom**: Staff visiting `/qr` with an active reception QR saw a Next.js "Recoverable Error — Hydration failed" on every page refresh (server-rendered countdown text, e.g. `14:53`, mismatched the client's `14:54`).

**Root cause**: `qr-panel.tsx`'s `countdown` state used a lazy `useState(() => formatCountdown(...))` initializer that calls `Date.now()`. This runs once during the server render pass and again during client hydration, at two different wall-clock moments, producing two different `mm:ss` strings for the same `<span className="font-mono">` node.

**Fix**: Initialize `countdown` with a deterministic placeholder (`'--:--'`) so server and client's first render match; the real countdown is now computed inside the existing tick `useEffect` immediately on mount (in addition to the 1s interval), so the correct value appears right after hydration with no user-visible regression.

**Files touched**: `app/[locale]/(hotel)/qr/qr-panel.tsx`.
