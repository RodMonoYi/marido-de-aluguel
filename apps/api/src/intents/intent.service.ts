import { Injectable, NotFoundException } from '@nestjs/common';
import type { RestrictedIntent } from '@marido/contracts';
import { uuidv7 } from 'uuidv7';

import { IntentRepository } from './intent.repository';

interface SaveIntentInput {
  professionalId: string;
  serviceId: string;
  action: 'REQUEST_QUOTE';
}

@Injectable()
export class IntentService {
  constructor(private readonly repository: IntentRepository) {}

  async save(input: SaveIntentInput): Promise<RestrictedIntent> {
    const intent = await this.repository.create({
      id: uuidv7(),
      ...input,
    });

    if (!intent) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_AVAILABLE',
        message: 'O serviço não está mais disponível.',
      });
    }
    return intent;
  }
}
