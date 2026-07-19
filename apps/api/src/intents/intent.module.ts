import { Module } from '@nestjs/common';

import { IntentController } from './intent.controller';
import { IntentRepository } from './intent.repository';
import { IntentService } from './intent.service';
import { PostgresIntentRepository } from './postgres-intent.repository';

@Module({
  controllers: [IntentController],
  providers: [
    IntentService,
    {
      provide: IntentRepository,
      useClass: PostgresIntentRepository,
    },
  ],
})
export class IntentModule {}
