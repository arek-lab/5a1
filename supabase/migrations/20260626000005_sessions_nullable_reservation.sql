-- Reception scans create sessions before the reservation is known.
-- Room scan handler populates reservation_id + expires_at when room is linked.
ALTER TABLE sessions ALTER COLUMN reservation_id DROP NOT NULL;
