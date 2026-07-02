import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Transport, MicroserviceOptions } from "@nestjs/microservices";
import { config } from "dotenv";
import { AppModule } from "./app.module";

config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  const swaggerConfig = new DocumentBuilder()
    .setTitle("GridWatch API")
    .setDescription("CSMS ingestion, live site status, and GIS query slice.")
    .setVersion("0.1.0")
    .addTag("health")
    .addTag("ingestion")
    .addTag("sites")
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("docs", app, document, {
    customSiteTitle: "GridWatch API Docs"
  });

  const port = Number(process.env.PORT ?? 3000);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        brokers: [process.env.KAFKA_BROKERS || "localhost:9092"]
      },
      consumer: {
        groupId: "ingestion-consumer-group"
      }
    }
  });

  await app.startAllMicroservices();
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
