import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { ActorRequest, AuthenticatedActor } from './authenticated-actor';

export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedActor => {
    const request = context.switchToHttp().getRequest<ActorRequest>();
    if (!request.actor) {
      throw new Error('Authenticated actor was not attached by the guard');
    }
    return request.actor;
  },
);
