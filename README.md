# GridWatch Take-Home

This repo contains a backend-focused vertical slice for the GridWatch assignment:

`CSMS stub events -> normalize -> store in PostgreSQL/PostGIS -> expose status rollup and nearest available charger APIs`

NestJS runs on Node.js, so the implementation uses **Node.js + TypeScript + NestJS** for the backend. No frontend is included because the FAQ says UI is not required and backend correctness matters more.

## Run With Docker Compose

```powershell
docker compose up --build
```

The API listens on `http://localhost:3000`. PostgreSQL/PostGIS is exposed on host port `15432` to avoid conflicting with a local PostgreSQL on `5432`.

Browser entry points:

```text
http://localhost:3000/       - Lightweight operations dashboard
http://localhost:3000/docs   - Swagger/OpenAPI UI
http://localhost:3000/docs-json - OpenAPI JSON
```

On startup the API container runs:

```text
npm run migrate
npm run seed
npm run ingest:fixtures
npm run start
```

## Useful Endpoints

```powershell
Invoke-RestMethod http://localhost:3000/health
Invoke-RestMethod "http://localhost:3000/sites/status-rollup?operator_id=acme-charge"
Invoke-RestMethod "http://localhost:3000/chargers/nearest?operator_id=acme-charge&lat=28.57&lng=77.32"
```

Replay a poll page:

```powershell
Invoke-RestMethod `
  -Method Post `
  -ContentType "application/json" `
  -Uri http://localhost:3000/ingest/poll-page `
  -Body '{"events":[{"type":"status","charger_id":"C-IN-0007-B","connector_id":"1","status":"Available","ts":"2026-06-09T14:32:09+05:30"}]}'
```

## Local PostgreSQL Option

Docker Compose is the submission path because the assignment requires one-command startup. For local experimentation against your installed PostgreSQL, set `DATABASE_URL` and run:

```powershell
$env:DATABASE_URL="postgres://postgres:<password>@127.0.0.1:5432/gridwatch"
npm run migrate
npm run seed
npm run ingest:fixtures
npm run start:dev
```

If PostGIS is installed, migration enables it and nearest-charger queries use the spatial index. If not, the service falls back to a plain PostgreSQL Haversine distance query so local development still works.

## Tests

```powershell
npm test
```

The tests target the vendor failure modes rather than broad coverage:

- Malformed poll events are rejected without crashing the batch.
- Duplicate webhook delivery creates the same event hash.
- Out-of-order statuses converge by newest vendor timestamp.
- Cumulative meter registers produce session energy.
- Meter resets are flagged instead of billed negatively.
- Poll `429` and `500` responses are classified correctly.

## Design Summary

The implementation stores immutable raw events for idempotency/audit and updates compact current-state tables for dashboard-style reads. Site coordinates are not assumed from the vendor; the sample addresses are resolved through deterministic local geocode fixtures, while the architecture document describes the production geocoding workflow.

Key choices:

- Stable event fingerprinting instead of trusting webhook `delivery_id`.
- Timestamp-based state convergence because webhooks can arrive out of order.
- PostGIS geography for nearest-available charger distance.
- Dead-letter storage for malformed vendor records.
- Meter-reset review state for settlement correctness.

## Documents

- [Part A architecture](docs/part-a-architecture.md)
- [Part B architecture review](docs/part-b-architecture-review.md)
- [Local infrastructure note](infra/local/README.md)

## Where I Stopped

This slice intentionally does not build a frontend, Kafka, Redis, TimescaleDB hypertables, production auth, or a real geocoding provider. Those are covered in the architecture document. The code focuses on the riskiest runnable path: ingesting ugly CSMS data, converging state correctly, storing it durably, and answering a useful GIS query.
