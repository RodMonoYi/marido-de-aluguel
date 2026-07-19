const SYNTHETIC_SEED_ENVIRONMENTS = new Set(['development', 'test']);

export function assertSyntheticSeedAllowed(environment: NodeJS.ProcessEnv): void {
  const nodeEnvironment = environment.NODE_ENV;
  if (!nodeEnvironment || !SYNTHETIC_SEED_ENVIRONMENTS.has(nodeEnvironment)) {
    throw new Error('Synthetic seed requires NODE_ENV=development or NODE_ENV=test');
  }

  if (environment.DEMO_MODE !== 'true') {
    throw new Error('Synthetic seed requires DEMO_MODE=true');
  }
}
