import { Module } from "@nestjs/common";
import { DatabaseModule } from "./db/database.module";
import { FrontendModule } from "./frontend/frontend.module";
import { IngestionModule } from "./ingestion/ingestion.module";
import { SitesModule } from "./sites/sites.module";
import { HealthController } from "./health.controller";
import { RedisModule } from "./redis/redis.module";
import { GatewayModule } from "./gateway/gateway.module";

@Module({
  imports: [DatabaseModule, IngestionModule, SitesModule, FrontendModule, RedisModule, GatewayModule],
  controllers: [HealthController]
})
export class AppModule {}
