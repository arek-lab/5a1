-- Fix: generateReceptionQR did UPDATE-deactivate-old + INSERT-new as two separate
-- non-transactional calls. Concurrent rotations (panel auto-rotate timer, manual
-- "rotate now", kiosk self-rotate) can race and leave two simultaneously-active
-- reception QR rows for one property. getActiveReceptionQr's .maybeSingle() then
-- throws PGRST116 ("multiple rows returned"), crashing /qr and /qr/display.

-- 1. Cleanup: keep only the most-recently-created active reception QR per property.
-- Must run before the unique index below, or index creation fails on existing dupes.
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY property_id ORDER BY created_at DESC) AS rn
    FROM qr_codes
   WHERE type = 'reception' AND is_active
)
UPDATE qr_codes
   SET is_active = false
  FROM ranked
 WHERE qr_codes.id = ranked.id AND ranked.rn > 1;

-- 2. Enforce the invariant at the DB level going forward.
CREATE UNIQUE INDEX qr_codes_one_active_reception_per_property
    ON qr_codes (property_id)
 WHERE type = 'reception' AND is_active;

-- 3. Atomic rotate: deactivate + insert in one round trip. On a race that still
-- hits the unique index (two rotations committing concurrently), return the
-- winner's row instead of raising, so the loser observes success, not a crash.
CREATE OR REPLACE FUNCTION rotate_reception_qr(
  p_property_id UUID,
  p_expires_at TIMESTAMPTZ,
  p_rotates_every INTERVAL
)
RETURNS qr_codes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row qr_codes;
BEGIN
  UPDATE qr_codes SET is_active = false
   WHERE property_id = p_property_id AND type = 'reception' AND is_active;

  INSERT INTO qr_codes (property_id, type, expires_at, rotates_every, is_active)
  VALUES (p_property_id, 'reception', p_expires_at, p_rotates_every, true)
  RETURNING * INTO v_row;

  RETURN v_row;
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_row FROM qr_codes
     WHERE property_id = p_property_id AND type = 'reception' AND is_active
     LIMIT 1;
    RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION rotate_reception_qr(UUID, TIMESTAMPTZ, INTERVAL) TO service_role;
