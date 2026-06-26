-- =============================================================================
-- DoD S0.3 — Custom Access Token Hook claim injection
-- Verifies that custom_access_token_hook injects property_id, session_id, and
-- auth_level into JWT app_metadata; also verifies the fail-closed path for a
-- bare anonymous user with no sessions row.
--
-- Calls the hook function directly — no real sign-in required from psql.
-- Runs inside a single transaction that is always ROLLBACK'd.
--
-- Run:
--   psql "$DATABASE_URL" -f supabase/tests/dod_s0_3_jwt_claims.sql
-- =============================================================================

BEGIN;

-- Bypass FK checks for test fixtures (auth_user_id → auth.users).
-- Transaction-local: resets automatically on ROLLBACK.
SET LOCAL session_replication_role = 'replica';

DO $$
DECLARE
  v_prop_id      UUID := gen_random_uuid();
  v_res_id       UUID := gen_random_uuid();
  v_session_id   UUID := gen_random_uuid();
  v_auth_user_id UUID := gen_random_uuid();
  v_unknown_user UUID := gen_random_uuid();
  v_event        JSONB;
  v_result       JSONB;
  v_claims       JSONB;
BEGIN
  -- ── Seed fixtures ─────────────────────────────────────────────────────────
  INSERT INTO properties (id, name)
  VALUES (v_prop_id, 'DoD S0.3 Property');

  INSERT INTO reservations (id, property_id, check_in, check_out)
  VALUES (v_res_id, v_prop_id, now(), now() + interval '1 day');

  INSERT INTO sessions (id, property_id, reservation_id, auth_user_id, auth_level, expires_at)
  VALUES (v_session_id, v_prop_id, v_res_id, v_auth_user_id, 1, now() + interval '1 hour');

  -- ── Test 1: known user with active session → claims injected ──────────────
  v_event := jsonb_build_object(
    'user_id', v_auth_user_id,
    'claims',  jsonb_build_object(
      'iss',          'https://example.supabase.co/auth/v1',
      'aud',          'authenticated',
      'role',         'anon',
      'app_metadata', '{}'::jsonb
    )
  );

  v_result := public.custom_access_token_hook(v_event);
  v_claims := v_result->'claims';

  ASSERT (v_claims->'app_metadata'->>'property_id')::uuid = v_prop_id,
    format('DOD S0.3 FAILED [T1]: expected property_id=%s, got %s',
           v_prop_id, v_claims->'app_metadata'->>'property_id');

  ASSERT (v_claims->'app_metadata'->>'session_id')::uuid = v_session_id,
    format('DOD S0.3 FAILED [T1]: expected session_id=%s, got %s',
           v_session_id, v_claims->'app_metadata'->>'session_id');

  ASSERT (v_claims->'app_metadata'->>'auth_level')::smallint = 1,
    format('DOD S0.3 FAILED [T1]: expected auth_level=1, got %s',
           v_claims->'app_metadata'->>'auth_level');

  -- Pre-existing claims must not be dropped by the hook
  ASSERT v_claims->>'iss' = 'https://example.supabase.co/auth/v1',
    'DOD S0.3 FAILED [T1]: hook dropped the iss claim';

  -- ── Test 2: unknown user (no sessions row) → fail-closed ──────────────────
  v_event := jsonb_build_object(
    'user_id', v_unknown_user,
    'claims',  jsonb_build_object('app_metadata', '{}'::jsonb)
  );

  v_result := public.custom_access_token_hook(v_event);
  v_claims := v_result->'claims';

  ASSERT (v_claims->'app_metadata'->>'auth_level')::smallint = 0,
    format('DOD S0.3 FAILED [T2]: bare anonymous user should get auth_level=0, got %s',
           v_claims->'app_metadata'->>'auth_level');

  ASSERT v_claims->'app_metadata'->>'property_id' IS NULL,
    'DOD S0.3 FAILED [T2]: bare anonymous user must not receive property_id';

  -- ── Test 3: expired session → fail-closed ────────────────────────────────
  INSERT INTO sessions (id, property_id, reservation_id, auth_user_id, auth_level, expires_at)
  VALUES (gen_random_uuid(), v_prop_id, v_res_id, v_unknown_user, 1, now() - interval '1 second');

  v_event := jsonb_build_object(
    'user_id', v_unknown_user,
    'claims',  jsonb_build_object('app_metadata', '{}'::jsonb)
  );

  v_result := public.custom_access_token_hook(v_event);
  v_claims := v_result->'claims';

  ASSERT (v_claims->'app_metadata'->>'auth_level')::smallint = 0,
    'DOD S0.3 FAILED [T3]: expired session must not inject claims';

  ASSERT v_claims->'app_metadata'->>'property_id' IS NULL,
    'DOD S0.3 FAILED [T3]: expired session must not inject property_id';

  RAISE NOTICE 'DOD S0.3 PASSED';
END;
$$;

ROLLBACK;
