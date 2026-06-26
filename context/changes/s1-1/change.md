---
change_id: s1-1
title: QR code generation — reception rotating token + room static token
status: implementing
created: 2026-06-26
updated: 2026-06-26
archived_at: null
---

## Notes

z 'c:/data/_new_projects/5a1/context/foundation/session-plan.md'

**Scope (S1.1):** logika `qr_codes`. Recepcja: rotujący co 5 min, `init_token` UUID single-use TTL 15 min. Pokój: statyczny, `room_id`, `is_active`. Utility obrazu QR. Unit testy.
**DoD:** unit testy przechodzą; QR recepcji rotuje; QR pokoju statyczny.
**Blokery:** S0.3 (✓ ukończone).
