import { Controller } from "@nestjs/common";
import { EventPattern, Payload } from "@nestjs/microservices";
import { IngestionService } from "./ingestion.service";
import { IngestBatchInput } from "../types";

@Controller()
export class IngestionWorkerController {
  constructor(private readonly ingestion: IngestionService) {}

  @EventPattern("telemetry-raw")
  async handleTelemetryRaw(@Payload() message: any) {
    const input: IngestBatchInput = {
      source: message.source,
      deliveryId: message.deliveryId,
      events: message.events || [],
    };
    
    await this.ingestion.ingestBatch(input);
  }
}
