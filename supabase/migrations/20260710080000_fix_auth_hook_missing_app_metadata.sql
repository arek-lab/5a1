-- Hotfix for bug in custom_access_token_hook (introduced in 20260626000004_auth_hook.sql, session s0-3).
-- Discovered during s3-1 manual verification: real GoTrue events for anonymous sign-in omit the
-- `app_metadata` key entirely (rather than sending `{}`). jsonb_set with a multi-element path
-- ('{app_metadata,property_id}') silently no-ops when an intermediate path element ('app_metadata')
-- is missing -- it only auto-creates the *last* path element, not intermediate objects. So the hook
-- ran without error and returned 200, but claims were never injected into the issued JWT.
-- Fix: ensure `app_metadata` exists as an object before any nested jsonb_set call.
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_property_id  uuid;
  v_session_id   uuid;
  v_auth_level   smallint;
  v_user_id      uuid;
  v_claims       jsonb;
BEGIN
  v_user_id := (event->>'user_id')::uuid;
  v_claims  := coalesce(event->'claims', '{}'::jsonb);

  v_claims := jsonb_set(v_claims, '{app_metadata}', coalesce(v_claims->'app_metadata', '{}'::jsonb));

  SELECT s.property_id, s.id, s.auth_level
    INTO v_property_id, v_session_id, v_auth_level
    FROM sessions s
   WHERE s.auth_user_id = v_user_id
     AND NOT s.revoked
     AND s.expires_at > now()
   ORDER BY s.created_at DESC
   LIMIT 1;

  IF v_property_id IS NOT NULL THEN
    v_claims := jsonb_set(v_claims, '{app_metadata,property_id}', to_jsonb(v_property_id));
    v_claims := jsonb_set(v_claims, '{app_metadata,session_id}',  to_jsonb(v_session_id));
    v_claims := jsonb_set(v_claims, '{app_metadata,auth_level}',  to_jsonb(v_auth_level));
  ELSE
    v_claims := jsonb_set(v_claims, '{app_metadata,auth_level}',  to_jsonb(0::smallint));
  END IF;

  RETURN jsonb_set(event, '{claims}', v_claims);
END;
$$;
