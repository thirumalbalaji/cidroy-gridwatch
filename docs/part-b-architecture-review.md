# Part B - Review Of Draft Architecture

## Ranking Criteria

I ranked issues by business impact, likelihood at the stated production scale, and whether the design could violate contractual commitments or create irreversible correctness/security problems.

## Findings

### Critical - Freshness Claims Contradict The Vendor Contract

The draft says polling every 30 seconds plus webhooks batched up to 60 seconds is "always fresh enough" for <5s and <2s KPIs. That is false if freshness is measured from charger event time.

Fix: separate vendor lag from GridWatch processing lag, use webhook-first ingestion, require stricter vendor SLA for critical events, and display stale-state indicators when source data exceeds freshness budgets.

### Critical - Storage Design Will Not Survive Production Telemetry

One unpartitioned `telemetry(charger_id, ts, payload jsonb)` table with indefinite retention is not implementation-ready. The draft itself estimates 864 GB/day, then proposes a 1 TB disk for a year, which is off by orders of magnitude.

Fix: use TimescaleDB hypertables or equivalent time-series partitioning, compression, retention tiers, object-storage archive for raw payloads, and indexes aligned with query patterns.

### Critical - GIS Design Is Not A GIS Design

The draft stores latitude/longitude as doubles, computes nearest charger with Euclidean degree math, returns full GeoJSON every 10 seconds, and computes density on demand. This will be inaccurate and expensive.

Fix: use PostGIS geography/geometry, spatial indexes, geocoding pipeline, KNN nearest queries, vector tiles/clustering for map rendering, and precomputed H3/geohash density aggregates.

### Critical - Multi-Tenant Isolation Is Unsafe

The frontend sends `operator_id` as a query parameter. That lets a user ask for another tenant's data if API authorization misses a check.

Fix: derive tenant scope from OIDC/JWT claims, enforce server-side authorization, add PostgreSQL row-level security for tenant tables, and audit cross-tenant/admin access.

### High - At-Least-Once Delivery Is Misunderstood

The draft says Kafka at-least-once delivery "guarantees we never lose an event." It does not guarantee exactly-once effects, and the vendor also sends duplicates and out-of-order batches.

Fix: persist raw events with stable idempotency keys, make consumers idempotent, commit offsets only after durable writes, and apply timestamp-based state convergence.

### High - Settlement Can Double-Bill And Mishandle Meter Resets

The draft assumes exactly one `session.stop` and computes `stop - start`. The stubs explicitly include duplicate stops and meter resets where `stop_meter_wh < start_meter_wh`.

Fix: unique settlement per `session_id`, dedupe by stable event hash, flag meter-reset sessions for review, and only bill when register deltas are valid.

### High - HA/DR Claims Are Internally Inconsistent

The draft claims async PostgreSQL replication gives RPO 0. Async replication can lose acknowledged writes on primary failure. Manual failover also makes a 5-minute RTO unlikely under stress.

Fix: define RPO/RTO per component, use replicated event log for accepted events, choose synchronous/semi-sync replication if RPO 0 is mandatory, and automate failover with tested runbooks.

### High - Redis Is A Single Point Of Failure For Live State

The draft uses one Redis node for sessions and live status cache. It says restart just causes users to re-authenticate and cache to refill, but this would degrade the central dashboard.

Fix: use managed/clustered Redis if needed, keep live state recoverable from Postgres/event replay, and avoid storing critical auth/session state in a single node.

### Medium - Observability Does Not Prove Contractual Freshness

CPU, RAM, HTTP 5xx, and DB connections do not prove dashboard freshness.

Fix: instrument event-time lag, vendor lag, queue lag, state-update lag, dashboard delivery lag, DLQ rate, duplicate rate, poll rate-limit rate, and P99/P99.9 per signal.

### Medium - Capacity Sizing Is Not Credible

The proposed 4 vCPU / 8 GB PostgreSQL instance is undersized for 5,000 writes/sec plus indexes, dashboard reads, settlement, and GIS queries.

Fix: model sustained and burst throughput, benchmark write path, separate hot current-state reads from telemetry history, and size DB/Kafka/workers from load-test data.

### Medium - Geocoding Is Ignored

The vendor feed has no coordinates, but the draft assumes sites already store latitude/longitude.

Fix: add geocoding enrichment, confidence scoring, cache, manual correction flow, and audit trail.

## Questions Before Sign-Off

- Are freshness KPIs measured from charger timestamp, CSMS receipt, or GridWatch receipt?
- Can the CSMS provide a stricter push SLA or streaming feed for status/faults?
- What are required telemetry retention periods by tenant/country?
- What geocoding provider, licensing terms, and manual override process are acceptable?
- What is the expected tenant isolation model for internal support/admin users?
- Are settlement records legally binding invoices or operational reconciliation estimates?

## Part C - Resolution of Findings

During the "Hardest Slice" implementation, the critical architectural flaws identified above were successfully addressed:
- **Storage**: Telemetry was migrated from a single unpartitioned table to **TimescaleDB** hypertables.
- **GIS Design**: Implemented a **GeocodingWorker** pipeline to assign coordinates and migrated to **PostGIS** `geography` types for accurate spatial calculations (e.g., `ST_Distance`).
- **Multi-Tenant Isolation**: Eradicated the insecure query-parameter fallback by fully integrating **Keycloak**. The application strictly parses the tenant's `operator_id` natively from the OIDC JSON Web Token.
- **At-Least-Once Delivery**: Refactored the core ingestion flow to route raw CSMS payloads directly into **Kafka** for durable event-log processing before any state updates occur.
- **Live State Caching**: Centralized real-time socket connections and live connector states into **Redis** rather than relying purely on transient memory.
