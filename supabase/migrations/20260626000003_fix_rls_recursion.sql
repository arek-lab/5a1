-- =============================================================================
-- Migration 003: Fix self-referential RLS recursion on hotel_users
-- Hotel Guest App MVP — S0.2 hotfix
-- =============================================================================
--
-- Root cause: every staff policy joins hotel_users to resolve auth.uid() →
-- property_id. But hotel_users itself has a staff policy that also joins
-- hotel_users, creating an infinite recursion that PostgreSQL detects and
-- rejects (ERROR 42P17).
--
-- Fix: a SECURITY DEFINER function that reads hotel_users as the function
-- owner (bypasses RLS), returning the caller's authorized property IDs.
-- All staff policies are rebuilt to call this function instead of an inline
-- subquery, breaking the recursive cycle.
-- =============================================================================

CREATE OR REPLACE FUNCTION auth_user_property_ids()
  RETURNS SETOF UUID
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
AS $$
  SELECT property_id FROM hotel_users
  WHERE auth_user_id = auth.uid() AND status = 'active'
$$;

-- anon must have EXECUTE so policy evaluation doesn't fail for unauthenticated
-- requests (returns empty set for anon since auth.uid() is NULL)
REVOKE ALL ON FUNCTION auth_user_property_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_user_property_ids() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Rebuild all staff policies using the SECURITY DEFINER function
-- ---------------------------------------------------------------------------

-- hotel_users (the self-referential table — primary fix target)
DROP POLICY staff_all_hotel_users ON hotel_users;
CREATE POLICY staff_all_hotel_users ON hotel_users
  FOR ALL
  USING (property_id IN (SELECT auth_user_property_ids()));

-- reservations
DROP POLICY staff_all_reservations ON reservations;
CREATE POLICY staff_all_reservations ON reservations
  FOR ALL
  USING (property_id IN (SELECT auth_user_property_ids()));

-- rooms
DROP POLICY staff_all_rooms ON rooms;
CREATE POLICY staff_all_rooms ON rooms
  FOR ALL
  USING (property_id IN (SELECT auth_user_property_ids()));

-- qr_codes
DROP POLICY staff_all_qr_codes ON qr_codes;
CREATE POLICY staff_all_qr_codes ON qr_codes
  FOR ALL
  USING (property_id IN (SELECT auth_user_property_ids()));

-- sessions
DROP POLICY staff_all_sessions ON sessions;
CREATE POLICY staff_all_sessions ON sessions
  FOR ALL
  USING (property_id IN (SELECT auth_user_property_ids()));

-- services
DROP POLICY staff_all_services ON services;
CREATE POLICY staff_all_services ON services
  FOR ALL
  USING (property_id IN (SELECT auth_user_property_ids()));

-- orders
DROP POLICY staff_all_orders ON orders;
CREATE POLICY staff_all_orders ON orders
  FOR ALL
  USING (property_id IN (SELECT auth_user_property_ids()));

-- knowledge_chunks
DROP POLICY staff_all_knowledge_chunks ON knowledge_chunks;
CREATE POLICY staff_all_knowledge_chunks ON knowledge_chunks
  FOR ALL
  USING (property_id IN (SELECT auth_user_property_ids()));

-- properties (separate SELECT + UPDATE policies)
DROP POLICY staff_read_own_property ON properties;
CREATE POLICY staff_read_own_property ON properties
  FOR SELECT
  USING (id IN (SELECT auth_user_property_ids()));

DROP POLICY staff_update_own_property ON properties;
CREATE POLICY staff_update_own_property ON properties
  FOR UPDATE
  USING    (id IN (SELECT auth_user_property_ids()))
  WITH CHECK (id IN (SELECT auth_user_property_ids()));
