import { Body, Controller, Headers, Inject, Post, UnauthorizedException } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ClientKafka } from "@nestjs/microservices";
import { isValidWebhookSignature } from "./webhook-signature";

@ApiTags("ingestion")
@Controller("ingest")
export class IngestionController {
  constructor(@Inject("KAFKA_CLIENT") private readonly kafkaClient: ClientKafka) {}

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
      this.kafkaClient.emit("telemetry-raw", {
        source: "poll",
        events: [{ type: "malformed_page", body }]
      });
      return { status: "accepted" };
    }

    this.kafkaClient.emit("telemetry-raw", {
      source: "poll",
      events: body.events
    });
    return { status: "accepted" };
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

    this.kafkaClient.emit("telemetry-raw", {
      source: "webhook",
      deliveryId: body.delivery_id,
      events: Array.isArray(body.events) ? body.events : []
    });
    return { status: "accepted" };
  }
}
