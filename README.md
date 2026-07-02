# GridWatch Take-Home

This repo contains a vertical slice for the GridWatch assignment, which has been fully upgraded to a **production-ready architecture**:

`CSMS stub events -> Kafka (Redpanda) -> normalize -> store in PostgreSQL/PostGIS & TimescaleDB -> expose via NestJS API -> React/Vite Frontend`

The technology stack includes:
- **Backend:** Node.js + TypeScript + NestJS
- **Frontend:** React + Vite
- **Storage:** PostgreSQL + PostGIS (for geospatial queries) + TimescaleDB (for telemetry hypertables)
- **Streaming:** Kafka (via Redpanda)
- **Cache/Real-time:** Redis + Socket.io
- **Auth:** Keycloak

## Run With Docker Compose

```powershell
docker compose up -d --build
```

The infrastructure will spin up multiple containers:
- `db`: TimescaleDB (Postgres 16 + PostGIS) on port `15432`
- `redis`: Redis cache
- `redpanda`: Kafka-compatible event stream broker
- `keycloak`: Auth provider on port `8080` (preconfigured with `gridwatch` realm and test users)
- `api`: NestJS API on port `3000`

Browser entry points:

```text
http://localhost:5173/       - React/Vite Operations dashboard (Requires running `npm run dev` in `/frontend`)
http://localhost:3000/docs   - Swagger/OpenAPI UI
http://localhost:8080/       - Keycloak Admin Console
```

On startup the API container runs:

```text
npm run migrate
npm run seed
npm run ingest:fixtures
npm run start
```

## Running the Frontend

The React frontend runs independently using Vite:

```powershell
cd frontend
npm install
npm run dev
```

Visit `http://localhost:5173` and log in using the pre-seeded Keycloak credentials:
- **Username:** `acme-admin`
- **Password:** `admin`

## Useful Endpoints (API)

```powershell
Invoke-RestMethod http://localhost:3000/health
```

*Note: Data endpoints like `/chargers/nearest` now securely require a Bearer token from Keycloak. The React frontend handles this automatically.*

## Design Summary & Hardest Slice Enhancements

The implementation stores immutable raw events for idempotency/audit via **Kafka**, and updates compact current-state tables for dashboard-style reads. Site coordinates are resolved asynchronously via a background **GeocodingWorker** querying Nominatim.

Key production enhancements made during the "Hardest Slice":
- **Kafka Integration:** Raw webhooks are sent to Redpanda immediately for at-least-once delivery.
- **TimescaleDB:** Telemetry metrics are routed to partitioned hypertables.
- **Keycloak Auth:** Multi-tenancy is enforced cryptographically by parsing the `operator_id` directly from the OIDC token.
- **Real-Time Push:** Redis and WebSockets broadcast `connector_update` events live to the React dashboard, eliminating polling.
- **PostGIS:** `ST_Distance` handles exact nearest-available charger math.

## Documents

- [Part A architecture](docs/part-a-architecture.md)
- [Part B architecture review](docs/part-b-architecture-review.md)
