import { Module } from "@nestjs/common";
import { ClientsModule, Transport } from "@nestjs/microservices";
import { DatabaseModule } from "../db/database.module";
import { IngestionController } from "./ingestion.controller";
import { IngestionService } from "./ingestion.service";
import { IngestionWorkerController } from "./ingestion-worker.controller";

@Module({
  imports: [
    DatabaseModule,
    ClientsModule.register([
      {
        name: "KAFKA_CLIENT",
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: "ingestion-api",
            brokers: [process.env.KAFKA_BROKERS || "localhost:9092"]
          },
          producerOnlyMode: true
        }
      }
    ])
  ],
  controllers: [IngestionController, IngestionWorkerController],
  providers: [IngestionService],
  exports: [IngestionService]
})
export class IngestionModule {}
