# S1.1 — QR Code Generation Implementation Plan

## Overview

Build the QR code generation subsystem for Hotel Guest App: Vitest testing infrastructure, a QR image utility (SVG), and the `qr_codes` database logic layer. S2.5 (panel UI) and S1.2 (scan handler) consume what this session delivers.

## Current State Analysis

S0.3 is complete. The `qr_codes` table is deployed with all required fields: `init_token`, `expires_at`, `is_active`, `room_id`, `rotates_every`, `type (qr_type ENUM)`, `used_at`. `createServiceRoleClient()` (`lib/supabase/service-role.ts`) and the `Database` type (`lib/supabase/database.types.ts`) are established and ready.

No QR-related code exists. Vitest is absent from `package.json` — the roadmap designates it as the unit test framework (§9) but S0.x sessions did not install it. No QR image generation library is installed.

## Desired End State

`npm run test` runs and all unit tests pass. `lib/qr/image.ts` exports `generateQRImage(url)` returning a complete SVG document string. `lib/qr/generate.ts` exports `generateReceptionQR`, `generateRoomQR`, and `deactivateRoomQR` — all backed by `qr_codes` via service_role, with DPA gate enforced inside the two generate functions. IT-1 rotation and deactivation scenarios are covered by mocked unit tests.

### Key Discoveries

- `qr_codes` schema: `lib/supabase/database.types.ts:328` — all needed fields present with correct nullable/non-nullable shapes
- `createServiceRoleClient` pattern: `lib/supabase/service-role.ts:4` — used for all admin DB operations
- `Tables<'qr_codes'>` from `database.types.ts` provides the return type for generate functions
- No `@types/qrcode` may need to be installed alongside `qrcode` — confirm after install

## What We're NOT Doing

- Reception QR auto-rotation timer (S2.5 triggers rotation via panel UI)
- Scan handler `/api/scan/*` (S1.2)
- DPA gate UI (S2.5)
- Panel UI for QR management (S2.5)
- Integration tests against real DB with active RLS — IT-1 as a full integration test belongs to S1.2
- `job_queue` cron entries for scheduled rotation

## Implementation Approach

Three isolated deliverables in sequence:

1. Vitest configured with `@/` path alias so server-side tests work
2. Pure stateless utility: `generateQRImage(url)` wrapping `qrcode.toString()` — no DB touch
3. DB logic in `lib/qr/generate.ts`: each function creates its own service_role client, checks DPA, performs minimal DB operations, returns typed result. Unit tests mock `createServiceRoleClient` at module scope.

## Critical Implementation Details

**Reception QR validity contract (S1.2 MUST follow this):** validate `expires_at > now()` AND `used_at IS NULL`. Do NOT filter on `is_active` — rotation sets `is_active=false` on old records but their tokens remain valid until TTL. A guest who scanned a rotating QR one second before rotation has up to 15 minutes to complete the flow. Room QR validity is the inverse: check `is_active = true` only (multi-use, no TTL on the record; access window is controlled by `rooms.valid_from/valid_until` at scan time in S1.2).

---

## Phase 1: Vitest Setup

### Overview

Install Vitest and configure it so `@/` resolves to the project root, enabling server-side unit tests across the `lib/` tree.

### Changes Required

#### 1. Test dependencies

**File**: `package.json`

**Intent**: Add Vitest and the V8 coverage provider to devDependencies so `npm run test` and `npm run test:coverage` are available.

**Contract**: `devDependencies` gains `"vitest": "^3"` and `"@vitest/coverage-v8": "^3"`. Scripts gain `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:coverage": "vitest run --coverage"`.

#### 2. Vitest configuration

**File**: `vitest.config.ts` (new)

**Intent**: Configure Vitest for a Node.js environment with the `@/` alias matching the project root, consistent with Next.js tsconfig paths.

**Contract**: `environment: 'node'`, `globals: true`, `resolve.alias` maps `'@'` to the absolute project root (`path.resolve(__dirname, '.')`). No `jsdom` — all tests are server-side.

### Success Criteria

#### Automated Verification:

- `npm run test` exits 0
- `npm run typecheck` passes

---

## Phase 2: QR Image Utility

### Overview

Install `qrcode` and expose one typed function that converts any URL to an SVG QR code document, ready for panel display or base64-encoded embedding.

### Changes Required

#### 1. qrcode dependencies

**File**: `package.json`

**Intent**: Add qrcode library and its TypeScript declarations.

**Contract**: `dependencies` gains `"qrcode": "^1"`. `devDependencies` gains `"@types/qrcode": "^1"`.

#### 2. Image utility

**File**: `lib/qr/image.ts` (new)

**Intent**: Wrap `qrcode.toString()` as the single function all callers use when they need a QR code rendered. Keeping this as a thin wrapper isolates the library dependency.

**Contract**: Export `generateQRImage(url: string): Promise<string>`. Calls `QRCode.toString(url, { type: 'svg' })`. Returns a complete SVG document string (includes `<svg>` wrapper — suitable for `data:image/svg+xml;base64,<encoded>` embedding in `<img>` tags; inline SVG callers strip the XML declaration themselves). Throws on empty `url`.

#### 3. Image utility tests

**File**: `lib/qr/__tests__/image.test.ts` (new)

**Intent**: Verify the utility produces valid SVG and forwards the URL into the QR data.

**Contract**: Three test cases — (1) returned string contains `<svg`; (2) returned string encodes the provided URL (use a fixed `https://example.com/scan?init_token=test` and assert the expected characters appear in the SVG output); (3) returns successfully for a typical HTTPS URL without error.

### Success Criteria

#### Automated Verification:

- `npm run test` — image utility tests pass (3 tests)
- `npm run typecheck` passes
- `npm run lint` passes

---

## Phase 3: QR Generation Logic

### Overview

Core business logic for `qr_codes` CRUD. Three exports cover all operations S2.5 and S1.2 will need: generate reception (rotating), generate room (static), deactivate room.

### Changes Required

#### 1. QR generation module

**File**: `lib/qr/generate.ts` (new)

**Intent**: Provide the authoritative layer for writing to `qr_codes`. The DPA gate lives here so no caller — not a route handler, not a cron job — can bypass it. Each function is independently callable and creates its own service_role client.

**Contract**: Exports:

- `class DpaNotSignedError extends Error` — thrown when the property's `dpa_signed_at IS NULL`. Message should identify the property for logging.

- `generateReceptionQR(propertyId: string): Promise<Tables<'qr_codes'>>`:
  1. Fetch `properties.dpa_signed_at` for `propertyId` via service_role; throw `DpaNotSignedError` if null
  2. Update `qr_codes` set `is_active = false` where `property_id = propertyId` AND `type = 'reception'` AND `is_active = true`
  3. Insert new row: `property_id`, `type = 'reception'`, `expires_at = now() + 15 minutes`, `rotates_every = '5 minutes'`, `is_active = true` (DB generates `init_token` from its default)
  4. Return the inserted row

- `generateRoomQR(propertyId: string, roomId: string): Promise<Tables<'qr_codes'>>`:
  1. Fetch DPA gate (same as above)
  2. Update `qr_codes` set `is_active = false` where `property_id`, `room_id`, `type = 'room'`, `is_active = true`
  3. Insert new row: `property_id`, `type = 'room'`, `room_id`, `is_active = true`, `expires_at = null`, `rotates_every = null`
  4. Return the inserted row

- `deactivateRoomQR(propertyId: string, roomId: string): Promise<void>`:
  - Update `qr_codes` set `is_active = false` where `property_id`, `room_id`, `type = 'room'`, `is_active = true`. No DPA check needed — deactivation is always allowed.

Note on `init_token` for room QR: the DB default (`gen_random_uuid()`) applies. The URL a caller encodes in the QR image is `/scan?room_id={roomId}` — the `room_id`, not the `init_token`. S1.2 will look up the QR record by `room_id` and check `is_active`.

#### 2. Generation logic unit tests

**File**: `lib/qr/__tests__/generate.test.ts` (new)

**Intent**: Verify IT-1 scenarios at unit level: reception rotation deactivates old records, DPA gate fires for both generate functions, room deactivation sets correct flag, correct fields are written.

**Contract**: Mock `createServiceRoleClient` at module scope (vi.mock). Provide a chainable query-builder mock that records calls. Six test cases minimum:
1. `generateReceptionQR` — calls update (is_active=false) before insert on same `property_id + type='reception'` filter
2. `generateReceptionQR` — inserted row has `type='reception'`, `expires_at` approximately 15 min from now, `rotates_every='5 minutes'`, `is_active=true`
3. `generateReceptionQR` — throws `DpaNotSignedError` when mocked property returns `dpa_signed_at: null`
4. `generateRoomQR` — inserted row has `type='room'`, `room_id` set, `expires_at=null`, `is_active=true`
5. `generateRoomQR` — throws `DpaNotSignedError` when DPA null
6. `deactivateRoomQR` — calls update with `is_active=false` filtered by `property_id`, `room_id`, `type='room'`

### Success Criteria

#### Automated Verification:

- `npm run test` — all tests pass (≥9 test cases across both test files)
- `npm run typecheck` passes
- `npm run lint` passes

#### Manual Verification:

- Reception QR record shows `expires_at ≈ now()+15min`, `rotates_every='5 minutes'`, `is_active=true`; previously active reception records for same property have `is_active=false` with `init_token` untouched
- Room QR record shows `is_active=true`, `expires_at=null`, `room_id` populated
- Calling either generate function for a property with `dpa_signed_at IS NULL` throws `DpaNotSignedError`

---

## Testing Strategy

### Unit Tests

- `generateQRImage`: SVG string validity, URL encoding presence, error on empty input
- `generateReceptionQR`: DPA gate, update-before-insert ordering, correct field values on insert
- `generateRoomQR`: DPA gate, static field values (`expires_at=null`, `rotates_every=null`)
- `deactivateRoomQR`: correct update filter applied

### Manual Testing Steps

1. Run `npm run test` — all tests pass
2. Run `npm run typecheck` and `npm run lint` — both pass
3. In a dev env with DPA-signed property: call `generateReceptionQR` twice; assert second call creates new row with `is_active=true` and first row has `is_active=false` with original `init_token` still present
4. Call `deactivateRoomQR`; assert room QR row has `is_active=false`
5. Call `generateReceptionQR` for property with `dpa_signed_at IS NULL`; assert `DpaNotSignedError` is thrown

## References

- Session scope: `context/foundation/session-plan.md § S1.1`
- Integration test IT-1 (future): `context/foundation/implementation_roadmap.md §9.2`
- qr_codes schema: `lib/supabase/database.types.ts:328`
- service_role pattern: `lib/supabase/service-role.ts:4`
- Security research: `context/research/session_06/security-qr-sessions.md`
- QR auth patterns: `context/research/session_01/qr-auth-patterns.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Vitest Setup

#### Automated

- [x] 1.1 `npm run test` exits 0 — 70fa907
- [x] 1.2 `npm run typecheck` passes — 70fa907

### Phase 2: QR Image Utility

#### Automated

- [x] 2.1 `npm run test` — image utility tests pass (3 tests) — b1e007d
- [x] 2.2 `npm run typecheck` passes — b1e007d
- [x] 2.3 `npm run lint` passes — b1e007d

### Phase 3: QR Generation Logic

#### Automated

- [x] 3.1 `npm run test` — all tests pass (≥9 test cases)
- [x] 3.2 `npm run typecheck` passes
- [x] 3.3 `npm run lint` passes

#### Manual

- [x] 3.4 Reception QR record has correct fields; previously active records have `is_active=false` with `init_token` intact
- [x] 3.5 Room QR record has `is_active=true`, `expires_at=null`, `room_id` populated
- [x] 3.6 DPA gate throws `DpaNotSignedError` when `dpa_signed_at IS NULL`
