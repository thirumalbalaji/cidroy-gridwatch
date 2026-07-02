import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from "@nestjs/common";
import { DatabaseService } from "../db/database.service";
import { isPostgisEnabled } from "../db/postgis";

@Injectable()
export class SitesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SitesService.name);
  private geocodeInterval?: NodeJS.Timeout;

  constructor(private readonly db: DatabaseService) {}

  onModuleInit() {
    this.geocodeInterval = setInterval(() => this.processGeocoding(), 10000); // 10s
  }

  onModuleDestroy() {
    if (this.geocodeInterval) clearInterval(this.geocodeInterval);
  }

  private async processGeocoding() {
    const result = await this.db.query(
      `SELECT site_id, address FROM sites WHERE geocode_status = 'unresolved' LIMIT 1`
    );
    if (result.rowCount === 0) return;
    
    const site = result.rows[0];
    try {
      const q = encodeURIComponent(site.address);
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, {
        headers: { "User-Agent": "Cidroy-Gridwatch/1.0" }
      });
      const data = (await res.json()) as any[];
      if (data && data.length > 0) {
        const { lat, lon } = data[0];
        await this.db.query(
          `UPDATE sites SET lat = $1, lng = $2, geocode_status = 'resolved' WHERE site_id = $3`,
          [lat, lon, site.site_id]
        );
        this.logger.log(`Geocoded site ${site.site_id}: ${lat}, ${lon}`);
      } else {
        await this.db.query(`UPDATE sites SET geocode_status = 'failed' WHERE site_id = $1`, [site.site_id]);
        this.logger.warn(`Failed to geocode site ${site.site_id}: no results`);
      }
    } catch (err) {
      this.logger.error(`Error geocoding site ${site.site_id}`, err);
    }
  }

  async statusRollup(operatorId: string) {
    const result = await this.db.query(
      `
        SELECT
          s.site_id,
          s.name,
          s.address,
          s.country,
          s.lat,
          s.lng,
          COUNT(cn.*)::int AS connector_count,
          COUNT(*) FILTER (WHERE cn.status = 'Available')::int AS available_count,
          COUNT(*) FILTER (WHERE cn.status = 'Charging')::int AS charging_count,
          COUNT(*) FILTER (WHERE cn.status = 'Faulted')::int AS faulted_count,
          COUNT(*) FILTER (WHERE cn.status = 'Offline')::int AS offline_count,
          COUNT(*) FILTER (WHERE cn.status = 'Unknown')::int AS unknown_count,
          CASE
            WHEN COUNT(*) FILTER (WHERE cn.status = 'Faulted') > 0 THEN 'Faulted'
            WHEN COUNT(*) FILTER (WHERE cn.status = 'Charging') > 0 THEN 'Charging'
            WHEN COUNT(*) FILTER (WHERE cn.status = 'Available') > 0 THEN 'Available'
            WHEN COUNT(cn.*) = 0 THEN 'NoConnectors'
            ELSE 'Unknown'
          END AS site_status,
          NULLIF(MAX(
            GREATEST(
              COALESCE(cn.status_ts, 'epoch'::timestamptz),
              COALESCE(cn.meter_ts, 'epoch'::timestamptz),
              COALESCE(cn.fault_ts, 'epoch'::timestamptz)
            )
          ), 'epoch'::timestamptz) AS latest_event_ts
        FROM sites s
        LEFT JOIN chargers c ON c.site_id = s.site_id
        LEFT JOIN connectors cn ON cn.charger_id = c.charger_id
        WHERE s.operator_id = $1
        GROUP BY s.site_id
        ORDER BY s.name
      `,
      [operatorId]
    );

    return result.rows.map((row) => ({
      ...row,
      latest_event_ts: row.latest_event_ts?.toISOString?.() ?? null,
      freshness_seconds:
        row.latest_event_ts && row.latest_event_ts.getTime() > 0
          ? Math.max(0, Math.round((Date.now() - row.latest_event_ts.getTime()) / 1000))
          : null
    }));
  }

  async nearestAvailable(operatorId: string, lat: number, lng: number, limit: number) {
    if (await isPostgisEnabled(this.db)) {
      return this.nearestAvailablePostgis(operatorId, lat, lng, limit);
    }

    return this.nearestAvailableHaversine(operatorId, lat, lng, limit);
  }

  private async nearestAvailablePostgis(operatorId: string, lat: number, lng: number, limit: number) {
    const result = await this.db.query(
      `
        WITH query_point AS (
          SELECT ST_SetSRID(ST_MakePoint($3::double precision, $2::double precision), 4326)::geography AS geom
        )
        SELECT
          c.charger_id,
          cn.connector_id,
          s.site_id,
          s.name AS site_name,
          s.address,
          s.lat,
          s.lng,
          ROUND(ST_Distance(s.geom, query_point.geom))::int AS distance_m
        FROM connectors cn
        JOIN chargers c ON c.charger_id = cn.charger_id
        JOIN sites s ON s.site_id = c.site_id
        CROSS JOIN query_point
        WHERE s.operator_id = $1
          AND cn.status = 'Available'
          AND s.lat IS NOT NULL
          AND s.lng IS NOT NULL
          AND s.geom IS NOT NULL
        ORDER BY s.geom::geometry <-> query_point.geom::geometry
        LIMIT $4
      `,
      [operatorId, lat, lng, limit]
    );

    return result.rows;
  }

  private async nearestAvailableHaversine(operatorId: string, lat: number, lng: number, limit: number) {
    const result = await this.db.query(
      `
        SELECT
          c.charger_id,
          cn.connector_id,
          s.site_id,
          s.name AS site_name,
          s.address,
          s.lat,
          s.lng,
          ROUND(
            6371000 * 2 * asin(
              sqrt(
                power(sin(radians((s.lat - $2::double precision) / 2)), 2) +
                cos(radians($2::double precision)) *
                cos(radians(s.lat)) *
                power(sin(radians((s.lng - $3::double precision) / 2)), 2)
              )
            )
          )::int AS distance_m
        FROM connectors cn
        JOIN chargers c ON c.charger_id = cn.charger_id
        JOIN sites s ON s.site_id = c.site_id
        WHERE s.operator_id = $1
          AND cn.status = 'Available'
          AND s.lat IS NOT NULL
          AND s.lng IS NOT NULL
        ORDER BY distance_m
        LIMIT $4
      `,
      [operatorId, lat, lng, limit]
    );

    return result.rows;
  }
}
