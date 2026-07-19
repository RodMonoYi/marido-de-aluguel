import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';

import { ApiExceptionFilter } from './common/http/api-exception.filter';
import { ApiResponseInterceptor } from './common/http/api-response.interceptor';

export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api/v1');
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.enableCors({
    origin: config.getOrThrow<string>('WEB_ORIGIN'),
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'X-Correlation-ID',
      'X-Demo-Actor-Id',
      'Idempotency-Key',
      'If-Match',
    ],
    exposedHeaders: ['X-Correlation-ID', 'ETag'],
    maxAge: 600,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      stopAtFirstError: false,
    }),
  );
  app.useGlobalInterceptors(new ApiResponseInterceptor());
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
}
