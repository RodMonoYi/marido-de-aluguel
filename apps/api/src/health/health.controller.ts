import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { DatabaseService } from '../database/database.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get('live')
  @ApiOperation({ summary: 'Verifica se o processo da API está ativo' })
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Verifica se a API consegue atender com suas dependências críticas' })
  async ready(): Promise<{ status: 'ready' }> {
    if (!(await this.database.isReady())) {
      throw new ServiceUnavailableException({
        code: 'DATABASE_UNAVAILABLE',
        message: 'A dependência de dados está indisponível.',
        retryable: true,
      });
    }
    return { status: 'ready' };
  }
}
