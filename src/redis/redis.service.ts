import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import Redis from "ioredis";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  public readonly client: Redis;
  public readonly publisher: Redis;
  public readonly subscriber: Redis;

  constructor() {
    const host = process.env.REDIS_HOST || "localhost";
    const port = Number(process.env.REDIS_PORT || 6379);
    
    this.client = new Redis({ host, port });
    this.publisher = new Redis({ host, port });
    this.subscriber = new Redis({ host, port });
  }

  async onModuleInit() {}

  async onModuleDestroy() {
    await this.client.quit();
    await this.publisher.quit();
    await this.subscriber.quit();
  }

  async cacheConnectorState(chargerId: string, connectorId: string, state: any) {
    const key = `connector:${chargerId}:${connectorId}`;
    await this.client.set(key, JSON.stringify(state));
    await this.publisher.publish("connector_updates", JSON.stringify({ chargerId, connectorId, ...state }));
  }
}
