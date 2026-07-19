import 'server-only';

import type { DemoApiEnvelope, DemoApiErrorEnvelope } from './demo-contract';
import { isDemoModeEnabled, type DemoActor } from './demo-session';

const API_URL = process.env.INTERNAL_API_URL ?? 'http://localhost:3000/api/v1';

export class DemoApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly correlationId?: string,
    readonly code = 'DEMO_API_ERROR',
    readonly retryable = false,
    readonly fields: Array<{ field: string; code: string }> = [],
  ) {
    super(message);
    this.name = 'DemoApiError';
  }
}

interface DemoRequestOptions {
  actor: DemoActor;
  method?: 'GET' | 'POST';
  body?: unknown;
  idempotencyKey?: string;
  ifMatch?: string;
}

function parseError(
  body: unknown,
  response: Response,
): Pick<DemoApiErrorEnvelope['error'], 'code' | 'message' | 'retryable' | 'fields'> & {
  correlationId?: string;
} {
  const fallbackCorrelationId = response.headers.get('x-correlation-id') ?? undefined;
  if (
    body &&
    typeof body === 'object' &&
    'error' in body &&
    body.error &&
    typeof body.error === 'object' &&
    'code' in body.error &&
    typeof body.error.code === 'string' &&
    'message' in body.error &&
    typeof body.error.message === 'string' &&
    'retryable' in body.error &&
    typeof body.error.retryable === 'boolean' &&
    'meta' in body &&
    body.meta &&
    typeof body.meta === 'object' &&
    'correlation_id' in body.meta &&
    typeof body.meta.correlation_id === 'string'
  ) {
    return {
      code: body.error.code,
      message: body.error.message,
      retryable: body.error.retryable,
      fields:
        'fields' in body.error && Array.isArray(body.error.fields)
          ? (body.error.fields as Array<{ field: string; code: string }>)
          : [],
      correlationId: body.meta.correlation_id,
    };
  }
  return {
    code: 'INVALID_API_ERROR',
    message: 'A API não conseguiu concluir a solicitação.',
    retryable: response.status >= 500,
    fields: [],
    ...(fallbackCorrelationId ? { correlationId: fallbackCorrelationId } : {}),
  };
}

export async function demoApiRequest<T>(
  path: string,
  { actor, method = 'GET', body, idempotencyKey, ifMatch }: DemoRequestOptions,
): Promise<DemoApiEnvelope<T>> {
  if (!isDemoModeEnabled()) {
    throw new DemoApiError(
      'A demonstração está desabilitada.',
      404,
      undefined,
      'DEMO_MODE_DISABLED',
    );
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      'X-Demo-Actor-Id': actor.id,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      ...(ifMatch ? { 'If-Match': ifMatch } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: 'no-store',
  });

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = parseError(payload, response);
    throw new DemoApiError(
      error.message,
      response.status,
      error.correlationId,
      error.code,
      error.retryable,
      error.fields,
    );
  }

  return payload as DemoApiEnvelope<T>;
}
