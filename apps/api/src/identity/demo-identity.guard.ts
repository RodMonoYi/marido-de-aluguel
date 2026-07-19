import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { ActorRequest } from './authenticated-actor';
import { IdentityContextRepository } from './identity-context.repository';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class DemoIdentityGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly identities: IdentityContextRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.config.getOrThrow<string>('NODE_ENV') === 'production' ||
      !this.config.getOrThrow<boolean>('DEMO_MODE')
    ) {
      throw this.unauthorized();
    }

    const request = context.switchToHttp().getRequest<ActorRequest>();
    const actorId = request.header('x-demo-actor-id');
    if (!actorId || !UUID.test(actorId)) {
      throw this.unauthorized();
    }

    const actor = await this.identities.findActiveActor(actorId.toLowerCase());
    if (!actor) {
      throw this.unauthorized();
    }

    request.actor = actor;
    return true;
  }

  private unauthorized(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'AUTHENTICATION_REQUIRED',
      message: 'A identidade demonstrativa não está disponível.',
    });
  }
}
