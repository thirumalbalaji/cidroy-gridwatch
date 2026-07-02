import { readFile } from "node:fs/promises";
import { DatabaseService } from "./database.service";
import { geocodeFromFixture } from "./geocode-fixtures";
import { isPostgisEnabled } from "./postgis";
import { DEFAULT_TARIFFS } from "../settlement/settlement";
import { CountryCode } from "../types";

interface PilotData {
  operators: Array<{ operator_id: string; name: string; country: CountryCode }>;
  sites: Array<{ site_id: string; operator_id: string; name: string; address: string; country: CountryCode }>;
  chargers: Array<{ charger_id: string; site_id: string; model: string; max_kw: number; connectors: string[] }>;
}

export async function loadPilotData(path = process.env.PILOT_DATA_PATH ?? "pilot-sample-data 1.json"): Promise<PilotData> {
  return JSON.parse(await readFile(path, "utf8")) as PilotData;
}

export async function seedPilotData(db: DatabaseService, data: PilotData): Promise<void> {
  const postgisEnabled = await isPostgisEnabled(db);

  for (const operator of data.operators) {
    await db.query(
      `
        INSERT INTO operators (operator_id, name, country)
        VALUES ($1, $2, $3)
        ON CONFLICT (operator_id)
        DO UPDATE SET name = EXCLUDED.name, country = EXCLUDED.country
      `,
      [operator.operator_id, operator.name, operator.country]
    );

    const tariff = DEFAULT_TARIFFS[operator.country];
    await db.query(
      `
        INSERT INTO tariffs (operator_id, currency, price_per_kwh_minor, session_fee_minor)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (operator_id)
        DO UPDATE SET
          currency = EXCLUDED.currency,
          price_per_kwh_minor = EXCLUDED.price_per_kwh_minor,
          session_fee_minor = EXCLUDED.session_fee_minor
      `,
      [operator.operator_id, tariff.currency, tariff.pricePerKwhMinor, tariff.sessionFeeMinor]
    );
  }

  for (const site of data.sites) {
    const geocode = geocodeFromFixture(site.address);
    await db.query(
      `
        INSERT INTO sites (site_id, operator_id, name, address, country, lat, lng, geocode_status)
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8
        )
        ON CONFLICT (site_id)
        DO UPDATE SET
          operator_id = EXCLUDED.operator_id,
          name = EXCLUDED.name,
          address = EXCLUDED.address,
          country = EXCLUDED.country,
          lat = EXCLUDED.lat,
          lng = EXCLUDED.lng,
          geocode_status = EXCLUDED.geocode_status
      `,
      [
        site.site_id,
        site.operator_id,
        site.name,
        site.address,
        site.country,
        geocode?.lat ?? null,
        geocode?.lng ?? null,
        geocode ? "fixture" : "unresolved"
      ]
    );

    if (postgisEnabled && geocode) {
      await db.query(
        `
          UPDATE sites
          SET geom = ST_SetSRID(ST_MakePoint($3::double precision, $2::double precision), 4326)::geography
          WHERE site_id = $1
        `,
        [site.site_id, geocode.lat, geocode.lng]
      );
    }
  }

  for (const charger of data.chargers) {
    await db.query(
      `
        INSERT INTO chargers (charger_id, site_id, model, max_kw)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (charger_id)
        DO UPDATE SET site_id = EXCLUDED.site_id, model = EXCLUDED.model, max_kw = EXCLUDED.max_kw
      `,
      [charger.charger_id, charger.site_id, charger.model, charger.max_kw]
    );

    for (const connectorId of charger.connectors) {
      await db.query(
        `
          INSERT INTO connectors (charger_id, connector_id)
          VALUES ($1, $2)
          ON CONFLICT (charger_id, connector_id) DO NOTHING
        `,
        [charger.charger_id, connectorId]
      );
    }
  }
}
