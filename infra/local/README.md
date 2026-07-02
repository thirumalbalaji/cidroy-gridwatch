# Local Infrastructure

This slice does not introduce cloud resources such as SQS, Kinesis, managed Kafka, object storage, or IAM. The local infrastructure is therefore declared with Docker Compose:

- `api`: NestJS ingestion/API service.
- `db`: PostgreSQL with PostGIS enabled.
- `gridwatch-db`: persistent local database volume.

For a production deployment, the architecture document maps these local resources to managed Postgres/PostGIS, a durable event log, Redis, and observability infrastructure.
