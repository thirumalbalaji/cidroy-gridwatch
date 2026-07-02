import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { SitesService } from "./sites.service";
import { AuthenticatedUser } from "nest-keycloak-connect";

@ApiTags("sites")
@Controller()
export class SitesController {
  constructor(private readonly sites: SitesService) {}

  @Get("sites/status-rollup")
  @ApiOperation({ summary: "Get live connector status rollup per site" })
  @ApiQuery({ name: "operator_id", example: "acme-charge", required: false, description: "Fallback if JWT lacks operator_id" })
  async statusRollup(@Query("operator_id") operatorIdQuery?: string, @AuthenticatedUser() user?: any) {
    const operatorId = user?.operator_id || operatorIdQuery;
    if (!operatorId) {
      throw new BadRequestException("operator_id is required via JWT claim or query");
    }

    return this.sites.statusRollup(operatorId);
  }

  @Get("chargers/nearest")
  @ApiOperation({ summary: "Find nearest available charger connector to a point" })
  @ApiQuery({ name: "operator_id", example: "acme-charge", required: false })
  @ApiQuery({ name: "lat", example: 28.57 })
  @ApiQuery({ name: "lng", example: 77.32 })
  @ApiQuery({ name: "limit", required: false, example: 3 })
  async nearestAvailable(
    @Query("lat") latRaw?: string,
    @Query("lng") lngRaw?: string,
    @Query("limit") limitRaw?: string,
    @Query("operator_id") operatorIdQuery?: string,
    @AuthenticatedUser() user?: any
  ) {
    console.log('User from token:', user);
    console.log('latRaw:', latRaw, 'lngRaw:', lngRaw);
    const operatorId = user?.operator_id || operatorIdQuery;
    if (!operatorId || latRaw === undefined || lngRaw === undefined) {
      throw new BadRequestException("operator_id, lat, and lng are required");
    }

    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    const limit = Math.min(25, Math.max(1, Number(limitRaw ?? 1)));

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new BadRequestException("lat and lng must be numbers");
    }

    return this.sites.nearestAvailable(operatorId, lat, lng, limit);
  }
}
