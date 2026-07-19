import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RestrictedIntent } from '@marido/contracts';

import { CreateIntentDto } from './dto/create-intent.dto';
import { IntentService } from './intent.service';

@ApiTags('restricted intents')
@Controller('intents')
export class IntentController {
  constructor(private readonly intents: IntentService) {}

  @Post()
  @ApiOperation({ summary: 'Salva uma intenção pública opaca por 30 minutos' })
  save(@Body() body: CreateIntentDto): Promise<RestrictedIntent> {
    return this.intents.save(body);
  }
}
