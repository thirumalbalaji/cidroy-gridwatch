import "reflect-metadata";
import { readFile } from "node:fs/promises";
import { config } from "dotenv";
import { DatabaseService } from "../db/database.service";
import { isPostgisAvailable } from "../db/postgis";

config();

async function main() {
  const db = new DatabaseService();
  const schema = await readFile("src/db/schema.sql", "utf8");
  await db.query(schema);

  if (await isPostgisAvailable(db)) {
    const postgis = await readFile("src/db/postgis.sql", "utf8");
    await db.query(postgis);
    console.log("postgis enabled");
  } else {
    console.warn("postgis extension is not installed; using lat/lng fallback queries");
  }

  await db.onModuleDestroy();
  console.log("database migrated");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
