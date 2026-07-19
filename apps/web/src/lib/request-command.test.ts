import { webcrypto } from 'node:crypto';

import type { CreateServiceRequestInput, ServiceRequest } from '@marido/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DemoClientError, type demoMutation } from './demo-client';
import { createAndPublishServiceRequest } from './request-command';

const CREATE_KEY = '019b0000-0000-7000-8000-000000000911';
const PUBLISH_KEY = '019b0000-0000-7000-8000-000000000912';
const REQUEST_ID = '019b0000-0000-7000-8000-000000000913';

const input: CreateServiceRequestInput = {
  categoryId: '019b0000-0000-7000-8000-000000000004',
  title: 'Montagem de guarda-roupa residencial',
  description: 'Preciso montar um guarda-roupa novo no quarto principal da residência.',
  locationApprox: {
    city: 'Salvador',
    state: 'BA',
    district: 'Pituba',
  },
  desiredWindow: {
    startsAt: '2026-08-10T12:00:00.000Z',
    endsAt: '2026-08-10T16:00:00.000Z',
    timezone: 'America/Bahia',
  },
  urgency: 'FLEXIBLE',
  budget: {
    minMinor: 15_000,
    maxMinor: 30_000,
    currency: 'BRL',
  },
  visibility: 'PRIVATE_MATCHED',
  proposalDeadline: '2026-08-05T21:00:00.000Z',
};

const draft: ServiceRequest = {
  id: REQUEST_ID,
  title: input.title,
  description: input.description,
  category: {
    id: input.categoryId,
    slug: 'montagem-de-moveis',
    name: 'Montagem de móveis',
  },
  locationApprox: input.locationApprox,
  desiredWindow: input.desiredWindow,
  urgency: input.urgency,
  budget: input.budget ?? null,
  visibility: 'PRIVATE_MATCHED',
  status: 'DRAFT',
  version: 1,
  proposalDeadline: input.proposalDeadline,
  proposalCount: 0,
  createdAt: '2026-07-19T12:00:00.000Z',
  publishedAt: null,
};
const published: ServiceRequest = {
  ...draft,
  status: 'PUBLISHED',
  version: 2,
  publishedAt: '2026-07-19T12:01:00.000Z',
};

describe('createAndPublishServiceRequest', () => {
  const randomUUID = vi.fn().mockReturnValueOnce(CREATE_KEY).mockReturnValueOnce(PUBLISH_KEY);

  beforeEach(() => {
    sessionStorage.clear();
    randomUUID.mockReset();
    randomUUID.mockReturnValueOnce(CREATE_KEY).mockReturnValueOnce(PUBLISH_KEY);
    vi.stubGlobal('crypto', {
      randomUUID,
      subtle: webcrypto.subtle,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retries an ambiguous creation with the same key instead of creating another draft', async () => {
    const mutation = vi
      .fn()
      .mockRejectedValueOnce(new DemoClientError('Falha de rede', 0, 'NETWORK_ERROR', true))
      .mockResolvedValueOnce({ data: draft, meta: { correlation_id: 'correlation-1' } })
      .mockResolvedValueOnce({ data: published, meta: { correlation_id: 'correlation-2' } });
    const mutate = mutation as unknown as typeof demoMutation;

    await expect(createAndPublishServiceRequest(input, {}, mutate)).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
    await expect(createAndPublishServiceRequest(input, {}, mutate)).resolves.toMatchObject({
      data: { id: REQUEST_ID, status: 'PUBLISHED' },
    });

    expect(mutation.mock.calls[0]?.[0]).toBe('service-requests');
    expect(mutation.mock.calls[1]?.[0]).toBe('service-requests');
    expect(mutation.mock.calls[0]?.[2]?.idempotencyKey).toBe(CREATE_KEY);
    expect(mutation.mock.calls[1]?.[2]?.idempotencyKey).toBe(CREATE_KEY);
    expect(sessionStorage).toHaveLength(0);
  });

  it('resumes publication from the persisted draft checkpoint after an ambiguous failure', async () => {
    const mutation = vi
      .fn()
      .mockResolvedValueOnce({ data: draft, meta: { correlation_id: 'correlation-1' } })
      .mockRejectedValueOnce(new DemoClientError('Falha de rede', 0, 'NETWORK_ERROR', true))
      .mockResolvedValueOnce({ data: published, meta: { correlation_id: 'correlation-2' } });
    const mutate = mutation as unknown as typeof demoMutation;

    await expect(createAndPublishServiceRequest(input, {}, mutate)).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
    await expect(createAndPublishServiceRequest(input, {}, mutate)).resolves.toMatchObject({
      data: { id: REQUEST_ID, status: 'PUBLISHED' },
    });

    expect(mutation.mock.calls.map((call) => call[0])).toEqual([
      'service-requests',
      `service-requests/${REQUEST_ID}/publish`,
      `service-requests/${REQUEST_ID}/publish`,
    ]);
    expect(mutation.mock.calls[1]?.[2]).toMatchObject({
      idempotencyKey: PUBLISH_KEY,
      ifMatch: '"1"',
    });
    expect(mutation.mock.calls[2]?.[2]).toEqual(mutation.mock.calls[1]?.[2]);
    expect(sessionStorage).toHaveLength(0);
  });
});
