import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { MarketplaceMaintenanceWorker } from './marketplace-maintenance.worker';
import { MarketplaceRepository } from './marketplace.repository';
import { MarketplaceService } from './marketplace.service';
import { PostgresMarketplaceRepository } from './postgres-marketplace.repository';
import { OpportunitiesController, ServiceRequestsController } from './service-requests.controller';
import { ContractsController, ProposalsController } from './proposals.controller';

@Module({
  imports: [IdentityModule],
  controllers: [
    ServiceRequestsController,
    OpportunitiesController,
    ProposalsController,
    ContractsController,
  ],
  providers: [
    MarketplaceService,
    MarketplaceMaintenanceWorker,
    PostgresMarketplaceRepository,
    {
      provide: MarketplaceRepository,
      useExisting: PostgresMarketplaceRepository,
    },
  ],
})
export class MarketplaceModule {}
