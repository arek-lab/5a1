-- =============================================================================
-- S3.3 — Guest orders SSE payload contract (session isolation, SQL half)
-- Same rationale as s2_6_sse_tenant_isolation.sql: LISTEN/NOTIFY bypasses RLS
-- entirely, so the standard *_staff_isolation.sql pattern cannot detect a
-- cross-session leak on this path. Session isolation for the guest SSE route
-- is enforced in the application fan-out (app/api/orders/stream/guest/route.ts
-- filters by session_id before enqueue), covered end-to-end by
-- lib/orders/__tests__/it-guest-sse.test.ts.
--
-- This script verifies the other half: the trigger's payload contract carries
-- session_id, so the application fan-out has a reliable field to filter on.
--
-- Runs inside a single transaction that is always ROLLBACK'd — no persistent
-- test data is left in the database.
--
-- Run:
--   psql "$DATABASE_URL" -f supabase/tests/s3_3_guest_orders_sse_isolation.sql
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_prop_id       UUID := gen_random_uuid();
  v_service_id    UUID := gen_random_uuid();
  v_session_a_id  UUID := gen_random_uuid();
  v_session_b_id  UUID := gen_random_uuid();
  v_order_id      UUID;
  v_payload       JSON;
BEGIN
  -- ── Seed a property + service + two guest sessions of the same property ──
  INSERT INTO properties (id, name)
  VALUES (v_prop_id, 'S3.3 Property');

  INSERT INTO services (id, property_id, name, category)
  VALUES (v_service_id, v_prop_id, 'S3.3 Service', 'other');

  INSERT INTO sessions (id, property_id, auth_level, expires_at)
  VALUES
    (v_session_a_id, v_prop_id, 1, now() + interval '1 hour'),
    (v_session_b_id, v_prop_id, 1, now() + interval '1 hour');

  -- ── Insert an order for session A — fires notify_order_change() ─────────
  INSERT INTO orders (property_id, service_id, session_id, status)
  VALUES (v_prop_id, v_service_id, v_session_a_id, 'new')
  RETURNING id INTO v_order_id;

  -- ── The trigger payload is row_to_json(NEW) — assert its contract here ───
  SELECT row_to_json(o) INTO v_payload
  FROM (SELECT * FROM orders WHERE id = v_order_id) o;

  IF (v_payload->>'session_id')::UUID != v_session_a_id THEN
    RAISE EXCEPTION 'S3.3 SSE FAILED: payload session_id % does not match order''s session %',
      v_payload->>'session_id', v_session_a_id;
  END IF;

  IF (v_payload->>'session_id')::UUID = v_session_b_id THEN
    RAISE EXCEPTION 'S3.3 SSE FAILED: payload session_id leaked as session B';
  END IF;

  IF (v_payload->>'id')::UUID != v_order_id THEN
    RAISE EXCEPTION 'S3.3 SSE FAILED: payload id % does not match order id %',
      v_payload->>'id', v_order_id;
  END IF;

  RAISE NOTICE 'S3.3 PASSED: notify_order_change payload carries correct session_id';
END;
$$;

ROLLBACK;
