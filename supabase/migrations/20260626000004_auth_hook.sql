-- Add missing index: sessions.auth_user_id is queried on every JWT mint/refresh by the hook
CREATE INDEX IF NOT EXISTS sessions_auth_user_id_idx ON sessions (auth_user_id);

-- Custom Access Token Hook: injects property_id, session_id, auth_level into JWT app_metadata
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
  v_claims  := event->'claims';

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

-- Grant execute to supabase_auth_admin (required for hook registration); deny all others
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC, anon, authenticated;
