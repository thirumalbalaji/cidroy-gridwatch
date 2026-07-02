import { DatabaseService } from "./database.service";

export async function isPostgisAvailable(db: DatabaseService): Promise<boolean> {
  const result = await db.query<{ available: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'postgis') AS available"
  );
  return result.rows[0]?.available === true;
}

export async function isPostgisEnabled(db: DatabaseService): Promise<boolean> {
  const result = await db.query<{ enabled: boolean }>("SELECT to_regtype('geography') IS NOT NULL AS enabled");
  return result.rows[0]?.enabled === true;
}
