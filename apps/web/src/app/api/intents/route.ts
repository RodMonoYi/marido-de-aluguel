import { NextResponse, type NextRequest } from 'next/server';

const API_URL = process.env.INTERNAL_API_URL ?? 'http://localhost:3000/api/v1';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null);
  const response = await fetch(`${API_URL}/intents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(request.headers.get('x-correlation-id')
        ? { 'X-Correlation-ID': request.headers.get('x-correlation-id') ?? '' }
        : {}),
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  }).catch(() => null);

  if (!response) {
    return NextResponse.json(
      {
        error: {
          code: 'API_UNAVAILABLE',
          message: 'Não foi possível salvar a intenção.',
          retryable: true,
        },
        meta: { correlation_id: 'unavailable' },
      },
      { status: 503 },
    );
  }

  const payload: unknown = await response.json();
  return NextResponse.json(payload, {
    status: response.status,
    headers: {
      'Cache-Control': 'no-store',
      ...(response.headers.get('x-correlation-id')
        ? { 'X-Correlation-ID': response.headers.get('x-correlation-id') ?? '' }
        : {}),
    },
  });
}
