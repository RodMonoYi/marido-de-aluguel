import { Module } from '@nestjs/common';

import { CatalogController } from './catalog.controller';
import { CatalogRepository } from './catalog.repository';
import { CatalogService } from './catalog.service';
import { PostgresCatalogRepository } from './postgres-catalog.repository';

@Module({
  controllers: [CatalogController],
  providers: [
    CatalogService,
    {
      provide: CatalogRepository,
      useClass: PostgresCatalogRepository,
    },
  ],
  exports: [CatalogService],
})
export class CatalogModule {}
