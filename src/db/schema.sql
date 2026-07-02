CREATE TABLE IF NOT EXISTS operators (
  operator_id text PRIMARY KEY,
  name text NOT NULL,
  country text NOT NULL CHECK (country IN ('IN', 'DE'))
);

CREATE TABLE IF NOT EXISTS tariffs (
  operator_id text PRIMARY KEY REFERENCES operators(operator_id) ON DELETE CASCADE,
  currency text NOT NULL CHECK (currency IN ('INR', 'EUR')),
  price_per_kwh_minor integer NOT NULL CHECK (price_per_kwh_minor >= 0),
  session_fee_minor integer NOT NULL CHECK (session_fee_minor >= 0)
);

CREATE TABLE IF NOT EXISTS sites (
  site_id text PRIMARY KEY,
  operator_id text NOT NULL REFERENCES operators(operator_id) ON DELETE CASCADE,
  name text NOT NULL,
  address text NOT NULL,
  country text NOT NULL CHECK (country IN ('IN', 'DE')),
  lat double precision,
  lng double precision,
  geocode_status text NOT NULL DEFAULT 'unresolved',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sites_operator_idx ON sites(operator_id);
CREATE INDEX IF NOT EXISTS sites_lat_lng_idx ON sites(lat, lng);

CREATE TABLE IF NOT EXISTS chargers (
  charger_id text PRIMARY KEY,
  site_id text NOT NULL REFERENCES sites(site_id) ON DELETE CASCADE,
  model text NOT NULL,
  max_kw numeric(8, 2) NOT NULL CHECK (max_kw > 0)
);

CREATE INDEX IF NOT EXISTS chargers_site_idx ON chargers(site_id);

CREATE TABLE IF NOT EXISTS connectors (
  charger_id text NOT NULL REFERENCES chargers(charger_id) ON DELETE CASCADE,
  connector_id text NOT NULL,
  status text NOT NULL DEFAULT 'Unknown',
  status_ts timestamptz,
  power_w integer,
  energy_register_wh bigint,
  meter_ts timestamptz,
  fault_code text,
  fault_severity text,
  fault_ts timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (charger_id, connector_id)
);

CREATE INDEX IF NOT EXISTS connectors_status_idx ON connectors(status);
CREATE INDEX IF NOT EXISTS connectors_status_ts_idx ON connectors(status_ts);

CREATE TABLE IF NOT EXISTS raw_events (
  event_hash text PRIMARY KEY,
  source text NOT NULL CHECK (source IN ('poll', 'webhook', 'fixture')),
  delivery_id text,
  event_type text NOT NULL,
  charger_id text NOT NULL,
  connector_id text NOT NULL,
  vendor_ts timestamptz NOT NULL,
  vendor_ts_raw text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS raw_events_vendor_ts_idx ON raw_events(vendor_ts);
CREATE INDEX IF NOT EXISTS raw_events_charger_idx ON raw_events(charger_id, connector_id);

CREATE TABLE IF NOT EXISTS sessions (
  session_id text PRIMARY KEY,
  charger_id text NOT NULL,
  connector_id text NOT NULL,
  start_meter_wh bigint,
  stop_meter_wh bigint,
  started_at timestamptz,
  stopped_at timestamptz,
  energy_wh bigint,
  billing_status text NOT NULL DEFAULT 'incomplete',
  currency text,
  amount_minor integer,
  anomaly_reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_charger_idx ON sessions(charger_id, connector_id);
CREATE INDEX IF NOT EXISTS sessions_stopped_at_idx ON sessions(stopped_at);

CREATE TABLE IF NOT EXISTS ingestion_dead_letters (
  id bigserial PRIMARY KEY,
  source text NOT NULL,
  delivery_id text,
  reason text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS poll_state (
  site_id text PRIMARY KEY REFERENCES sites(site_id) ON DELETE CASCADE,
  since_ts timestamptz,
  cursor text,
  last_success_at timestamptz,
  next_allowed_poll_at timestamptz
);
