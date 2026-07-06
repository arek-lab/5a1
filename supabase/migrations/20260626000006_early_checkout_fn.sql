CREATE OR REPLACE FUNCTION process_early_checkout(p_reservation_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_property_id UUID;
  v_room_id     UUID;
BEGIN
  SELECT property_id, room_id
    INTO v_property_id, v_room_id
    FROM reservations
   WHERE id = p_reservation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reservation_not_found: %', p_reservation_id;
  END IF;

  -- 1. Mark reservation checked out
  UPDATE reservations SET status = 'checked_out' WHERE id = p_reservation_id;

  -- 2. Revoke all sessions tied to this reservation
  UPDATE sessions SET revoked = true
   WHERE reservation_id = p_reservation_id AND revoked = false;

  -- 3. Close the room availability window
  IF v_room_id IS NOT NULL THEN
    UPDATE rooms SET valid_until = now()
     WHERE id = v_room_id AND room_active_reservation_id = p_reservation_id;

    -- 4. Deactivate room QR codes
    UPDATE qr_codes SET is_active = false
     WHERE room_id = v_room_id AND type = 'room';
  END IF;

  -- 5. Audit trail (service_role–only table; SECURITY DEFINER gives access)
  INSERT INTO audit_logs (property_id, event_type, target_id, metadata)
  VALUES (
    v_property_id,
    'early_checkout',
    p_reservation_id,
    jsonb_build_object('reservation_id', p_reservation_id, 'room_id', v_room_id)
  );
END;
$$;
