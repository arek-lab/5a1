CREATE OR REPLACE FUNCTION transfer_hotel_ownership(
  p_property_id UUID,
  p_current_owner_id UUID,
  p_new_owner_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_role TEXT;
  v_new_status   TEXT;
BEGIN
  SELECT role INTO v_current_role
    FROM hotel_users
   WHERE id = p_current_owner_id AND property_id = p_property_id;

  IF NOT FOUND OR v_current_role <> 'owner' THEN
    RAISE EXCEPTION 'not_current_owner: %', p_current_owner_id;
  END IF;

  SELECT status INTO v_new_status
    FROM hotel_users
   WHERE id = p_new_owner_id AND property_id = p_property_id;

  IF NOT FOUND OR v_new_status <> 'active' THEN
    RAISE EXCEPTION 'target_not_active: %', p_new_owner_id;
  END IF;

  UPDATE hotel_users SET role = 'admin' WHERE id = p_current_owner_id;
  UPDATE hotel_users SET role = 'owner' WHERE id = p_new_owner_id;
END;
$$;
