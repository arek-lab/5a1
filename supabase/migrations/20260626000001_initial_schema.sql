-- =============================================================================
-- Migration 001: ENUMs + Tables + Indexes
-- Hotel Guest App MVP — S0.2
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Section 0: Extensions
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- Section 1: ENUMs
-- ---------------------------------------------------------------------------

CREATE TYPE hotel_role AS ENUM ('owner', 'admin', 'staff', 'viewer');

CREATE TYPE qr_type AS ENUM ('reception', 'room');

CREATE TYPE order_status AS ENUM ('new', 'confirmed', 'fulfilled', 'rejected');

CREATE TYPE reservation_status AS ENUM ('pending', 'checked_in', 'checked_out', 'cancelled');

-- ---------------------------------------------------------------------------
-- Section 2: Tables (FK-safe dependency order)
-- ---------------------------------------------------------------------------

-- ── TENANT ROOT ──────────────────────────────────────────────────────────────
CREATE TABLE properties (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  address          TEXT,
  phone_reception  TEXT,
  logo_url         TEXT,
  timezone         TEXT NOT NULL DEFAULT 'Europe/Warsaw',
  check_in_time    TIME,
  check_out_time   TIME,
  default_locale   TEXT NOT NULL DEFAULT 'pl',
  ai_bot_name      TEXT,
  setup_completed  BOOLEAN NOT NULL DEFAULT false,
  dpa_signed_at    TIMESTAMPTZ,                    -- HITL #11: NULL = DPA not signed; blocks QR generation
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── PANEL USERS ──────────────────────────────────────────────────────────────
CREATE TABLE hotel_users (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id        UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  auth_user_id       UUID REFERENCES auth.users(id),
  email              TEXT NOT NULL,
  full_name          TEXT,
  role               hotel_role NOT NULL DEFAULT 'staff',
  status             TEXT NOT NULL DEFAULT 'invited',   -- 'invited'|'active'|'deactivated'
  invite_token       UUID,
  invite_expires_at  TIMESTAMPTZ,
  last_login_at      TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (property_id, email)
);

-- ── ROOMS (without circular FK — added via ALTER TABLE below) ─────────────────
CREATE TABLE rooms (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  room_number  TEXT NOT NULL,
  room_type    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (property_id, room_number)
);

-- ── RESERVATIONS ─────────────────────────────────────────────────────────────
CREATE TABLE reservations (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id             UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  external_id             TEXT,
  source                  TEXT NOT NULL DEFAULT 'csv',
  guest_first_name        TEXT,
  guest_email             TEXT,
  room_id                 UUID REFERENCES rooms(id),
  check_in                TIMESTAMPTZ NOT NULL,
  check_out               TIMESTAMPTZ NOT NULL,
  status                  reservation_status NOT NULL DEFAULT 'pending',
  invite_token            UUID DEFAULT gen_random_uuid(),
  invite_token_expires_at TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Resolve circular FK: rooms ↔ reservations ────────────────────────────────
ALTER TABLE rooms
  ADD COLUMN room_active_reservation_id UUID REFERENCES reservations(id),
  ADD COLUMN valid_from  TIMESTAMPTZ,
  ADD COLUMN valid_until TIMESTAMPTZ;

-- ── QR CODES ─────────────────────────────────────────────────────────────────
CREATE TABLE qr_codes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id    UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  type           qr_type NOT NULL,
  room_id        UUID REFERENCES rooms(id),
  init_token     UUID NOT NULL DEFAULT gen_random_uuid(),
  rotates_every  INTERVAL,
  expires_at     TIMESTAMPTZ,
  used_at        TIMESTAMPTZ,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── GUEST SESSIONS ───────────────────────────────────────────────────────────
CREATE TABLE sessions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id        UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  reservation_id     UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  room_id            UUID REFERENCES rooms(id),
  auth_user_id       UUID REFERENCES auth.users(id),
  auth_level         SMALLINT NOT NULL DEFAULT 0,
  reception_scan_at  TIMESTAMPTZ,
  room_scan_at       TIMESTAMPTZ,
  device_fingerprint TEXT,
  last_asn           INTEGER,
  expires_at         TIMESTAMPTZ NOT NULL,
  revoked            BOOLEAN NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── SERVICES ─────────────────────────────────────────────────────────────────
CREATE TABLE services (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  template_key    TEXT,
  name            TEXT NOT NULL,
  description     TEXT,
  category        TEXT NOT NULL,
  price_cents     INTEGER,
  currency        TEXT NOT NULL DEFAULT 'PLN',
  image_url       TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  is_pinned       BOOLEAN NOT NULL DEFAULT false,
  available_from  TIME,
  available_to    TIME,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── ORDERS ───────────────────────────────────────────────────────────────────
CREATE TABLE orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  session_id      UUID REFERENCES sessions(id),
  reservation_id  UUID REFERENCES reservations(id),
  room_id         UUID REFERENCES rooms(id),
  service_id      UUID NOT NULL REFERENCES services(id),
  price_cents     INTEGER,
  note            TEXT,
  status          order_status NOT NULL DEFAULT 'new',
  scheduled_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── KNOWLEDGE CHUNKS (AI concierge) ─────────────────────────────────────────
CREATE TABLE knowledge_chunks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  category      TEXT,
  question      TEXT,
  content       TEXT NOT NULL,
  language      TEXT NOT NULL DEFAULT 'pl',
  valid_from    TIMESTAMPTZ,
  valid_until   TIMESTAMPTZ,
  content_hash  TEXT,
  embedding     vector(1536),                     -- HITL #12: column present, stays NULL on MVP
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── AUDIT LOGS (service_role only — no RLS) ──────────────────────────────────
CREATE TABLE audit_logs (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  property_id UUID,
  actor_id    UUID,
  event_type  TEXT NOT NULL,
  target_id   UUID,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── PLATFORM CONFIG (service_role only) ──────────────────────────────────────
CREATE TABLE platform_config (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── JOB QUEUE (service_role only) ────────────────────────────────────────────
CREATE TABLE job_queue (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type    TEXT NOT NULL,
  payload     JSONB,
  property_id UUID,
  status      TEXT NOT NULL DEFAULT 'pending',
  run_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts    INTEGER NOT NULL DEFAULT 0,
  last_error  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Section 3: Indexes
-- ---------------------------------------------------------------------------

-- hotel_users
CREATE INDEX ON hotel_users (property_id);
CREATE INDEX ON hotel_users (property_id, role);

-- reservations
CREATE INDEX ON reservations (property_id);
CREATE INDEX ON reservations (property_id, check_out);
CREATE INDEX ON reservations (invite_token);

-- sessions
CREATE INDEX ON sessions (property_id);
CREATE INDEX ON sessions (reservation_id);
CREATE INDEX ON sessions (expires_at);

-- rooms
CREATE INDEX ON rooms (property_id);
CREATE INDEX ON rooms (property_id, room_number);

-- qr_codes
CREATE INDEX ON qr_codes (property_id);
CREATE INDEX ON qr_codes (property_id, type);
CREATE INDEX ON qr_codes (init_token);

-- services
CREATE INDEX ON services (property_id);
CREATE INDEX ON services (property_id, category, is_active);

-- orders
CREATE INDEX ON orders (property_id);
CREATE INDEX ON orders (property_id, status);
CREATE INDEX ON orders (session_id);

-- knowledge_chunks
CREATE INDEX ON knowledge_chunks (property_id);
CREATE INDEX ON knowledge_chunks (property_id, category);

-- audit_logs
CREATE INDEX ON audit_logs (property_id, created_at);
CREATE INDEX ON audit_logs (actor_id);

-- job_queue
CREATE INDEX ON job_queue (status, run_at);
