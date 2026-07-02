import "reflect-metadata";
import { config } from "dotenv";
import { DatabaseService } from "../db/database.service";
import { loadPilotData, seedPilotData } from "../db/seed-pilot";

config();

async function main() {
  const db = new DatabaseService();
  const data = await loadPilotData();
  await seedPilotData(db, data);
  await db.onModuleDestroy();
  console.log("pilot data seeded");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
