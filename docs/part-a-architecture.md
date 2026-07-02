# Part A - GridWatch Architecture

## Executive Summary

GridWatch should be built as an event-driven, multi-tenant monitoring platform whose source of truth starts at the CSMS boundary. The product risk is not CRUD; it is correctness and freshness when the upstream vendor gives us rate-limited polling, best-effort webhooks, at-least-once delivery, out-of-order batches, local timestamps, cumulative meter registers, and no coordinates.

The production architecture I would choose:

- Webhook-first ingestion with poll as reconciliation/backfill.
- Kafka or Redpanda as the durable event log.
- Idempotent normalizers/processors that write raw events, current state, sessions, and dead letters.
- PostgreSQL + PostGIS for tenant hierarchy, geospatial data, current operational state, and settlement records.
- TimescaleDB hypertables for high-volume telemetry history.
- Redis only for derived live caches and fan-out state, not as source of truth.
- Dashboard APIs backed by current-state tables/materialized rollups plus WebSocket/SSE fan-out.
- A dedicated geocoding/enrichment workflow because the vendor feed has addresses but no coordinates.

## Key Assumptions And Tensions

- A "charger" in the scale statement means EVSE; many have multiple connectors. Capacity sizing uses connector telemetry where relevant.
- Vendor timestamps include offsets and are normalized to UTC at ingestion. The original timestamp string is retained for audit.
- The current vendor contract cannot prove the stated freshness KPIs from charger event time, because webhooks can batch up to 60 seconds and polling is limited to 30 seconds per site. We can meet freshness from "arrival at GridWatch" with the architecture below, but not from "event occurred at charger" without a stricter vendor push SLA.
- Geocoding must be explicit, cached, auditable, and reviewable. Guessing coordinates at request time is not acceptable.

## End-To-End Data Flow

1. CSMS sends webhook batches to `ingestion-api`.
2. `ingestion-api` validates HMAC, records receipt time, acknowledges quickly, and appends each event to the event log.
3. Poll workers run per-site reconciliation at the documented minimum interval. They respect `429 Retry-After`, retry transient `500`s, and keep a per-site high-water mark plus overlap window because the API may repeat events.
4. Normalizer workers parse events, validate schema, normalize status/timestamps/units, compute a stable idempotency key, and write malformed records to a dead-letter queue.
5. State processors update:
   - Raw immutable event store.
   - Connector current state.
   - Session state and settlement candidates.
   - Fault/alert tables.
   - Telemetry hypertables.
6. Dashboard API reads current-state and rollup tables; streaming updates are pushed through WebSocket/SSE.
7. GIS API reads PostGIS and precomputed spatial aggregates for map markers, nearest charger, and density/coverage analytics.

## Storage Design

Core relational model:

```sql
operators(operator_id, name, country)
sites(site_id, operator_id, name, address, country, geom geography(Point,4326), geocode_status)
chargers(charger_id, site_id, model, max_kw)
connectors(charger_id, connector_id, status, status_ts, power_w, energy_register_wh, meter_ts)
sessions(session_id, charger_id, connector_id, start_meter_wh, stop_meter_wh, started_at, stopped_at, energy_wh, billing_status)
tariffs(operator_id, currency, price_per_kwh_minor, session_fee_minor)
raw_events(event_hash, source, delivery_id, event_type, vendor_ts, received_at, payload)
ingestion_dead_letters(id, source, reason, payload, received_at)
```

Telemetry history should not be one unpartitioned table. I would use TimescaleDB hypertables partitioned by time and optionally space-partitioned by operator/charger hash:

```sql
connector_meter_values(operator_id, charger_id, connector_id, ts, energy_register_wh, power_w)
connector_status_events(operator_id, charger_id, connector_id, ts, status)
fault_events(operator_id, charger_id, connector_id, ts, code, severity)
```

Retention:

- Raw vendor payloads: 30-90 days hot, then archive to object storage if required.
- Normalized meter/status telemetry: 13 months hot/warm with Timescale compression.
- Current state/session/settlement: relational source of truth retained per business/legal policy.

## GIS Architecture

Vendor data has address strings only, so geocoding is an enrichment pipeline:

1. Store vendor address exactly.
2. Resolve through a geocoder provider or internal gazetteer.
3. Cache the result with provider, confidence, normalized address, and timestamp.
4. Mark low-confidence or missing coordinates for manual review.
5. Store final coordinates in PostGIS as `geography(Point,4326)`.

Spatial operations:

- Map markers: query tenant-scoped sites with current rollup status and coordinates.
- Nearest available charger: PostGIS KNN prefilter plus `ST_Distance` on geography.
- Region queries: administrative boundary polygons in PostGIS, joined by `ST_Intersects`.
- Density/coverage: H3 or geohash materialized aggregates, refreshed incrementally as site/charger inventory changes.
- Large map views: vector tiles or clustered endpoints instead of returning every marker on every refresh.

## Freshness KPIs

GridWatch can control latency after event arrival, but not upstream batching delay.

| Signal | Target | Feasibility |
|---|---:|---|
| Connector/charger status < 5s P99.9 | Achievable after webhook receipt | Not guaranteed from charger event time because webhook may batch 60s |
| Active session power/energy < 10s P99.9 | Achievable after receipt | Polling alone cannot meet this with 30s minimum interval |
| Fault/alarm < 5s P99.9 | Requires push SLA | Best-effort batched webhooks violate contractual target |
| Dashboard tile freshness < 2s P99.9 | Achievable from current-state tables/cache | Depends on ingestion already receiving the event |
| Map live-status update < 10s P95 | Achievable with stream fan-out | Upstream batching can still make event-time freshness miss |

Mitigations:

- Contractually define dashboard freshness as both `event_ts -> visible` and `gridwatch_received_at -> visible`.
- Require vendor critical-event webhook SLA for status/faults, or a streaming integration such as MQTT/Kafka bridge.
- Show stale markers when connector state exceeds freshness budget.
- Measure and report vendor lag separately from GridWatch processing lag.

## HA, Failover, RPO/RTO

Production baseline:

- Ingestion API: stateless, 3+ replicas across availability zones.
- Event log: 3 brokers, replication factor 3, min ISR 2.
- PostgreSQL/PostGIS/Timescale: managed multi-AZ primary with synchronous or semi-synchronous commit for critical operational tables if RPO 0 is mandatory; async read replicas for analytics.
- Redis: clustered or managed HA, but treated as disposable derived state.
- Workers: horizontally scalable consumer groups.

Targets:

- RPO: 0 for accepted events after they are committed to Kafka and replicated to min ISR. Near-zero for database state because it can be replayed from the event log.
- RTO: 5-15 minutes for regional AZ failure with automated failover; longer for full-region DR depending on cross-region replication.

Component failure behavior:

- Ingestion API dies before Kafka commit: webhook is not acknowledged; CSMS redelivers.
- Worker dies mid-batch: Kafka offset is not committed; events replay idempotently.
- Database primary dies: fail over; consumers pause/retry; replay from Kafka covers missed state updates.
- Redis dies: dashboard may temporarily lose push cache; API rebuilds current state from Postgres.

## Capacity Sizing

Telemetry rate:

- 50,000 chargers / 10 seconds = 5,000 charger readings/sec.
- If average 1.5 connectors per charger, connector-level telemetry can be closer to 7,500 events/sec.
- Webhook batching can create burst rates above the average; provision for 3-5x bursts.

Storage rough order:

- 5,000 events/sec * 86,400 sec/day = 432M events/day.
- At 300-700 bytes normalized, telemetry is roughly 130-300 GB/day before indexes/compression.
- At 2 KB raw JSON, raw payload retention would be ~864 GB/day; raw indefinite retention is not sensible.
- Timescale compression can reduce older telemetry materially, but retention and archive policy are still required.

Compute starting point:

- Ingestion API: 3 replicas, 2 vCPU/4 GB each.
- Workers: separate autoscaled pools for status, meter/session, settlement, and geocoding.
- Kafka/Redpanda: 3 broker cluster sized for sustained 10-20 MB/sec plus burst.
- Postgres/Timescale: start at 8-16 vCPU, 64 GB RAM, provisioned IOPS, partitioning/compression enabled. Tune after load test.

## Security And Multi-Tenant Isolation

- OIDC/OAuth2 via Keycloak or managed IdP.
- Tenant identity comes from auth claims, never from a trusted frontend query parameter.
- Server-side tenant scoping in every query.
- PostgreSQL row-level security for defense in depth on tenant-scoped tables.
- Vendor webhook HMAC validation, secret rotation, replay window, and IP allowlisting where possible.
- TLS everywhere, encryption at rest, least-privilege DB users.
- Audit logs for operator access, settlement changes, geocode overrides, and admin actions.

## Observability

To prove freshness KPIs, every event carries:

- `vendor_ts`
- `gridwatch_received_at`
- `event_log_committed_at`
- `state_updated_at`
- `dashboard_delivered_at`

Required metrics:

- Vendor lag: `gridwatch_received_at - vendor_ts`
- Ingestion lag: `event_log_committed_at - gridwatch_received_at`
- State lag: `state_updated_at - event_log_committed_at`
- Dashboard lag: `dashboard_delivered_at - state_updated_at`
- End-to-end lag: `dashboard_delivered_at - vendor_ts`
- DLQ rate by reason.
- Duplicate rate.
- Poll 429/500 rate.
- Consumer lag by topic/partition.
- Stale connector/site counts by tenant.

Dashboards should show P50/P95/P99/P99.9 by signal type and tenant. Alerts should fire before contractual breach, not after.

## Decision Log

1. **Kafka/Redpanda event log vs direct database writes**
   - Chose event log for replay, burst absorption, and worker isolation.
   - Direct DB writes are simpler but make failure recovery and backfills fragile.

2. **PostGIS + Timescale vs one PostgreSQL JSON table**
   - Chose specialized relational/spatial/time-series modeling.
   - A single JSON telemetry table fails on partitioning, indexing, retention, and query cost at this volume.

3. **Webhook-first with poll reconciliation vs polling as primary**
   - Chose webhook-first because 30s minimum polling cannot meet the freshness targets.
   - Polling remains essential for reconciliation and missed webhook recovery.

4. **Deterministic idempotency keys vs trusting delivery IDs**
   - Chose stable event fingerprints because duplicate webhook delivery can use a different `delivery_id`.
   - Delivery IDs are useful for audit but not enough for exactly-once effects.

## What I Would Not Build First

- Demand forecasting models. The brief marks this as architectural-only.
- A polished frontend. The FAQ says backend correctness is more important.
- Full tariff complexity. I would start with per-CPO kWh price plus session fee, then extend.
- Real-time density recomputation on every telemetry event. Density changes with inventory/geography, not every meter reading.

## Part C - Implementation Details

The theoretical architecture described above has been actively implemented as the "Hardest Slice" of the assessment. 

Key implementation highlights include:
- **Event-Driven Ingestion**: The `IngestionController` acts as a Kafka producer, publishing raw CSMS webhooks and poll events to a `telemetry-raw` topic (powered by Redpanda).
- **Time-Series Storage**: Telemetry is routed and stored in **TimescaleDB** hypertables for optimized high-volume history.
- **Geospatial Processing**: A background **GeocodingWorker** asynchronously uses Nominatim to enrich vendor address data with exact coordinates, storing them in **PostGIS** as `geography(Point,4326)` for ST_Distance nearest-neighbor queries.
- **Real-time Live State**: Connector state is cached and pushed to clients in real-time via **WebSockets (Socket.io)** and **Redis**.
- **Multi-Tenant Security**: Full OIDC integration using **Keycloak**. The API strictly extracts the `operator_id` from the decoded JWT claims instead of trusting client query parameters, ensuring absolute data isolation per tenant.
- **Modern Frontend**: The legacy vanilla JS dashboard has been replaced with a reactive **React + Vite** application that transparently manages Keycloak authentication and state updates.
