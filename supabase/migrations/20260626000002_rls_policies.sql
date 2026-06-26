-- =============================================================================
-- Migration 002: RLS Policies + set_tenant_context Function
-- Hotel Guest App MVP — S0.2
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Section 1: set_tenant_context helper function
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_tenant_context(
  p_property_id uuid,
  p_session_id  uuid DEFAULT NULL
) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
BEGIN
  -- is_local=true: scopes to current transaction only (Supavisor transaction-mode safety)
  PERFORM set_config('app.property_id', p_property_id::text, true);
  IF p_session_id IS NOT NULL THEN
    PERFORM set_config('app.session_id', p_session_id::text, true);
  END IF;
END;
$$;

-- Restrict to service_role only: anon/authenticated must never call this directly
REVOKE ALL ON FUNCTION set_tenant_context(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_tenant_context(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Section 2: Enable RLS on 9 tenant tables
-- ---------------------------------------------------------------------------

ALTER TABLE properties       ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_users      ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms            ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_codes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE services         ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Section 3: Guest isolation policies (current_setting pattern)
-- ---------------------------------------------------------------------------

-- properties: guest reads only their own property
CREATE POLICY guest_read_own_property ON properties
  FOR SELECT
  USING (id = current_setting('app.property_id', true)::uuid);

-- hotel_users: guest reads hotel users of their property
CREATE POLICY guest_read_hotel_users ON hotel_users
  FOR SELECT
  USING (property_id = current_setting('app.property_id', true)::uuid);

-- rooms: guest reads rooms of their property
CREATE POLICY guest_read_rooms ON rooms
  FOR SELECT
  USING (property_id = current_setting('app.property_id', true)::uuid);

-- qr_codes: guest reads QR codes of their property
CREATE POLICY guest_read_qr_codes ON qr_codes
  FOR SELECT
  USING (property_id = current_setting('app.property_id', true)::uuid);

-- services: guest reads services of their property
CREATE POLICY guest_read_services ON services
  FOR SELECT
  USING (property_id = current_setting('app.property_id', true)::uuid);

-- knowledge_chunks: guest reads knowledge of their property
CREATE POLICY guest_read_knowledge_chunks ON knowledge_chunks
  FOR SELECT
  USING (property_id = current_setting('app.property_id', true)::uuid);

-- reservations: guest reads only their own reservation (via session binding)
CREATE POLICY guest_read_own_reservation ON reservations
  FOR SELECT
  USING (
    property_id = current_setting('app.property_id', true)::uuid
    AND id = (
      SELECT reservation_id FROM sessions
      WHERE id = current_setting('app.session_id', true)::uuid
        AND NOT revoked
      LIMIT 1
    )
  );

-- sessions: guest reads only their own session
CREATE POLICY guest_read_own_session ON sessions
  FOR SELECT
  USING (id = current_setting('app.session_id', true)::uuid);

-- orders: guest reads own orders (by session) and can insert for their session
CREATE POLICY guest_read_own_orders ON orders
  FOR SELECT
  USING (session_id = current_setting('app.session_id', true)::uuid);

CREATE POLICY guest_insert_orders ON orders
  FOR INSERT
  WITH CHECK (
    property_id = current_setting('app.property_id', true)::uuid
    AND session_id = current_setting('app.session_id', true)::uuid
  );

-- ---------------------------------------------------------------------------
-- Section 4: Staff management policies (auth.uid() + hotel_users join)
-- ---------------------------------------------------------------------------

-- hotel_users: staff manages users of their own property
CREATE POLICY staff_all_hotel_users ON hotel_users
  FOR ALL
  USING (
    property_id IN (
      SELECT property_id FROM hotel_users
      WHERE auth_user_id = auth.uid() AND status = 'active'
    )
  );

-- reservations: staff manages reservations of their property
CREATE POLICY staff_all_reservations ON reservations
  FOR ALL
  USING (
    property_id IN (
      SELECT property_id FROM hotel_users
      WHERE auth_user_id = auth.uid() AND status = 'active'
    )
  );

-- rooms: staff manages rooms of their property
CREATE POLICY staff_all_rooms ON rooms
  FOR ALL
  USING (
    property_id IN (
      SELECT property_id FROM hotel_users
      WHERE auth_user_id = auth.uid() AND status = 'active'
    )
  );

-- qr_codes: staff manages QR codes of their property
CREATE POLICY staff_all_qr_codes ON qr_codes
  FOR ALL
  USING (
    property_id IN (
      SELECT property_id FROM hotel_users
      WHERE auth_user_id = auth.uid() AND status = 'active'
    )
  );

-- sessions: staff manages sessions of their property
CREATE POLICY staff_all_sessions ON sessions
  FOR ALL
  USING (
    property_id IN (
      SELECT property_id FROM hotel_users
      WHERE auth_user_id = auth.uid() AND status = 'active'
    )
  );

-- services: staff manages services of their property
CREATE POLICY staff_all_services ON services
  FOR ALL
  USING (
    property_id IN (
      SELECT property_id FROM hotel_users
      WHERE auth_user_id = auth.uid() AND status = 'active'
    )
  );

-- orders: staff manages orders of their property
CREATE POLICY staff_all_orders ON orders
  FOR ALL
  USING (
    property_id IN (
      SELECT property_id FROM hotel_users
      WHERE auth_user_id = auth.uid() AND status = 'active'
    )
  );

-- knowledge_chunks: staff manages knowledge of their property
CREATE POLICY staff_all_knowledge_chunks ON knowledge_chunks
  FOR ALL
  USING (
    property_id IN (
      SELECT property_id FROM hotel_users
      WHERE auth_user_id = auth.uid() AND status = 'active'
    )
  );

-- properties: staff can read and update their own property record
CREATE POLICY staff_read_own_property ON properties
  FOR SELECT
  USING (
    id IN (
      SELECT property_id FROM hotel_users
      WHERE auth_user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY staff_update_own_property ON properties
  FOR UPDATE
  USING (
    id IN (
      SELECT property_id FROM hotel_users
      WHERE auth_user_id = auth.uid() AND status = 'active'
    )
  )
  WITH CHECK (
    id IN (
      SELECT property_id FROM hotel_users
      WHERE auth_user_id = auth.uid() AND status = 'active'
    )
  );

-- ---------------------------------------------------------------------------
-- Section 5: Platform table access restriction (service_role only)
-- ---------------------------------------------------------------------------

REVOKE ALL ON audit_logs    FROM anon, authenticated;
REVOKE ALL ON platform_config FROM anon, authenticated;
REVOKE ALL ON job_queue     FROM anon, authenticated;

-- Belt-and-suspenders: no truncation by app roles on any public table
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
