-- =============================================================================
-- Fix: guest_* RLS policies throw on unset app.property_id/app.session_id (S2.8)
-- =============================================================================
-- current_setting('app.*', true) returns '' (not NULL) for a session that never
-- called set_tenant_context, because the custom GUC is pre-declared with an
-- empty default rather than being genuinely unset. Casting '' to uuid raises
-- 22P02 instead of yielding NULL/false, breaking any authenticated (non
-- service-role) query that scans rows outside the caller's own property.
-- NULLIF(..., '') collapses the empty-string case to NULL before the cast.

DROP POLICY guest_read_own_property ON properties;
CREATE POLICY guest_read_own_property ON properties
  FOR SELECT
  USING (id = NULLIF(current_setting('app.property_id', true), '')::uuid);

DROP POLICY guest_read_hotel_users ON hotel_users;
CREATE POLICY guest_read_hotel_users ON hotel_users
  FOR SELECT
  USING (property_id = NULLIF(current_setting('app.property_id', true), '')::uuid);

DROP POLICY guest_read_rooms ON rooms;
CREATE POLICY guest_read_rooms ON rooms
  FOR SELECT
  USING (property_id = NULLIF(current_setting('app.property_id', true), '')::uuid);

DROP POLICY guest_read_qr_codes ON qr_codes;
CREATE POLICY guest_read_qr_codes ON qr_codes
  FOR SELECT
  USING (property_id = NULLIF(current_setting('app.property_id', true), '')::uuid);

DROP POLICY guest_read_services ON services;
CREATE POLICY guest_read_services ON services
  FOR SELECT
  USING (property_id = NULLIF(current_setting('app.property_id', true), '')::uuid);

DROP POLICY guest_read_knowledge_chunks ON knowledge_chunks;
CREATE POLICY guest_read_knowledge_chunks ON knowledge_chunks
  FOR SELECT
  USING (property_id = NULLIF(current_setting('app.property_id', true), '')::uuid);

DROP POLICY guest_read_own_reservation ON reservations;
CREATE POLICY guest_read_own_reservation ON reservations
  FOR SELECT
  USING (
    property_id = NULLIF(current_setting('app.property_id', true), '')::uuid
    AND id = (
      SELECT reservation_id FROM sessions
      WHERE id = NULLIF(current_setting('app.session_id', true), '')::uuid
        AND NOT revoked
      LIMIT 1
    )
  );

DROP POLICY guest_read_own_session ON sessions;
CREATE POLICY guest_read_own_session ON sessions
  FOR SELECT
  USING (id = NULLIF(current_setting('app.session_id', true), '')::uuid);

DROP POLICY guest_read_own_orders ON orders;
CREATE POLICY guest_read_own_orders ON orders
  FOR SELECT
  USING (session_id = NULLIF(current_setting('app.session_id', true), '')::uuid);

DROP POLICY guest_insert_orders ON orders;
CREATE POLICY guest_insert_orders ON orders
  FOR INSERT
  WITH CHECK (
    property_id = NULLIF(current_setting('app.property_id', true), '')::uuid
    AND session_id = NULLIF(current_setting('app.session_id', true), '')::uuid
  );
