import { Module } from "@nestjs/common";
import { DatabaseModule } from "../db/database.module";
import { SitesController } from "./sites.controller";
import { SitesService } from "./sites.service";

@Module({
  imports: [DatabaseModule],
  controllers: [SitesController],
  providers: [SitesService]
})
export class SitesModule {}
