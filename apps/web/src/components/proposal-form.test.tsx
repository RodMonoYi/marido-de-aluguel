import { webcrypto } from 'node:crypto';

import type { Proposal, ServiceRequest } from '@marido/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DemoClientError } from '@/lib/demo-client';

import { ProposalForm } from './proposal-form';

const { demoMutationMock, refreshMock } = vi.hoisted(() => ({
  demoMutationMock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: refreshMock }),
}));

vi.mock('@/lib/demo-client', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@/lib/demo-client')),
  demoMutation: demoMutationMock,
}));

const request: ServiceRequest = {
  id: '019b0000-0000-7000-8000-000000000501',
  title: 'Montagem de guarda-roupa residencial',
  description: 'Preciso montar um guarda-roupa novo no quarto principal da residência.',
  category: {
    id: '019b0000-0000-7000-8000-000000000004',
    slug: 'montagem-de-moveis',
    name: 'Montagem de móveis',
  },
  locationApprox: { city: 'Salvador', state: 'BA', district: 'Pituba' },
  desiredWindow: {
    startsAt: '2026-08-10T12:00:00.000Z',
    endsAt: '2026-08-10T16:00:00.000Z',
    timezone: 'America/Bahia',
  },
  urgency: 'FLEXIBLE',
  budget: null,
  visibility: 'PRIVATE_MATCHED',
  status: 'PUBLISHED',
  version: 2,
  proposalDeadline: '2026-08-05T21:00:00.000Z',
  proposalCount: 1,
  createdAt: '2026-07-19T12:00:00.000Z',
  publishedAt: '2026-07-19T12:01:00.000Z',
};

const proposal: Proposal = {
  id: '019b0000-0000-7000-8000-000000000601',
  requestId: request.id,
  professional: {
    id: '019b0000-0000-7000-8000-000000000102',
    slug: 'casa-em-ordem-montagens',
    displayName: 'Casa em Ordem',
  },
  status: 'SENT',
  version: 1,
  currentRevision: {
    id: '019b0000-0000-7000-8000-000000000602',
    version: 1,
    scope: 'Montagem completa com conferência das peças e regulagem final das portas.',
    included: ['Montagem completa'],
    excluded: ['Fixação estrutural em parede'],
    breakdown: {
      laborMinor: 25_000,
      materialsMinor: 0,
      travelMinor: 0,
      customerPlatformFeeMinor: 0,
      professionalCommissionMinor: 3_750,
      customerTotalMinor: 25_000,
      professionalNetEstimateMinor: 21_250,
      currency: 'BRL',
      policy: {
        code: 'DEMO_COMMISSION_15_PERCENT',
        version: 1,
        developmentOnly: true,
      },
    },
    schedule: {
      startsAt: request.desiredWindow.startsAt,
      endsAt: request.desiredWindow.endsAt,
      timezone: 'America/Bahia',
    },
    validUntil: request.proposalDeadline,
    policies: {
      cancellation: {
        code: 'DEMO_CANCELLATION_NO_CHARGE',
        version: 1,
        label: 'Demonstração sem cobrança: cancelamentos não geram taxa.',
      },
      guarantee: null,
    },
    createdAt: '2026-07-19T13:00:00.000Z',
  },
  createdAt: '2026-07-19T13:00:00.000Z',
  updatedAt: '2026-07-19T13:00:00.000Z',
};

describe('ProposalForm idempotency', () => {
  const randomUUID = vi.fn();

  beforeEach(() => {
    sessionStorage.clear();
    demoMutationMock.mockReset();
    refreshMock.mockReset();
    randomUUID.mockReset();
    randomUUID.mockReturnValue('019b0000-0000-7000-8000-000000000931');
    vi.stubGlobal('crypto', {
      randomUUID,
      subtle: webcrypto.subtle,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reuses the revision key after an ambiguous client failure', async () => {
    demoMutationMock
      .mockRejectedValueOnce(new DemoClientError('Falha de rede', 0, 'NETWORK_ERROR', true))
      .mockResolvedValueOnce({ data: proposal });
    render(<ProposalForm existingProposal={proposal} request={request} />);
    const action = screen.getByRole('button', { name: 'Enviar proposta revisada' });
    const form = action.closest('form');
    expect(form).not.toBeNull();
    expect(screen.getByText('Total exibido ao cliente')).toBeInTheDocument();
    expect(screen.getByText('Taxa da plataforma para o cliente')).toBeInTheDocument();
    expect(screen.getByText('Comissão descontada do profissional (15%)')).toBeInTheDocument();
    expect(
      screen.getByText('Demonstração sem cobrança: cancelamentos não geram taxa.'),
    ).toBeInTheDocument();

    fireEvent.submit(form!);
    await screen.findByText(/Falha de rede/);
    fireEvent.submit(form!);

    await waitFor(() => expect(demoMutationMock).toHaveBeenCalledTimes(2));
    expect(demoMutationMock.mock.calls[0]?.[2]?.idempotencyKey).toBe(
      demoMutationMock.mock.calls[1]?.[2]?.idempotencyKey,
    );
    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(sessionStorage).toHaveLength(0);
  });
});
