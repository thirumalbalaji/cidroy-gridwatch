CREATE EXTENSION IF NOT EXISTS timescaledb;

SELECT create_hypertable('connector_meter_values', by_range('ts'), if_not_exists => TRUE);
SELECT create_hypertable('connector_status_events', by_range('ts'), if_not_exists => TRUE);
