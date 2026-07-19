import type { RestrictedIntent } from '@marido/contracts';

export interface CreateIntentInput {
  id: string;
  professionalId: string;
  serviceId: string;
  action: 'REQUEST_QUOTE';
}

export abstract class IntentRepository {
  abstract create(input: CreateIntentInput): Promise<RestrictedIntent | null>;
}
