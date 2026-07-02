import "reflect-metadata";
import { config } from "dotenv";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { allFixtureBatches } from "../fixtures/csms-stub-payloads";
import { IngestionService } from "../ingestion/ingestion.service";

config();

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const ingestion = app.get(IngestionService);

  for (const batch of allFixtureBatches) {
    const summary = await ingestion.ingestBatch(batch);
    console.log(`${batch.source}${batch.deliveryId ? `:${batch.deliveryId}` : ""}`, summary);
  }

  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
