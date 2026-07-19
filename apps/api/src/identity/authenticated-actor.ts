import type { DemoActor } from '@marido/contracts';
import type { Request } from 'express';

export type AuthenticatedActor = DemoActor;

export type ActorRequest = Request & {
  actor?: AuthenticatedActor;
};
