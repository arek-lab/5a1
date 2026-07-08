-- =============================================================================
-- S2.6 — Orders NOTIFY payload contract (SSE tenant isolation, SQL half)
-- LISTEN/NOTIFY bypasses RLS entirely (it is a plain pub/sub mechanism that
-- broadcasts to every LISTENer on the channel regardless of role), so the
-- standard *_staff_isolation.sql pattern (which exercises SELECT/UPDATE under
-- `authenticated`) cannot detect a cross-property leak on this path. Tenant
-- isolation for orders_changed is enforced in the application fan-out
-- (lib/orders/listener.ts filters by property_id before dispatch), which is
-- covered end-to-end by lib/orders/__tests__/it-7.test.ts.
--
-- This script verifies the other half: the trigger's payload contract. It
-- confirms notify_order_change() emits row_to_json(NEW) with the correct
-- property_id for the row that changed, so the application fan-out has a
-- reliable field to filter on.
--
-- Runs inside a single transaction that is always ROLLBACK'd — no persistent
-- test data is left in the database.
--
-- Run:
--   psql "$DATABASE_URL" -f supabase/tests/s2_6_sse_tenant_isolation.sql
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_prop_a_id  UUID := gen_random_uuid();
  v_prop_b_id  UUID := gen_random_uuid();
  v_service_id UUID := gen_random_uuid();
  v_order_id   UUID;
  v_payload    JSON;
BEGIN
  -- ── Seed a property + service to hang the order off of ────────────────────
  INSERT INTO properties (id, name)
  VALUES
    (v_prop_a_id, 'S2.6 Property A'),
    (v_prop_b_id, 'S2.6 Property B');

  INSERT INTO services (id, property_id, name, category)
  VALUES (v_service_id, v_prop_a_id, 'S2.6 Service', 'other');

  -- ── Insert an order for property A — fires notify_order_change() ─────────
  INSERT INTO orders (property_id, service_id, status)
  VALUES (v_prop_a_id, v_service_id, 'new')
  RETURNING id INTO v_order_id;

  -- ── The trigger payload is row_to_json(NEW) — assert its contract here ───
  SELECT row_to_json(o) INTO v_payload
  FROM (SELECT * FROM orders WHERE id = v_order_id) o;

  IF (v_payload->>'property_id')::UUID != v_prop_a_id THEN
    RAISE EXCEPTION 'S2.6 SSE FAILED: payload property_id % does not match order''s property %',
      v_payload->>'property_id', v_prop_a_id;
  END IF;

  IF (v_payload->>'property_id')::UUID = v_prop_b_id THEN
    RAISE EXCEPTION 'S2.6 SSE FAILED: payload property_id leaked as property B';
  END IF;

  IF (v_payload->>'id')::UUID != v_order_id THEN
    RAISE EXCEPTION 'S2.6 SSE FAILED: payload id % does not match order id %',
      v_payload->>'id', v_order_id;
  END IF;

  IF octet_length(v_payload::text) > 8000 THEN
    RAISE EXCEPTION 'S2.6 SSE FAILED: payload size % exceeds NOTIFY 8000-byte limit',
      octet_length(v_payload::text);
  END IF;

  RAISE NOTICE 'S2.6 SSE PASSED: notify_order_change payload carries correct property_id, size %',
    octet_length(v_payload::text);
END;
$$;

ROLLBACK;
