import { NextResponse, type NextRequest } from 'next/server';

import { getDemoActor, isDemoModeEnabled } from '@/lib/demo-session';

const API_URL = process.env.INTERNAL_API_URL ?? 'http://localhost:3000/api/v1';
const IDENTIFIER = '[0-9a-z-]{1,100}';
const ALLOWED_ROUTES: Array<{ method: string; pattern: RegExp }> = [
  { method: 'GET', pattern: /^service-requests$/ },
  { method: 'POST', pattern: /^service-requests$/ },
  { method: 'GET', pattern: new RegExp(`^service-requests/${IDENTIFIER}$`) },
  { method: 'POST', pattern: new RegExp(`^service-requests/${IDENTIFIER}/publish$`) },
  { method: 'GET', pattern: new RegExp(`^service-requests/${IDENTIFIER}/proposals$`) },
  { method: 'POST', pattern: new RegExp(`^service-requests/${IDENTIFIER}/proposals$`) },
  { method: 'GET', pattern: new RegExp(`^proposals/${IDENTIFIER}/revisions$`) },
  { method: 'POST', pattern: new RegExp(`^proposals/${IDENTIFIER}/revisions$`) },
  { method: 'POST', pattern: new RegExp(`^proposals/${IDENTIFIER}/accept$`) },
  { method: 'GET', pattern: new RegExp(`^contracts/${IDENTIFIER}$`) },
];

type RouteContext = { params: Promise<{ path: string[] }> };

function isAllowed(method: string, path: string): boolean {
  return ALLOWED_ROUTES.some((route) => route.method === method && route.pattern.test(path));
}

async function proxy(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  if (!isDemoModeEnabled()) {
    return NextResponse.json(
      {
        error: {
          code: 'DEMO_MODE_DISABLED',
          message: 'A demonstração não está disponível neste ambiente.',
          retryable: false,
        },
        meta: { correlation_id: crypto.randomUUID() },
      },
      { status: 404 },
    );
  }

  const actor = await getDemoActor();
  if (!actor) {
    return NextResponse.json(
      {
        error: {
          code: 'DEMO_SESSION_REQUIRED',
          message: 'Escolha um perfil sintético para continuar.',
          retryable: false,
        },
        meta: { correlation_id: crypto.randomUUID() },
      },
      { status: 401 },
    );
  }

  const { path: segments } = await context.params;
  const path = segments.join('/');
  if (!isAllowed(request.method, path)) {
    return NextResponse.json(
      {
        error: {
          code: 'DEMO_PROXY_ROUTE_NOT_ALLOWED',
          message: 'A operação não faz parte da jornada demonstrativa.',
          retryable: false,
        },
        meta: { correlation_id: crypto.randomUUID() },
      },
      { status: 404 },
    );
  }

  const upstreamUrl = new URL(`${API_URL}/${path}`);
  request.nextUrl.searchParams.forEach((value, key) => upstreamUrl.searchParams.append(key, value));

  const body =
    request.method === 'GET' ? undefined : await request.arrayBuffer().catch(() => undefined);
  const response = await fetch(upstreamUrl, {
    method: request.method,
    headers: {
      Accept: 'application/json',
      'X-Demo-Actor-Id': actor.id,
      ...(request.headers.get('content-type')
        ? { 'Content-Type': request.headers.get('content-type') ?? 'application/json' }
        : {}),
      ...(request.headers.get('x-correlation-id')
        ? { 'X-Correlation-ID': request.headers.get('x-correlation-id') ?? '' }
        : {}),
      ...(request.headers.get('idempotency-key')
        ? { 'Idempotency-Key': request.headers.get('idempotency-key') ?? '' }
        : {}),
      ...(request.headers.get('if-match')
        ? { 'If-Match': request.headers.get('if-match') ?? '' }
        : {}),
    },
    ...(body === undefined ? {} : { body }),
    cache: 'no-store',
  }).catch(() => null);

  if (!response) {
    return NextResponse.json(
      {
        error: {
          code: 'API_UNAVAILABLE',
          message: 'A API da demonstração está temporariamente indisponível.',
          retryable: true,
        },
        meta: { correlation_id: 'unavailable' },
      },
      { status: 503 },
    );
  }

  const payload = await response.arrayBuffer();
  return new NextResponse(payload, {
    status: response.status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': response.headers.get('content-type') ?? 'application/json',
      ...(response.headers.get('x-correlation-id')
        ? { 'X-Correlation-ID': response.headers.get('x-correlation-id') ?? '' }
        : {}),
      ...(response.headers.get('etag') ? { ETag: response.headers.get('etag') ?? '' } : {}),
    },
  });
}

export function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return proxy(request, context);
}

export function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return proxy(request, context);
}
