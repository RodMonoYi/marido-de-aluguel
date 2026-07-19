import {
  apiEnvelopeSchema,
  categorySummarySchema,
  intentSchema,
  professionalCardSchema,
  professionalProfileSchema,
  type ApiEnvelope,
  type CategorySummary,
  type ProfessionalCard,
  type ProfessionalProfile,
  type RestrictedIntent,
} from '@marido/contracts';
import { cache } from 'react';

const API_URL = process.env.INTERNAL_API_URL ?? 'http://localhost:3000/api/v1';

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly correlationId?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...init?.headers,
    },
    next: init?.method ? undefined : { revalidate: 60 },
  });

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const correlationId =
      body &&
      typeof body === 'object' &&
      'meta' in body &&
      body.meta &&
      typeof body.meta === 'object' &&
      'correlation_id' in body.meta &&
      typeof body.meta.correlation_id === 'string'
        ? body.meta.correlation_id
        : (response.headers.get('x-correlation-id') ?? undefined);
    throw new ApiClientError(
      'A API não conseguiu concluir a solicitação.',
      response.status,
      correlationId,
    );
  }
  return body;
}

export async function getCategories(): Promise<CategorySummary[]> {
  const body = await request('/categories');
  return apiEnvelopeSchema(categorySummarySchema.array()).parse(body).data;
}

interface SearchInput {
  q?: string;
  category?: string;
  city?: string;
  cursor?: string;
  limit?: number;
}

export async function searchProfessionals(
  input: SearchInput = {},
): Promise<ApiEnvelope<ProfessionalCard[]>> {
  const parameters = new URLSearchParams();
  if (input.q) parameters.set('q', input.q);
  if (input.category) parameters.set('category', input.category);
  if (input.city) parameters.set('city', input.city);
  if (input.cursor) parameters.set('cursor', input.cursor);
  parameters.set('limit', String(input.limit ?? 12));

  const body = await request(`/search/professionals?${parameters.toString()}`);
  return apiEnvelopeSchema(professionalCardSchema.array()).parse(body);
}

export const getProfessional = cache(async (slug: string): Promise<ProfessionalProfile> => {
  const body = await request(`/professionals/${encodeURIComponent(slug)}`);
  return apiEnvelopeSchema(professionalProfileSchema).parse(body).data;
});

export async function createIntent(input: {
  professionalId: string;
  serviceId: string;
}): Promise<RestrictedIntent> {
  const body = await request('/intents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, action: 'REQUEST_QUOTE' }),
    cache: 'no-store',
  });
  return apiEnvelopeSchema(intentSchema).parse(body).data;
}
