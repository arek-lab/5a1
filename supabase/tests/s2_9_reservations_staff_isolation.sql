-- =============================================================================
-- S2.9 — Reservations/rooms staff write isolation
-- Verifies that staff_all_reservations/staff_all_rooms (auth.uid() + hotel_users
-- join) prevent a staff member of property A from reading or modifying
-- property B's reservations/rooms rows. Complements the guest scan path (RLS
-- on the anon role), this test covers the staff panel path added in S2.9
-- (check-in / check-out edit).
--
-- These policies are today ALL-access per property for any active hotel_user,
-- not scoped per-role (see plan.md "What We're NOT Doing") — so the expected
-- result is zero cross-property leak, regardless of role.
--
-- Runs inside a single transaction that is always ROLLBACK'd — no persistent
-- test data is left in the database.
--
-- Run:
--   psql "$DATABASE_URL" -f supabase/tests/s2_9_reservations_staff_isolation.sql
-- =============================================================================

BEGIN;

-- Bypass FK checks for test fixtures (auth_user_id → auth.users).
-- Transaction-local: resets automatically on ROLLBACK.
SET LOCAL session_replication_role = 'replica';

DO $$
DECLARE
  v_prop_a_id       UUID := gen_random_uuid();
  v_prop_b_id       UUID := gen_random_uuid();
  v_auth_user_a     UUID := gen_random_uuid();
  v_auth_user_b     UUID := gen_random_uuid();
  v_room_b_id       UUID := gen_random_uuid();
  v_reservation_b_id UUID := gen_random_uuid();
  v_leak_count      BIGINT;
  v_updated_count   BIGINT;
  v_room_updated_count BIGINT;
BEGIN
  -- ── Seed two isolated properties with a staff user each ───────────────────
  INSERT INTO properties (id, name)
  VALUES
    (v_prop_a_id, 'S2.9 Property A'),
    (v_prop_b_id, 'S2.9 Property B');

  INSERT INTO hotel_users (property_id, auth_user_id, email, role, status)
  VALUES
    (v_prop_a_id, v_auth_user_a, 's29-a@test.local', 'staff', 'active'),
    (v_prop_b_id, v_auth_user_b, 's29-b@test.local', 'staff', 'active');

  -- ── Seed a room + active reservation belonging to property B ──────────────
  INSERT INTO rooms (id, property_id, room_number)
  VALUES (v_room_b_id, v_prop_b_id, '901');

  INSERT INTO reservations (id, property_id, room_id, check_in, check_out, source, status)
  VALUES (
    v_reservation_b_id,
    v_prop_b_id,
    v_room_b_id,
    now(),
    now() + interval '1 day',
    'direct',
    'checked_in'
  );

  UPDATE rooms
  SET room_active_reservation_id = v_reservation_b_id,
      valid_from = now(),
      valid_until = now() + interval '1 day'
  WHERE id = v_room_b_id;

  -- ── Simulate an authenticated JWT for property A's staff user ─────────────
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_auth_user_a)::text,
    true
  );
  SET LOCAL ROLE authenticated;

  -- ── 1. Read leak — property A staff must not see property B's reservation ─
  SELECT COUNT(*) INTO v_leak_count
  FROM reservations
  WHERE id = v_reservation_b_id;

  IF v_leak_count > 0 THEN
    RAISE EXCEPTION 'S2.9 FAILED: staff read leaked % reservation row(s) across properties', v_leak_count;
  END IF;

  -- ── 2. Write leak — property A staff must not edit property B's check_out ─
  UPDATE reservations SET check_out = now() + interval '2 days' WHERE id = v_reservation_b_id;
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF v_updated_count > 0 THEN
    RAISE EXCEPTION 'S2.9 FAILED: staff write leaked, updated % reservation row(s) across properties', v_updated_count;
  END IF;

  -- ── 3. Write leak — property A staff must not edit property B's room window ─
  UPDATE rooms SET valid_until = now() + interval '2 days' WHERE id = v_room_b_id;
  GET DIAGNOSTICS v_room_updated_count = ROW_COUNT;

  IF v_room_updated_count > 0 THEN
    RAISE EXCEPTION 'S2.9 FAILED: staff write leaked, updated % room row(s) across properties', v_room_updated_count;
  END IF;

  RAISE NOTICE 'S2.9 PASSED: staff write isolation verified for reservations/rooms';
END;
$$;

ROLLBACK;
