-- =============================================================================
-- S2.3 — Services staff write isolation
-- Verifies that staff_all_services (auth.uid() + hotel_users join) prevents a
-- staff member of property A from reading or updating property B's services.
-- Complements it3_tenant_isolation.sql, which only covers the guest read path
-- (current_setting-based, anon role) — this test covers the staff write path.
--
-- Runs inside a single transaction that is always ROLLBACK'd — no persistent
-- test data is left in the database.
--
-- Run:
--   psql "$DATABASE_URL" -f supabase/tests/s2_3_services_staff_isolation.sql
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
  v_service_b_id  UUID := gen_random_uuid();
  v_leak_count    BIGINT;
  v_updated_count BIGINT;
BEGIN
  -- ── Seed two isolated properties with a staff user each ───────────────────
  INSERT INTO properties (id, name)
  VALUES
    (v_prop_a_id, 'S2.3 Property A'),
    (v_prop_b_id, 'S2.3 Property B');

  INSERT INTO hotel_users (property_id, auth_user_id, email, role, status)
  VALUES
    (v_prop_a_id, v_auth_user_a, 's23-a@test.local', 'staff', 'active'),
    (v_prop_b_id, v_auth_user_b, 's23-b@test.local', 'staff', 'active');

  -- ── Seed a service belonging to property B ────────────────────────────────
  INSERT INTO services (id, property_id, name, category)
  VALUES (v_service_b_id, v_prop_b_id, 'S2.3 Service B', 'spa');

  -- ── Simulate an authenticated JWT for property A's staff user ─────────────
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_auth_user_a)::text,
    true
  );
  SET LOCAL ROLE authenticated;

  -- ── 1. Read leak — property A staff must not see property B's service ────
  SELECT COUNT(*) INTO v_leak_count
  FROM services
  WHERE id = v_service_b_id;

  IF v_leak_count > 0 THEN
    RAISE EXCEPTION 'S2.3 FAILED: staff read leaked % row(s) across properties', v_leak_count;
  END IF;

  -- ── 2. Write leak — property A staff must not update property B's service ─
  UPDATE services SET name = 'hacked' WHERE id = v_service_b_id;
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF v_updated_count > 0 THEN
    RAISE EXCEPTION 'S2.3 FAILED: staff write leaked, updated % row(s) across properties', v_updated_count;
  END IF;

  RAISE NOTICE 'S2.3 PASSED: staff write isolation verified for services';
END;
$$;

ROLLBACK;
