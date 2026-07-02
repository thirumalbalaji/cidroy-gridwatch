import { Module, Global } from "@nestjs/common";
import { KeycloakConnectModule, ResourceGuard, RoleGuard, AuthGuard } from "nest-keycloak-connect";
import { APP_GUARD } from "@nestjs/core";

@Global()
@Module({
  imports: [
    KeycloakConnectModule.register({
      authServerUrl: process.env.KEYCLOAK_URL || "http://localhost:8080",
      realm: process.env.KEYCLOAK_REALM || "gridwatch",
      clientId: process.env.KEYCLOAK_CLIENT_ID || "gridwatch-api",
      secret: process.env.KEYCLOAK_CLIENT_SECRET || "secret",
      useNestLogger: true,
    }),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ResourceGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RoleGuard,
    },
  ],
  exports: [KeycloakConnectModule],
})
export class AuthModule {}
