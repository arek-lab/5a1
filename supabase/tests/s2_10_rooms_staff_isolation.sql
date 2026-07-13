-- =============================================================================
-- S2.10 — Rooms staff write isolation
-- Verifies that staff_all_rooms (auth.uid() + hotel_users join) prevents a
-- staff member of property A from reading, modifying, or inserting rows into
-- property B's rooms.
--
-- Split into several top-level DO $$ blocks (each with a single BEGIN/END,
-- never nested) instead of one large block with a nested BEGIN/EXCEPTION/END
-- sub-block — some SQL clients (e.g. the Supabase Studio SQL editor) split
-- multi-statement scripts on a naive BEGIN/END count and mis-parse nested
-- blocks, raising a spurious "syntax error at or near IF" further down.
--
-- Runs inside a single transaction that is always ROLLBACK'd — no persistent
-- test data is left in the database.
--
-- Run:
--   psql "$DATABASE_URL" -f supabase/tests/s2_10_rooms_staff_isolation.sql
-- or paste directly into the Supabase SQL Editor.
-- =============================================================================

BEGIN;

-- Bypass FK checks for test fixtures (auth_user_id → auth.users).
-- Transaction-local: resets automatically on ROLLBACK.
SET LOCAL session_replication_role = 'replica';

-- ── Seed two isolated properties with a staff user each + a room on B ──────
DO $$
DECLARE
  v_prop_a_id   UUID := gen_random_uuid();
  v_prop_b_id   UUID := gen_random_uuid();
  v_auth_user_a UUID := gen_random_uuid();
  v_auth_user_b UUID := gen_random_uuid();
  v_room_b_id   UUID := gen_random_uuid();
BEGIN
  INSERT INTO properties (id, name)
  VALUES
    (v_prop_a_id, 'S2.10 Property A'),
    (v_prop_b_id, 'S2.10 Property B');

  INSERT INTO hotel_users (property_id, auth_user_id, email, role, status)
  VALUES
    (v_prop_a_id, v_auth_user_a, 's210-a@test.local', 'staff', 'active'),
    (v_prop_b_id, v_auth_user_b, 's210-b@test.local', 'staff', 'active');

  INSERT INTO rooms (id, property_id, room_number)
  VALUES (v_room_b_id, v_prop_b_id, '901');

  -- Simulate an authenticated JWT for property A's staff user.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth_user_a)::text, true);

  -- Persist ids for the later top-level statements in this same transaction.
  PERFORM set_config('s210.prop_b_id', v_prop_b_id::text, true);
  PERFORM set_config('s210.room_b_id', v_room_b_id::text, true);
END $$;

SET LOCAL ROLE authenticated;

-- ── 1 & 2. Read/write leak — property A staff must not see/modify B's room ─
DO $$
DECLARE
  v_room_b_id     UUID := current_setting('s210.room_b_id')::uuid;
  v_leak_count    BIGINT;
  v_updated_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_leak_count FROM rooms WHERE id = v_room_b_id;
  IF v_leak_count > 0 THEN
    RAISE EXCEPTION 'S2.10 FAILED: staff read leaked % row(s) across properties', v_leak_count;
  END IF;

  UPDATE rooms SET room_type = 'suite' WHERE id = v_room_b_id;
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count > 0 THEN
    RAISE EXCEPTION 'S2.10 FAILED: staff write leaked, updated % row(s) across properties', v_updated_count;
  END IF;

  RAISE NOTICE 'S2.10 step 1/2 PASSED: no read/write leak on rooms';
END $$;

-- ── 3. Insert leak — property A staff must not insert a room into property B ─
DO $$
DECLARE
  v_prop_b_id UUID := current_setting('s210.prop_b_id')::uuid;
BEGIN
  INSERT INTO rooms (property_id, room_number) VALUES (v_prop_b_id, '902');
  RAISE EXCEPTION 'S2.10 FAILED: staff insert leaked into property B rooms';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'S2.10 step 3 PASSED: insert into property B blocked by RLS';
END $$;

DO $$ BEGIN RAISE NOTICE 'S2.10 PASSED: staff write isolation verified for rooms'; END $$;

ROLLBACK;
