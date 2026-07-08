-- =============================================================================
-- Migration: Narrow hotel_users RLS to owner/admin for mutations (S2.7 p1)
-- =============================================================================
--
-- staff_all_hotel_users (migration 003) grants every active hotel_user of a
-- property full ALL access (SELECT/INSERT/UPDATE/DELETE) to that property's
-- hotel_users rows. That's wider than intended: a viewer/staff account could
-- mutate roles or other users' rows at the DB layer, with app-layer canPerform()
-- as the only guard. This migration keeps SELECT open to every active user
-- (panel needs to list users regardless of role) but restricts INSERT/UPDATE/
-- DELETE to owner/admin.
-- =============================================================================

CREATE OR REPLACE FUNCTION auth_user_admin_property_ids()
  RETURNS SETOF UUID
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
AS $$
  SELECT property_id FROM hotel_users
  WHERE auth_user_id = auth.uid() AND status = 'active' AND role IN ('owner', 'admin')
$$;

REVOKE ALL ON FUNCTION auth_user_admin_property_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_user_admin_property_ids() TO anon, authenticated;

DROP POLICY staff_all_hotel_users ON hotel_users;

CREATE POLICY staff_read_hotel_users ON hotel_users
  FOR SELECT
  USING (property_id IN (SELECT auth_user_property_ids()));

CREATE POLICY staff_insert_hotel_users ON hotel_users
  FOR INSERT
  WITH CHECK (property_id IN (SELECT auth_user_admin_property_ids()));

CREATE POLICY staff_update_hotel_users ON hotel_users
  FOR UPDATE
  USING      (property_id IN (SELECT auth_user_admin_property_ids()))
  WITH CHECK (property_id IN (SELECT auth_user_admin_property_ids()));

CREATE POLICY staff_delete_hotel_users ON hotel_users
  FOR DELETE
  USING (property_id IN (SELECT auth_user_admin_property_ids()));
