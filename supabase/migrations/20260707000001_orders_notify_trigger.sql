-- S2.6: NOTIFY trigger for live order updates (panel SSE fan-out).
-- Channel is global (not per-property); property_id filtering happens in the
-- application listener fan-out, not in Postgres.
CREATE OR REPLACE FUNCTION notify_order_change() RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('orders_changed', row_to_json(NEW)::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_notify_change
  AFTER INSERT OR UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION notify_order_change();
