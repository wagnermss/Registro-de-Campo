import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api");
  const corsOrigins = (
    process.env.CORS_ORIGINS ??
    `http://localhost:${process.env.WEB_PORT ?? 3000},http://127.0.0.1:${process.env.WEB_PORT ?? 3000}`
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  await app.listen(process.env.API_PORT ?? 3001);
}

void bootstrap();
