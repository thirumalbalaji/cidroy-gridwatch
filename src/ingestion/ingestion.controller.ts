import { Body, Controller, Headers, Post, UnauthorizedException } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IngestionService } from "./ingestion.service";
import { isValidWebhookSignature } from "./webhook-signature";

@ApiTags("ingestion")
@Controller("ingest")
export class IngestionController {
  constructor(private readonly ingestion: IngestionService) {}

  @Post("poll-page")
  @ApiOperation({ summary: "Ingest one CSMS poll API page" })
  @ApiBody({
    schema: {
      example: {
        events: [
          {
            type: "status",
            charger_id: "C-IN-0007-B",
            connector_id: "1",
            status: "Available",
            ts: "2026-06-09T14:32:09+05:30"
          }
        ]
      }
    }
  })
  async ingestPollPage(@Body() body: { events?: unknown[] }) {
    if (!Array.isArray(body.events)) {
      return this.ingestion.ingestBatch({
        source: "poll",
        events: [{ type: "malformed_page", body }]
      });
    }

    return this.ingestion.ingestBatch({
      source: "poll",
      events: body.events
    });
  }

  @Post("webhook")
  @ApiOperation({ summary: "Ingest one CSMS webhook delivery batch" })
  @ApiBody({
    schema: {
      example: {
        delivery_id: "dlv-003",
        events: [
          {
            type: "status",
            charger_id: "C-IN-0007-A",
            connector_id: "1",
            status: "Available",
            ts: "2026-06-09T14:33:40+05:30"
          }
        ]
      }
    }
  })
  async ingestWebhook(@Body() body: { delivery_id?: string; events?: unknown[] }, @Headers("x-csms-signature") sig?: string) {
    if (process.env.REQUIRE_WEBHOOK_SIGNATURE === "true" && !isValidWebhookSignature(body, sig)) {
      throw new UnauthorizedException("invalid CSMS webhook signature");
    }

    return this.ingestion.ingestBatch({
      source: "webhook",
      deliveryId: body.delivery_id,
      events: Array.isArray(body.events) ? body.events : []
    });
  }
}
