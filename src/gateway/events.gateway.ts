import { WebSocketGateway, WebSocketServer, OnGatewayInit } from "@nestjs/websockets";
import { Server } from "socket.io";
import { RedisService } from "../redis/redis.service";
import { Logger } from "@nestjs/common";

@WebSocketGateway({ cors: true })
export class EventsGateway implements OnGatewayInit {
  @WebSocketServer()
  server!: Server;
  private readonly logger = new Logger(EventsGateway.name);

  constructor(private readonly redisService: RedisService) {}

  afterInit() {
    this.redisService.subscriber.subscribe("connector_updates", (err) => {
      if (err) {
        this.logger.error("Failed to subscribe to Redis channel", err);
      }
    });

    this.redisService.subscriber.on("message", (channel, message) => {
      if (channel === "connector_updates") {
        this.server.emit("connector_update", JSON.parse(message));
      }
    });
  }
}
