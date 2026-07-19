import 'server-only';

import { notFound, redirect } from 'next/navigation';

import {
  getDemoActor,
  isDemoModeEnabled,
  type DemoActor,
  type DemoActorRole,
} from './demo-session';

export async function requireDemoActor(role: DemoActorRole, returnTo: string): Promise<DemoActor> {
  if (!isDemoModeEnabled()) {
    notFound();
  }

  const actor = await getDemoActor();
  if (!actor || actor.role !== role) {
    redirect(`/entrar?required=${role}&returnTo=${encodeURIComponent(returnTo)}`);
  }
  return actor;
}

export async function requireAnyDemoActor(returnTo: string): Promise<DemoActor> {
  if (!isDemoModeEnabled()) {
    notFound();
  }

  const actor = await getDemoActor();
  if (!actor) {
    redirect(`/entrar?returnTo=${encodeURIComponent(returnTo)}`);
  }
  return actor;
}
