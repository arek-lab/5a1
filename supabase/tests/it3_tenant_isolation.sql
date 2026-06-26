-- =============================================================================
-- IT-3 Tenant Isolation Test
-- Verifies that a session scoped to property A cannot read property B's rows
-- across all 9 RLS-enabled tenant tables.
--
-- Runs inside a single transaction that is always ROLLBACK'd — no persistent
-- test data is left in the database.
--
-- Run:
--   psql "postgresql://postgres.<password>@db.<project-ref>.supabase.co:5432/postgres" \
--     -f supabase/tests/it3_tenant_isolation.sql
-- =============================================================================

BEGIN;

DO $$
DECLARE
  prop_a_id    UUID := gen_random_uuid();
  prop_b_id    UUID := gen_random_uuid();
  room_b_id    UUID := gen_random_uuid();
  res_b_id     UUID := gen_random_uuid();
  session_b_id UUID := gen_random_uuid();
  service_b_id UUID := gen_random_uuid();
  session_a_id UUID := gen_random_uuid();
  leak_count   BIGINT;
BEGIN
  -- ── Seed two isolated properties ──────────────────────────────────────────
  INSERT INTO properties (id, name)
  VALUES
    (prop_a_id, 'IT3 Property A'),
    (prop_b_id, 'IT3 Property B');

  -- ── Seed one row per tenant table belonging to property B ─────────────────
  -- hotel_users
  INSERT INTO hotel_users (property_id, email, role, status)
  VALUES (prop_b_id, 'it3@b.test', 'staff', 'active');

  -- rooms (no room_active_reservation_id yet — circular FK is nullable)
  INSERT INTO rooms (id, property_id, room_number)
  VALUES (room_b_id, prop_b_id, 'B101');

  -- reservations (room_id nullable — set at check-in)
  INSERT INTO reservations (id, property_id, check_in, check_out)
  VALUES (res_b_id, prop_b_id, now(), now() + interval '1 day');

  -- qr_codes
  INSERT INTO qr_codes (property_id, type)
  VALUES (prop_b_id, 'reception');

  -- sessions (reservation_id NOT NULL)
  INSERT INTO sessions (id, property_id, reservation_id, expires_at)
  VALUES (session_b_id, prop_b_id, res_b_id, now() + interval '1 hour');

  -- services
  INSERT INTO services (id, property_id, name, category)
  VALUES (service_b_id, prop_b_id, 'IT3 Service', 'food');

  -- orders (service_id NOT NULL; session_id → property B's session)
  INSERT INTO orders (property_id, service_id, session_id)
  VALUES (prop_b_id, service_b_id, session_b_id);

  -- knowledge_chunks
  INSERT INTO knowledge_chunks (property_id, content)
  VALUES (prop_b_id, 'IT3 test content');

  -- ── Set tenant context to property A BEFORE switching role ─────────────────
  -- is_local=false: session scope survives the SET LOCAL ROLE switch below.
  PERFORM set_config('app.property_id', prop_a_id::text, false);
  PERFORM set_config('app.session_id',  session_a_id::text, false);

  -- ── Engage RLS by switching to the anon role ───────────────────────────────
  EXECUTE 'SET LOCAL ROLE anon';

  -- ── 1. properties — policy: id = app.property_id ──────────────────────────
  EXECUTE format(
    'SELECT COUNT(*) FROM properties WHERE id = %L', prop_b_id
  ) INTO leak_count;
  IF leak_count > 0 THEN
    RAISE EXCEPTION 'IT-3 FAILED: properties leaked % row(s)', leak_count;
  END IF;

  -- ── 2. hotel_users — policy: property_id = app.property_id ───────────────
  EXECUTE format(
    'SELECT COUNT(*) FROM hotel_users WHERE property_id = %L', prop_b_id
  ) INTO leak_count;
  IF leak_count > 0 THEN
    RAISE EXCEPTION 'IT-3 FAILED: hotel_users leaked % row(s)', leak_count;
  END IF;

  -- ── 3. rooms — policy: property_id = app.property_id ─────────────────────
  EXECUTE format(
    'SELECT COUNT(*) FROM rooms WHERE property_id = %L', prop_b_id
  ) INTO leak_count;
  IF leak_count > 0 THEN
    RAISE EXCEPTION 'IT-3 FAILED: rooms leaked % row(s)', leak_count;
  END IF;

  -- ── 4. reservations — policy: property_id + session reservation binding ───
  EXECUTE format(
    'SELECT COUNT(*) FROM reservations WHERE property_id = %L', prop_b_id
  ) INTO leak_count;
  IF leak_count > 0 THEN
    RAISE EXCEPTION 'IT-3 FAILED: reservations leaked % row(s)', leak_count;
  END IF;

  -- ── 5. qr_codes — policy: property_id = app.property_id ──────────────────
  EXECUTE format(
    'SELECT COUNT(*) FROM qr_codes WHERE property_id = %L', prop_b_id
  ) INTO leak_count;
  IF leak_count > 0 THEN
    RAISE EXCEPTION 'IT-3 FAILED: qr_codes leaked % row(s)', leak_count;
  END IF;

  -- ── 6. sessions — policy: id = app.session_id ────────────────────────────
  EXECUTE format(
    'SELECT COUNT(*) FROM sessions WHERE property_id = %L', prop_b_id
  ) INTO leak_count;
  IF leak_count > 0 THEN
    RAISE EXCEPTION 'IT-3 FAILED: sessions leaked % row(s)', leak_count;
  END IF;

  -- ── 7. services — policy: property_id = app.property_id ──────────────────
  EXECUTE format(
    'SELECT COUNT(*) FROM services WHERE property_id = %L', prop_b_id
  ) INTO leak_count;
  IF leak_count > 0 THEN
    RAISE EXCEPTION 'IT-3 FAILED: services leaked % row(s)', leak_count;
  END IF;

  -- ── 8. orders — policy: session_id = app.session_id ─────────────────────
  EXECUTE format(
    'SELECT COUNT(*) FROM orders WHERE property_id = %L', prop_b_id
  ) INTO leak_count;
  IF leak_count > 0 THEN
    RAISE EXCEPTION 'IT-3 FAILED: orders leaked % row(s)', leak_count;
  END IF;

  -- ── 9. knowledge_chunks — policy: property_id = app.property_id ──────────
  EXECUTE format(
    'SELECT COUNT(*) FROM knowledge_chunks WHERE property_id = %L', prop_b_id
  ) INTO leak_count;
  IF leak_count > 0 THEN
    RAISE EXCEPTION 'IT-3 FAILED: knowledge_chunks leaked % row(s)', leak_count;
  END IF;

  RAISE NOTICE 'IT-3 PASSED: tenant isolation verified across 9 tables';
END;
$$;

ROLLBACK;
