import { Injectable } from "@nestjs/common";
import { PoolClient } from "pg";
import { DatabaseService } from "../db/database.service";
import { RedisService } from "../redis/redis.service";
import { IngestBatchInput, IngestSummary, NormalizedEvent, NormalizedSessionEvent } from "../types";
import { computeSettlement, Tariff } from "../settlement/settlement";
import { normalizeVendorEvent } from "./event-normalizer";

@Injectable()
export class IngestionService {
  constructor(private readonly db: DatabaseService, private readonly redisService: RedisService) {}

  async ingestBatch(input: IngestBatchInput): Promise<IngestSummary> {
    const summary: IngestSummary = {
      received: input.events.length,
      accepted: 0,
      duplicates: 0,
      deadLettered: 0
    };

    for (const raw of input.events) {
      const normalized = normalizeVendorEvent({ source: input.source, deliveryId: input.deliveryId, raw });

      if (!normalized.ok) {
        await this.writeDeadLetter(input.source, input.deliveryId, normalized.reason, raw);
        summary.deadLettered += 1;
        continue;
      }

      try {
        const inserted = await this.db.transaction((client) => this.persistNormalizedEvent(client, normalized.event));
        if (inserted) {
          summary.accepted += 1;
        } else {
          summary.duplicates += 1;
        }
      } catch (error) {
        await this.writeDeadLetter(
          input.source,
          input.deliveryId,
          error instanceof Error ? error.message : "unknown persistence error",
          raw
        );
        summary.deadLettered += 1;
      }
    }

    return summary;
  }

  private async persistNormalizedEvent(client: PoolClient, event: NormalizedEvent): Promise<boolean> {
    const inserted = await client.query(
      `
        INSERT INTO raw_events (
          event_hash, source, delivery_id, event_type, charger_id, connector_id,
          vendor_ts, vendor_ts_raw, payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (event_hash) DO NOTHING
        RETURNING event_hash
      `,
      [
        event.eventHash,
        event.source,
        event.deliveryId ?? null,
        event.kind,
        event.chargerId,
        event.connectorId,
        event.vendorTs,
        event.vendorTsRaw,
        JSON.stringify(event.raw)
      ]
    );

    if (inserted.rowCount === 0) {
      return false;
    }

    switch (event.kind) {
      case "status":
        await this.applyStatus(client, event.chargerId, event.connectorId, event.status, event.vendorTs);
        break;
      case "meter_value":
        await this.applyMeterValue(
          client,
          event.chargerId,
          event.connectorId,
          event.energyRegisterWh,
          event.powerW,
          event.vendorTs
        );
        break;
      case "fault":
        await this.applyFault(client, event.chargerId, event.connectorId, event.code, event.severity, event.vendorTs);
        break;
      case "session":
        await this.applySession(client, event);
        break;
    }

    return true;
  }

  private async applyStatus(
    client: PoolClient,
    chargerId: string,
    connectorId: string,
    status: string,
    vendorTs: Date
  ): Promise<void> {
    const result = await client.query(
      `
        WITH op AS (
          SELECT s.operator_id
          FROM chargers c
          JOIN sites s ON s.site_id = c.site_id
          WHERE c.charger_id = $1
        ),
        inserted_ts AS (
          INSERT INTO connector_status_events (operator_id, charger_id, connector_id, ts, status)
          SELECT operator_id, $1, $2, $4, $3 FROM op
        )
        UPDATE connectors
        SET status = $3, status_ts = $4, updated_at = now()
        WHERE charger_id = $1
          AND connector_id = $2
          AND (status_ts IS NULL OR $4 >= status_ts)
      `,
      [chargerId, connectorId, status, vendorTs]
    );

    if (result.rowCount === 0) {
      await this.assertConnectorExists(client, chargerId, connectorId);
    } else {
      await this.redisService.cacheConnectorState(chargerId, connectorId, { status, status_ts: vendorTs });
    }
  }

  private async applyMeterValue(
    client: PoolClient,
    chargerId: string,
    connectorId: string,
    energyRegisterWh: number,
    powerW: number,
    vendorTs: Date
  ): Promise<void> {
    const result = await client.query(
      `
        WITH op AS (
          SELECT s.operator_id
          FROM chargers c
          JOIN sites s ON s.site_id = c.site_id
          WHERE c.charger_id = $1
        ),
        inserted_ts AS (
          INSERT INTO connector_meter_values (operator_id, charger_id, connector_id, ts, energy_register_wh, power_w)
          SELECT operator_id, $1, $2, $5, $3, $4 FROM op
        )
        UPDATE connectors
        SET
          energy_register_wh = $3,
          power_w = $4,
          meter_ts = $5,
          updated_at = now()
        WHERE charger_id = $1
          AND connector_id = $2
          AND (meter_ts IS NULL OR $5 >= meter_ts)
      `,
      [chargerId, connectorId, energyRegisterWh, powerW, vendorTs]
    );

    if (result.rowCount === 0) {
      await this.assertConnectorExists(client, chargerId, connectorId);
    } else {
      await this.redisService.cacheConnectorState(chargerId, connectorId, { energyRegisterWh, powerW, meter_ts: vendorTs });
    }
  }

  private async applyFault(
    client: PoolClient,
    chargerId: string,
    connectorId: string,
    code: string,
    severity: string,
    vendorTs: Date
  ): Promise<void> {
    const result = await client.query(
      `
        UPDATE connectors
        SET
          fault_code = $3,
          fault_severity = $4,
          fault_ts = $5,
          status = CASE
            WHEN lower($4) IN ('warning', 'critical') AND (status_ts IS NULL OR $5 >= status_ts)
            THEN 'Faulted'
            ELSE status
          END,
          status_ts = CASE
            WHEN lower($4) IN ('warning', 'critical') AND (status_ts IS NULL OR $5 >= status_ts)
            THEN $5
            ELSE status_ts
          END,
          updated_at = now()
        WHERE charger_id = $1
          AND connector_id = $2
          AND (fault_ts IS NULL OR $5 >= fault_ts)
      `,
      [chargerId, connectorId, code, severity, vendorTs]
    );

    if (result.rowCount === 0) {
      await this.assertConnectorExists(client, chargerId, connectorId);
    }
  }

  private async applySession(client: PoolClient, event: NormalizedSessionEvent): Promise<void> {
    const tariff = await this.findTariff(client, event.chargerId);
    const settlement =
      event.sessionEvent === "session.stop"
        ? computeSettlement(event.startMeterWh, event.stopMeterWh, tariff)
        : computeSettlement(event.startMeterWh, undefined, tariff);

    await client.query(
      `
        INSERT INTO sessions (
          session_id, charger_id, connector_id, start_meter_wh, stop_meter_wh,
          started_at, stopped_at, energy_wh, billing_status, currency,
          amount_minor, anomaly_reason
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (session_id)
        DO UPDATE SET
          charger_id = EXCLUDED.charger_id,
          connector_id = EXCLUDED.connector_id,
          start_meter_wh = COALESCE(sessions.start_meter_wh, EXCLUDED.start_meter_wh),
          stop_meter_wh = COALESCE(EXCLUDED.stop_meter_wh, sessions.stop_meter_wh),
          started_at = COALESCE(sessions.started_at, EXCLUDED.started_at),
          stopped_at = CASE
            WHEN EXCLUDED.stopped_at IS NOT NULL
              AND (sessions.stopped_at IS NULL OR EXCLUDED.stopped_at >= sessions.stopped_at)
            THEN EXCLUDED.stopped_at
            ELSE sessions.stopped_at
          END,
          energy_wh = CASE
            WHEN EXCLUDED.energy_wh IS NOT NULL THEN EXCLUDED.energy_wh
            ELSE sessions.energy_wh
          END,
          billing_status = CASE
            WHEN EXCLUDED.billing_status <> 'incomplete' THEN EXCLUDED.billing_status
            ELSE sessions.billing_status
          END,
          currency = COALESCE(EXCLUDED.currency, sessions.currency),
          amount_minor = CASE
            WHEN EXCLUDED.amount_minor IS NOT NULL THEN EXCLUDED.amount_minor
            ELSE sessions.amount_minor
          END,
          anomaly_reason = COALESCE(EXCLUDED.anomaly_reason, sessions.anomaly_reason),
          updated_at = now()
      `,
      [
        event.sessionId,
        event.chargerId,
        event.connectorId,
        event.startMeterWh,
        event.stopMeterWh ?? null,
        event.sessionEvent === "session.start" ? event.vendorTs : null,
        event.sessionEvent === "session.stop" ? event.vendorTs : null,
        settlement.energyWh,
        settlement.billingStatus,
        settlement.currency,
        settlement.amountMinor,
        settlement.anomalyReason
      ]
    );
  }

  private async findTariff(client: PoolClient, chargerId: string): Promise<Tariff> {
    const result = await client.query<{
      currency: "INR" | "EUR";
      price_per_kwh_minor: number;
      session_fee_minor: number;
    }>(
      `
        SELECT t.currency, t.price_per_kwh_minor, t.session_fee_minor
        FROM chargers c
        JOIN sites s ON s.site_id = c.site_id
        JOIN tariffs t ON t.operator_id = s.operator_id
        WHERE c.charger_id = $1
      `,
      [chargerId]
    );

    const tariff = result.rows[0];
    if (!tariff) {
      throw new Error(`unknown charger for session tariff lookup: ${chargerId}`);
    }

    return {
      currency: tariff.currency,
      pricePerKwhMinor: tariff.price_per_kwh_minor,
      sessionFeeMinor: tariff.session_fee_minor
    };
  }

  private async assertConnectorExists(client: PoolClient, chargerId: string, connectorId: string): Promise<void> {
    const result = await client.query("SELECT 1 FROM connectors WHERE charger_id = $1 AND connector_id = $2", [
      chargerId,
      connectorId
    ]);

    if (result.rowCount === 0) {
      throw new Error(`unknown connector: ${chargerId}/${connectorId}`);
    }
  }

  private async writeDeadLetter(source: string, deliveryId: string | undefined, reason: string, payload: unknown) {
    await this.db.query(
      `
        INSERT INTO ingestion_dead_letters (source, delivery_id, reason, payload)
        VALUES ($1, $2, $3, $4)
      `,
      [source, deliveryId ?? null, reason, JSON.stringify(payload)]
    );
  }
}
