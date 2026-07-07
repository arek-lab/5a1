-- =============================================================================
-- S2.4 — Knowledge chunks staff write isolation
-- Verifies that staff_all_knowledge_chunks (auth.uid() + hotel_users join)
-- prevents a staff member of property A from reading, updating, or deleting
-- property B's knowledge_chunks rows. Complements it3_tenant_isolation.sql,
-- which only covers the guest read path (current_setting-based, anon role) —
-- this test covers the staff write path.
--
-- Unlike s2_3_services_staff_isolation.sql, knowledge_chunks supports a real
-- DELETE (no is_active soft-delete column), so this test adds a delete-leak
-- assertion on top of the read/update pattern.
--
-- Runs inside a single transaction that is always ROLLBACK'd — no persistent
-- test data is left in the database.
--
-- Run:
--   psql "$DATABASE_URL" -f supabase/tests/s2_4_knowledge_staff_isolation.sql
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
  v_chunk_b_id    UUID := gen_random_uuid();
  v_leak_count    BIGINT;
  v_updated_count BIGINT;
  v_deleted_count BIGINT;
BEGIN
  -- ── Seed two isolated properties with a staff user each ───────────────────
  INSERT INTO properties (id, name)
  VALUES
    (v_prop_a_id, 'S2.4 Property A'),
    (v_prop_b_id, 'S2.4 Property B');

  INSERT INTO hotel_users (property_id, auth_user_id, email, role, status)
  VALUES
    (v_prop_a_id, v_auth_user_a, 's24-a@test.local', 'staff', 'active'),
    (v_prop_b_id, v_auth_user_b, 's24-b@test.local', 'staff', 'active');

  -- ── Seed a knowledge chunk belonging to property B ─────────────────────────
  INSERT INTO knowledge_chunks (id, property_id, category, question, content)
  VALUES (v_chunk_b_id, v_prop_b_id, 'faq', 'S2.4 Question B', 'S2.4 Content B');

  -- ── Simulate an authenticated JWT for property A's staff user ─────────────
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_auth_user_a)::text,
    true
  );
  SET LOCAL ROLE authenticated;

  -- ── 1. Read leak — property A staff must not see property B's chunk ──────
  SELECT COUNT(*) INTO v_leak_count
  FROM knowledge_chunks
  WHERE id = v_chunk_b_id;

  IF v_leak_count > 0 THEN
    RAISE EXCEPTION 'S2.4 FAILED: staff read leaked % row(s) across properties', v_leak_count;
  END IF;

  -- ── 2. Write leak — property A staff must not update property B's chunk ──
  UPDATE knowledge_chunks SET content = 'hacked' WHERE id = v_chunk_b_id;
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF v_updated_count > 0 THEN
    RAISE EXCEPTION 'S2.4 FAILED: staff write leaked, updated % row(s) across properties', v_updated_count;
  END IF;

  -- ── 3. Delete leak — property A staff must not delete property B's chunk ─
  DELETE FROM knowledge_chunks WHERE id = v_chunk_b_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  IF v_deleted_count > 0 THEN
    RAISE EXCEPTION 'S2.4 FAILED: staff delete leaked, deleted % row(s) across properties', v_deleted_count;
  END IF;

  RAISE NOTICE 'S2.4 PASSED: staff write isolation verified for knowledge_chunks';
END;
$$;

ROLLBACK;
