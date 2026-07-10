-- =============================================================================
-- Self-service signup: atomic property + owner creation (S2.8)
-- =============================================================================

CREATE OR REPLACE FUNCTION create_hotel_and_owner(
  p_auth_user_id UUID,
  p_email TEXT,
  p_hotel_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hotel_name   TEXT;
  v_new_property_id UUID;
BEGIN
  v_hotel_name := trim(p_hotel_name);
  IF v_hotel_name = '' THEN
    RAISE EXCEPTION 'invalid_hotel_name: %', p_hotel_name;
  END IF;

  IF EXISTS (SELECT 1 FROM hotel_users WHERE email = p_email) THEN
    RAISE EXCEPTION 'email_taken: %', p_email;
  END IF;

  INSERT INTO properties (name, setup_completed, dpa_signed_at)
  VALUES (v_hotel_name, false, NULL)
  RETURNING id INTO v_new_property_id;

  INSERT INTO hotel_users (property_id, auth_user_id, email, role, status)
  VALUES (v_new_property_id, p_auth_user_id, p_email, 'owner', 'active');

  RETURN v_new_property_id;
END;
$$;
