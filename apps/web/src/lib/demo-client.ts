import type { DemoApiEnvelope, DemoApiErrorEnvelope } from './demo-contract';

export class DemoClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly retryable: boolean,
    readonly correlationId?: string,
    readonly fields: Array<{ field: string; code: string }> = [],
  ) {
    super(message);
    this.name = 'DemoClientError';
  }
}

interface MutationOptions {
  idempotencyKey?: string;
  ifMatch?: string;
}

function isErrorEnvelope(value: unknown): value is DemoApiErrorEnvelope {
  if (!value || typeof value !== 'object' || !('error' in value) || !('meta' in value)) {
    return false;
  }
  const error = value.error;
  const meta = value.meta;
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string' &&
    'message' in error &&
    typeof error.message === 'string' &&
    'retryable' in error &&
    typeof error.retryable === 'boolean' &&
    !!meta &&
    typeof meta === 'object' &&
    'correlation_id' in meta &&
    typeof meta.correlation_id === 'string'
  );
}

export async function demoMutation<T>(
  path: string,
  body: unknown,
  options: MutationOptions = {},
): Promise<DemoApiEnvelope<T>> {
  let response: Response;
  try {
    response = await fetch(`/api/demo/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
        ...(options.ifMatch ? { 'If-Match': options.ifMatch } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new DemoClientError(
      'Não foi possível alcançar o servidor. Verifique sua conexão e tente novamente.',
      0,
      'NETWORK_ERROR',
      true,
    );
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (isErrorEnvelope(payload)) {
      throw new DemoClientError(
        payload.error.message,
        response.status,
        payload.error.code,
        payload.error.retryable,
        payload.meta.correlation_id,
        payload.error.fields ?? [],
      );
    }
    throw new DemoClientError(
      'O servidor devolveu uma resposta inválida.',
      response.status,
      'INVALID_API_RESPONSE',
      response.status >= 500,
      response.headers.get('x-correlation-id') ?? undefined,
    );
  }

  return payload as DemoApiEnvelope<T>;
}
