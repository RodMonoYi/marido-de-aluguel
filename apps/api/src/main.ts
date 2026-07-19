import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';

import { AppModule } from './app.module';
import { configureApp } from './configure-app';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  configureApp(app);

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Marketplace de serviços locais')
      .setDescription(
        'Descoberta pública e fluxo privado demonstrativo; nenhuma rota captura pagamento ou cria lançamento contábil.',
      )
      .setVersion('1.3.0')
      .addApiKey(
        {
          type: 'apiKey',
          in: 'header',
          name: 'X-Demo-Actor-Id',
          description:
            'Identificador de ator sintético disponível apenas em desenvolvimento e teste.',
        },
        'DemoActor',
      )
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs/openapi.json',
  });

  const config = app.get(ConfigService);
  await app.listen(config.get<number>('API_PORT', 3000), '0.0.0.0');
}

void bootstrap();
