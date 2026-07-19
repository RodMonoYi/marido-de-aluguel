import { Module } from '@nestjs/common';

import { DemoActorsController } from './demo-actors.controller';
import { DemoIdentityGuard } from './demo-identity.guard';
import { IdentityContextRepository } from './identity-context.repository';
import { PostgresIdentityContextRepository } from './postgres-identity-context.repository';

@Module({
  controllers: [DemoActorsController],
  providers: [
    DemoIdentityGuard,
    {
      provide: IdentityContextRepository,
      useClass: PostgresIdentityContextRepository,
    },
  ],
  exports: [DemoIdentityGuard, IdentityContextRepository],
})
export class IdentityModule {}
