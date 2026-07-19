import { NextResponse, type NextRequest } from 'next/server';

import {
  DEMO_ACTORS,
  DEMO_SESSION_COOKIE,
  isDemoModeEnabled,
  isDemoActorRole,
} from '@/lib/demo-session';

function safeReturnTo(value: FormDataEntryValue | null, fallback: string): string {
  if (
    typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\')
  ) {
    return value.slice(0, 500);
  }
  return fallback;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
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

  const form = await request.formData();
  const action = form.get('action');

  if (action === 'logout') {
    const response = NextResponse.redirect(new URL('/', request.url), 303);
    response.cookies.delete(DEMO_SESSION_COOKIE);
    return response;
  }

  const role = form.get('role');
  if (!isDemoActorRole(role)) {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_DEMO_ACTOR',
          message: 'Escolha um perfil de demonstração válido.',
          retryable: false,
        },
        meta: { correlation_id: crypto.randomUUID() },
      },
      { status: 400 },
    );
  }

  const actor = DEMO_ACTORS[role];
  const response = NextResponse.redirect(
    new URL(safeReturnTo(form.get('returnTo'), actor.homePath), request.url),
    303,
  );
  response.cookies.set(DEMO_SESSION_COOKIE, role, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 8,
    path: '/',
  });
  return response;
}
