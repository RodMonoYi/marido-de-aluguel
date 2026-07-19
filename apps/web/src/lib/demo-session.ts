import { cookies } from 'next/headers';

export const DEMO_SESSION_COOKIE = 'resolve_perto_demo_actor';

export type DemoActorRole = 'CLIENT' | 'PROFESSIONAL';

export interface DemoActor {
  id: string;
  role: DemoActorRole;
  displayName: string;
  shortName: string;
  homePath: string;
}

export function isDemoModeEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.DEMO_MODE === 'true';
}

function demoActorId(environmentValue: string | undefined, developmentFallback: string): string {
  return process.env.NODE_ENV === 'production' ? '' : (environmentValue ?? developmentFallback);
}

// IDs are centralized here so local, preview and API seeds cannot silently diverge.
export const DEMO_ACTORS: Record<DemoActorRole, DemoActor> = {
  CLIENT: {
    id: demoActorId(process.env.DEMO_CLIENT_ACTOR_ID, '019b0000-0000-7000-8000-000000000401'),
    role: 'CLIENT',
    displayName: 'Marina Souza',
    shortName: 'Marina',
    homePath: '/pedidos/novo',
  },
  PROFESSIONAL: {
    id: demoActorId(process.env.DEMO_PROFESSIONAL_ACTOR_ID, '019b0000-0000-7000-8000-000000000402'),
    role: 'PROFESSIONAL',
    displayName: 'Casa em Ordem',
    shortName: 'Casa em Ordem',
    homePath: '/oportunidades',
  },
};

export function isDemoActorRole(value: unknown): value is DemoActorRole {
  return value === 'CLIENT' || value === 'PROFESSIONAL';
}

export async function getDemoActor(): Promise<DemoActor | null> {
  if (!isDemoModeEnabled()) {
    return null;
  }
  const store = await cookies();
  const role = store.get(DEMO_SESSION_COOKIE)?.value;
  return isDemoActorRole(role) ? DEMO_ACTORS[role] : null;
}
