import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  // Per Phase 1: this API serves a separately-hosted web dashboard (and
  // eventually the Flutter POS app), so it needs CORS enabled rather than
  // assuming same-origin. FRONTEND_URL supports a comma-separated list for
  // when staging/production add more origins later.
  const allowedOrigins = (process.env.FRONTEND_URL ?? 'http://localhost:3001')
    .split(',')
    .map((origin) => origin.trim());
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // Per Phase 1, Section 3: versioned from day one.
  app.setGlobalPrefix('api/v1');

  // Strips unknown fields and rejects requests with extra/invalid fields
  // rather than silently accepting them -- fail loud on bad input.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Normalizes every thrown error (ours and Nest's own) into the
  // { error: { code, message, details } } shape from Phase 1, Section 3.
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  await app.listen(port);
  console.log(`YaseeTech backend listening on http://localhost:${port}/api/v1`);
}

bootstrap();
