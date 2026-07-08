-- Allow sessions to be hard-deleted by the retention sweep without breaking
-- 5-year order retention: orders.session_id must survive session deletion.
ALTER TABLE orders DROP CONSTRAINT orders_session_id_fkey;
ALTER TABLE orders
  ADD CONSTRAINT orders_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL;
