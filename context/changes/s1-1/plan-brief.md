# S1.1 — QR Code Generation — Plan Brief

> Full plan: `context/changes/s1-1/plan.md`

## What & Why

S1.1 builds the QR code generation layer that powers the entire guest auth flow. Without it, S1.2 (scan handler) and S2.5 (QR panel UI) have no business logic to call. The session delivers three things: a testing framework (Vitest), a QR image utility (SVG), and the `qr_codes` database operations layer with the DPA gate enforced at the function level per HITL #11.

## Starting Point

S0.3 is complete. The `qr_codes` table is deployed with all needed fields (`init_token`, `expires_at`, `is_active`, `room_id`, `rotates_every`, `type`). `createServiceRoleClient()` and the full `Database` TypeScript type are ready. No QR code exists in `lib/`, no testing framework is installed, no QR image library is in `package.json`.

## Desired End State

`npm run test` runs and all unit tests pass. `lib/qr/image.ts` converts any URL to an SVG QR document. `lib/qr/generate.ts` exposes `generateReceptionQR`, `generateRoomQR`, and `deactivateRoomQR` — each using service_role, with the two generate functions checking `dpa_signed_at` before writing to `qr_codes`. S2.5 and S1.2 can import these functions directly.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Testing framework | Vitest | Roadmap §9 designates Vitest; DoD requires tests to pass — install now | Plan |
| QR image library | `qrcode` npm | Most maintained, full TS support, works server-side, multi-format (SVG/PNG/Buffer) | Plan |
| Image output format | SVG string | Vector, crisp at any scale for panel display and PDF; library supports natively | Plan |
| Reception QR URL | `/scan?init_token={uuid}` | Matches roadmap §3.2 token-exchange flow; S1.2 validates this parameter | Plan |
| Room QR URL | `/scan?room_id={uuid}` | Room QR encodes room_id directly; stateless, never expires on its own | Plan |
| DPA gate location | Inside generate functions | Gate is unbypassable regardless of caller (panel, cron, test); IT-6 testable at unit level | Plan |
| Old token validity on rotation | Valid until TTL (`expires_at`) | Guest who scanned just before rotation must not get 401; `is_active` is cosmetic for reception QRs | Plan |

## Scope

**In scope:**
- `vitest.config.ts` + Vitest install + test scripts in `package.json`
- `qrcode` install + `lib/qr/image.ts` (`generateQRImage`)
- `lib/qr/generate.ts` (`DpaNotSignedError`, `generateReceptionQR`, `generateRoomQR`, `deactivateRoomQR`)
- Unit tests for all three functions + image utility

**Out of scope:**
- Auto-rotation timer (S2.5 panel UI responsibility)
- Scan handler `/api/scan/*` (S1.2)
- Integration tests with real DB + active RLS (IT-1 full test = S1.2)
- Panel UI for QR (S2.5)
- `job_queue` cron for scheduled rotation

## Architecture / Approach

```
lib/qr/
  image.ts         ← generateQRImage(url) → SVG string
                      wraps qrcode.toString(url, { type: 'svg' })

  generate.ts      ← generateReceptionQR(propertyId)
                        1. DPA gate (properties.dpa_signed_at check)
                        2. update qr_codes set is_active=false (old reception QRs)
                        3. insert new row (expires_at=now()+15min, rotates_every='5min')

                     generateRoomQR(propertyId, roomId)
                        1. DPA gate
                        2. update qr_codes set is_active=false (old room QRs)
                        3. insert new row (static: expires_at=null, rotates_every=null)

                     deactivateRoomQR(propertyId, roomId)
                        update qr_codes set is_active=false (no DPA check)

  __tests__/
    image.test.ts
    generate.test.ts  ← mocks createServiceRoleClient
```

S2.5 calls `generateReceptionQR(propertyId)` → gets `init_token` → builds URL → calls `generateQRImage(url)` → displays SVG. S1.2 receives `/scan?init_token=` and validates against `expires_at` + `used_at` (not `is_active`).

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Vitest Setup | `npm run test` works; path aliases resolve | `@/` alias must match tsconfig — misconfigured alias breaks all test imports |
| 2. QR Image Utility | `generateQRImage(url)` → SVG; 3 tests pass | `qrcode` output format — full SVG document, not bare path; callers must base64-encode for `<img>` |
| 3. QR Generation Logic | 3 DB functions + mocked tests; DoD satisfied | Supabase mock must chain `.from().update().eq()` correctly — multi-eq chains need care |

**Prerequisites:** S0.3 applied (confirmed); `lib/supabase/service-role.ts` and `database.types.ts` present  
**Estimated effort:** ~1 session; Phase 1 ~20 min, Phase 2 ~40 min, Phase 3 ~60 min

## Open Risks & Assumptions

- `qrcode` package includes TS declarations in the package itself — if not, `@types/qrcode` install is required separately
- Vitest `globals: true` requires no `import { describe, it, expect }` in test files — confirm this works with project's ESLint config (may need `env.vitest: true` in ESLint)
- The `@/` → project root alias must match whatever `tsconfig.json` defines; if tsconfig uses a different base, `vitest.config.ts` alias must be adjusted

## Success Criteria (Summary)

- `npm run test` exits 0 with ≥9 passing test cases
- `npm run typecheck` and `npm run lint` pass
- `generateReceptionQR` creates a new `qr_codes` row and sets old rows `is_active=false` while leaving their `init_token` values intact
