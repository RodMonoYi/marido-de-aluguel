interface RawEnvironment {
  NODE_ENV?: string;
  API_PORT?: string;
  WEB_ORIGIN?: string;
  DATABASE_URL?: string;
  DATABASE_POOL_MAX?: string;
  DEMO_MODE?: string;
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export function validateEnvironment(raw: RawEnvironment): Record<string, unknown> {
  if (!raw.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  const nodeEnv = raw.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('NODE_ENV must be development, test or production');
  }

  const demoMode = raw.DEMO_MODE === 'true';
  if (raw.DEMO_MODE !== undefined && !['true', 'false'].includes(raw.DEMO_MODE)) {
    throw new Error('DEMO_MODE must be true or false');
  }
  if (nodeEnv === 'production' && demoMode) {
    throw new Error('DEMO_MODE is forbidden in production');
  }

  return {
    ...raw,
    NODE_ENV: nodeEnv,
    API_PORT: positiveInteger(raw.API_PORT, 3000, 'API_PORT'),
    DATABASE_POOL_MAX: positiveInteger(raw.DATABASE_POOL_MAX, 10, 'DATABASE_POOL_MAX'),
    WEB_ORIGIN: raw.WEB_ORIGIN ?? 'http://localhost:5174',
    DEMO_MODE: demoMode,
  };
}
