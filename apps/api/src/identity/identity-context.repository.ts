import type { DemoActor } from '@marido/contracts';

export abstract class IdentityContextRepository {
  abstract findActiveActor(id: string): Promise<DemoActor | null>;
  abstract listActiveActors(): Promise<DemoActor[]>;
}
