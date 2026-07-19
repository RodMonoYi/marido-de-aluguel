import { Controller, Get, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { DemoActor } from '@marido/contracts';

import { IdentityContextRepository } from './identity-context.repository';

@ApiTags('development')
@Controller('demo/actors')
export class DemoActorsController {
  constructor(
    private readonly config: ConfigService,
    private readonly identities: IdentityContextRepository,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lista atores exclusivamente sintéticos fora de produção' })
  list(): Promise<DemoActor[]> {
    if (
      this.config.getOrThrow<string>('NODE_ENV') === 'production' ||
      !this.config.getOrThrow<boolean>('DEMO_MODE')
    ) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: 'Este recurso não está disponível.',
      });
    }
    return this.identities.listActiveActors();
  }
}
