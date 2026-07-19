import { MiddlewareConsumer, Module, type NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { CatalogModule } from './catalog/catalog.module';
import { CorrelationIdMiddleware } from './common/http/correlation-id.middleware';
import { validateEnvironment } from './config/environment';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { IntentModule } from './intents/intent.module';
import { IdentityModule } from './identity/identity.module';
import { MarketplaceModule } from './marketplace/marketplace.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
      validate: validateEnvironment,
    }),
    DatabaseModule,
    HealthModule,
    CatalogModule,
    IntentModule,
    IdentityModule,
    MarketplaceModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(CorrelationIdMiddleware)
      .forRoutes({ path: '*splat', method: RequestMethod.ALL });
  }
}
