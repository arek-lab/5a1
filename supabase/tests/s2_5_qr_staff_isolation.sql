-- =============================================================================
-- S2.5 — QR codes staff write isolation
-- Verifies that staff_all_qr_codes (auth.uid() + hotel_users join) prevents
-- a staff member of property A from reading or modifying property B's
-- qr_codes rows. Complements the guest scan path (RLS on the anon role),
-- this test covers the staff panel path.
--
-- Unlike s2_4_knowledge_staff_isolation.sql, the app never DELETEs qr_codes
-- rows (only flips is_active=false), so the third scenario here is a write
-- leak on a deactivation UPDATE rather than a DELETE leak.
--
-- Runs inside a single transaction that is always ROLLBACK'd — no persistent
-- test data is left in the database.
--
-- Run:
--   psql "$DATABASE_URL" -f supabase/tests/s2_5_qr_staff_isolation.sql
-- =============================================================================

BEGIN;

-- Bypass FK checks for test fixtures (auth_user_id → auth.users).
-- Transaction-local: resets automatically on ROLLBACK.
SET LOCAL session_replication_role = 'replica';

DO $$
DECLARE
  v_prop_a_id     UUID := gen_random_uuid();
  v_prop_b_id     UUID := gen_random_uuid();
  v_auth_user_a   UUID := gen_random_uuid();
  v_auth_user_b   UUID := gen_random_uuid();
  v_room_b_id     UUID := gen_random_uuid();
  v_qr_b_id       UUID := gen_random_uuid();
  v_leak_count    BIGINT;
  v_updated_count BIGINT;
  v_deactivated_count BIGINT;
BEGIN
  -- ── Seed two isolated properties with a staff user each ───────────────────
  INSERT INTO properties (id, name)
  VALUES
    (v_prop_a_id, 'S2.5 Property A'),
    (v_prop_b_id, 'S2.5 Property B');

  INSERT INTO hotel_users (property_id, auth_user_id, email, role, status)
  VALUES
    (v_prop_a_id, v_auth_user_a, 's25-a@test.local', 'staff', 'active'),
    (v_prop_b_id, v_auth_user_b, 's25-b@test.local', 'staff', 'active');

  -- ── Seed a room + active QR code belonging to property B ──────────────────
  INSERT INTO rooms (id, property_id, room_number)
  VALUES (v_room_b_id, v_prop_b_id, '901');

  INSERT INTO qr_codes (id, property_id, type, room_id, is_active)
  VALUES (v_qr_b_id, v_prop_b_id, 'room', v_room_b_id, true);

  -- ── Simulate an authenticated JWT for property A's staff user ─────────────
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_auth_user_a)::text,
    true
  );
  SET LOCAL ROLE authenticated;

  -- ── 1. Read leak — property A staff must not see property B's QR code ────
  SELECT COUNT(*) INTO v_leak_count
  FROM qr_codes
  WHERE id = v_qr_b_id;

  IF v_leak_count > 0 THEN
    RAISE EXCEPTION 'S2.5 FAILED: staff read leaked % row(s) across properties', v_leak_count;
  END IF;

  -- ── 2. Write leak — property A staff must not update property B's QR code ─
  UPDATE qr_codes SET type = 'reception' WHERE id = v_qr_b_id;
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF v_updated_count > 0 THEN
    RAISE EXCEPTION 'S2.5 FAILED: staff write leaked, updated % row(s) across properties', v_updated_count;
  END IF;

  -- ── 3. Deactivation leak — property A staff must not deactivate property B's room QR ─
  UPDATE qr_codes SET is_active = false WHERE id = v_qr_b_id;
  GET DIAGNOSTICS v_deactivated_count = ROW_COUNT;

  IF v_deactivated_count > 0 THEN
    RAISE EXCEPTION 'S2.5 FAILED: staff deactivation leaked, deactivated % row(s) across properties', v_deactivated_count;
  END IF;

  RAISE NOTICE 'S2.5 PASSED: staff write isolation verified for qr_codes';
END;
$$;

ROLLBACK;
