import { describe, expect, it } from 'vitest';

import { assertSyntheticSeedAllowed } from '../src/database/scripts/seed-environment';

describe('synthetic seed environment gate', () => {
  it.each(['development', 'test'])(
    'allows the seed in %s only when demo mode is explicitly enabled',
    (nodeEnvironment) => {
      expect(() =>
        assertSyntheticSeedAllowed({
          NODE_ENV: nodeEnvironment,
          DEMO_MODE: 'true',
        }),
      ).not.toThrow();
    },
  );

  it.each([undefined, 'production', 'staging'])(
    'rejects NODE_ENV=%s even when demo mode is enabled',
    (nodeEnvironment) => {
      expect(() =>
        assertSyntheticSeedAllowed({
          NODE_ENV: nodeEnvironment,
          DEMO_MODE: 'true',
        }),
      ).toThrow('Synthetic seed requires NODE_ENV=development or NODE_ENV=test');
    },
  );

  it.each([undefined, 'false', 'TRUE', '1'])(
    'rejects DEMO_MODE=%s in an allowed environment',
    (demoMode) => {
      expect(() =>
        assertSyntheticSeedAllowed({
          NODE_ENV: 'development',
          DEMO_MODE: demoMode,
        }),
      ).toThrow('Synthetic seed requires DEMO_MODE=true');
    },
  );
});
